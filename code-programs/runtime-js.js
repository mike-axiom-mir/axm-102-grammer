'use strict';

// Original runtime source emitted into each standalone CommonJS candidate.
module.exports = String.raw`'use strict';

function _axm_error(code) { throw new Error(code); }
function _axm_tick(ctx) { if (--ctx[0] < 0) _axm_error('STEP_LIMIT'); }
function _axm_step(ctx, value) {
  _axm_tick(ctx);
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 9007199254740991)) _axm_error('NUMBER_RANGE');
  if (typeof value === 'string') {
    ctx[0] -= [...value].length; if (ctx[0] < 0) _axm_error('STEP_LIMIT');
    if (value.length > 32768 || [...value].length > 16384) _axm_error('STRING_LIMIT');
    for (const ch of value) { const cp = ch.codePointAt(0); if (cp >= 0xd800 && cp <= 0xdfff) _axm_error('UNICODE_SURROGATE'); }
  }
  if (Array.isArray(value)) {
    if (value.length > 4096) _axm_error('LIST_LIMIT');
    ctx[0] -= value.length; if (ctx[0] < 0) _axm_error('STEP_LIMIT');
  }
  return Object.is(value, -0) ? 0 : value;
}
function _axm_check(ctx, value, wanted, depth = 0) {
  _axm_step(ctx, value);
  if (depth > 48) _axm_error('VALUE_DEPTH_LIMIT');
  if (wanted === 'null') { if (value !== null) _axm_error('VALUE_TYPE'); return; }
  if (typeof wanted === 'string') { if (typeof value !== wanted) _axm_error('VALUE_TYPE'); return; }
  if (wanted.nullable !== undefined) { if (value !== null) _axm_check(ctx, value, wanted.nullable, depth + 1); return; }
  if (wanted.list !== undefined) {
    if (!Array.isArray(value)) _axm_error('VALUE_TYPE');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) _axm_error('VALUE_TYPE');
    for (let i = 0; i < value.length; i++) {
      const descriptor = descriptors[i];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) _axm_error('VALUE_TYPE');
      _axm_check(ctx, descriptor.value, wanted.list, depth + 1);
    }
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) _axm_error('VALUE_TYPE');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Object.keys(wanted.record).sort(_axm_compare);
  if (Reflect.ownKeys(descriptors).length !== keys.length) _axm_error('VALUE_TYPE');
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) _axm_error('VALUE_TYPE');
    _axm_check(ctx, descriptor.value, wanted.record[key], depth + 1);
  }
}
function _axm_literal(ctx, value, wanted) { _axm_check(ctx, value, wanted); return value; }
function _axm_entry(fn, args, types, resultType) {
  if (args.length !== types.length) _axm_error('ARGUMENT_COUNT');
  const ctx = [100000];
  args.forEach((arg, i) => _axm_check(ctx, arg, types[i]));
  const value = fn(ctx, ...args);
  _axm_check(ctx, value, resultType);
  return value;
}
function _axm_index(value) { if (!Number.isSafeInteger(value) || value < 0) _axm_error('INDEX_INVALID'); return value; }
function _axm_div(left, right) { if (right === 0) _axm_error('DIVISION_BY_ZERO'); return left / right; }
function _axm_rem(left, right) { if (right === 0) _axm_error('DIVISION_BY_ZERO'); return left % right; }
function _axm_equal(ctx, left, right) {
  _axm_tick(ctx);
  if (left === right && (left === null || typeof left !== 'object')) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) return left.length === right.length && left.every((value, i) => _axm_equal(ctx, value, right[i]));
  const keys = Object.keys(left).sort(_axm_compare);
  return keys.length === Object.keys(right).length && keys.every(k => Object.hasOwn(right, k) && _axm_equal(ctx, left[k], right[k]));
}
function _axm_seq(ctx, kind, values, fn) {
  const output = [];
  for (const item of values) {
    _axm_tick(ctx);
    const value = fn(item);
    if (kind === 'map') output.push(value);
    else if (kind === 'filter' && value) output.push(item);
    else if (kind === 'some' && value) return true;
    else if (kind === 'every' && !value) return false;
  }
  return kind === 'some' ? false : kind === 'every' ? true : output;
}
function _axm_fold(ctx, values, initial, fn) { let value = initial; for (const item of values) { _axm_tick(ctx); value = fn(value, item); } return value; }
function _axm_compare(left, right) {
  if (typeof left === 'number') return left < right ? -1 : left > right ? 1 : 0;
  const a = [...left], b = [...right];
  for (let i = 0; i < Math.min(a.length, b.length); i++) { const d = a[i].codePointAt(0) - b[i].codePointAt(0); if (d) return d < 0 ? -1 : 1; }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}
function _axm_sort(ctx, values, fn, descending) {
  const decorated = values.map((value, index) => { _axm_tick(ctx); return {value, index, key: fn(value)}; });
  for (let i = 0; i < values.length * Math.max(1, values.length ? Math.floor(Math.log2(values.length)) + 1 : 0); i++) _axm_tick(ctx);
  decorated.sort((a, b) => { const order = _axm_compare(a.key, b.key); return (descending ? -order : order) || a.index - b.index; });
  return decorated.map(item => item.value);
}
function _axm_at(values, index, fallback) { _axm_index(index); return index < values.length ? values[index] : fallback(); }
function _axm_slice(value, start, end) { _axm_index(start); _axm_index(end); return typeof value === 'string' ? [...value].slice(start, end).join('') : value.slice(start, end); }
function _axm_join(values, separator) { return values.join(separator); }
function _axm_contains(left, right) { return left.includes(right); }
function _axm_split(value, separator) { if (!separator.length) _axm_error('EMPTY_SEPARATOR'); return value.split(separator); }
function _axm_trim(value) { return value.replace(/^[ \t\r\n\v\f]+|[ \t\r\n\v\f]+$/g, ''); }
function _axm_lower(value) { return value.replace(/[A-Z]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 32)); }
function _axm_upper(value) { return value.replace(/[a-z]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 32)); }
function _axm_coalesce(value, fallback) { return value === null ? fallback() : value; }
`;
