'use strict';

const c = require('./common.js');
const jsRuntime = require('./runtime-js.js');
const pythonRuntime = require('./runtime-python.js');

function literal(value, python) {
  if (value === null) return python ? 'None' : 'null';
  if (typeof value === 'boolean') return python ? (value ? 'True' : 'False') : String(value);
  if (Array.isArray(value)) return '[' + value.map(v => literal(v, python)).join(', ') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort(c.compare).map(k => JSON.stringify(k) + ': ' + literal(value[k], python)).join(', ') + '}';
  return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
function emit(analysis, languageId) {
  const python = languageId === 'python';
  if (!python && languageId !== 'javascript') c.fail('LANGUAGE_EMITTER_UNSUPPORTED', String(languageId));
  const lit = value => literal(value, python);
  const names = new Map(analysis.program.functions.map((fn, i) => [fn.name, '_axm_f' + i]));
  let next = 0;
  const fresh = () => '_axm_v' + next++;
  const lambda = (params, expression) => python ? `(lambda ${params.join(', ')}: ${expression})` : `((${params.join(', ')}) => ${expression})`;
  function expression(node, env) {
    const e = field => expression(node[field], env);
    const binary = op => `(${e('left')} ${op} ${e('right')})`;
    const unary = op => `(${op}${e('value')})`;
    const op = node.op;
    let out;
    if (op === 'literal') out = node.value && typeof node.value === 'object' ? `_axm_literal(_axm_ctx, ${lit(node.value)}, ${lit(node.type)})` : lit(node.value);
    else if (op === 'ref') out = env.get(node.name);
    else if (op === 'field') out = `${e('value')}[${lit(node.key)}]`;
    else if (op === 'record') out = '{' + Object.entries(node.fields).map(([k, value]) => lit(k) + ': ' + expression(value, env)).join(', ') + '}';
    else if (op === 'list') out = '[' + node.items.map(value => expression(value, env)).join(', ') + ']';
    else if (op === 'call') out = names.get(node.function) + '(_axm_ctx' + node.args.map(value => ', ' + expression(value, env)).join('') + ')';
    else if (op === 'let') { const name = fresh(), scope = new Map(env); scope.set(node.name, name); out = `${lambda([name], expression(node.body, scope))}(${e('value')})`; }
    else if (op === 'if') out = python ? `(${e('then')} if ${e('condition')} else ${e('else')})` : `(${e('condition')} ? ${e('then')} : ${e('else')})`;
    else if (['map', 'filter', 'some', 'every', 'fold', 'sortBy'].includes(op)) {
      const item = fresh(), scope = new Map(env); scope.set(node.item, item);
      if (op === 'fold') { const acc = fresh(); scope.set(node.acc, acc); out = `_axm_fold(_axm_ctx, ${e('input')}, ${e('initial')}, ${lambda([acc, item], expression(node.body, scope))})`; }
      else if (op === 'sortBy') out = `_axm_sort(_axm_ctx, ${e('input')}, ${lambda([item], expression(node.key, scope))}, ${lit(node.descending)})`;
      else out = `_axm_seq(_axm_ctx, ${lit(op)}, ${e('input')}, ${lambda([item], expression(node.body, scope))})`;
    } else if (op === 'at') out = `_axm_at(${e('input')}, ${e('index')}, ${lambda([], e('fallback'))})`;
    else if (op === 'slice') out = `_axm_slice(${e('input')}, ${e('start')}, ${e('end')})`;
    else if (op === 'join') out = `_axm_join(${e('input')}, ${e('separator')})`;
    else if (op === 'length') out = python ? `_axm_b.len(${e('value')})` : `[...${e('value')}].length`;
    else if (['trim', 'asciiLower', 'asciiUpper'].includes(op)) out = `_axm_${{trim:'trim',asciiLower:'lower',asciiUpper:'upper'}[op]}(${e('value')})`;
    else if (op === 'not') out = unary(python ? 'not ' : '!');
    else if (op === 'negate') out = unary('-');
    else if (op === 'abs') out = `${python ? '_axm_b.abs' : 'Math.abs'}(${e('value')})`;
    else if (op === 'floor' || op === 'ceil') out = `${python ? '_axm_math.' : 'Math.'}${op}(${e('value')})`;
    else if (op === 'isNull') out = `(${e('value')} ${python ? 'is None' : '=== null'})`;
    else if (op === 'coalesce') out = `_axm_coalesce(${e('value')}, ${lambda([], e('fallback'))})`;
    else if (op === 'equal' || op === 'notEqual') out = `${op === 'notEqual' ? (python ? 'not ' : '!') : ''}_axm_equal(_axm_ctx, ${e('left')}, ${e('right')})`;
    else if (op === 'and' || op === 'or') out = binary(python ? op : (op === 'and' ? '&&' : '||'));
    else if (['add', 'subtract', 'multiply'].includes(op)) {
      const sign = {add:'+',subtract:'-',multiply:'*'}[op];
      out = python ? `(_axm_b.float(${e('left')}) ${sign} _axm_b.float(${e('right')}))` : binary(sign);
    } else if (op === 'divide' || op === 'remainder') out = `_axm_${op === 'divide' ? 'div' : 'rem'}(${e('left')}, ${e('right')})`;
    else if (op === 'min' || op === 'max') out = `${python ? '_axm_b.' : 'Math.'}${op}(${e('left')}, ${e('right')})`;
    else if (['lt', 'lte', 'gt', 'gte'].includes(op)) out = binary({lt:'<',lte:'<=',gt:'>',gte:'>='}[op]);
    else if (op === 'concat') out = binary('+');
    else if (op === 'split') out = `_axm_split(${e('left')}, ${e('right')})`;
    else if (op === 'contains') out = `_axm_contains(${e('left')}, ${e('right')})`;
    else if (op === 'startsWith' || op === 'endsWith') out = `${e('left')}.${python ? op.toLowerCase() : op}(${e('right')})`;
    else c.fail('EMISSION_UNSUPPORTED', op);
    return `_axm_step(_axm_ctx, ${out})`;
  }
  const lines = [python ? '# Generated by AXM code-programs v1. Candidate source; verification remains separate.' : '// Generated by AXM code-programs v1. Candidate source; verification remains separate.', python ? pythonRuntime : jsRuntime];
  const sourceMap = [];
  for (const name of analysis.functionOrder) {
    const fn = analysis.program.functions.find(f => f.name === name);
    const params = fn.params.map(() => fresh());
    const env = new Map(fn.params.map((param, i) => [param.name, params[i]]));
    const startLine = lines.join('\n').split('\n').length + 1;
    const body = expression(fn.body, env);
    lines.push('', `${python ? '#' : '//'} ${name}: ${c.canonical(fn.returns)}`);
    const args = ['_axm_ctx', ...params].join(', ');
    if (python) lines.push(`def ${names.get(name)}(${args}):`, `    return ${body}`, '');
    else lines.push(`function ${names.get(name)}(${args}) {`, `  return ${body};`, '}');
    sourceMap.push({function: name, irPath: '/functions/' + analysis.program.functions.findIndex(f => f.name === name), startLine, endLine: lines.join('\n').split('\n').length});
  }
  for (const name of analysis.program.exports) {
    const fn = analysis.program.functions.find(f => f.name === name);
    const args = `${names.get(name)}, _axm_args, ${lit(fn.params.map(p => p.type))}, ${lit(fn.returns)}`;
    if (python) lines.push(`def ${name}(*_axm_args):`, `    return _axm_entry(${args})`, '');
    else lines.push(`function ${name}(..._axm_args) { return _axm_entry(${args}); }`);
  }
  lines.push(python ? 'FUNCTIONS = {' + analysis.program.exports.map(name => `${lit(name)}: ${name}`).join(', ') + '}' : 'module.exports = Object.freeze({' + analysis.program.exports.join(', ') + '});', '');
  const source = lines.join('\n');
  if (Buffer.byteLength(source) > c.LIMITS.bytes) c.fail('SOURCE_BYTES_LIMIT');
  return {source, sourceSha256: c.hash(source), sourceMap};
}
module.exports = {emit, literal};
