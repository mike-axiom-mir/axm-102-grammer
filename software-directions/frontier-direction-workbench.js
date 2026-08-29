'use strict';

const crypto = require('crypto');
const registry = require('./direction-registry.js');
const directionStack = require('./direction-stack.js');
const gapDetector = require('./direction-gap-detector.js');
const referenceBuilds = require('./frontier-reference-builds.js');
const catalog = require('./frontier-trial-catalog.json');

const AUTHORITY = referenceBuilds.AUTHORITY;
const LEVELS = Object.freeze(['seed', 'stretch']);
let INDEX = null;

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

function validateCatalog() {
  if (INDEX) return INDEX;
  if (catalog.schema !== 'axm.code.frontier-direction-trial-catalog.v1') throw Error('FRONTIER_TRIAL_CATALOG_SCHEMA_INVALID');
  if (catalog.status !== 'TEST' || catalog.method.trialCount !== 58) throw Error('FRONTIER_TRIAL_CATALOG_METHOD_INVALID');
  if (!Array.isArray(catalog.trials) || catalog.trials.length !== 29) throw Error('FRONTIER_TRIAL_DIRECTION_COUNT_INVALID');
  const profiles = registry.all();
  const ids = new Set();
  const index = new Map();
  for (const trial of catalog.trials) {
    if (!trial || typeof trial !== 'object' || !trial.directionId || ids.has(trial.directionId)) throw Error(`FRONTIER_TRIAL_DIRECTION_INVALID:${trial && trial.directionId}`);
    const profile = registry.get(trial.directionId);
    if (!profile) throw Error(`FRONTIER_TRIAL_UNKNOWN_DIRECTION:${trial.directionId}`);
    ids.add(trial.directionId);
    if (!referenceBuilds.HANDLERS[trial.directionId]) throw Error(`FRONTIER_TRIAL_HANDLER_MISSING:${trial.directionId}`);
    for (const level of LEVELS) {
      const challenge = trial[level];
      if (!challenge || typeof challenge.name !== 'string' || typeof challenge.goal !== 'string') throw Error(`FRONTIER_TRIAL_CHALLENGE_INVALID:${trial.directionId}:${level}`);
      for (const field of ['requiredCapabilities', 'verifierEvidence', 'expectedChecks']) if (!Array.isArray(challenge[field]) || !challenge[field].length) throw Error(`FRONTIER_TRIAL_CHALLENGE_FIELD_INVALID:${trial.directionId}:${level}:${field}`);
      const unknownCapabilities = challenge.requiredCapabilities.filter(id => !profile.capabilityNeeds.includes(id));
      const unknownVerifiers = challenge.verifierEvidence.filter(id => !profile.verifierNeeds.includes(id));
      if (unknownCapabilities.length) throw Error(`FRONTIER_TRIAL_CAPABILITY_OUTSIDE_PROFILE:${trial.directionId}:${level}:${unknownCapabilities.join(',')}`);
      if (unknownVerifiers.length) throw Error(`FRONTIER_TRIAL_VERIFIER_OUTSIDE_PROFILE:${trial.directionId}:${level}:${unknownVerifiers.join(',')}`);
      if (new Set(challenge.expectedChecks).size !== challenge.expectedChecks.length) throw Error(`FRONTIER_TRIAL_DUPLICATE_CHECK:${trial.directionId}:${level}`);
    }
    if (!trial.frontierObservation || typeof trial.frontierObservation.helpful !== 'string' || typeof trial.frontierObservation.needsTuning !== 'string') throw Error(`FRONTIER_TRIAL_OBSERVATION_INVALID:${trial.directionId}`);
    index.set(trial.directionId, trial);
  }
  if (profiles.some(profile => !ids.has(profile.id))) throw Error('FRONTIER_TRIAL_PROFILE_COVERAGE_INCOMPLETE');
  INDEX = index;
  return INDEX;
}

function held(result, errorCode = null, details = {}) {
  const body = {schema: 'axm.code.frontier-direction-build-packet.v1', version: '1.0.0', status: 'TEST', result, errorCode, ...details, authority: AUTHORITY};
  return freeze({...body, packetSha256: hash(body)});
}

