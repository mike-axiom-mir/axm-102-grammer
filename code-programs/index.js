'use strict';

const c = require('./common.js');
const checker = require('./checker.js');
const emitter = require('./emitter.js');
const reuse = require('./reuse.js');
const recipes = require('./recipes.js');
const organs = require('../language-organs/registry.js');
const AUTHORITY = Object.freeze({workspaceRead: false, workspaceMutation: false, toolExecution: false, network: false, install: false, promotion: false, canon: false});
const LANGUAGE_IDS = Object.freeze(['javascript', 'python']);

function catalog() {
  return c.freeze({schema: 'axm.code.program-catalog.v1', version: '1.0.0', languages: LANGUAGE_IDS, operations: checker.OPERATIONS, limits: c.LIMITS,
    recipes: recipes.RECIPES.map(r => ({id: r.id, description: r.description, programSha256: checker.analyze(r.program).programSha256})),
    truth: {arbitrarySourceCompilation: false, arbitraryLanguageTranslation: false, executionAvailable: false, sourceGenerationAvailable: true}, authority: AUTHORITY});
}
function validate(program) {
  try {
    const analysis = checker.analyze(program);
    return c.freeze({schema: 'axm.code.program-validation.v1', result: 'CODE_PROGRAM_TYPECHECKED', ...analysis, authority: AUTHORITY});
  } catch (error) { return c.freeze({schema: 'axm.code.program-validation.v1', result: 'CODE_PROGRAM_HELD', errorCode: String(error.message), authority: AUTHORITY}); }
}
function testSource(cases, python) {
  const rows = emitter.literal(cases, python);
  if (python) return [
    '# Caller-supplied or bundled cases. Passing these alone is not general correctness proof.',
    'from module import FUNCTIONS',
    '', 'CASES = ' + rows,
    'for case in CASES:',
    '    try:',
    '        actual = FUNCTIONS[case["function"]](*case["args"])',
    '    except Exception as error:',
    '        if "error" not in case or str(error) != case["error"]:',
    '            raise',
    '    else:',
    '        if "error" in case or actual != case["expected"]:',
    '            raise AssertionError("CASE_MISMATCH:" + case["function"])',
    'print("PASS code-program cases:", len(CASES))', ''
  ].join('\n');
  return [
    "'use strict';", "const assert = require('node:assert/strict');", "const functions = require('./module.js');", 'const cases = ' + rows + ';',
    'for (const row of cases) {',
    '  if (Object.hasOwn(row, "error")) assert.throws(() => functions[row.function](...row.args), error => error.message === row.error);',
    '  else assert.deepStrictEqual(functions[row.function](...row.args), row.expected);',
    '}', 'console.log("PASS code-program cases:", cases.length);', ''
  ].join('\n');
}
function compile(input) {
  try {
    const request = c.data(input);
    c.exact(request, ['program', 'languageId'], ['cases']);
    const {languageId} = request;
    if (!LANGUAGE_IDS.includes(languageId)) c.fail('LANGUAGE_EMITTER_UNSUPPORTED', String(languageId));
    const analysis = checker.analyze(request.program), emitted = emitter.emit(analysis, languageId);
    const cases = request.cases || [];
    if (!Array.isArray(cases) || cases.length > 256) c.fail('CASE_COUNT');
    for (const row of cases) {
      c.exact(row, ['function', 'args'], ['expected', 'error']);
      if (Object.hasOwn(row, 'expected') === Object.hasOwn(row, 'error')) c.fail('CASE_ORACLE_REQUIRED');
      if (!analysis.program.exports.includes(row.function) || !Array.isArray(row.args)) c.fail('CASE_FUNCTION_INVALID');
      if (Object.hasOwn(row, 'error') && (typeof row.error !== 'string' || !/^[A-Z_]{1,80}$/.test(row.error))) c.fail('CASE_ERROR_INVALID');
      const fn = analysis.program.functions.find(fn => fn.name === row.function);
      if (Object.hasOwn(row, 'expected') && !c.valueMatches(row.expected, fn.returns)) c.fail('CASE_EXPECTED_TYPE');
    }
    const extension = languageId === 'python' ? 'py' : 'js';
    const artifacts = [{path: 'module.' + extension, role: 'source', content: emitted.source, sha256: emitted.sourceSha256}];
    if (cases.length) { const content = testSource(cases, languageId === 'python'); artifacts.push({path: 'selftest.' + extension, role: 'verification', content, sha256: c.hash(content)}); }
    const organ = organs.getByLanguageId(languageId);
    const body = {
      schema: 'axm.code.program-compilation.v1', version: '1.0.0', status: 'TEST', result: 'CODE_PROGRAM_CANDIDATE_READY',
      languageId, programSha256: analysis.programSha256, languageBinding: {organId: organ.organId, organSha256: organ.sha256},
      exports: analysis.program.exports, functionOrder: analysis.functionOrder, nodeCount: analysis.nodeCount, atomCounts: analysis.atomCounts,
      limits: c.LIMITS, artifacts, sourceMap: emitted.sourceMap, typedNodes: analysis.facts,
      reusableFunctions: analysis.program.functions.map(fn => ({name: fn.name, structuralSha256: reuse.extract(analysis, fn.name).structuralSha256})),
      verification: {typeChecked: true, emittedCases: cases.length, executed: false, runtimeResult: 'NOT_RUN'},
      truth: {deterministicSourceGeneration: true, sourceIsCandidate: true, nativeLanguageLevelsUnchanged: true, arbitrarySourceExecution: false, filesystemMutation: false}, authority: AUTHORITY
    };
    return c.freeze({...body, compilationSha256: c.hash(body)});
  } catch (error) { return c.freeze({schema: 'axm.code.program-compilation.v1', result: 'CODE_PROGRAM_HELD', errorCode: String(error.message), authority: AUTHORITY}); }
}
function compileRecipe({id, languageId} = {}) { const recipe = recipes.getRecipe(id); return compile({program: recipe.program, languageId, cases: recipe.cases}); }
function handle(input = {}) {
  const request = c.data(input);
  c.exact(request, ['action'], ['program', 'languageId', 'cases', 'id', 'archive', 'origin', 'structuralSha256', 'name']);
  const {action, ...args} = request;
  if (action === 'catalog') { c.exact(args, []); return catalog(); }
  if (action === 'validate') { c.exact(args, ['program']); return validate(args.program); }
  if (action === 'compile') return compile(args);
  if (action === 'recipe') { c.exact(args, ['id', 'languageId']); return compileRecipe(args); }
  if (action === 'capture') { c.exact(args, ['program'], ['archive', 'origin']); return reuse.remember(args); }
  if (action === 'restore') { c.exact(args, ['archive', 'structuralSha256'], ['name']); return reuse.restore(args); }
  c.fail('ACTION_UNKNOWN', String(action));
}
module.exports = {AUTHORITY, LANGUAGE_IDS, catalog, validate, compile, compileRecipe, handle, getRecipe: recipes.getRecipe, emptyArchive: reuse.emptyArchive, remember: reuse.remember, restore: reuse.restore};
