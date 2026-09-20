'use strict';

// Declarative source only. Each example is an independently callable code program.
const c = require('./common.js');
const ref = name => ({op: 'ref', name});
const lit = (value, type = typeof value) => ({op: 'literal', type, value});
const field = (value, key) => ({op: 'field', value, key});
const binary = (op, left, right) => ({op, left, right});
const unary = (op, value) => ({op, value});
const record = fields => ({op: 'record', fields});
const fn = (name, params, returns, body) => ({name, params: Object.entries(params).map(([name, type]) => ({name, type})), returns, body});
const program = (name, functions, exports = functions.map(f => f.name)) => ({schema: 'axm.code.program.v1', name, functions, exports});
const sum = input => ({op: 'fold', input, item: 'amount', acc: 'total', initial: lit(0), body: binary('add', ref('total'), ref('amount'))});

const itemType = {record: {name: 'string', quantity: 'number', unitPrice: 'number', active: 'boolean'}};
const item = ref('entry');
const cost = {op: 'call', function: 'lineCost', args: [field(item, 'quantity'), field(item, 'unitPrice')]};
const invoice = program('invoiceTotals', [
  fn('lineCost', {quantity: 'number', unitPrice: 'number'}, 'number', binary('multiply', ref('quantity'), ref('unitPrice'))),
  fn('invoice', {entries: {list: itemType}, taxRate: 'number'}, {record: {subtotal: 'number', tax: 'number', total: 'number', labels: {list: 'string'}}}, {
    op: 'let', name: 'activeEntries', value: {op: 'filter', input: ref('entries'), item: 'entry', body: field(item, 'active')}, body: {
      op: 'let', name: 'subtotalValue', value: sum({op: 'map', input: ref('activeEntries'), item: 'entry', body: cost}), body: record({
        subtotal: ref('subtotalValue'), tax: binary('multiply', ref('subtotalValue'), ref('taxRate')),
        total: binary('add', ref('subtotalValue'), binary('multiply', ref('subtotalValue'), ref('taxRate'))),
        labels: {op: 'map', input: ref('activeEntries'), item: 'entry', body: unary('trim', field(item, 'name'))}
      })
    }
  })
], ['invoice']);

const rankType = {record: {name: 'string', score: 'number'}};
const ranking = program('stableLeaderboard', [fn('leaderboard', {players: {list: rankType}, limit: 'number'}, {list: rankType}, {
  op: 'slice', input: {op: 'sortBy', input: ref('players'), item: 'player', key: field(ref('player'), 'score'), descending: true}, start: lit(0), end: ref('limit')
})]);
const normalized = unary('asciiLower', unary('trim', ref('label')));
const cleanLabels = program('cleanLabelPipeline', [fn('cleanLabels', {labels: {list: 'string'}}, {list: 'string'}, {
  op: 'filter', input: {op: 'map', input: ref('labels'), item: 'label', body: normalized}, item: 'clean', body: binary('gt', unary('length', ref('clean')), lit(0))
})]);
const required = program('requiredFields', [fn('validContact', {contact: {record: {name: 'string', email: 'string'}}}, 'boolean', binary('and', binary('gt', unary('length', unary('trim', field(ref('contact'), 'name'))), lit(0)), binary('contains', field(ref('contact'), 'email'), lit('@'))))]);
const clamp = program('boundedDamage', [fn('remainingHealth', {health: 'number', damage: 'number', armor: 'number'}, 'number', binary('max', lit(0), binary('subtract', ref('health'), binary('max', lit(0), binary('subtract', ref('damage'), ref('armor'))))))]);
const statistics = program('numericSummary', [fn('summary', {values: {list: 'number'}}, {record: {count: 'number', total: 'number', mean: 'number'}}, {
  op: 'let', name: 'totalValue', value: sum(ref('values')), body: record({count: unary('length', ref('values')), total: ref('totalValue'), mean: {op: 'if', condition: binary('equal', unary('length', ref('values')), lit(0)), then: lit(0), else: binary('divide', ref('totalValue'), unary('length', ref('values')))}})
})]);
const nullable = program('nullableDefaults', [fn('displayName', {preferred: {nullable: 'string'}, fallbackName: 'string'}, 'string', {op: 'coalesce', value: ref('preferred'), fallback: ref('fallbackName')})]);
const tokens = program('splitAndJoin', [fn('retokenize', {text: 'string', separator: 'string', replacement: 'string'}, 'string', {op: 'join', input: binary('split', ref('text'), ref('separator')), separator: ref('replacement')})]);

const RECIPES = c.freeze([
  {id: 'invoice-totals', description: 'Filter active lines, call a reusable cost function, sum and calculate tax.', program: invoice, cases: [{function: 'invoice', args: [[{name: ' bolts ', quantity: 3, unitPrice: 4, active: true}, {name: 'skip', quantity: 50, unitPrice: 20, active: false}], 0.25], expected: {subtotal: 12, tax: 3, total: 15, labels: ['bolts']}}, {function: 'invoice', args: [[], 0.21], expected: {subtotal: 0, tax: 0, total: 0, labels: []}}]},
  {id: 'stable-leaderboard', description: 'Stable descending score order and explicit top-N slicing.', program: ranking, cases: [{function: 'leaderboard', args: [[{name: 'A', score: 7}, {name: 'B', score: 9}, {name: 'C', score: 9}], 2], expected: [{name: 'B', score: 9}, {name: 'C', score: 9}]}, {function: 'leaderboard', args: [[], 0], expected: []}]},
  {id: 'clean-labels', description: 'ASCII case/whitespace normalization, preserving all non-ASCII characters.', program: cleanLabels, cases: [{function: 'cleanLabels', args: [['  HELLO ', '\t', 'ÉCOLE', '😀 A']], expected: ['hello', 'École', '😀 a']}]},
  {id: 'required-fields', description: 'Typed contact record with non-empty name and a simple @ presence check; not full email validation.', program: required, cases: [{function: 'validContact', args: [{name: 'Mike', email: 'a@b'}], expected: true}, {function: 'validContact', args: [{name: ' ', email: 'a@b'}], expected: false}]},
  {id: 'bounded-damage', description: 'Compose armor absorption and health floor from reusable arithmetic atoms.', program: clamp, cases: [{function: 'remainingHealth', args: [100, 30, 5], expected: 75}, {function: 'remainingHealth', args: [10, 30, 5], expected: 0}]},
  {id: 'numeric-summary', description: 'Reuse an aggregate through an immutable binding, with explicit empty-input behavior.', program: statistics, cases: [{function: 'summary', args: [[2, 4, 6]], expected: {count: 3, total: 12, mean: 4}}, {function: 'summary', args: [[]], expected: {count: 0, total: 0, mean: 0}}]},
  {id: 'nullable-defaults', description: 'Use an explicit nullable string and a lazy fallback.', program: nullable, cases: [{function: 'displayName', args: [null, 'Guest'], expected: 'Guest'}, {function: 'displayName', args: ['', 'Guest'], expected: ''}]},
  {id: 'split-and-join', description: 'Literal separator replacement via split and join, without regex or source interpolation.', program: tokens, cases: [{function: 'retokenize', args: ['a::b::', '::', '/'], expected: 'a/b/'}, {function: 'retokenize', args: ['x', '', ','], error: 'EMPTY_SEPARATOR'}]}
]);
function getRecipe(id) { const recipe = RECIPES.find(r => r.id === id); if (!recipe) c.fail('RECIPE_UNKNOWN', String(id)); return recipe; }
module.exports = {RECIPES, getRecipe};
