'use strict';

const crypto = require('crypto');
const registry = require('./direction-registry.js');

const AUTHORITY = Object.freeze({workspaceRead: false, workspaceMutation: false, toolExecution: false, network: false, install: false, selection: false, promotion: false, canon: false});
const INPUT_AXES = Object.freeze(['runtime', 'execution', 'state', 'quality', 'risk', 'verification', 'distribution']);
const OBSERVATION_FIELDS = Object.freeze(['goals', 'requirements', 'constraints', 'capabilities', 'risks', 'notes']);
const MAX_ITEMS = 128;
const MAX_TEXT = 4000;
const STOP = new Set(['a', 'an', 'as', 'in', 'is', 'of', 'on', 'or', 'to', 'the', 'and', 'for', 'with', 'from', 'into', 'software', 'system', 'application', 'tool', 'build']);

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

function strings(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw Error(`DIRECTION_FIELD_NOT_ARRAY:${name}`);
  if (value.length > MAX_ITEMS) throw Error(`DIRECTION_FIELD_TOO_MANY_ITEMS:${name}`);
  return value.map((item, index) => {
    if (typeof item !== 'string') throw Error(`DIRECTION_ITEM_NOT_STRING:${name}:${index}`);
    if (item.length > MAX_TEXT) throw Error(`DIRECTION_ITEM_TOO_LONG:${name}:${index}`);
    return item.trim();
  }).filter(Boolean);
}

function normalizeText(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9+#./-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function words(value) {
  return normalizeText(value).split(' ').filter(word => word.length > 1 && !STOP.has(word));
}

function normalizeInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('DIRECTION_INPUT_NOT_OBJECT');
  const out = {directionIds: strings(input.directionIds, 'directionIds')};
  for (const axis of INPUT_AXES) out[axis] = strings(input[axis], axis);
  return freeze(out);
}

function sourceUnion(profiles, field, explicit = []) {
  const sources = new Map();
  for (const profile of profiles) {
    for (const value of profile[field]) {
      if (!sources.has(value)) sources.set(value, []);
      sources.get(value).push(profile.id);
    }
  }
  for (const value of explicit) {
    if (!sources.has(value)) sources.set(value, []);
    sources.get(value).push('EXPLICIT_AXIS');
  }
  return [...sources.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, sourceDirections]) => ({id, sourceDirections: [...new Set(sourceDirections)].sort()}));
}

function tensions(axes) {
  const has = (axis, id) => axes[axis].some(item => item.id === id);
  const out = [];
  if (has('execution', 'hard-real-time') && has('state', 'distributed-replicated')) out.push({id: 'REAL_TIME_DISTRIBUTED_STATE_TENSION', meaning: 'Network and replicated-state uncertainty may conflict with hard real-time deadlines.', automaticRejection: false});
  if (has('risk', 'safety-critical') && has('risk', 'experimental')) out.push({id: 'SAFETY_EXPERIMENT_TENSION', meaning: 'Experimental behavior needs an explicit containment and evidence boundary before safety-critical use.', automaticRejection: false});
  if (has('runtime', 'browser') && has('execution', 'interrupt-driven')) out.push({id: 'BROWSER_INTERRUPT_MODEL_TENSION', meaning: 'Browser code cannot directly own a hardware interrupt model without an external adapter/runtime.', automaticRejection: false});
  if (has('risk', 'irreversible-deployment') && !has('verification', 'security-review')) out.push({id: 'IRREVERSIBLE_WITHOUT_SECURITY_REVIEW_TENSION', meaning: 'Irreversible deployment is selected without security-review evidence in the direction stack.', automaticRejection: false});
  return out;
}

function held(result, errorCode = null, details = {}) {
  const body = {schema: 'axm.code.software-direction-stack.v1', version: '1.0.0', status: 'TEST', result, errorCode, ...details, truth: {directionIsAuthority: false, tensionIsInvalidity: false}, authority: AUTHORITY};
  return freeze({...body, stackSha256: hash(body)});
}

