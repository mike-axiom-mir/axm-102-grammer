'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const placementPlane = require('./placement-plane.js');
const projectMapHand = require('./project-map-hand.js');
const registry = require('./placement-registry.js');
const journal = require('./workspace-edit-journal.js');
const spawnedParser = require('./spawned-parser-hand.js');

const AUTHORITY = Object.freeze({workspaceRead: true, workspaceMutation: true, exactNamedTargetWrite: true, rollbackWrite: true, externalJournalReadWrite: true, workspaceLease: true, verifierAdapterInvocation: true, childProcessExecution: true, boundedParserProcessExecution: true, candidateExecutionByParser: false, network: false, install: false, deployment: false, userFileDeletion: false, transactionArtifactCleanup: true, promotion: false, canon: false});
const AUTHORIZATION_TTL_MS = 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5000;
const MAX_CANDIDATE_BYTES = 1024 * 1024;
const MAX_VERIFIER_BINDINGS = 8;
const HEX64 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const USED_AUTHORIZATIONS = new Set();

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function receipt(body, digestField) {
  return freeze({...body, [digestField]: registry.hash(body)});
}

function held(errorCode, details = {}) {
  const body = {
    schema: 'axm.code.workspace-edit-transaction-receipt.v1',
    version: '1.0.0',
    status: 'TEST',
    result: 'EDIT_TRANSACTION_HELD',
    errorCode,
    ...details,
    truth: {workspaceMutationAttemptedByHand: false, workspaceChangeCausedByHand: false, workspaceStateEqualityClaimed: false, codeGeneratedByHand: false},
    authority: AUTHORITY
  };
  return receipt(body, 'transactionSha256');
}

function safeRelative(value, code) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) throw Error(`${code}_INVALID`);
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..') || path.posix.normalize(value) !== value) throw Error(`${code}_TRAVERSAL_OR_EMPTY`);
  return value;
}

function inside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function workspaceRoot(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw Error('EDIT_WORKSPACE_ROOT_MUST_BE_ABSOLUTE');
  const root = path.resolve(value);
  if (root === path.parse(root).root) throw Error('EDIT_WORKSPACE_ROOT_TOO_BROAD');
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(root, fs.realpathSync(root)) !== '') throw Error('EDIT_WORKSPACE_ROOT_INVALID');
  return root;
}

function absoluteTarget(root, relative, code) {
  const clean = safeRelative(relative, code);
  const target = path.resolve(root, ...clean.split('/'));
  if (!inside(target, root)) throw Error(`${code}_ESCAPES_WORKSPACE`);
  const parent = path.dirname(target);
  const parentStat = fs.lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw Error(`${code}_PARENT_INVALID`);
  if (!inside(fs.realpathSync(parent), root)) throw Error(`${code}_PARENT_REALPATH_ESCAPE`);
  return target;
}

function validateDigestReceipt(value, digestField, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !HEX64.test(value[digestField] || '')) throw Error(`${code}_INVALID`);
  const body = {...value};
  delete body[digestField];
  if (registry.hash(body) !== value[digestField]) throw Error(`${code}_DIGEST_MISMATCH`);
}

function validateObservation(observation, root, declaration) {
  validateDigestReceipt(observation, 'observationSha256', 'EDIT_PROJECT_MAP_OBSERVATION');
  if (observation.schema !== 'axm.code.project-map-observation.v1' || observation.version !== '1.0.0' || observation.status !== 'TEST' || observation.result !== 'PROJECT_MAP_OBSERVED_READ_ONLY' || observation.workspaceRootIdentitySha256 !== registry.hash(root) || observation.declarationSha256 !== registry.hash(declaration)) throw Error('EDIT_PROJECT_MAP_OBSERVATION_BINDING_INVALID');
  if (registry.hash(observation.projectMap) !== observation.projectMapSha256) throw Error('EDIT_PROJECT_MAP_CONTENT_DIGEST_MISMATCH');
  placementPlane.validateProjectMap(observation.projectMap);
  if (projectMapHand.freshness(observation).status !== 'LIVE') throw Error('EDIT_PROJECT_MAP_OBSERVATION_NOT_LIVE');
  if (observation.authority?.workspaceRead !== true || observation.authority?.workspaceMutation !== false || observation.truth?.preMutationRecheckStillRequired !== true) throw Error('EDIT_PROJECT_MAP_OBSERVATION_AUTHORITY_INVALID');
}

