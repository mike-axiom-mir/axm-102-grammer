'use strict';

const crypto = require('crypto');
const registry = require('./registry.js');
const grammar = require('./grammar-profile-registry.js');
const eyes = require('./specialist-eye-registry.js');
const discovery = require('./code-native-discovery-seam.js');
const templates = require('./machine-template-fabric.js');
const templateRouter = require('./template-fast-router.js');
const keyboards = require('./machine-code-keyboard-fabric.js');
const keyboardRouter = require('./machine-code-keyboard-router.js');
const cheatcodes = require('./machine-cheatcode-fabric.js');
const influence = require('./machine-cheatcode-influence-mesh.js');

const AUTHORITY = Object.freeze({
  workspaceRead: false,
  workspaceMutation: false,
  toolExecution: false,
  network: false,
  install: false,
  languageSwitch: false,
  promotion: false,
  canon: false
});
const OBSERVATION_FIELDS = Object.freeze([
  'goals', 'capabilities', 'gaps', 'constraints', 'risks', 'requirements',
  'paths', 'notes', 'pressures', 'activeLanguages', 'factCodes',
  'semanticSignals', 'symbolSignals', 'dependencySignals', 'typeSignals',
  'stateSignals', 'controlSignals', 'effectSignals', 'verifierSignals',
  'testSignals', 'performanceSignals', 'buildSignals', 'debugSignals',
  'presentConstructs', 'changedConstructs', 'changedUnits',
  'publicSurfaceSignals', 'scopeSignals'
]);
const MAX_ITEMS = 256;
const MAX_TEXT = 4000;
let SNAPSHOTS = null;

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

function text(value, name, fallback = '') {
  if (value == null) return fallback;
  if (typeof value !== 'string') throw Error(`COMPOSITION_FIELD_NOT_STRING:${name}`);
  if (value.length > MAX_TEXT) throw Error(`COMPOSITION_FIELD_TOO_LONG:${name}`);
  return value.trim();
}

function stringArray(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw Error(`COMPOSITION_FIELD_NOT_ARRAY:${name}`);
  if (value.length > MAX_ITEMS) throw Error(`COMPOSITION_FIELD_TOO_MANY_ITEMS:${name}`);
  return value.map((item, index) => {
    if (typeof item !== 'string') throw Error(`COMPOSITION_ITEM_NOT_STRING:${name}:${index}`);
    if (item.length > MAX_TEXT) throw Error(`COMPOSITION_ITEM_TOO_LONG:${name}:${index}`);
    return item.trim();
  }).filter(Boolean);
}

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('COMPOSITION_INPUT_NOT_OBJECT');
  const observationInput = input.observation == null ? {} : input.observation;
  if (!observationInput || typeof observationInput !== 'object' || Array.isArray(observationInput)) {
    throw Error('COMPOSITION_OBSERVATION_NOT_OBJECT');
  }
  const observation = {};
  for (const field of OBSERVATION_FIELDS) observation[field] = stringArray(observationInput[field], `observation.${field}`);
  const requestedStages = input.requestedStages == null ? [...registry.STAGES] : stringArray(input.requestedStages, 'requestedStages');
  const mode = text(input.mode, 'mode', 'MACHINE').toUpperCase();
  if (!['MACHINE', 'AI'].includes(mode)) throw Error('COMPOSITION_MODE_INVALID');
  const topN = input.topN == null ? 5 : Number(input.topN);
  const hotKeyCount = input.hotKeyCount == null ? 12 : Number(input.hotKeyCount);
  if (!Number.isInteger(topN) || topN < 1 || topN > 12) throw Error('COMPOSITION_TOP_N_INVALID');
  if (!Number.isInteger(hotKeyCount) || hotKeyCount < 4 || hotKeyCount > 16) throw Error('COMPOSITION_HOT_KEY_COUNT_INVALID');
  return freeze({
    languageId: text(input.languageId, 'languageId') || null,
    filePath: text(input.filePath, 'filePath'),
    firstLine: text(input.firstLine, 'firstLine'),
    preferredOrganId: text(input.preferredOrganId, 'preferredOrganId') || null,
    operation: text(input.operation, 'operation', 'understand') || 'understand',
    intent: text(input.intent, 'intent', 'build') || 'build',
    role: text(input.role, 'role') || null,
    signals: stringArray(input.signals, 'signals'),
    requestedStages,
    mode,
    topN,
    hotKeyCount,
    observation
  });
}

