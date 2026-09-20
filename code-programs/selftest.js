'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const api = require('./index.js');
const c = require('./common.js');
const checker = require('./checker.js');
const reuse = require('./reuse.js');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-code-program-proof-'));
const python = [process.env.AXM_PYTHON, 'python3', 'python'].filter(Boolean).find(cmd => spawnSync(cmd, ['--version'], {encoding: 'utf8'}).status === 0);
assert(python, 'Python runtime required');
let compileCount = 0, caseCount = 0, refusalCount = 0, generatedTestRuns = 0;
const exercised = new Set(), outputDigests = [];
const ref = name => ({op: 'ref', name});
const lit = (value, type = typeof value) => ({op: 'literal', type, value});
const binary = (op, left, right) => ({op, left, right});
const unary = (op, value) => ({op, value});
const fn = (name, params, returns, body) => ({name, params: Object.entries(params).map(([name, type]) => ({name, type})), returns, body});
const program = (name, functions, exports = functions.map(f => f.name)) => ({schema: 'axm.code.program.v1', name, functions, exports});
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {encoding: 'utf8', timeout: 10000, maxBuffer: 8 * 1024 * 1024, env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}, ...options});
  assert.ifError(result.error);
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  return result.stdout;
}
function runBoth(source, cases, label, extraSource = null) {
  const snapshots = [];
  for (const languageId of api.LANGUAGE_IDS) {
    const output = api.compile({program: source, languageId, cases: cases.slice(0, 256)});
    assert.equal(output.result, 'CODE_PROGRAM_CANDIDATE_READY', output.errorCode);
    assert.deepEqual(output, api.compile({program: source, languageId, cases: cases.slice(0, 256)}));
    assert.equal(output.verification.executed, false);
    assert.equal(output.verification.runtimeResult, 'NOT_RUN');
    assert(Object.values(output.authority).every(v => v === false));
    const core = {...output}; delete core.compilationSha256;
    assert.equal(c.hash(core), output.compilationSha256);
    for (const op of Object.keys(output.atomCounts)) exercised.add(op);
    const folder = path.join(temporary, String(compileCount++)); fs.mkdirSync(folder);
    for (const artifact of output.artifacts) { assert.equal(c.hash(artifact.content), artifact.sha256); fs.writeFileSync(path.join(folder, artifact.path), artifact.content); }
    assert(output.sourceMap.every(row => row.startLine > 0 && row.endLine >= row.startLine && row.endLine <= output.artifacts[0].content.split('\n').length));
    fs.writeFileSync(path.join(folder, 'cases.json'), JSON.stringify(cases));
    const javascriptHarness = `const fs=require('node:fs'); const f=require('./module.js'); const cases=JSON.parse(fs.readFileSync('cases.json','utf8')); const before=JSON.stringify(cases); const out=cases.map(c=>{try{return {ok:true,value:f[c.function](...c.args)}}catch(e){return {ok:false,error:e.message}}}); if(before!==JSON.stringify(cases))throw Error('INPUT_MUTATED'); process.stdout.write(JSON.stringify(out));`;
    const pythonHarness = `import json\nfrom module import FUNCTIONS\ncases=json.load(open('cases.json',encoding='utf8'))\nbefore=json.dumps(cases)\nout=[]\nfor case in cases:\n    try:\n        out.append({'ok':True,'value':FUNCTIONS[case['function']](*case['args'])})\n    except Exception as error:\n        out.append({'ok':False,'error':str(error)})\nif before != json.dumps(cases):\n    raise AssertionError('INPUT_MUTATED')\nprint(json.dumps(out,allow_nan=False))\n`;
    const suffix = languageId === 'python' ? 'py' : 'js';
    fs.writeFileSync(path.join(folder, 'harness.' + suffix), languageId === 'python' ? pythonHarness : javascriptHarness);
    if (languageId === 'python') run(python, ['-c', "import ast,pathlib; ast.parse(pathlib.Path('module.py').read_text(encoding='utf8'))"], {cwd: folder});
    else run(process.execPath, ['--check', 'module.js'], {cwd: folder});
    run(languageId === 'python' ? python : process.execPath, ['selftest.' + suffix], {cwd: folder});
    generatedTestRuns++;
    const actual = JSON.parse(run(languageId === 'python' ? python : process.execPath, ['harness.' + suffix], {cwd: folder}));
    const expected = cases.map(row => Object.hasOwn(row, 'error') ? {ok: false, error: row.error} : {ok: true, value: row.expected});
    assert.deepEqual(actual, c.data(expected), label + '/' + languageId);
    caseCount += cases.length;
    snapshots.push(actual); outputDigests.push(output.artifacts[0].sha256);
    if (extraSource) {
      fs.writeFileSync(path.join(folder, 'extra.' + suffix), extraSource[languageId]);
      run(languageId === 'python' ? python : process.execPath, ['extra.' + suffix], {cwd: folder});
    }
  }
  assert.deepEqual(snapshots[0], snapshots[1], label + '/cross-language parity');
}
function held(value, code) { const report = api.validate(value); assert.equal(report.result, 'CODE_PROGRAM_HELD'); assert(report.errorCode.includes(code), report.errorCode + ' expected ' + code); refusalCount++; }