function validatePlan(plan, observation) {
  validateDigestReceipt(plan, 'planSha256', 'EDIT_PLACEMENT_PLAN');
  if (plan.schema !== 'axm.code.placement-plan.v1' || plan.version !== '1.0.0' || plan.status !== 'TEST' || plan.result !== 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY') throw Error('EDIT_PLACEMENT_PLAN_NOT_READY');
  if (plan.projectMapSha256 !== observation.projectMapSha256 || plan.projectMapEvidence?.kind !== 'read-only-project-map-hand' || plan.projectMapEvidence?.observationSha256 !== observation.observationSha256) throw Error('EDIT_PLACEMENT_PLAN_OBSERVATION_MISMATCH');
  if (plan.authority?.workspaceMutation !== false || plan.truth?.authorizedHandsRequiredForApplication !== true) throw Error('EDIT_PLACEMENT_PLAN_AUTHORITY_INVALID');
  if (!['extend-existing', 'create-module'].includes(plan.sourcePlacement?.action) || !['extend-existing-test', 'create-test-module'].includes(plan.verificationPlacement?.action)) throw Error('EDIT_PLACEMENT_ACTION_UNSUPPORTED');
  if (plan.verificationPlacement.verifiesSourcePath !== plan.sourcePlacement.targetPath || plan.sourcePlacement.targetPath === plan.verificationPlacement.targetPath) throw Error('EDIT_PLACEMENT_TARGET_BINDING_INVALID');
  if (!['javascript', 'python'].includes(plan.languageBinding?.languageId)) throw Error('EDIT_LANGUAGE_PARSER_UNSUPPORTED');
  const projectMap = observation.projectMap;
  const protectedTarget = target => projectMap.protectedPaths.some(item => target === item || target.startsWith(`${item}/`));
  const below = (target, root) => root === '.' ? !target.startsWith('/') && !target.startsWith('../') : target === root || target.startsWith(`${root}/`);
  const sourcePath = safeRelative(plan.sourcePlacement.targetPath, 'EDIT_SOURCE_PLAN_TARGET');
  const verificationPath = safeRelative(plan.verificationPlacement.targetPath, 'EDIT_VERIFICATION_PLAN_TARGET');
  if (protectedTarget(sourcePath) || protectedTarget(verificationPath)) throw Error('EDIT_PLACEMENT_TARGET_PROTECTED');
  if (!below(sourcePath, projectMap.conventions.sourceRoot) || below(sourcePath, projectMap.conventions.testRoot) || !below(verificationPath, projectMap.conventions.testRoot)) throw Error('EDIT_PLACEMENT_TARGET_ROOT_INVALID');
  if (!sourcePath.endsWith(projectMap.conventions.fileExtension) || !verificationPath.endsWith(projectMap.conventions.fileExtension)) throw Error('EDIT_PLACEMENT_TARGET_LANGUAGE_SIGNAL_INVALID');
  if (plan.sourcePlacement.action === 'extend-existing') {
    const sourceModule = projectMap.modules.find(item => item.id === plan.sourcePlacement.targetModuleId);
    if (!sourceModule || sourceModule.path !== sourcePath || sourceModule.contentSha256 !== plan.sourcePlacement.expectedPreMutationSha256 || sourceModule.status !== 'active' || sourceModule.mutable !== true || sourceModule.role !== plan.resolvedRole?.id) throw Error('EDIT_SOURCE_PLACEMENT_NOT_OBSERVED_OWNER');
  } else if (plan.sourcePlacement.targetModuleId !== null || plan.sourcePlacement.expectedPreMutationSha256 !== null) throw Error('EDIT_SOURCE_CREATE_BINDING_INVALID');
  if (plan.verificationPlacement.action === 'extend-existing-test') {
    const verificationModule = projectMap.modules.find(item => item.id === plan.verificationPlacement.targetModuleId);
    if (!verificationModule || verificationModule.path !== verificationPath || verificationModule.contentSha256 !== plan.verificationPlacement.expectedPreMutationSha256 || verificationModule.status !== 'active' || verificationModule.mutable !== true || verificationModule.role !== 'verification' || !verificationModule.verifies.includes(sourcePath)) throw Error('EDIT_VERIFICATION_PLACEMENT_NOT_OBSERVED_SEAM');
  } else if (plan.verificationPlacement.targetModuleId !== null || plan.verificationPlacement.expectedPreMutationSha256 !== null) throw Error('EDIT_VERIFICATION_CREATE_BINDING_INVALID');
}

function candidate(value, lane, placement, languageId) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 'axm.code.edit-candidate.v1' || value.version !== '1.0.0' || value.lane !== lane || value.targetPath !== placement.targetPath || value.languageId !== languageId || typeof value.content !== 'string' || value.content.includes('\0')) throw Error(`EDIT_${lane.toUpperCase()}_CANDIDATE_INVALID`);
  const bytes = Buffer.from(value.content, 'utf8');
  if (bytes.length === 0 || bytes.length > MAX_CANDIDATE_BYTES) throw Error(`EDIT_${lane.toUpperCase()}_CANDIDATE_SIZE_INVALID`);
  if (!HEX64.test(value.contentSha256 || '') || sha256(bytes) !== value.contentSha256) throw Error(`EDIT_${lane.toUpperCase()}_CANDIDATE_DIGEST_MISMATCH`);
  return {schema: value.schema, version: value.version, lane, targetPath: value.targetPath, languageId: value.languageId, content: value.content, bytes, contentSha256: value.contentSha256};
}