function resolveLanguage(input) {
  const hasSignals = Boolean(input.filePath || input.firstLine);
  if (input.languageId) {
    const organ = registry.getByLanguageId(input.languageId);
    if (!organ) return freeze({result: 'UNKNOWN_EXPLICIT_LANGUAGE', languageId: input.languageId, organ: null, candidates: []});
    if (input.preferredOrganId && input.preferredOrganId !== organ.organId) {
      return freeze({result: 'EXPLICIT_LANGUAGE_PREFERENCE_CONFLICT', languageId: input.languageId, preferredOrganId: input.preferredOrganId, organ: null, candidates: [organ.organId]});
    }
    if (!hasSignals) return freeze({result: 'LANGUAGE_RESOLVED', source: 'EXPLICIT_LANGUAGE', reason: 'CALLER_EXPLICIT', languageId: organ.languageId, organ, candidates: [organ.organId]});
    const detected = registry.detect({filePath: input.filePath, firstLine: input.firstLine});
    if (detected.result === 'MATCHED' && detected.organ.organId !== organ.organId) {
      return freeze({result: 'EXPLICIT_LANGUAGE_SIGNAL_CONFLICT', languageId: input.languageId, detectedLanguageId: detected.organ.languageId, reason: detected.reason, organ: null, candidates: detected.candidates});
    }
    if (detected.result === 'SELECTION_REQUIRED') {
      if (!detected.candidates.includes(organ.organId)) {
        return freeze({result: 'EXPLICIT_LANGUAGE_SIGNAL_CONFLICT', languageId: input.languageId, detectedLanguageId: null, reason: detected.reason, organ: null, candidates: detected.candidates});
      }
      return freeze({result: 'LANGUAGE_RESOLVED', source: 'EXPLICIT_LANGUAGE', reason: 'EXPLICIT_RESOLVES_DETECTION_AMBIGUITY', languageId: organ.languageId, organ, candidates: detected.candidates});
    }
    if (detected.result === 'MATCHED') {
      return freeze({result: 'LANGUAGE_RESOLVED', source: 'EXPLICIT_AND_DETECTED', reason: detected.reason, languageId: organ.languageId, organ, candidates: detected.candidates});
    }
    if (detected.result !== 'UNKNOWN_LANGUAGE') {
      return freeze({...detected, languageId: input.languageId});
    }
    return freeze({result: 'LANGUAGE_RESOLVED', source: 'EXPLICIT_LANGUAGE', reason: 'NO_CONFLICTING_DETECTION_SIGNAL', languageId: organ.languageId, organ, candidates: [organ.organId]});
  }
  if (!hasSignals) return freeze({result: 'LANGUAGE_REQUIRED', languageId: null, organ: null, candidates: []});
  const detected = registry.detect({filePath: input.filePath, firstLine: input.firstLine, preferredOrganId: input.preferredOrganId});
  if (detected.result !== 'MATCHED') return freeze({...detected, languageId: null});
  return freeze({result: 'LANGUAGE_RESOLVED', source: 'DETERMINISTIC_DETECTION', reason: detected.reason, languageId: detected.organ.languageId, organ: detected.organ, candidates: detected.candidates});
}

function snapshotBindings() {
  if (!SNAPSHOTS) {
    SNAPSHOTS = freeze({
      organRegistrySha256: registry.snapshot().snapshotSha256,
      grammarRegistrySha256: grammar.snapshot().snapshotSha256,
      specialistEyeRegistrySha256: eyes.snapshot().snapshotSha256,
      templateFabricSha256: templates.snapshot().snapshotSha256,
      cheatcodeFabricSha256: cheatcodes.snapshot().snapshotSha256,
      keyboardFabricSha256: keyboards.snapshot().snapshotSha256
    });
  }
  return SNAPSHOTS;
}

