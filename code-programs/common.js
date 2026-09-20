'use strict';

const crypto = require('node:crypto');

const LIMITS = Object.freeze({functions: 32, parameters: 16, nodes: 4096, depth: 48, list: 4096, fields: 128, string: 16384, steps: 100000, inputNodes: 32768, bytes: 1048576});
const AUTHORITY = Object.freeze({workspaceRead: false, workspaceMutation: false, toolExecution: false, network: false, install: false, promotion: false, canon: false});
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const RESERVED = new Set(('and as assert async await break case catch class const continue debugger def default del delete do elif else enum except export extends false False finally for from function global if implements import in instanceof interface is lambda let new nonlocal not null None of or package pass private protected public raise return static super switch this throw true True try typeof var void while with yield run FUNCTIONS exports module globalThis Reflect undefined eval arguments Infinity NaN Object Array Number String Boolean Error Map Set JSON Math Buffer dict list str float int bool len type range sorted isinstance set tuple zip enumerate any all sum min max abs print globals locals').split(' '));

function fail(code, location = '') { throw new Error(`${code}${location ? ':' + location : ''}`); }
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort(compare).map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex'); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
function string(value, at) {
  if (typeof value !== 'string' || value.length > LIMITS.string * 2 || [...value].length > LIMITS.string) fail('STRING_INVALID', at);
  for (const ch of value) { const cp = ch.codePointAt(0); if (cp >= 0xd800 && cp <= 0xdfff) fail('UNICODE_SURROGATE', at); }
  return value;
}
function key(value, at) { string(value, at); if (FORBIDDEN.has(value)) fail('RESERVED_KEY', at); return value; }
function identifier(value, at) {
  if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(value) || RESERVED.has(value)) fail('IDENTIFIER_INVALID', at);
  return value;
}
function exact(value, required, optional = [], at = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('OBJECT_REQUIRED', at);
  for (const k of Object.keys(value)) if (!required.includes(k) && !optional.includes(k)) fail('UNKNOWN_FIELD', at + '/' + k);
  for (const k of required) if (!Object.hasOwn(value, k)) fail('MISSING_FIELD', at + '/' + k);
}
// Copies only data, before reading any request fields. No getters/toJSON/import/eval.
function data(value) {
  let nodes = 0;
  const active = new Set();
  function visit(v, depth) {
    if (++nodes > LIMITS.inputNodes || depth > 128) fail('DATA_LIMIT');
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER) fail('NUMBER_RANGE'); return Object.is(v, -0) ? 0 : v; }
    if (typeof v === 'string') return string(v, 'data');
    if (!v || typeof v !== 'object') fail('JSON_DATA_REQUIRED');
    if (active.has(v)) fail('CYCLIC_DATA');
    const array = Array.isArray(v);
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail('PLAIN_DATA_REQUIRED');
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (Reflect.ownKeys(descriptors).some(k => typeof k !== 'string')) fail('SYMBOL_DATA');
    const names = Object.keys(descriptors).filter(k => !(array && k === 'length'));
    if (array && (v.length > LIMITS.list || names.length !== v.length || names.some((k, i) => k !== String(i)))) fail('ARRAY_DATA_INVALID');
    active.add(v);
    const out = array ? [] : {};
    for (const k of names) {
      key(k, 'data');
      const descriptor = descriptors[k];
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('DATA_PROPERTY_INVALID');
      out[k] = visit(descriptor.value, depth + 1);
    }
    active.delete(v);
    return out;
  }
  const copy = visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(copy)) > LIMITS.bytes) fail('DATA_BYTES_LIMIT');
  return copy;
}
function type(value, depth = 0) {
  if (depth > 12) fail('TYPE_DEPTH_LIMIT');
  if (['number', 'string', 'boolean', 'null'].includes(value)) return value;
  exact(value, [], ['list', 'record', 'nullable'], 'type');
  if (Object.keys(value).length !== 1) fail('TYPE_INVALID');
  if (Object.hasOwn(value, 'list')) return {list: type(value.list, depth + 1)};
  if (Object.hasOwn(value, 'nullable')) { const inner = type(value.nullable, depth + 1); if (inner === 'null' || inner?.nullable) fail('NULLABLE_TYPE_INVALID'); return {nullable: inner}; }
  const fields = value.record;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields) || Object.keys(fields).length > LIMITS.fields) fail('RECORD_TYPE_INVALID');
  return {record: Object.fromEntries(Object.keys(fields).sort(compare).map(k => [key(k, 'type'), type(fields[k], depth + 1)]))};
}
function same(a, b) { return canonical(a) === canonical(b); }
function assignable(actual, expected) { return same(actual, expected) || (expected?.nullable !== undefined && (actual === 'null' || same(actual, expected.nullable))); }
function valueMatches(value, wanted, depth = 0) {
  if (depth > LIMITS.depth) return false;
  if (wanted === 'null') return value === null;
  if (typeof wanted === 'string') return typeof value === wanted && (wanted !== 'number' || (Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER));
  if (wanted.nullable !== undefined) return value === null || valueMatches(value, wanted.nullable, depth + 1);
  if (wanted.list !== undefined) return Array.isArray(value) && value.length <= LIMITS.list && value.every(v => valueMatches(v, wanted.list, depth + 1));
  return value !== null && typeof value === 'object' && !Array.isArray(value) && same(Object.keys(value).sort(compare), Object.keys(wanted.record).sort(compare)) && Object.keys(wanted.record).every(k => valueMatches(value[k], wanted.record[k], depth + 1));
}
module.exports = {LIMITS, AUTHORITY, fail, compare, canonical, hash, freeze, string, key, identifier, exact, data, type, same, assignable, valueMatches};