function parserBinding(languageId, parserContext) {
  if (languageId === 'javascript') return {parserId: 'node-vm-script-syntax-v1', capsuleSha256: null, environmentObservationSha256: null};
  if (languageId !== 'python') throw Error('EDIT_LANGUAGE_PARSER_UNSUPPORTED');
  if (!parserContext || typeof parserContext !== 'object') throw Error('EDIT_PYTHON_PARSER_CONTEXT_REQUIRED');
  spawnedParser.validateExecutionBinding(parserContext.capsule, parserContext.environmentObservation);
  if (parserContext.capsule.languageId !== languageId || parserContext.capsule.parserId !== 'python-ast-exec-syntax-v1') throw Error('EDIT_PYTHON_PARSER_CONTEXT_BINDING_INVALID');
  return {parserId: parserContext.capsule.parserId, capsuleSha256: parserContext.capsule.capsuleSha256, environmentObservationSha256: parserContext.environmentObservation.environmentObservationSha256};
}

function validateAuthorization(authorization, context, adapters) {
  validateDigestReceipt(authorization, 'authorizationSha256', 'EDIT_AUTHORIZATION');
  if (authorization.schema !== 'axm.code.edit-authorization.v1' || authorization.version !== '1.0.0' || authorization.status !== 'TEST' || authorization.result !== 'EDIT_TRANSACTION_AUTHORIZED' || !SAFE_ID.test(authorization.authorizationId || '') || authorization.approval !== 'EXPLICIT_SINGLE_TRANSACTION') throw Error('EDIT_AUTHORIZATION_HEADER_INVALID');
  if (USED_AUTHORIZATIONS.has(authorization.authorizationSha256)) throw Error('EDIT_AUTHORIZATION_REPLAYED');
  const issuedAt = Date.parse(authorization.issuedAt); const expiresAt = Date.parse(authorization.expiresAt); const now = Date.now();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || new Date(issuedAt).toISOString() !== authorization.issuedAt || new Date(expiresAt).toISOString() !== authorization.expiresAt || expiresAt <= issuedAt || authorization.ttlMs !== expiresAt - issuedAt || authorization.ttlMs > AUTHORIZATION_TTL_MS) throw Error('EDIT_AUTHORIZATION_TIME_INVALID');
  if (issuedAt > now + MAX_CLOCK_SKEW_MS) throw Error('EDIT_AUTHORIZATION_FUTURE');
  if (now > expiresAt || expiresAt > Date.parse(context.observation.expiresAt)) throw Error('EDIT_AUTHORIZATION_STALE');
  if (authorization.workspaceRootIdentitySha256 !== registry.hash(context.root) || authorization.journalRootIdentitySha256 !== context.journalRootIdentitySha256 || authorization.projectMapObservationSha256 !== context.observation.observationSha256 || authorization.placementPlanSha256 !== context.plan.planSha256 || authorization.parserId !== context.parserBinding.parserId || authorization.rollbackRequired !== true || authorization.durableRecoveryRequired !== true) throw Error('EDIT_AUTHORIZATION_BINDING_INVALID');
  if (context.plan.languageBinding.languageId === 'python' && (authorization.parserCapsuleSha256 !== context.parserBinding.capsuleSha256 || authorization.parserEnvironmentObservationSha256 !== context.parserBinding.environmentObservationSha256)) throw Error('EDIT_AUTHORIZATION_PYTHON_PARSER_BINDING_INVALID');
  const expectedTargets = {
    source: {targetPath: context.plan.sourcePlacement.targetPath, action: context.plan.sourcePlacement.action, expectedBeforeSha256: context.plan.sourcePlacement.expectedPreMutationSha256, candidateSha256: context.source.contentSha256},
    verification: {targetPath: context.plan.verificationPlacement.targetPath, action: context.plan.verificationPlacement.action, expectedBeforeSha256: context.plan.verificationPlacement.expectedPreMutationSha256, candidateSha256: context.verification.contentSha256}
  };
  if (registry.canon(authorization.targets) !== registry.canon(expectedTargets)) throw Error('EDIT_AUTHORIZATION_TARGET_MISMATCH');
  if (!Array.isArray(authorization.verifierBindings) || authorization.verifierBindings.length === 0 || authorization.verifierBindings.length > MAX_VERIFIER_BINDINGS) throw Error('EDIT_AUTHORIZATION_VERIFIERS_INVALID');
  const requested = context.plan.verificationPlacement.requestedVerifiers;
  const provided = authorization.verifierBindings.map(item => item.providesVerifierId);
  if (new Set(authorization.verifierBindings.map(item => item.id)).size !== authorization.verifierBindings.length || requested.some(id => !provided.includes(id))) throw Error('EDIT_REQUESTED_VERIFIER_UNBOUND');
  const adapterMap = new Map();
  for (const binding of authorization.verifierBindings) {
    if (!binding || !SAFE_ID.test(binding.id || '') || !HEX64.test(binding.adapterSha256 || '') || typeof binding.providesVerifierId !== 'string') throw Error('EDIT_VERIFIER_BINDING_INVALID');
    const adapter = adapters.find(item => item?.id === binding.id);
    if (!adapter || adapter.adapterSha256 !== binding.adapterSha256 || adapter.providesVerifierId !== binding.providesVerifierId || typeof adapter.verify !== 'function') throw Error(`EDIT_VERIFIER_ADAPTER_MISMATCH:${binding.id}`);
    adapterMap.set(binding.id, adapter);
  }
  if (authorization.authority?.workspaceMutation !== true || authorization.authority?.rollbackWrite !== true || authorization.authority?.network !== false || authorization.authority?.install !== false || authorization.authority?.deployment !== false || authorization.authority?.userFileDeletion !== false || authorization.truth?.digestIsSignerOrConsentProof !== false || authorization.truth?.candidateGenerationDelegated !== true) throw Error('EDIT_AUTHORIZATION_AUTHORITY_INVALID');
  return authorization.verifierBindings.map(binding => ({binding, adapter: adapterMap.get(binding.id)}));
}