function held(result, input, resolution, errorCode = null) {
  const body = {
    schema: 'axm.code.standalone-capability-capsule.v1',
    version: '1.0.0',
    status: 'TEST',
    result,
    errorCode,
    inputSha256: input ? hash(input) : null,
    resolution,
    sourceCode: null,
    truth: {
      semanticCorrectnessClaimed: false,
      runtimeCorrectnessClaimed: false,
      automaticAction: false,
      workspaceMutated: false,
      toolExecuted: false
    },
    authority: AUTHORITY
  };
  return freeze({...body, capsuleSha256: hash(body)});
}

function compose(rawInput = {}) {
  let input;
  try {
    input = normalize(rawInput);
  } catch (error) {
    return held('INVALID_COMPOSITION_INPUT', null, null, error.message);
  }
  const resolution = resolveLanguage(input);
  if (resolution.result !== 'LANGUAGE_RESOLVED') {
    const result = resolution.result === 'SELECTION_REQUIRED' ? 'LANGUAGE_SELECTION_REQUIRED' : 'LANGUAGE_RESOLUTION_HELD';
    return held(result, input, resolution);
  }

  const languageId = resolution.languageId;
  const organ = resolution.organ;
  const activeLanguages = [...new Set([...input.observation.activeLanguages, languageId])];
  const observation = {...input.observation, activeLanguages};
  const discoveryReport = discovery.review(observation);
  const selectedEyeReview = discoveryReport.eyes.find(item => item.languageId === languageId);
  const grammarPlan = grammar.plan({languageId, operation: input.operation});
  const organPlan = registry.plan({organId: organ.organId, requestedStages: input.requestedStages});
  const eyePlan = eyes.plan({languageId, operation: input.operation});
  const cheatcodeReport = cheatcodes.evaluate({languageId, observation});
  const influenceReport = influence.propagate({languageId, observation});
  const templateSelection = templateRouter.select({
    languageId,
    intent: input.intent,
    signals: input.signals,
    mode: input.mode,
    topN: input.topN
  });
  const keyboardLayout = keyboardRouter.layout({
    languageId,
    role: input.role,
    intent: input.intent,
    signals: input.signals,
    hotKeyCount: input.hotKeyCount
  });
  const bank = keyboards.buildBank(languageId);
  const cheatcodeBank = cheatcodes.build(languageId);
  const templateBank = templates.build(languageId);

  const body = {
    schema: 'axm.code.standalone-capability-capsule.v1',
    version: '1.0.0',
    status: 'TEST',
    result: 'CAPABILITY_CAPSULE_READY_NO_EXECUTION_AUTHORITY',
    inputSha256: hash(input),
    languageId,
    organId: organ.organId,
    resolution,
    bindings: {
      ...snapshotBindings(),
      organSha256: organ.sha256,
      grammarProfileSha256: grammarPlan.profileDigest,
      specialistEyeSha256: eyePlan.eyeDigest,
      templateBankSha256: templateBank.bankSha256,
      cheatcodeBankSha256: cheatcodeBank.bankSha256,
      keyboardBankSha256: bank.keyboardSha256,
      discoveryReportSha256: discoveryReport.reportSha256,
      influenceMeshSha256: influenceReport.meshSha256
    },
    plans: {organ: organPlan, grammar: grammarPlan, specialistEye: eyePlan},
    review: selectedEyeReview,
    cheatcodes: cheatcodeReport,
    influence: influenceReport,
    templates: templateSelection,
    keyboard: keyboardLayout,
    sourceCode: null,
    truth: {
      languageResolutionDeterministic: true,
      explicitLanguageMayResolveOnlyCompatibleAmbiguity: true,
      semanticCorrectnessClaimed: false,
      runtimeCorrectnessClaimed: false,
      templateSelectionIsNotCorrectnessProof: true,
      influenceIsNotEvidence: true,
      keyboardProducesIntentNotSource: true,
      automaticAction: false,
      workspaceMutated: false,
      toolExecuted: false
    },
    authority: AUTHORITY
  };
  return freeze({...body, capsuleSha256: hash(body)});
}

module.exports = {AUTHORITY, compose, resolveLanguage, snapshotBindings};
