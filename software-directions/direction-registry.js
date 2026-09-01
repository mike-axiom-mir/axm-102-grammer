'use strict';

const crypto = require('crypto');
const axisCatalog = require('./axis-catalog.json');
const directionCatalog = require('./direction-catalog.json');
const provenance = require('./provenance.json');

const FAMILIES = new Set(['human-interface', 'service-network', 'data-intelligence', 'system-hardware', 'creation-operations']);
const AXIS_BINDINGS = Object.freeze({
  typicalRuntimes: 'runtime',
  executionModels: 'execution',
  stateModels: 'state',
  qualityPriorities: 'quality',
  riskFlags: 'risk',
  verifierNeeds: 'verification',
  distributionModels: 'distribution'
});
let PROFILES = null;
let SNAPSHOT = null;

function canon(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canon(value[key])}`).join(',')}}`;
}

function hash(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : canon(value)).digest('hex');
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

function requireStrings(value, code, {allowEmpty = false, pattern = null} = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw Error(`${code}_NOT_ARRAY_OR_EMPTY`);
  if (value.some(item => typeof item !== 'string' || !item.trim())) throw Error(`${code}_ITEM_INVALID`);
  if (new Set(value).size !== value.length) throw Error(`${code}_DUPLICATE`);
  if (pattern && value.some(item => !pattern.test(item))) throw Error(`${code}_FORMAT_INVALID`);
}

function validateAxes() {
  if (axisCatalog.schema !== 'axm.code.software-direction-axis-catalog.v1' || axisCatalog.version !== '1.0.0' || axisCatalog.status !== 'TEST') {
    throw Error('DIRECTION_AXIS_CATALOG_INVALID');
  }
  const required = ['runtime', 'execution', 'state', 'quality', 'risk', 'verification', 'distribution'];
  if (Object.keys(axisCatalog.axes).sort().join('|') !== required.sort().join('|')) throw Error('DIRECTION_AXIS_SET_INVALID');
  const index = {};
  for (const [axis, entries] of Object.entries(axisCatalog.axes)) {
    if (!Array.isArray(entries) || entries.length === 0) throw Error(`DIRECTION_AXIS_EMPTY:${axis}`);
    const ids = entries.map(entry => entry.id);
    requireStrings(ids, `DIRECTION_AXIS_IDS:${axis}`, {pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/});
    if (entries.some(entry => typeof entry.meaning !== 'string' || !entry.meaning.trim())) throw Error(`DIRECTION_AXIS_MEANING_INVALID:${axis}`);
    index[axis] = new Set(ids);
  }
  return index;
}

function validateProvenance() {
  if (provenance.schema !== 'axm.code.software-direction-provenance.v1' || provenance.status !== 'RESEARCH_SYNTHESIS') throw Error('DIRECTION_PROVENANCE_INVALID');
  if (!Array.isArray(provenance.sources) || provenance.sources.length < 8) throw Error('DIRECTION_PROVENANCE_SOURCES_INSUFFICIENT');
  for (const source of provenance.sources) {
    if (typeof source.id !== 'string' || typeof source.url !== 'string' || !source.url.startsWith('https://') || typeof source.scope !== 'string') throw Error('DIRECTION_PROVENANCE_SOURCE_INVALID');
  }
  if (provenance.boundaries?.singleUniversalTaxonomyClaimed !== false || provenance.boundaries?.profilesAreMutuallyExclusive !== false || provenance.authority !== 'NONE') throw Error('DIRECTION_PROVENANCE_BOUNDARY_INVALID');
}

function build() {
  const axes = validateAxes();
  validateProvenance();
  if (directionCatalog.schema !== 'axm.code.software-direction-catalog.v1' || directionCatalog.version !== '1.0.0' || directionCatalog.status !== 'TEST') throw Error('DIRECTION_CATALOG_INVALID');
  if (!Array.isArray(directionCatalog.profiles) || directionCatalog.profiles.length !== 29) throw Error(`DIRECTION_PROFILE_COUNT_NOT_29:${directionCatalog.profiles?.length}`);
  const ids = directionCatalog.profiles.map(profile => profile.id);
  requireStrings(ids, 'DIRECTION_PROFILE_IDS', {pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/});
  const profiles = directionCatalog.profiles.map(profile => {
    if (typeof profile.displayName !== 'string' || !profile.displayName.trim() || typeof profile.description !== 'string' || !profile.description.trim()) throw Error(`DIRECTION_PROFILE_TEXT_INVALID:${profile.id}`);
    if (!FAMILIES.has(profile.family)) throw Error(`DIRECTION_PROFILE_FAMILY_INVALID:${profile.id}:${profile.family}`);
    for (const [field, axis] of Object.entries(AXIS_BINDINGS)) {
      requireStrings(profile[field], `DIRECTION_PROFILE_${field}:${profile.id}`);
      const unknown = profile[field].filter(id => !axes[axis].has(id));
      if (unknown.length) throw Error(`DIRECTION_PROFILE_AXIS_UNKNOWN:${profile.id}:${field}:${unknown.join(',')}`);
    }
    requireStrings(profile.capabilityNeeds, `DIRECTION_CAPABILITIES:${profile.id}`, {pattern: /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/});
    requireStrings(profile.signals, `DIRECTION_SIGNALS:${profile.id}`);
    requireStrings(profile.gapQuestions, `DIRECTION_GAP_QUESTIONS:${profile.id}`);
    if (profile.gapQuestions.length < 3) throw Error(`DIRECTION_GAP_QUESTIONS_TOO_FEW:${profile.id}`);
    const body = {...profile, schema: 'axm.code.software-direction-profile.v1', version: '1.0.0', status: 'TEST', authority: 'NONE'};
    return freeze({...body, profileSha256: hash(body)});
  });
  if (new Set(profiles.map(profile => profile.profileSha256)).size !== 29) throw Error('DIRECTION_PROFILE_DIGESTS_NOT_UNIQUE');
  return freeze(profiles);
}

function all() {
  if (!PROFILES) PROFILES = build();
  return PROFILES;
}

function get(id) {
  return all().find(profile => profile.id === id) || null;
}

function axes() {
  validateAxes();
  return freeze(axisCatalog);
}

function provenanceRecord() {
  validateProvenance();
  return freeze(provenance);
}

function snapshot() {
  if (!SNAPSHOT) {
    const entries = all().map(profile => ({id: profile.id, family: profile.family, profileSha256: profile.profileSha256}));
    const body = {
      schema: 'axm.code.software-direction-registry-snapshot.v1',
      profileCount: entries.length,
      familyCount: new Set(entries.map(entry => entry.family)).size,
      axisCatalogSha256: hash(axisCatalog),
      provenanceSha256: hash(provenance),
      entries,
      authority: 'NONE'
    };
    SNAPSHOT = freeze({...body, snapshotSha256: hash(body)});
  }
  return SNAPSHOT;
}

module.exports = {AXIS_BINDINGS, all, get, axes, provenanceRecord, snapshot, canon, hash};