function prepare({directionId = null, level = null} = {}) {
  const index = validateCatalog();
  if (typeof directionId !== 'string' || !directionId) return held('DIRECTION_REQUIRED');
  if (!LEVELS.includes(level)) return held('TRIAL_LEVEL_REQUIRED', null, {allowedLevels: LEVELS});
  const trial = index.get(directionId);
  if (!trial) return held('UNKNOWN_DIRECTION', null, {directionId});
  const profile = registry.get(directionId);
  const stack = directionStack.compose({directionIds: [directionId]});
  const body = {
    schema: 'axm.code.frontier-direction-build-packet.v1',
    version: '1.0.0',
    status: 'TEST',
    result: 'FRONTIER_DIRECTION_BUILD_PACKET_READY_NO_EXECUTION_AUTHORITY',
    directionId,
    level,
    profile: {id: profile.id, displayName: profile.displayName, family: profile.family, description: profile.description, profileSha256: profile.profileSha256},
    stackSha256: stack.stackSha256,
    challenge: trial[level],
    context: {
      runtimes: profile.typicalRuntimes,
      executionModels: profile.executionModels,
      stateModels: profile.stateModels,
      qualityPriorities: profile.qualityPriorities,
      riskFlags: profile.riskFlags,
      distributionModels: profile.distributionModels,
      gapQuestions: profile.gapQuestions,
      fullCapabilityExpectations: profile.capabilityNeeds,
      fullVerifierExpectations: profile.verifierNeeds
    },
    runPolicy: {
      autonomousAfterPacket: true,
      humanInterventionDuringRun: false,
      onlyCallerSuppliedOrReferenceEvidence: true,
      productionReadinessClaimed: false,
      hardwareEvidenceClaimedWithoutHardware: false
    },
    authority: AUTHORITY
  };
  return freeze({...body, packetSha256: hash(body)});
}

function runTrial(input = {}) {
  const packet = prepare(input);
  if (packet.result !== 'FRONTIER_DIRECTION_BUILD_PACKET_READY_NO_EXECUTION_AUTHORITY') {
    const body = {schema: 'axm.code.frontier-direction-trial-result.v1', version: '1.0.0', status: 'TEST', result: 'FRONTIER_DIRECTION_TRIAL_HELD', packet, authority: AUTHORITY};
    return freeze({...body, trialSha256: hash(body)});
  }
  const build = referenceBuilds.run(packet);
  const expectedChecks = packet.challenge.expectedChecks;
  const actualCheckNames = Object.keys(build.checks).sort();
  const expectedCheckNames = [...expectedChecks].sort();
  const checkSurfaceMatches = canon(actualCheckNames) === canon(expectedCheckNames);
  const failedChecks = expectedChecks.filter(name => build.checks[name] !== true);
  const capabilityEvidenceComplete = packet.challenge.requiredCapabilities.every(id => build.evidence.capabilities.includes(id));
  const verifierEvidenceComplete = packet.challenge.verifierEvidence.every(id => build.evidence.verifiers.includes(id));
  const gapReport = gapDetector.evaluate({stackInput: {directionIds: [packet.directionId]}, languageId: 'javascript', observed: build.evidence});
  const passed = checkSurfaceMatches && failedChecks.length === 0 && capabilityEvidenceComplete && verifierEvidenceComplete && build.truth.humanInterventionDuringRun === false && build.authority.workspaceMutation === false && build.authority.toolExecution === false;
  const body = {
    schema: 'axm.code.frontier-direction-trial-result.v1',
    version: '1.0.0',
    status: 'TEST',
    result: passed ? 'FRONTIER_DIRECTION_REFERENCE_BUILD_PASS' : 'FRONTIER_DIRECTION_REFERENCE_BUILD_FAIL',
    directionId: packet.directionId,
    level: packet.level,
    packetSha256: packet.packetSha256,
    buildSha256: build.buildSha256,
    checkSurfaceMatches,
    failedChecks,
    capabilityEvidenceComplete,
    verifierEvidenceComplete,
    modeledCapabilityCoveragePercent: gapReport.coverage.capabilityPercent,
    modeledVerifierCoveragePercent: gapReport.coverage.verifierPercent,
    missingRealWorldCapabilities: gapReport.missingCapabilities.map(item => item.id),
    missingRealWorldVerifiers: gapReport.missingVerifiers.map(item => item.id),
    build,
    truth: {
      beginnerReferenceProbeOnly: true,
      fullDirectionCapabilityClaimed: false,
      productionReady: false,
      gapMeansLanguageIncapability: false,
      frontierObservationIsSingleModelEvidence: true
    },
    authority: AUTHORITY
  };
  return freeze({...body, trialSha256: hash(body)});
}