function parseReceipt(candidateValue, phase, parserContext = null) {
  let result = 'LANGUAGE_PARSE_PASS'; let errorCode = null;
  let parserId = 'node-vm-script-syntax-v1'; let spawnedParserReceiptSha256 = null;
  let observations = {processStatus: null, processSignal: null, astNodeCount: null, syntaxLine: null, syntaxOffset: null, stdoutSha256: null, stderrSha256: null};
  if (candidateValue.languageId === 'python') {
    const spawned = spawnedParser.parse({capsule: parserContext?.capsule, environmentObservation: parserContext?.environmentObservation, candidate: candidateValue, phase});
    parserId = spawned.parserId || parserContext?.capsule?.parserId || 'python-ast-exec-syntax-v1';
    spawnedParserReceiptSha256 = spawned.receiptSha256;
    observations = spawned.observations || observations;
    if (spawned.result !== 'SPAWNED_PARSER_PASS') { result = 'LANGUAGE_PARSE_FAIL'; errorCode = spawned.errorCode || 'PYTHON_PARSE_ERROR'; }
  } else {
    try {
      new vm.Script(candidateValue.content, {filename: candidateValue.targetPath, displayErrors: true});
    } catch (error) {
      result = 'LANGUAGE_PARSE_FAIL';
      errorCode = error?.name === 'SyntaxError' ? 'JAVASCRIPT_SYNTAX_ERROR' : 'JAVASCRIPT_PARSE_ERROR';
    }
  }
  const body = {
    schema: 'axm.code.language-parse-receipt.v1', version: '1.0.0', status: 'TEST', result, errorCode,
    parserId, languageId: candidateValue.languageId, lane: candidateValue.lane, phase,
    targetPath: candidateValue.targetPath, contentSha256: candidateValue.contentSha256,
    parserCapsuleSha256: parserContext?.capsule?.capsuleSha256 || null, spawnedParserReceiptSha256, observations,
    truth: {sourceExecuted: false, syntaxPassIsBehaviorProof: false, parserIsJavaScriptCommonjsScriptGoal: candidateValue.languageId === 'javascript', parserMayUseBoundedChildProcess: candidateValue.languageId === 'python'},
    authority: {workspaceRead: false, workspaceMutation: false, candidateExecution: false, boundedParserProcessExecution: candidateValue.languageId === 'python', network: false}
  };
  return receipt(body, 'receiptSha256');
}

