'use strict';

const crypto = require('crypto');
const directionStack = require('./direction-stack.js');

const AUTHORITY = directionStack.AUTHORITY;
const HIGH_RISKS = new Set(['safety-critical', 'physical-control', 'financial-impact', 'adversarial-input', 'irreversible-deployment']);
const MAX_ITEMS = 512;

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
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw Error(`DIRECTION_GAP_FIELD_INVALID:${name}`);
  return value.map((item, index) => {
    if (typeof item !== 'string' || !item.trim()) throw Error(`DIRECTION_GAP_ITEM_INVALID:${name}:${index}`);
    return item.trim();
  });
}

function percentage(present, total) {
  return total === 0 ? 100 : Math.round((present / total) * 10000) / 100;
}

function evaluate({stack = null, stackInput = null, observed = {}, languageId = null} = {}) {
  const resolvedStack = stack || directionStack.compose(stackInput || {});
  if (resolvedStack.result !== 'DIRECTION_STACK_READY_NO_AUTHORITY') {
    const body = {schema: 'axm.code.software-direction-gap-report.v1', version: '1.0.0', status: 'TEST', result: 'DIRECTION_STACK_NOT_READY', stackResult: resolvedStack.result, languageId: languageId || null, authority: AUTHORITY};
    return freeze({...body, reportSha256: hash(body)});
  }
  let capabilities;
  let verifiers;
  try {
    if (!observed || typeof observed !== 'object' || Array.isArray(observed)) throw Error('DIRECTION_GAP_OBSERVED_NOT_OBJECT');
    capabilities = new Set(strings(observed.capabilities, 'observed.capabilities'));
    verifiers = new Set(strings(observed.verifiers, 'observed.verifiers'));
  } catch (error) {
    const body = {schema: 'axm.code.software-direction-gap-report.v1', version: '1.0.0', status: 'TEST', result: 'INVALID_DIRECTION_GAP_EVIDENCE', errorCode: error.message, stackSha256: resolvedStack.stackSha256, languageId: languageId || null, authority: AUTHORITY};
    return freeze({...body, reportSha256: hash(body)});
  }
  const highRisk = resolvedStack.axes.risk.some(item => HIGH_RISKS.has(item.id));
  const missingCapabilities = resolvedStack.expectations.capabilities.filter(item => !capabilities.has(item.id)).map(item => ({kind: 'DIRECTION_CAPABILITY_NOT_EVIDENCED', id: item.id, sourceDirections: item.sourceDirections, severity: highRisk ? 'HIGH' : 'MEDIUM', languageIncapabilityClaimed: false, suggestedNextCheck: `Provide bounded evidence for ${item.id} or record the adapter/library/design gap explicitly.`}));
  const missingVerifiers = resolvedStack.expectations.verifiers.filter(item => !verifiers.has(item.id)).map(item => ({kind: 'DIRECTION_VERIFIER_NOT_EVIDENCED', id: item.id, sourceDirections: item.sourceDirections, severity: highRisk ? 'HIGH' : 'MEDIUM', languageIncapabilityClaimed: false, suggestedNextCheck: `Bind or run ${item.id} evidence appropriate to the selected runtime before promoting the claim.`}));
  const expectedCapabilityIds = new Set(resolvedStack.expectations.capabilities.map(item => item.id));
  const expectedVerifierIds = new Set(resolvedStack.expectations.verifiers.map(item => item.id));
  const extraObservedCapabilities = [...capabilities].filter(id => !expectedCapabilityIds.has(id)).sort();
  const extraObservedVerifiers = [...verifiers].filter(id => !expectedVerifierIds.has(id)).sort();
  const capabilityPresent = resolvedStack.expectations.capabilities.length - missingCapabilities.length;
  const verifierPresent = resolvedStack.expectations.verifiers.length - missingVerifiers.length;
  const gaps = [...missingCapabilities, ...missingVerifiers];
  const body = {
    schema: 'axm.code.software-direction-gap-report.v1',
    version: '1.0.0',
    status: 'TEST',
    result: gaps.length ? 'DIRECTION_GAPS_FOUND' : 'DIRECTION_EXPECTATIONS_EVIDENCED_CALLER_SUPPLIED',
    stackSha256: resolvedStack.stackSha256,
    languageId: languageId || null,
    observedEvidenceSha256: hash({capabilities: [...capabilities].sort(), verifiers: [...verifiers].sort()}),
    coverage: {
      expectedCapabilityCount: resolvedStack.expectations.capabilities.length,
      evidencedCapabilityCount: capabilityPresent,
      capabilityPercent: percentage(capabilityPresent, resolvedStack.expectations.capabilities.length),
      expectedVerifierCount: resolvedStack.expectations.verifiers.length,
      evidencedVerifierCount: verifierPresent,
      verifierPercent: percentage(verifierPresent, resolvedStack.expectations.verifiers.length)
    },
    missingCapabilities,
    missingVerifiers,
    extraObservedCapabilities,
    extraObservedVerifiers,
    stackTensions: resolvedStack.tensions,
    truth: {callerEvidenceOnly: true, missingEvidenceMeansImpossible: false, languageIncapabilityClaimed: false, automaticRepair: false, automaticLanguageSwitch: false},
    authority: AUTHORITY
  };
  return freeze({...body, reportSha256: hash(body)});
}

module.exports = {AUTHORITY, evaluate};
