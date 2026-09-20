'use strict';

const c = require('./common.js');
const NUMERIC = ['add', 'subtract', 'multiply', 'divide', 'remainder', 'min', 'max'];
const COMPARE = ['lt', 'lte', 'gt', 'gte'];
const TEXT_BINARY = ['concat', 'contains', 'startsWith', 'endsWith', 'split'];
const OPERATIONS = Object.freeze(['literal', 'ref', 'record', 'list', 'field', 'call', 'let', 'if', 'map', 'filter', 'some', 'every', 'fold', 'sortBy', 'at', 'slice', 'join', 'length', 'trim', 'asciiLower', 'asciiUpper', 'not', 'negate', 'abs', 'floor', 'ceil', 'isNull', 'coalesce', 'equal', 'notEqual', 'and', 'or', ...NUMERIC, ...COMPARE, ...TEXT_BINARY]);

function analyze(input) {
  const program = c.data(input);
  c.exact(program, ['schema', 'name', 'functions', 'exports']);
  if (program.schema !== 'axm.code.program.v1') c.fail('PROGRAM_SCHEMA');
  c.identifier(program.name, '/name');
  if (!Array.isArray(program.functions) || !program.functions.length || program.functions.length > c.LIMITS.functions) c.fail('FUNCTION_COUNT');
  const functions = new Map();
  for (const [index, fn] of program.functions.entries()) {
    c.exact(fn, ['name', 'params', 'returns', 'body'], [], `/functions/${index}`);
    c.identifier(fn.name, '/functions/name');
    if (functions.has(fn.name)) c.fail('DUPLICATE_FUNCTION', fn.name);
    if (!Array.isArray(fn.params) || fn.params.length > c.LIMITS.parameters) c.fail('PARAMETER_COUNT', fn.name);
    const names = new Set();
    fn.params = fn.params.map(p => { c.exact(p, ['name', 'type']); c.identifier(p.name, 'parameter'); if (names.has(p.name)) c.fail('DUPLICATE_PARAMETER', p.name); names.add(p.name); return {name: p.name, type: c.type(p.type)}; });
    fn.returns = c.type(fn.returns);
    functions.set(fn.name, fn);
  }
  if (!Array.isArray(program.exports) || !program.exports.length || program.exports.length > functions.size || new Set(program.exports).size !== program.exports.length) c.fail('EXPORTS_INVALID');
  for (const name of program.exports) if (!functions.has(name)) c.fail('EXPORT_UNKNOWN', String(name));
  program.functions.sort((a, b) => c.compare(a.name, b.name));
  program.exports.sort(c.compare);
  const dependencies = new Map(program.functions.map(fn => [fn.name, new Set()]));
  const facts = [], atomCounts = {};
  let count = 0;
  function infer(node, env, at, depth, owner) {
    if (++count > c.LIMITS.nodes || depth > c.LIMITS.depth) c.fail('PROGRAM_COMPLEXITY_LIMIT', at);
    if (!node || typeof node !== 'object' || Array.isArray(node) || !OPERATIONS.includes(node.op)) c.fail('OPERATION_UNSUPPORTED', at);
    const op = node.op;
    atomCounts[op] = (atomCounts[op] || 0) + 1;
    const requireFields = (fields, optional = []) => c.exact(node, ['op', ...fields], optional, at);
    const child = (field, scope = env) => infer(node[field], scope, at + '/' + field, depth + 1, owner);
    const need = (actual, expected, field) => { if (!c.assignable(actual, expected)) c.fail('TYPE_MISMATCH', at + '/' + field); };
    const bind = (name, value) => { c.identifier(name, at); if (env.has(name)) c.fail('BINDING_SHADOWED', at + '/' + name); const scope = new Map(env); scope.set(name, value); return scope; };
    let result;
    if (op === 'literal') { requireFields(['type', 'value']); node.type = c.type(node.type); if (!c.valueMatches(node.value, node.type)) c.fail('LITERAL_TYPE_MISMATCH', at); result = node.type; }
    else if (op === 'ref') { requireFields(['name']); if (!env.has(node.name)) c.fail('REFERENCE_UNKNOWN', at); result = env.get(node.name); }
    else if (op === 'record') {
      requireFields(['fields']); if (!node.fields || typeof node.fields !== 'object' || Array.isArray(node.fields) || Object.keys(node.fields).length > c.LIMITS.fields) c.fail('RECORD_FIELDS_INVALID', at);
      node.fields = Object.fromEntries(Object.keys(node.fields).sort(c.compare).map(k => [c.key(k, at), node.fields[k]]));
      result = {record: Object.fromEntries(Object.entries(node.fields).map(([k, v]) => [k, infer(v, env, at + '/fields/' + k.replace(/~/g, '~0').replace(/\//g, '~1'), depth + 1, owner)]))};
    } else if (op === 'list') {
      requireFields(['itemType', 'items']); node.itemType = c.type(node.itemType);
      if (!Array.isArray(node.items) || node.items.length > c.LIMITS.list) c.fail('LIST_COUNT', at);
      node.items.forEach((item, i) => need(infer(item, env, at + '/items/' + i, depth + 1, owner), node.itemType, 'items/' + i)); result = {list: node.itemType};
    } else if (op === 'field') { requireFields(['value', 'key']); const t = child('value'); c.key(node.key, at); if (!t?.record || !Object.hasOwn(t.record, node.key)) c.fail('FIELD_UNKNOWN', at); result = t.record[node.key]; }
    else if (op === 'call') {
      requireFields(['function', 'args']); const target = functions.get(node.function); if (!target) c.fail('FUNCTION_UNKNOWN', at);
      if (!Array.isArray(node.args) || node.args.length !== target.params.length) c.fail('CALL_ARITY', at);
      node.args.forEach((arg, i) => need(infer(arg, env, at + '/args/' + i, depth + 1, owner), target.params[i].type, 'args/' + i)); dependencies.get(owner).add(node.function); result = target.returns;
    } else if (op === 'let') { requireFields(['name', 'value', 'body']); result = child('body', bind(node.name, child('value'))); }
    else if (op === 'if') { requireFields(['condition', 'then', 'else']); need(child('condition'), 'boolean', 'condition'); const yes = child('then'), no = child('else'); if (!c.same(yes, no)) c.fail('BRANCH_TYPE_MISMATCH', at); result = yes; }
    else if (['map', 'filter', 'some', 'every', 'fold', 'sortBy'].includes(op)) {
      requireFields(['input', 'item', ...(op === 'fold' ? ['acc', 'initial', 'body'] : op === 'sortBy' ? ['key', 'descending'] : ['body'])]);
      const source = child('input'); if (source?.list === undefined) c.fail('LIST_REQUIRED', at);
      let scope = bind(node.item, source.list);
      if (op === 'fold') { const initial = child('initial'); c.identifier(node.acc, at); if (scope.has(node.acc)) c.fail('BINDING_SHADOWED', at); scope.set(node.acc, initial); need(child('body', scope), initial, 'body'); result = initial; }
      else if (op === 'sortBy') { const sortType = child('key', scope); if (!['string', 'number'].includes(sortType)) c.fail('SORT_KEY_TYPE', at); if (typeof node.descending !== 'boolean') c.fail('SORT_DIRECTION', at); result = source; }
      else { const body = child('body', scope); if (op !== 'map') need(body, 'boolean', 'body'); result = op === 'map' ? {list: body} : op === 'filter' ? source : 'boolean'; }
    } else if (op === 'at') { requireFields(['input', 'index', 'fallback']); const source = child('input'); if (source?.list === undefined) c.fail('LIST_REQUIRED', at); need(child('index'), 'number', 'index'); need(child('fallback'), source.list, 'fallback'); result = source.list; }
    else if (op === 'slice') { requireFields(['input', 'start', 'end']); const source = child('input'); if (source !== 'string' && source?.list === undefined) c.fail('SEQUENCE_REQUIRED', at); need(child('start'), 'number', 'start'); need(child('end'), 'number', 'end'); result = source; }
    else if (op === 'join') { requireFields(['input', 'separator']); need(child('input'), {list: 'string'}, 'input'); need(child('separator'), 'string', 'separator'); result = 'string'; }
    else if (['length', 'trim', 'asciiLower', 'asciiUpper', 'not', 'negate', 'abs', 'floor', 'ceil', 'isNull'].includes(op)) {
      requireFields(['value']); const value = child('value');
      if (op === 'length') { if (value !== 'string' && value?.list === undefined) c.fail('SEQUENCE_REQUIRED', at); result = 'number'; }
      else if (op === 'isNull') result = 'boolean';
      else if (op === 'not') { need(value, 'boolean', 'value'); result = 'boolean'; }
      else if (['trim', 'asciiLower', 'asciiUpper'].includes(op)) { need(value, 'string', 'value'); result = 'string'; }
      else { need(value, 'number', 'value'); result = 'number'; }
    } else if (op === 'coalesce') { requireFields(['value', 'fallback']); const v = child('value'); if (!v?.nullable) c.fail('NULLABLE_REQUIRED', at); need(child('fallback'), v.nullable, 'fallback'); result = v.nullable; }
    else {
      requireFields(['left', 'right']); const left = child('left'), right = child('right');
      if (['equal', 'notEqual'].includes(op)) { if (!c.same(left, right)) c.fail('COMPARISON_TYPE_MISMATCH', at); result = 'boolean'; }
      else if (['and', 'or'].includes(op)) { need(left, 'boolean', 'left'); need(right, 'boolean', 'right'); result = 'boolean'; }
      else if (TEXT_BINARY.includes(op)) { need(left, 'string', 'left'); need(right, 'string', 'right'); result = op === 'concat' ? 'string' : op === 'split' ? {list: 'string'} : 'boolean'; }
      else { need(left, 'number', 'left'); need(right, 'number', 'right'); result = COMPARE.includes(op) ? 'boolean' : 'number'; }
    }
    facts.push({path: at, op, type: result});
    return result;
  }
  for (const [index, fn] of program.functions.entries()) {
    const inferred = infer(fn.body, new Map(fn.params.map(p => [p.name, p.type])), `/functions/${index}/body`, 0, fn.name);
    if (!c.assignable(inferred, fn.returns)) c.fail('RETURN_TYPE_MISMATCH', fn.name);
  }
  const active = new Set(), done = new Set(), order = [];
  function visit(name) { if (active.has(name)) c.fail('RECURSION_REFUSED', name); if (done.has(name)) return; active.add(name); [...dependencies.get(name)].sort(c.compare).forEach(visit); active.delete(name); done.add(name); order.push(name); }
  program.functions.forEach(fn => visit(fn.name));
  return c.freeze({program, programSha256: c.hash(program), functionOrder: order, dependencies: Object.fromEntries([...dependencies].map(([k, v]) => [k, [...v].sort(c.compare)])), nodeCount: count, atomCounts, facts});
}
module.exports = {OPERATIONS, analyze};