function targetState(root, placement, candidateValue, authorizationId) {
  const target = absoluteTarget(root, placement.targetPath, `EDIT_${candidateValue.lane.toUpperCase()}_TARGET`);
  const expectsExisting = placement.action.startsWith('extend-existing');
  let beforeBytes = null; let mode = 0o600;
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error(`EDIT_${candidateValue.lane.toUpperCase()}_TARGET_TYPE_INVALID`);
    if (!expectsExisting) throw Error(`EDIT_${candidateValue.lane.toUpperCase()}_CREATE_TARGET_EXISTS`);
    beforeBytes = fs.readFileSync(target); mode = stat.mode & 0o777;
    if (sha256(beforeBytes) !== placement.expectedPreMutationSha256) throw Error(`EDIT_${candidateValue.lane.toUpperCase()}_TARGET_DIGEST_DRIFT`);
  } else if (expectsExisting || placement.expectedPreMutationSha256 !== null) throw Error(`EDIT_${candidateValue.lane.toUpperCase()}_TARGET_MISSING`);
  const ext = path.extname(target) || '.txt'; const base = path.basename(target); const token = authorizationId.slice(0, 32);
  const tempPath = path.join(path.dirname(target), `.axm-${token}-${base}.tmp${ext}`);
  const backupPath = path.join(path.dirname(target), `.axm-${token}-${base}.bak${ext}`);
  if (fs.existsSync(tempPath) || fs.existsSync(backupPath)) throw Error(`EDIT_${candidateValue.lane.toUpperCase()}_TRANSACTION_ARTIFACT_COLLISION`);
  return {lane: candidateValue.lane, targetPath: target, relativePath: placement.targetPath, tempPath, backupPath, beforeBytes, beforeSha256: beforeBytes ? sha256(beforeBytes) : null, candidate: candidateValue, mode, tempPresent: false, backupPresent: false, targetInstalled: false};
}