function compose(rawInput = {}) {
  let input;
  try {
    input = normalizeInput(rawInput);
  } catch (error) {
    return held('INVALID_DIRECTION_INPUT', error.message);
  }
  const hasAny = input.directionIds.length || INPUT_AXES.some(axis => input[axis].length);
  if (!hasAny) return held('DIRECTION_INPUT_REQUIRED');
  const unknownDirections = input.directionIds.filter(id => !registry.get(id));
  if (unknownDirections.length) return held('UNKNOWN_DIRECTION', null, {unknownDirections});
  const axisCatalog = registry.axes().axes;
  for (const axis of INPUT_AXES) {
    const allowed = new Set(axisCatalog[axis].map(entry => entry.id));
    const unknown = input[axis].filter(id => !allowed.has(id));
    if (unknown.length) return held('UNKNOWN_DIRECTION_AXIS_VALUE', null, {axis, unknownValues: unknown});
  }
  const directionIds = [...new Set(input.directionIds)];
  const profiles = directionIds.map(id => registry.get(id));
  const axes = {
    runtime: sourceUnion(profiles, 'typicalRuntimes', input.runtime),
    execution: sourceUnion(profiles, 'executionModels', input.execution),
    state: sourceUnion(profiles, 'stateModels', input.state),
    quality: sourceUnion(profiles, 'qualityPriorities', input.quality),
    risk: sourceUnion(profiles, 'riskFlags', input.risk),
    verification: sourceUnion(profiles, 'verifierNeeds', input.verification),
    distribution: sourceUnion(profiles, 'distributionModels', input.distribution)
  };
  const expectations = {
    capabilities: sourceUnion(profiles, 'capabilityNeeds'),
    verifiers: axes.verification,
    gapQuestions: sourceUnion(profiles, 'gapQuestions')
  };
  const selectedProfiles = profiles.map(profile => ({id: profile.id, displayName: profile.displayName, family: profile.family, profileSha256: profile.profileSha256}));
  const body = {
    schema: 'axm.code.software-direction-stack.v1',
    version: '1.0.0',
    status: 'TEST',
    result: 'DIRECTION_STACK_READY_NO_AUTHORITY',
    registrySnapshotSha256: registry.snapshot().snapshotSha256,
    directionIds,
    duplicateDirectionCount: input.directionIds.length - directionIds.length,
    selectedProfiles,
    axes,
    expectations,
    tensions: tensions(axes),
    truth: {profilesMayCompose: true, directionIsAuthority: false, tensionIsInvalidity: false, expectationsAreProof: false},
    authority: AUTHORITY
  };
  return freeze({...body, stackSha256: hash(body)});
}

function signalScore(signal, haystack, tokenSet) {
  const normalized = normalizeText(signal);
  if (!normalized) return 0;
  if (haystack.includes(normalized)) return 8 + words(normalized).length;
  const tokens = words(normalized);
  if (!tokens.length) return 0;
  const hit = tokens.filter(token => tokenSet.has(token)).length;
  if (hit === tokens.length) return 4 + hit;
  if (tokens.length >= 3 && hit >= Math.ceil(tokens.length * 0.75)) return 2;
  return 0;
}

function suggest(rawObservation = {}, {topN = 8} = {}) {
  try {
    if (!rawObservation || typeof rawObservation !== 'object' || Array.isArray(rawObservation)) throw Error('DIRECTION_OBSERVATION_NOT_OBJECT');
    const observation = {};
    for (const field of OBSERVATION_FIELDS) observation[field] = strings(rawObservation[field], `observation.${field}`);
    const text = OBSERVATION_FIELDS.flatMap(field => observation[field]).join(' | ');
    const haystack = normalizeText(text);
    const tokenSet = new Set(words(text));
    const candidates = [];
    for (const profile of registry.all()) {
      const matches = profile.signals.map(signal => ({signal, score: signalScore(signal, haystack, tokenSet)})).filter(match => match.score > 0);
      if (!matches.length) continue;
      candidates.push({directionId: profile.id, displayName: profile.displayName, family: profile.family, profileSha256: profile.profileSha256, score: matches.reduce((sum, match) => sum + match.score, 0), matchedSignals: matches.sort((a, b) => b.score - a.score || a.signal.localeCompare(b.signal)), candidateIsSelection: false, authority: 'NONE'});
    }
    candidates.sort((a, b) => b.score - a.score || a.directionId.localeCompare(b.directionId));
    const body = {schema: 'axm.code.software-direction-suggestion-report.v1', version: '1.0.0', status: 'TEST', result: candidates.length ? 'DIRECTION_CANDIDATES_READY_NO_SELECTION' : 'NO_DIRECTION_CANDIDATE', observationSha256: hash(observation), candidateCount: candidates.length, candidates: candidates.slice(0, Math.max(1, Math.min(29, Number(topN) || 8))), automaticSelection: false, reasonInferenceWithoutCallerEvidence: 'FORBIDDEN', authority: AUTHORITY};
    return freeze({...body, reportSha256: hash(body)});
  } catch (error) {
    const body = {schema: 'axm.code.software-direction-suggestion-report.v1', version: '1.0.0', status: 'TEST', result: 'INVALID_DIRECTION_OBSERVATION', errorCode: error.message, candidates: [], automaticSelection: false, authority: AUTHORITY};
    return freeze({...body, reportSha256: hash(body)});
  }
}

module.exports = {AUTHORITY, INPUT_AXES, compose, suggest, normalizeInput};
