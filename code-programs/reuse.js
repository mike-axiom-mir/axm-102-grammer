'use strict';

const c = require('./common.js');
const {analyze} = require('./checker.js');
const MAX_ENTRIES = 128;

// Alpha-normalize bound names, preserving constants, field names, argument order,
// operation order and the entire dependency closure. This is structural reuse,
// not a claim that differently written algorithms are semantically equivalent.
function extract(analysis, rootName) {
  const source = new Map(analysis.program.functions.map(fn => [fn.name, fn]));
  const functionNames = new Map(), queue = [];
  function nameFor(name) { if (!functionNames.has(name)) { functionNames.set(name, 'f' + functionNames.size); queue.push(name); } return functionNames.get(name); }
  nameFor(rootName);
  const functions = [];
  for (let index = 0; index < queue.length; index++) {
    const fn = source.get(queue[index]);
    let serial = 0;
    const params = fn.params.map((p, i) => ({name: 'p' + i, type: p.type}));
    const scope = new Map(fn.params.map((p, i) => [p.name, params[i].name]));
    function walk(node, env) {
      if (node.op === 'literal') return node;
      if (node.op === 'ref') return {op: 'ref', name: env.get(node.name)};
      if (node.op === 'call') return {op: 'call', function: nameFor(node.function), args: node.args.map(n => walk(n, env))};
      if (node.op === 'let') {
        const value = walk(node.value, env), name = 'v' + serial++, nested = new Map(env); nested.set(node.name, name);
        return {op: 'let', name, value, body: walk(node.body, nested)};
      }
      if (['map', 'filter', 'some', 'every', 'fold', 'sortBy'].includes(node.op)) {
        const input = walk(node.input, env), item = 'v' + serial++, nested = new Map(env); nested.set(node.item, item);
        if (node.op === 'fold') { const initial = walk(node.initial, env), acc = 'v' + serial++; nested.set(node.acc, acc); return {op: node.op, input, item, acc, initial, body: walk(node.body, nested)}; }
        if (node.op === 'sortBy') return {op: node.op, input, item, key: walk(node.key, nested), descending: node.descending};
        return {op: node.op, input, item, body: walk(node.body, nested)};
      }
      if (node.op === 'record') return {op: 'record', fields: Object.fromEntries(Object.keys(node.fields).sort(c.compare).map(k => [k, walk(node.fields[k], env)]))};
      if (node.op === 'list') return {...node, items: node.items.map(n => walk(n, env))};
      return Object.fromEntries(Object.keys(node).sort(c.compare).map(k => [k, node[k]?.op ? walk(node[k], env) : node[k]]));
    }
    functions.push({name: functionNames.get(fn.name), params, returns: fn.returns, body: walk(fn.body, scope)});
  }
  const program = analyze({schema: 'axm.code.program.v1', name: 'reusableFunction', functions, exports: ['f0']}).program;
  return c.freeze({structuralSha256: c.hash(program), program});
}
function emptyArchive() { return seal([]); }
function seal(entries) { const body = {schema: 'axm.code.recipe-archive.v1', entries}; return c.freeze({...body, archiveSha256: c.hash(body)}); }
function validateArchive(input) {
  const archive = c.data(input);
  c.exact(archive, ['schema', 'entries', 'archiveSha256']);
  if (archive.schema !== 'axm.code.recipe-archive.v1' || !Array.isArray(archive.entries) || archive.entries.length > MAX_ENTRIES) c.fail('ARCHIVE_INVALID');
  if (archive.archiveSha256 !== c.hash({schema: archive.schema, entries: archive.entries})) c.fail('ARCHIVE_DIGEST_MISMATCH');
  const seen = new Set();
  let previous = '';
  for (const entry of archive.entries) {
    c.exact(entry, ['structuralSha256', 'program', 'origins']);
    const normalized = extract(analyze(entry.program), 'f0');
    if (entry.structuralSha256 !== normalized.structuralSha256 || !c.same(entry.program, normalized.program)) c.fail('ARCHIVE_ENTRY_MISMATCH');
    if (seen.has(entry.structuralSha256) || c.compare(entry.structuralSha256, previous) < 0) c.fail('ARCHIVE_ORDER_INVALID');
    seen.add(entry.structuralSha256); previous = entry.structuralSha256;
    if (!Array.isArray(entry.origins) || !entry.origins.length || entry.origins.length > 128) c.fail('ARCHIVE_ORIGINS_INVALID');
    for (const origin of entry.origins) { c.exact(origin, ['label', 'programSha256', 'function']); c.string(origin.label, 'origin'); if (!/^[a-f0-9]{64}$/.test(origin.programSha256)) c.fail('ARCHIVE_ORIGIN_DIGEST'); c.identifier(origin.function, 'origin'); }
    const keys = entry.origins.map(c.canonical);
    if (!c.same(keys, [...new Set(keys)].sort(c.compare))) c.fail('ARCHIVE_ORIGIN_ORDER');
  }
  return archive;
}
function remember({archive = emptyArchive(), program, origin = 'caller-supplied'} = {}) {
  const current = validateArchive(archive), analysis = analyze(program);
  c.string(origin, 'origin');
  const entries = new Map(current.entries.map(entry => [entry.structuralSha256, entry]));
  const captured = [];
  for (const fn of analysis.program.functions) {
    const reusable = extract(analysis, fn.name), existing = entries.get(reusable.structuralSha256);
    const evidence = {label: origin, programSha256: analysis.programSha256, function: fn.name};
    const origins = [...(existing?.origins || [])];
    if (!origins.some(o => c.same(o, evidence))) origins.push(evidence);
    if (origins.length > 128) c.fail('ARCHIVE_ORIGIN_LIMIT');
    origins.sort((a, b) => c.compare(c.canonical(a), c.canonical(b)));
    entries.set(reusable.structuralSha256, {...reusable, origins});
    captured.push({function: fn.name, structuralSha256: reusable.structuralSha256, added: !existing});
  }
  if (entries.size > MAX_ENTRIES) c.fail('ARCHIVE_ENTRY_LIMIT');
  const next = seal([...entries.values()].sort((a, b) => c.compare(a.structuralSha256, b.structuralSha256)));
  // Ensure a returned archive can be accepted again through the same bounded API.
  validateArchive(next);
  return c.freeze({schema: 'axm.code.recipe-capture.v1', result: 'RECIPE_ARCHIVE_READY_NO_PERSISTENCE_AUTHORITY', previousArchiveSha256: current.archiveSha256, addedCount: entries.size - current.entries.length, captured, archive: next, truth: {runtimeVerified: false, originsAreCallerDeclared: true, namesDoNotCreateNewAtoms: true, constantsAndDependenciesPreserved: true, callerMustPersistArchive: true}, authority: c.AUTHORITY});
}
function restore({archive, structuralSha256, name = 'restoredFunction'} = {}) {
  const current = validateArchive(archive), entry = current.entries.find(e => e.structuralSha256 === structuralSha256);
  if (!entry) c.fail('ARCHIVE_ENTRY_UNKNOWN');
  c.identifier(name, 'restored name');
  if (entry.program.functions.some(fn => fn.name === name && fn.name !== 'f0')) c.fail('RESTORE_NAME_COLLISION');
  const program = c.data(entry.program);
  program.name = name;
  program.functions.find(fn => fn.name === 'f0').name = name;
  program.exports = [name];
  return analyze(program).program;
}
module.exports = {MAX_ENTRIES, extract, emptyArchive, validateArchive, remember, restore};