function runAll() {
  const index = validateCatalog();
  const directionReports = [];
  for (const profile of registry.all()) {
    const seed = runTrial({directionId: profile.id, level: 'seed'});
    const stretch = runTrial({directionId: profile.id, level: 'stretch'});
    const beginnerReferenceReady = seed.result === 'FRONTIER_DIRECTION_REFERENCE_BUILD_PASS' && stretch.result === 'FRONTIER_DIRECTION_REFERENCE_BUILD_PASS';
    const observation = index.get(profile.id).frontierObservation;
    directionReports.push({
      directionId: profile.id,
      displayName: profile.displayName,
      family: profile.family,
      seed: {result: seed.result, trialSha256: seed.trialSha256, capabilityCoveragePercent: seed.modeledCapabilityCoveragePercent, verifierCoveragePercent: seed.modeledVerifierCoveragePercent},
      stretch: {result: stretch.result, trialSha256: stretch.trialSha256, capabilityCoveragePercent: stretch.modeledCapabilityCoveragePercent, verifierCoveragePercent: stretch.modeledVerifierCoveragePercent},
      beginnerReferenceReady,
      productionReady: false,
      helpfulForFrontierModel: observation.helpful,
      needsTuning: observation.needsTuning
    });
  }
  const passedBuildCount = directionReports.reduce((sum, item) => sum + Number(item.seed.result.endsWith('_PASS')) + Number(item.stretch.result.endsWith('_PASS')), 0);
  const beginnerReferenceReadyCount = directionReports.filter(item => item.beginnerReferenceReady).length;
  const body = {
    schema: 'axm.code.frontier-direction-user-report.v1',
    version: '1.0.0',
    status: 'TEST',
    result: passedBuildCount === 58 && beginnerReferenceReadyCount === 29 ? 'ALL_DIRECTIONS_BEGINNER_REFERENCE_READY' : 'DIRECTION_REFERENCE_GAPS_FOUND',
    method: catalog.method,
    directionCount: directionReports.length,
    buildCount: directionReports.length * 2,
    passedBuildCount,
    beginnerReferenceReadyCount,
    productionReadyCount: 0,
    directionReports,
    crossDirectionFindings: {
      helpful: [
        'The direction packet consistently exposed runtime, state, quality, risk, capability, verifier, and gap-question concerns before implementation.',
        'The profiles reduced generic app-shaped reasoning and gave a frontier model domain-specific seams to preserve.',
        'The gap detector kept modeled evidence separate from absent production, hardware, security, scale, and deployment evidence.'
      ],
      needsTuning: [
        'Profiles need optional framework, platform, toolchain, and verifier-adapter bindings before they can drive real builds end to end.',
        'Capability IDs need richer acceptance schemas so evidence can be stronger than a declared name plus bounded reference check.',
        'High-risk directions need domain-expert, hardware, infrastructure, or independent-review gates that a frontier model cannot self-award.',
        'A future local trial should compare multiple frontier/local models and record disagreements instead of treating this single-model pass as universal.'
      ]
    },
    truth: {
      singleFrontierModelTrial: true,
      productionReadinessClaimed: false,
      fullDirectionCapabilityClaimed: false,
      runtimeCorrectnessForArbitraryBuildsClaimed: false,
      humanFollowupReservedForLaterLocalTrial: true
    },
    authority: AUTHORITY
  };
  return freeze({...body, reportSha256: hash(body)});
}

module.exports = {AUTHORITY, LEVELS, prepare, runTrial, runAll, validateCatalog};