try {
  for (const row of api.catalog().recipes) { const recipe = api.getRecipe(row.id); runBoth(recipe.program, recipe.cases, recipe.id); }

  // Literal expected results exercise every operator, not merely compilation success.
  const fields = {}, fieldTypes = {}, expected = {};
  function add(name, expression, type, value) { fields[name] = expression; fieldTypes[name] = type; expected[name] = value; }
  for (const [op, value] of Object.entries({add:4, subtract:10, multiply:-21, divide:-7/3, remainder:1, min:-3, max:7, lt:false, lte:false, gt:true, gte:true, equal:false, notEqual:true})) add(op, binary(op, ref('a'), ref('b')), typeof value, value);
  add('negativeRemainder', binary('remainder', ref('b'), lit(2)), 'number', -1);
  add('not', unary('not', lit(false)), 'boolean', true);
  add('negate', unary('negate', ref('b')), 'number', 3);
  add('abs', unary('abs', ref('b')), 'number', 3);
  add('floor', unary('floor', lit(-2.2)), 'number', -3);
  add('ceil', unary('ceil', lit(-2.2)), 'number', -2);
  add('and', binary('and', lit(true), lit(false)), 'boolean', false);
  add('or', binary('or', lit(true), lit(false)), 'boolean', true);
  add('concat', binary('concat', ref('text'), lit('!')), 'string', 'A😀B!');
  add('length', unary('length', ref('text')), 'number', 3);
  add('contains', binary('contains', ref('text'), lit('😀')), 'boolean', true);
  add('startsWith', binary('startsWith', ref('text'), lit('A')), 'boolean', true);
  add('endsWith', binary('endsWith', ref('text'), lit('B')), 'boolean', true);
  add('trim', unary('trim', lit('\t café \n')), 'string', 'café');
  add('asciiUpper', unary('asciiUpper', lit('école ß 😀')), 'string', 'éCOLE ß 😀');
  add('asciiLower', unary('asciiLower', lit('ÉCOLE ß 😀')), 'string', 'École ß 😀');
  add('isNull', unary('isNull', ref('maybe')), 'boolean', true);
  add('coalesce', {op:'coalesce', value:ref('maybe'), fallback:lit('fallback')}, 'string', 'fallback');
  add('list', {op:'list', itemType:'number', items:[lit(3),lit(1),lit(2)]}, {list:'number'}, [3,1,2]);
  add('at', {op:'at',input:ref('values'),index:lit(1),fallback:lit(9)}, 'number', 1);
  add('atFallback', {op:'at',input:ref('values'),index:lit(99),fallback:lit(9)}, 'number', 9);
  add('slice', {op:'slice',input:ref('text'),start:lit(1),end:lit(2)}, 'string', '😀');
  add('some', {op:'some',input:ref('values'),item:'each',body:binary('equal',ref('each'),lit(1))}, 'boolean', true);
  add('every', {op:'every',input:ref('values'),item:'each',body:binary('gt',ref('each'),lit(0))}, 'boolean', true);
  add('call', {op:'call',function:'bump',args:[lit(9)]}, 'number', 10);
  add('field', {op:'field',value:{op:'record',fields:{answer:lit(42)}},key:'answer'}, 'number', 42);
  add('recordEquality', binary('equal',lit({b:2,a:1},{record:{a:'number',b:'number'}}),lit({a:1,b:2},{record:{a:'number',b:'number'}})), 'boolean', true);
  add('lazyAnd', binary('and',lit(false),binary('gt',binary('divide',lit(1),lit(0)),lit(0))), 'boolean', false);
  add('lazyOr', binary('or',lit(true),binary('gt',binary('divide',lit(1),lit(0)),lit(0))), 'boolean', true);
  add('lazyAt', {op:'at',input:ref('values'),index:lit(0),fallback:binary('divide',lit(1),lit(0))}, 'number', 3);
  const comprehensive = program('operatorProbe', [fn('bump',{amount:'number'},'number',binary('add',ref('amount'),lit(1))),fn('probe',{a:'number',b:'number',text:'string',values:{list:'number'},maybe:{nullable:'string'}},{record:fieldTypes},{op:'record',fields})], ['probe']);
  runBoth(comprehensive, [{function:'probe',args:[7,-3,'A😀B',[3,1,2],null],expected}], 'operator-matrix');
  assert.deepEqual([...exercised].sort(), [...checker.OPERATIONS].sort(), 'every advertised operation executed');

  const edgePrograms = program('edgeCases', [
    fn('quotient',{leftValue:'number',rightValue:'number'},'number',binary('divide',ref('leftValue'),ref('rightValue'))),
    fn('product',{leftValue:'number',rightValue:'number'},'number',binary('multiply',ref('leftValue'),ref('rightValue'))),
    fn('pick',{values:{list:'number'},position:'number'},'number',{op:'at',input:ref('values'),index:ref('position'),fallback:lit(0)}),
    fn('sortWords',{values:{list:'string'}},{list:'string'},{op:'sortBy',input:ref('values'),item:'word',key:ref('word'),descending:false}),
    fn('emptyEvery',{values:{list:'number'}},'boolean',{op:'every',input:ref('values'),item:'each',body:binary('gt',ref('each'),lit(10))}),
    fn('nestedMap',{values:{list:'number'}},{list:{list:'number'}},{op:'map',input:ref('values'),item:'outerValue',body:{op:'map',input:ref('values'),item:'innerValue',body:binary('add',ref('outerValue'),ref('innerValue'))}}),
    fn('ord',{text:'string'},'string',unary('asciiUpper',ref('text')))
  ]);
  runBoth(edgePrograms, [
    {function:'quotient',args:[1,0],error:'DIVISION_BY_ZERO'},
    {function:'quotient',args:[1,true],error:'VALUE_TYPE'},
    {function:'quotient',args:[1,'2'],error:'VALUE_TYPE'},
    {function:'quotient',args:[1],error:'ARGUMENT_COUNT'},
    {function:'quotient',args:[1,2,3],error:'ARGUMENT_COUNT'},
    {function:'quotient',args:[0,-1],expected:0},
    {function:'product',args:[9007199254740991,2],error:'NUMBER_RANGE'},
    {function:'pick',args:[[1,2],-1],error:'INDEX_INVALID'},
    {function:'pick',args:[[1,2],0.5],error:'INDEX_INVALID'},
    {function:'pick',args:[[],0],expected:0},
    {function:'pick',args:[Array(4097).fill(1),0],error:'LIST_LIMIT'},
    {function:'sortWords',args:[['😀','\ue000','a','😀']],expected:['a','\ue000','😀','😀']},
    {function:'emptyEvery',args:[[]],expected:true},
    {function:'nestedMap',args:[Array(200).fill(1)],error:'STEP_LIMIT'},
    {function:'ord',args:['hello😀'],expected:'HELLO😀'}
  ].filter(row=>row.function!=='pick'||row.args[0].length<=4096), 'runtime-edge-cases', {
    javascript: `const assert=require('node:assert/strict'),f=require('./module.js');assert.throws(()=>f.quotient(NaN,1),/NUMBER_RANGE/);assert.throws(()=>f.quotient(Infinity,1),/NUMBER_RANGE/);assert.throws(()=>f.pick(Array(4097).fill(1),0),/LIST_LIMIT/);const a=[1];Object.defineProperty(a,'0',{get(){throw Error('GETTER_EXECUTED')}});assert.throws(()=>f.pick(a,0),/VALUE_TYPE/);assert.throws(()=>f.ord('\\ud800'),/UNICODE_SURROGATE/);`,
    python: `from module import FUNCTIONS\nchecks=[(lambda:FUNCTIONS['quotient'](float('nan'),1),'NUMBER_RANGE'),(lambda:FUNCTIONS['quotient'](float('inf'),1),'NUMBER_RANGE'),(lambda:FUNCTIONS['pick']([1]*4097,0),'LIST_LIMIT'),(lambda:FUNCTIONS['ord']('\\ud800'),'UNICODE_SURROGATE')]\nfor check,code in checks:\n    try:\n        check()\n    except Exception as error:\n        assert str(error)==code\n    else:\n        raise AssertionError('EXPECTED_REFUSAL')\n`
  });

  // Seeded scalar expression trees use a small independent numeric oracle.
  let seed = 0x102a7;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed; };
  function tree(depth) { if (!depth) return random()%2 ? ref('inputValue') : lit((random()%17)-8); const op=['add','subtract','multiply','min','max'][random()%5]; return binary(op,tree(depth-1),tree(depth-1)); }
  function oracle(node, value) { if(node.op==='literal')return node.value;if(node.op==='ref')return value;const a=oracle(node.left,value),b=oracle(node.right,value);switch(node.op){case 'add':return a+b;case 'subtract':return a-b;case 'multiply':return a*b;case 'min':return Math.min(a,b);case 'max':return Math.max(a,b);default:throw Error('oracle unsupported');} }
  for(let batch=0;batch<3;batch++) {
    const functions=Array.from({length:16},(_,i)=>fn('generated'+i,{inputValue:'number'},'number',tree(4)));
    const cases=functions.flatMap(f=>Array.from({length:16},(_,i)=>({function:f.name,args:[i-8],expected:oracle(f.body,i-8)})));
    runBoth(program('seededBatch'+batch,functions),cases,'seeded-oracle-'+batch);
  }

  const base = api.getRecipe('bounded-damage').program;
  const mutate = change => {const value=c.data(base);change(value);return value;};
  held(mutate(p=>{p.extra=true;}),'UNKNOWN_FIELD');
  held(mutate(p=>{p.functions[0].body={op:'eval',source:'process.exit()'};}),'OPERATION_UNSUPPORTED');
  held(mutate(p=>{p.functions[0].body=ref('unknown');}),'REFERENCE_UNKNOWN');
  held(mutate(p=>{p.functions[0].returns='string';}),'RETURN_TYPE_MISMATCH');
  held(mutate(p=>{p.functions[0].params[0].type='any';}),'OBJECT_REQUIRED');
  held(mutate(p=>{p.functions[0].name='bad;code';}),'IDENTIFIER_INVALID');
  held(mutate(p=>{p.functions[0].name='Reflect';}),'IDENTIFIER_INVALID');
  held(mutate(p=>{p.functions[0].name='arguments';}),'IDENTIFIER_INVALID');
  held(mutate(p=>{p.functions.push(p.functions[0]);}),'DUPLICATE_FUNCTION');
  held(mutate(p=>{p.functions[0].params.push(p.functions[0].params[0]);}),'DUPLICATE_PARAMETER');
  held(mutate(p=>{p.functions[0].body=binary('add',lit('x'),lit(1));}),'TYPE_MISMATCH');
  held(mutate(p=>{p.functions[0].body={op:'call',function:'remainingHealth',args:[lit(1),lit(2),lit(3)]};}),'RECURSION_REFUSED');
  held(mutate(p=>{p.functions[0].body={op:'call',function:'missingFunction',args:[]};}),'FUNCTION_UNKNOWN');
  held(mutate(p=>{p.functions[0].body={op:'call',function:'remainingHealth',args:[]};}),'CALL_ARITY');
  held(mutate(p=>{p.functions[0].body={op:'let',name:'health',value:lit(1),body:ref('health')};}),'BINDING_SHADOWED');
  held(mutate(p=>{p.functions[0].body={op:'if',condition:lit(true),then:lit(1),else:lit('no')};}),'BRANCH_TYPE_MISMATCH');
  held(mutate(p=>{p.functions[0].body={op:'field',value:lit({}, {record:{}}),key:'missing'};}),'FIELD_UNKNOWN');
  held(mutate(p=>{p.functions[0].body=lit(true,'number');}),'LITERAL_TYPE_MISMATCH');
  held(mutate(p=>{p.functions[0].body=lit(Infinity);}),'NUMBER_RANGE');
  held(mutate(p=>{p.functions[0].body=lit('\ud800');}),'UNICODE_SURROGATE');
  held(mutate(p=>{p.functions[0].body=lit(undefined);}),'JSON_DATA_REQUIRED');
  held(mutate(p=>{p.functions[0].body=lit(1);for(let i=0;i<50;i++)p.functions[0].body=unary('negate',p.functions[0].body);}),'PROGRAM_COMPLEXITY_LIMIT');
  const cyclic=c.data(base);cyclic.loop=cyclic;held(cyclic,'CYCLIC_DATA');
  const accessor=c.data(base);Object.defineProperty(accessor,'name',{enumerable:true,get(){throw Error('GETTER_EXECUTED')}});held(accessor,'DATA_PROPERTY_INVALID');
  const proto=JSON.parse(JSON.stringify(base));proto.functions[0].body=JSON.parse('{"op":"literal","type":{"record":{"__proto__":"string"}},"value":{"__proto__":"x"}}');held(proto,'RESERVED_KEY');
  assert.equal(api.compile({program:base,languageId:'rust'}).errorCode,'LANGUAGE_EMITTER_UNSUPPORTED:rust');refusalCount++;
  assert.equal(api.compile({program:base,languageId:'python',execute:true}).errorCode,'UNKNOWN_FIELD:/execute');refusalCount++;

  // Static text remains data, even when it looks like source, paths or shell syntax.
  const payload=`'); require('node:fs').writeFileSync('ESCAPED','bad'); // $(touch ESCAPED) \u2028 😀`;
  runBoth(program('literalPreservation',[fn('verbatim',{},'string',lit(payload))]),[{function:'verbatim',args:[],expected:payload}],'literal-injection');
  assert(!fs.existsSync(path.join(temporary,'ESCAPED')));

  // Additive function/dependency capture, reload and parameter-name-independent deduplication.
  let archive = api.emptyArchive();
  for(const row of api.catalog().recipes)archive=api.remember({archive,program:api.getRecipe(row.id).program,origin:'selftest'}).archive;
  const countBefore=archive.entries.length;
  const again=api.remember({archive,program:api.getRecipe('invoice-totals').program,origin:'selftest'});
  assert.equal(again.addedCount,0);assert.equal(again.archive.archiveSha256,archive.archiveSha256);
  const renamed=c.data(base);renamed.name='renamedModule';renamed.functions[0].name='differentName';renamed.exports=['differentName'];renamed.functions[0].params[0].name='life';
  function renameRefs(node){if(node&&typeof node==='object'){if(node.op==='ref'&&node.name==='health')node.name='life';Object.values(node).forEach(renameRefs);}}
  renameRefs(renamed);
  assert.equal(api.remember({archive,program:renamed,origin:'rename-check'}).addedCount,0);
  const changed=c.data(base);changed.functions[0].body.left.value=1;
  assert.equal(api.remember({archive,program:changed,origin:'logic-change'}).addedCount,1);
  assert.equal(archive.entries.length,countBefore);
  const invoiceCapture=api.remember({program:api.getRecipe('invoice-totals').program});
  const root=invoiceCapture.captured.find(row=>row.function==='invoice');
  const restored=api.restore({archive:invoiceCapture.archive,structuralSha256:root.structuralSha256,name:'restoredInvoice'});
  runBoth(restored,api.getRecipe('invoice-totals').cases.map(row=>({...row,function:'restoredInvoice'})),'restored-dependency-closure');
  const reordered=c.data(comprehensive);reordered.functions.reverse();
  assert.equal(api.compile({program:reordered,languageId:'python'}).compilationSha256,api.compile({program:comprehensive,languageId:'python'}).compilationSha256);
  const corrupted=c.data(archive);corrupted.entries[0].program.name='tampered';assert.throws(()=>reuse.validateArchive(corrupted),/ARCHIVE_DIGEST_MISMATCH/);refusalCount++;
  const replay=c.data(archive);replay.entries[0].program.name='tampered';replay.archiveSha256=c.hash({schema:replay.schema,entries:replay.entries});assert.throws(()=>reuse.validateArchive(replay),/ARCHIVE_ENTRY_MISMATCH/);refusalCount++;
  fs.writeFileSync(path.join(temporary,'archive.json'),JSON.stringify(archive));
  assert.deepEqual(reuse.validateArchive(JSON.parse(fs.readFileSync(path.join(temporary,'archive.json'),'utf8'))),archive);

  // Real CLI and backend routes expose the same compiler; neither executes candidates.
  const cli=path.resolve(__dirname,'../bin/axm-code-program.js');
  const input=JSON.stringify({action:'recipe',id:'invoice-totals',languageId:'python'});
  const fromCli=JSON.parse(run(process.execPath,[cli],{input}));
  assert.deepEqual(fromCli,api.compileRecipe({id:'invoice-totals',languageId:'python'}));
  const core=require('../local-backend/core.js').createCore();
  assert(core.handle({op:'health'}).operations.includes('code-program'));
  assert.deepEqual(core.handle({op:'code-program',input:JSON.parse(input)}),fromCli);
  for(const bad of [Buffer.from('{'),Buffer.from([0xff]),Buffer.alloc(1048577,32)]) {
    const result=spawnSync(process.execPath,[cli],{input:bad,encoding:'utf8',timeout:5000});
    assert.equal(result.status,2);assert.equal(result.stdout,'');assert.equal(JSON.parse(result.stderr).authority,'NONE');refusalCount++;
  }
  console.log(JSON.stringify({ok:true,languageEmitters:2,operationsExecuted:exercised.size,standaloneCompilationsExecuted:compileCount,generatedTestRuns,behaviorChecks:caseCount,seededOracleCasesPerLanguage:768,compilerAndBoundaryRefusals:refusalCount,capturedUniqueFunctions:archive.entries.length,restoredDependenciesExecuted:true,offlineCliAndBackend:true,generatedSourcesSha256:c.hash(outputDigests),runtimeScope:'Bounded typed data programs; not arbitrary JavaScript/Python or all 102 languages.'},null,2));
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