function install(state, onPhase) {
  let fd = null;
  try {
    fd = fs.openSync(state.tempPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, state.mode);
    state.tempPresent = true;
    fs.writeFileSync(fd, state.candidate.bytes);
    fs.fchmodSync(fd, state.mode);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = null;
    journal.syncDirectory(path.dirname(state.tempPath));
    onPhase(`${state.lane.toUpperCase()}_TEMP_WRITTEN`);
    if (state.beforeBytes) {
      fs.renameSync(state.targetPath, state.backupPath);
      state.backupPresent = true;
      journal.syncDirectory(path.dirname(state.targetPath));
      onPhase(`${state.lane.toUpperCase()}_BACKED_UP`);
    }
    fs.renameSync(state.tempPath, state.targetPath);
    state.tempPresent = false; state.targetInstalled = true;
    journal.syncDirectory(path.dirname(state.targetPath));
    onPhase(`${state.lane.toUpperCase()}_INSTALLED`);
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

function installedCandidate(state) {
  const stat = fs.lstatSync(state.targetPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error(`EDIT_${state.lane.toUpperCase()}_POSTWRITE_TYPE_INVALID`);
  const bytes = fs.readFileSync(state.targetPath); const digest = sha256(bytes);
  if (digest !== state.candidate.contentSha256) throw Error(`EDIT_${state.lane.toUpperCase()}_POSTWRITE_DIGEST_MISMATCH`);
  const content = bytes.toString('utf8');
  if (!Buffer.from(content, 'utf8').equals(bytes)) throw Error(`EDIT_${state.lane.toUpperCase()}_POSTWRITE_UTF8_MISMATCH`);
  return {...state.candidate, content, bytes};
}

function verifierReceipt(binding, adapter, context) {
  let passed = false; let observations = {}; let errorCode = null;
  try {
    const evaluation = adapter.verify(freeze({
      source: freeze({targetPath: context.source.targetPath, content: context.source.content, contentSha256: context.source.contentSha256}),
      verification: freeze({targetPath: context.verification.targetPath, content: context.verification.content, contentSha256: context.verification.contentSha256}),
      placementPlanSha256: context.planSha256
    }));
    passed = evaluation?.passed === true;
    observations = JSON.parse(JSON.stringify(evaluation?.observations || {}));
    if (!passed) errorCode = 'VERIFIER_REPORTED_FAILURE';
  } catch (error) {
    errorCode = 'VERIFIER_ADAPTER_THROW';
    observations = {errorName: typeof error?.name === 'string' ? error.name : 'Error'};
  }
  const body = {
    schema: 'axm.code.workspace-verifier-receipt.v1', version: '1.0.0', status: 'TEST', result: passed ? 'WORKSPACE_VERIFIER_PASS' : 'WORKSPACE_VERIFIER_FAIL', errorCode,
    adapterId: binding.id, adapterSha256: binding.adapterSha256, verifierId: binding.providesVerifierId,
    sourceContentSha256: context.source.contentSha256, verificationContentSha256: context.verification.contentSha256,
    placementPlanSha256: context.planSha256, observations,
    truth: {receiptIsUniversalProof: false, adapterPurityProvenByHand: false, productionEvidenceClaimed: false},
    authority: {registeredVerifierInvocation: true, workspacePathSharedByHand: false, networkAuthorityGrantedByHand: false}
  };
  return receipt(body, 'receiptSha256');
}

function rollback(states) {
  const outcomes = [];
  for (const state of [...states].reverse()) {
    let restored = false; let errorCode = null;
    try {
      if (state.targetInstalled && fs.existsSync(state.targetPath)) { fs.unlinkSync(state.targetPath); journal.syncDirectory(path.dirname(state.targetPath)); }
      state.targetInstalled = false;
      if (state.backupPresent && fs.existsSync(state.backupPath)) {
        fs.renameSync(state.backupPath, state.targetPath); state.backupPresent = false; journal.syncDirectory(path.dirname(state.targetPath));
      }
      if (state.tempPresent && fs.existsSync(state.tempPath)) { fs.unlinkSync(state.tempPath); state.tempPresent = false; journal.syncDirectory(path.dirname(state.tempPath)); }
      if (state.beforeBytes) restored = fs.existsSync(state.targetPath) && sha256(fs.readFileSync(state.targetPath)) === state.beforeSha256 && (fs.statSync(state.targetPath).mode & 0o777) === state.mode;
      else restored = !fs.existsSync(state.targetPath);
      if (!restored) errorCode = 'ROLLBACK_STATE_MISMATCH';
    } catch (error) {
      errorCode = 'ROLLBACK_FILESYSTEM_ERROR';
    }
    outcomes.push({lane: state.lane, targetPath: state.relativePath, expectedRestoredSha256: state.beforeSha256, restored, errorCode});
  }
  const allRestored = outcomes.length > 0 && outcomes.every(item => item.restored);
  const body = {schema: 'axm.code.workspace-edit-rollback-receipt.v1', version: '1.0.0', status: 'TEST', result: allRestored ? 'ROLLBACK_PASS' : 'ROLLBACK_FAIL', outcomes, truth: {receiptDescribesProcessLocalRollbackAttemptOnly: true, durableRestartRecoveryDescribedByJournal: true, universalPowerLossRecoveryClaimed: false}, authority: AUTHORITY};
  return receipt(body, 'receiptSha256');
}

function cleanup(states) {
  const failures = [];
  for (const state of states) {
    try {
      if (state.backupPresent && fs.existsSync(state.backupPath)) { fs.unlinkSync(state.backupPath); state.backupPresent = false; journal.syncDirectory(path.dirname(state.backupPath)); }
      if (state.tempPresent && fs.existsSync(state.tempPath)) { fs.unlinkSync(state.tempPath); state.tempPresent = false; journal.syncDirectory(path.dirname(state.tempPath)); }
    } catch (error) {
      failures.push({lane: state.lane, errorCode: 'TRANSACTION_ARTIFACT_CLEANUP_FAILED'});
    }
  }
  return failures;
}

function apply({workspaceRoot: rootInput = null, journalRoot: journalRootInput = null, declaration = null, projectMapObservation = null, placementPlan = null, authorization = null, candidates = null, parserContext = null, verifierAdapters = []} = {}) {
  const parserReceipts = []; const verifierReceipts = []; const states = [];
  let mutationStarted = false; let verificationRecorded = false; let authorizationSha256 = null; let journalHandle = null; let durability = null;
  try {
    const root = workspaceRoot(rootInput);
    durability = journal.roots(root, journalRootInput);
    validateObservation(projectMapObservation, root, declaration);
    validatePlan(placementPlan, projectMapObservation);
    const freshObservation = projectMapHand.inspect({workspaceRoot: root, declaration});
    if (freshObservation.result !== 'PROJECT_MAP_OBSERVED_READ_ONLY') throw Error(`EDIT_FRESH_PROJECT_MAP_HELD:${freshObservation.errorCode}`);
    if (freshObservation.projectMapSha256 !== projectMapObservation.projectMapSha256 || freshObservation.projectMapSha256 !== placementPlan.projectMapSha256) throw Error('EDIT_WORKSPACE_DRIFT_SINCE_PLACEMENT');
    const source = candidate(candidates?.source, 'source', placementPlan.sourcePlacement, placementPlan.languageBinding.languageId);
    const verification = candidate(candidates?.verification, 'verification', placementPlan.verificationPlacement, placementPlan.languageBinding.languageId);
    const boundParser = parserBinding(placementPlan.languageBinding.languageId, parserContext);
    const context = {root, journalRootIdentitySha256: durability.journalIdentitySha256, observation: projectMapObservation, plan: placementPlan, source, verification, parserBinding: boundParser};
    const adapterBindings = validateAuthorization(authorization, context, verifierAdapters);
    authorizationSha256 = authorization.authorizationSha256;
    parserReceipts.push(parseReceipt(source, 'pre-mutation', parserContext), parseReceipt(verification, 'pre-mutation', parserContext));
    const failedPreParse = parserReceipts.find(item => item.result !== 'LANGUAGE_PARSE_PASS');
    if (failedPreParse) throw Error(`EDIT_${failedPreParse.lane.toUpperCase()}_PARSE_FAILED`);
    states.push(targetState(root, placementPlan.sourcePlacement, source, authorization.authorizationId));
    states.push(targetState(root, placementPlan.verificationPlacement, verification, authorization.authorizationId));
    journalHandle = journal.prepare({workspaceRoot: root, journalRoot: durability.journal, authorization, placementPlanSha256: placementPlan.planSha256, states});
    USED_AUTHORIZATIONS.add(authorizationSha256);
    mutationStarted = true;
    for (const state of states) install(state, phase => journal.append(journalHandle, phase, {lane: state.lane, targetPath: state.relativePath}));
    const installedSource = installedCandidate(states[0]); const installedVerification = installedCandidate(states[1]);
    parserReceipts.push(parseReceipt(installedSource, 'post-mutation', parserContext), parseReceipt(installedVerification, 'post-mutation', parserContext));
    const failedPostParse = parserReceipts.find(item => item.phase === 'post-mutation' && item.result !== 'LANGUAGE_PARSE_PASS');
    if (failedPostParse) throw Error(`EDIT_${failedPostParse.lane.toUpperCase()}_POSTWRITE_PARSE_FAILED`);
    journal.append(journalHandle, 'INSTALLED_PARSED', {parserReceiptSha256: parserReceipts.filter(item => item.phase === 'post-mutation').map(item => item.receiptSha256)});
    for (const {binding, adapter} of adapterBindings) verifierReceipts.push(verifierReceipt(binding, adapter, {source: installedSource, verification: installedVerification, planSha256: placementPlan.planSha256}));
    const failedVerifier = verifierReceipts.find(item => item.result !== 'WORKSPACE_VERIFIER_PASS');
    if (failedVerifier) throw Error(`EDIT_VERIFIER_FAILED:${failedVerifier.adapterId}`);
    journal.append(journalHandle, 'VERIFIED', {verifierReceiptSha256: verifierReceipts.map(item => item.receiptSha256)});
    verificationRecorded = true;
    const cleanupFailures = cleanup(states);
    if (!cleanupFailures.length) {
      journal.append(journalHandle, 'CLEANUP_COMPLETE', {targetCount: states.length});
      journal.append(journalHandle, 'COMMITTED', {targetCount: states.length});
      journal.releaseLease(journalHandle);
    }
    const body = {
      schema: 'axm.code.workspace-edit-transaction-receipt.v1', version: '1.0.0', status: 'TEST',
      result: cleanupFailures.length ? 'EDIT_TRANSACTION_COMMITTED_WITH_CLEANUP_HOLD' : 'EDIT_TRANSACTION_COMMITTED',
      errorCode: cleanupFailures.length ? 'TRANSACTION_ARTIFACT_CLEANUP_INCOMPLETE' : null,
      authorizationId: authorization.authorizationId, authorizationSha256, projectMapObservationSha256: projectMapObservation.observationSha256,
      freshPreflightObservationSha256: freshObservation.observationSha256, placementPlanSha256: placementPlan.planSha256,
      targets: states.map(state => ({lane: state.lane, targetPath: state.relativePath, action: state.beforeBytes ? 'replace' : 'create', beforeSha256: state.beforeSha256, afterSha256: state.candidate.contentSha256})),
      parserReceipts, verifierReceipts, rollbackReceipt: null, cleanupFailures,
      durableJournal: {authorizationId: authorization.authorizationId, journalRootIdentitySha256: durability.journalIdentitySha256, latestPhase: cleanupFailures.length ? 'VERIFIED' : 'COMMITTED', recoveryRequired: cleanupFailures.length > 0},
      truth: {workspaceMutationAttempted: true, workspaceChangedAtReturn: true, exactCandidateBytesInstalled: true, codeGeneratedByHand: false, requestedVerifiersPassed: true, multiFileAtomicityClaimed: false, processCrashRecoveryProvided: true, replayProtectionSurvivesRestart: true, powerLossDurabilityUniversallyClaimed: false, concurrentMutationRaceEliminated: false, simultaneousHandMutationPreventedByLease: true, declarationUpdateRequired: states.some(state => !state.beforeBytes)},
      authority: AUTHORITY
    };
    return receipt(body, 'transactionSha256');
  } catch (error) {
    const message = String(error?.message || 'EDIT_TRANSACTION_FAILED');
    const errorCode = message.startsWith('EDIT_') ? message : (typeof error?.code === 'string' ? `EDIT_FILESYSTEM_${error.code}` : 'EDIT_TRANSACTION_FAILED');
    if (!mutationStarted) return held(errorCode, {authorizationSha256, parserReceipts, verifierReceipts});
    if (verificationRecorded) {
      const body = {
        schema: 'axm.code.workspace-edit-transaction-receipt.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_TRANSACTION_COMMITTED_WITH_RECOVERY_HOLD', errorCode,
        authorizationSha256, placementPlanSha256: placementPlan?.planSha256 || null,
        targets: states.map(state => ({lane: state.lane, targetPath: state.relativePath, beforeSha256: state.beforeSha256, candidateSha256: state.candidate.contentSha256})),
        parserReceipts, verifierReceipts, rollbackReceipt: null,
        durableJournal: {authorizationId: authorization?.authorizationId || null, journalRootIdentitySha256: durability?.journalIdentitySha256 || null, latestPhase: journalHandle?.records?.at(-1)?.phase || null, recoveryRequired: true},
        truth: {workspaceMutationAttempted: true, workspaceChangedAtReturn: true, verifiedCandidatePreservedForRecovery: true, codeGeneratedByHand: false, multiFileAtomicityClaimed: false, processCrashRecoveryProvided: true, leaseRetainedForRecovery: true}, authority: AUTHORITY
      };
      return receipt(body, 'transactionSha256');
    }
    const rollbackReceipt = rollback(states);
    let journalErrorCode = null;
    if (rollbackReceipt.result === 'ROLLBACK_PASS' && journalHandle) {
      try {
        journal.append(journalHandle, 'ROLLED_BACK', {rollbackReceiptSha256: rollbackReceipt.receiptSha256});
        journal.releaseLease(journalHandle);
      } catch (journalError) {
        journalErrorCode = String(journalError?.message || 'EDIT_JOURNAL_ROLLBACK_RECORD_FAILED');
      }
    }
    const body = {
      schema: 'axm.code.workspace-edit-transaction-receipt.v1', version: '1.0.0', status: 'TEST',
      result: rollbackReceipt.result === 'ROLLBACK_PASS' ? (journalErrorCode ? 'EDIT_TRANSACTION_ROLLED_BACK_WITH_JOURNAL_HOLD' : 'EDIT_TRANSACTION_ROLLED_BACK') : 'EDIT_TRANSACTION_ROLLBACK_FAILED',
      errorCode, journalErrorCode, authorizationSha256, placementPlanSha256: placementPlan?.planSha256 || null,
      targets: states.map(state => ({lane: state.lane, targetPath: state.relativePath, beforeSha256: state.beforeSha256, candidateSha256: state.candidate.contentSha256})),
      parserReceipts, verifierReceipts, rollbackReceipt,
      durableJournal: {authorizationId: authorization?.authorizationId || null, journalRootIdentitySha256: durability?.journalIdentitySha256 || null, latestPhase: journalHandle?.records?.at(-1)?.phase || null, recoveryRequired: rollbackReceipt.result !== 'ROLLBACK_PASS' || journalErrorCode !== null},
      truth: {workspaceMutationAttempted: true, workspaceChangedAtReturn: rollbackReceipt.result !== 'ROLLBACK_PASS', finalWorkspaceRestored: rollbackReceipt.result === 'ROLLBACK_PASS', codeGeneratedByHand: false, failedVerificationWasNotAccepted: true, processCrashRecoveryProvided: true, replayProtectionSurvivesRestart: true, concurrentMutationRaceEliminated: false, simultaneousHandMutationPreventedByLease: true},
      authority: AUTHORITY
    };
    return receipt(body, 'transactionSha256');
  }
}

const INTERNALS = Object.freeze({freeze, sha256, receipt, held, workspaceRoot, validateDigestReceipt, validateObservation, validatePlan, candidate, parserBinding, parseReceipt, targetState, install, installedCandidate, verifierReceipt, rollback, cleanup});

module.exports = {AUTHORITY, AUTHORIZATION_TTL_MS, MAX_CANDIDATE_BYTES, apply, recover: journal.recover, INTERNALS};
