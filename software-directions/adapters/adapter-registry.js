'use strict';

const crypto = require('crypto');
const directionRegistry = require('../direction-registry.js');
const catalog = require('./adapter-catalog.json');

let CACHE = null;

function canon(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canon(value[key])}`).join(',')}}`;
}

function hash(value) {
  return crypto.createHash('sha256').update(canon(value)).digest('hex');
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

function load() {
  if (CACHE) return CACHE;
  if (catalog.schema !== 'axm.code.direction-adapter-catalog.v1' || catalog.status !== 'TEST' || catalog.authority !== 'NONE') throw Error('DIRECTION_ADAPTER_CATALOG_HEADER_INVALID');
  if (!Array.isArray(catalog.adapters) || catalog.adapters.length !== 10) throw Error('DIRECTION_ADAPTER_COUNT_INVALID');
  const verifierIds = new Set(directionRegistry.axes().axes.verification.map(item => item.id));
  const ids = new Set(); const implementations = new Set(); const provided = new Set();
  const adapters = catalog.adapters.map(adapter => {
    if (!adapter || typeof adapter !== 'object' || !/^[a-z0-9-]+-v1$/.test(adapter.id)) throw Error(`DIRECTION_ADAPTER_ID_INVALID:${adapter && adapter.id}`);
    if (ids.has(adapter.id)) throw Error(`DIRECTION_ADAPTER_DUPLICATE:${adapter.id}`);
    ids.add(adapter.id);
    if (!['runtime', 'verifier'].includes(adapter.kind)) throw Error(`DIRECTION_ADAPTER_KIND_INVALID:${adapter.id}`);
    if (typeof adapter.implementation !== 'string' || implementations.has(adapter.implementation)) throw Error(`DIRECTION_ADAPTER_IMPLEMENTATION_INVALID:${adapter.id}`);
    implementations.add(adapter.implementation);
    if (!Array.isArray(adapter.requires) || !adapter.requires.includes('node>=18')) throw Error(`DIRECTION_ADAPTER_RUNTIME_REQUIREMENT_INVALID:${adapter.id}`);
    if (typeof adapter.scope !== 'string' || adapter.scope.length < 40) throw Error(`DIRECTION_ADAPTER_SCOPE_INVALID:${adapter.id}`);
    if (adapter.kind === 'runtime' && adapter.providesVerifierId !== null) throw Error(`DIRECTION_RUNTIME_ADAPTER_VERIFIER_INVALID:${adapter.id}`);
    if (adapter.kind === 'verifier') {
      if (!verifierIds.has(adapter.providesVerifierId)) throw Error(`DIRECTION_ADAPTER_VERIFIER_UNKNOWN:${adapter.id}`);
      if (provided.has(adapter.providesVerifierId)) throw Error(`DIRECTION_ADAPTER_VERIFIER_DUPLICATE:${adapter.providesVerifierId}`);
      provided.add(adapter.providesVerifierId);
    }
    return freeze({...adapter, adapterSha256: hash(adapter)});
  });
  if (adapters.filter(item => item.kind === 'runtime').length !== 1) throw Error('DIRECTION_RUNTIME_ADAPTER_COUNT_INVALID');
  const unsupported = catalog.knownUnsupportedVerifierIds;
  if (!Array.isArray(unsupported) || new Set(unsupported).size !== unsupported.length) throw Error('DIRECTION_UNSUPPORTED_VERIFIER_LIST_INVALID');
  if (unsupported.some(id => !verifierIds.has(id) || provided.has(id))) throw Error('DIRECTION_UNSUPPORTED_VERIFIER_PARTITION_INVALID');
  if (provided.size + unsupported.length !== verifierIds.size) throw Error('DIRECTION_VERIFIER_PARTITION_INCOMPLETE');
  const byId = new Map(adapters.map(adapter => [adapter.id, adapter]));
  const byVerifier = new Map(adapters.filter(adapter => adapter.kind === 'verifier').map(adapter => [adapter.providesVerifierId, adapter]));
  const snapshotBody = {schema: catalog.schema, version: catalog.version, status: catalog.status, adapters: adapters.map(item => ({id: item.id, adapterSha256: item.adapterSha256})), supportedVerifierIds: [...byVerifier.keys()].sort(), unsupportedVerifierIds: [...unsupported].sort(), authority: catalog.authority};
  CACHE = freeze({adapters, byId, byVerifier, unsupported: new Set(unsupported), snapshot: {...snapshotBody, snapshotSha256: hash(snapshotBody)}});
  return CACHE;
}

function all() { return load().adapters; }
function get(id) { return load().byId.get(id) || null; }
function forVerifier(verifierId) { return load().byVerifier.get(verifierId) || null; }
function unsupportedVerifierIds() { return freeze([...load().unsupported].sort()); }
function snapshot() { return load().snapshot; }

module.exports = {all, get, forVerifier, unsupportedVerifierIds, snapshot, canon, hash};
