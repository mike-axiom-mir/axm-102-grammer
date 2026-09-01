'use strict';

const path = require('path');
const organs = require('../../language-organs/registry.js');
const directions = require('../direction-registry.js');
const registry = require('./placement-registry.js');

const AUTHORITY = Object.freeze({workspaceRead: false, workspaceMutation: false, toolExecution: false, network: false, install: false, deployment: false, promotion: false, canon: false});
const STATUSES = new Set(['active', 'deprecated', 'locked']);
const LANGUAGE_BINDING_KINDS = new Set(['extension', 'basename', 'path-context']);
const HEX64 = /^[a-f0-9]{64}$/;
const SIGNAL = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const MAX_OBSERVATION_TTL_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5000;

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

function held(result, errorCode = null, details = {}) {
  const body = {schema: 'axm.code.placement-plan.v1', version: '1.0.0', status: 'TEST', result, errorCode, ...details, authority: AUTHORITY};
  return freeze({...body, planSha256: registry.hash(body)});
}

function resolveProjectInput(projectMap, projectMapObservation) {
  if (projectMap && projectMapObservation) throw Error('PROJECT_MAP_INPUT_AMBIGUOUS');
  if (!projectMapObservation) return {projectMap, evidence: {kind: 'caller-declaration', observationSha256: null, observedAt: null, expiresAt: null, freshness: 'UNOBSERVED'}};
  const observation = projectMapObservation;
  if (!observation || typeof observation !== 'object' || Array.isArray(observation) || observation.schema !== 'axm.code.project-map-observation.v1' || observation.version !== '1.0.0' || observation.status !== 'TEST' || observation.result !== 'PROJECT_MAP_OBSERVED_READ_ONLY') throw Error('PROJECT_MAP_OBSERVATION_INVALID');
  if (!observation.projectMap || registry.hash(observation.projectMap) !== observation.projectMapSha256) throw Error('PROJECT_MAP_OBSERVATION_PROJECT_DIGEST_MISMATCH');
  const receiptBody = {...observation};
  delete receiptBody.observationSha256;
  if (!HEX64.test(observation.observationSha256 || '') || registry.hash(receiptBody) !== observation.observationSha256) throw Error('PROJECT_MAP_OBSERVATION_RECEIPT_DIGEST_MISMATCH');
  if (observation.projectId !== observation.projectMap.projectId || !HEX64.test(observation.declarationSha256 || '') || !HEX64.test(observation.workspaceRootIdentitySha256 || '')) throw Error('PROJECT_MAP_OBSERVATION_BINDING_INVALID');
  if (observation.authority?.workspaceRead !== true || observation.authority?.workspaceMutation !== false || observation.authority?.toolExecution !== false) throw Error('PROJECT_MAP_OBSERVATION_AUTHORITY_INVALID');
  const observedAt = Date.parse(observation.observedAt);
  const expiresAt = Date.parse(observation.expiresAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(expiresAt) || new Date(observedAt).toISOString() !== observation.observedAt || new Date(expiresAt).toISOString() !== observation.expiresAt || expiresAt <= observedAt || observation.ttlMs !== expiresAt - observedAt || observation.ttlMs > MAX_OBSERVATION_TTL_MS) throw Error('PROJECT_MAP_OBSERVATION_TIME_INVALID');
  const now = Date.now();
  if (observedAt > now + MAX_CLOCK_SKEW_MS) return {hold: 'PROJECT_MAP_OBSERVATION_FUTURE', details: {observationSha256: observation.observationSha256, observedAt: observation.observedAt}};
  if (now > expiresAt) return {hold: 'PROJECT_MAP_OBSERVATION_STALE', details: {observationSha256: observation.observationSha256, observedAt: observation.observedAt, expiresAt: observation.expiresAt}};
  if (observation.coverage?.allMatchingFilesMapped !== true || observation.coverage?.symlinksFollowed !== false || !Number.isSafeInteger(observation.coverage?.observedFileCount) || observation.coverage.observedFileCount < 0 || !Number.isSafeInteger(observation.coverage?.observedByteCount) || observation.coverage.observedByteCount < 0 || !HEX64.test(observation.coverage?.discoveredPathsSha256 || '') || observation.truth?.workspaceMutated !== false || observation.truth?.fileBytesDigestBound !== true || observation.truth?.semanticRolesCallerDeclared !== true || observation.truth?.preMutationRecheckStillRequired !== true) throw Error('PROJECT_MAP_OBSERVATION_COVERAGE_INVALID');
  return {
    projectMap: observation.projectMap,
    evidence: {
      kind: 'read-only-project-map-hand',
      observationSha256: observation.observationSha256,
      observedAt: observation.observedAt,
      expiresAt: observation.expiresAt,
      freshness: 'LIVE',
      observedFileCount: observation.coverage.observedFileCount,
      observedByteCount: observation.coverage.observedByteCount,
      discoveredPathsSha256: observation.coverage.discoveredPathsSha256
    }
  };
}

function strings(value, code, {allowEmpty = false, pattern = null} = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw Error(`${code}_NOT_ARRAY_OR_EMPTY`);
  if (value.some(item => typeof item !== 'string' || !item.trim())) throw Error(`${code}_ITEM_INVALID`);
  if (new Set(value).size !== value.length) throw Error(`${code}_DUPLICATE`);
  if (pattern && value.some(item => !pattern.test(item))) throw Error(`${code}_FORMAT_INVALID`);
}

function relativePath(value, code) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) throw Error(`${code}_INVALID`);
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw Error(`${code}_TRAVERSAL_OR_EMPTY`);
  if (path.posix.normalize(value) !== value) throw Error(`${code}_NOT_NORMALIZED`);
  return value;
}

function relativeRoot(value, code) {
  if (value === '.') return value;
  return relativePath(value, code);
}

function below(target, root) {
  if (root === '.') return typeof target === 'string' && !target.startsWith('/') && !target.startsWith('../');
  return target === root || target.startsWith(`${root}/`);
}

function slug(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function validateProjectMap(projectMap) {
  if (!projectMap || typeof projectMap !== 'object' || Array.isArray(projectMap)) throw Error('PROJECT_MAP_REQUIRED');
  if (projectMap.schema !== 'axm.code.project-map.v1' || typeof projectMap.projectId !== 'string' || !projectMap.projectId.trim()) throw Error('PROJECT_MAP_HEADER_INVALID');
  if (typeof projectMap.languageId !== 'string' || !projectMap.languageId) throw Error('PROJECT_MAP_LANGUAGE_REQUIRED');
  const conventions = projectMap.conventions;
  if (!conventions || typeof conventions !== 'object' || conventions.naming !== 'kebab-case') throw Error('PROJECT_MAP_CONVENTIONS_INVALID');
  relativeRoot(conventions.sourceRoot, 'PROJECT_SOURCE_ROOT');
  relativeRoot(conventions.testRoot, 'PROJECT_TEST_ROOT');
  if (conventions.sourceRoot === conventions.testRoot) throw Error('PROJECT_ROOTS_EQUAL');
  if (conventions.testRoot === '.' || below(conventions.sourceRoot, conventions.testRoot)) throw Error('PROJECT_SOURCE_ROOT_INSIDE_TEST_ROOT');
  if (typeof conventions.fileExtension !== 'string' || !/^\.[A-Za-z0-9.+-]+$/.test(conventions.fileExtension)) throw Error('PROJECT_FILE_EXTENSION_INVALID');
  if (!conventions.languageBinding || typeof conventions.languageBinding !== 'object' || !LANGUAGE_BINDING_KINDS.has(conventions.languageBinding.kind) || typeof conventions.languageBinding.signal !== 'string' || !conventions.languageBinding.signal) throw Error('PROJECT_LANGUAGE_BINDING_INVALID');
  if (typeof conventions.sourceFilePattern !== 'string' || conventions.sourceFilePattern.includes('/') || typeof conventions.roleDirectory !== 'boolean') throw Error('PROJECT_SOURCE_PATTERN_INVALID');
  const probeSourceName = conventions.sourceFilePattern.replaceAll('{name}', 'probe').replaceAll('{ext}', conventions.fileExtension);
  if (!probeSourceName || !/^[A-Za-z0-9._+-]+$/.test(probeSourceName)) throw Error('PROJECT_SOURCE_PATTERN_UNSAFE');
  if (typeof conventions.testFilePattern !== 'string' || conventions.testFilePattern.includes('/') || !conventions.testFilePattern.includes('{name}') || !conventions.testFilePattern.includes('{ext}')) throw Error('PROJECT_TEST_PATTERN_INVALID');
  const probeTestName = conventions.testFilePattern.replaceAll('{name}', 'probe').replaceAll('{ext}', conventions.fileExtension);
  if (!/^[A-Za-z0-9._+-]+$/.test(probeTestName)) throw Error('PROJECT_TEST_PATTERN_UNSAFE');
  if (!Array.isArray(projectMap.modules)) throw Error('PROJECT_MODULES_INVALID');
  strings(projectMap.protectedPaths, 'PROJECT_PROTECTED_PATHS', {allowEmpty: true});
  projectMap.protectedPaths.forEach(item => relativePath(item, 'PROJECT_PROTECTED_PATH'));
  const roleIds = new Set(registry.all().map(role => role.id));
  const kindIds = new Set(registry.all().flatMap(role => role.changeKinds));
  const directionIds = new Set(directions.all().map(item => item.id));
  const moduleIds = new Set(); const modulePaths = new Set();
  for (const module of projectMap.modules) {
    if (!module || typeof module !== 'object' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(module.id) || moduleIds.has(module.id)) throw Error('PROJECT_MODULE_ID_INVALID');
    moduleIds.add(module.id);
    relativePath(module.path, `PROJECT_MODULE_PATH:${module.id}`);
    if (modulePaths.has(module.path)) throw Error(`PROJECT_MODULE_PATH_DUPLICATE:${module.path}`);
    modulePaths.add(module.path);
    if (!module.path.endsWith(conventions.fileExtension)) throw Error(`PROJECT_MODULE_EXTENSION_MISMATCH:${module.id}`);
    if (!roleIds.has(module.role) || !STATUSES.has(module.status) || typeof module.mutable !== 'boolean') throw Error(`PROJECT_MODULE_CONTRACT_INVALID:${module.id}`);
    const expectedRoot = module.role === 'verification' ? conventions.testRoot : conventions.sourceRoot;
    if (!below(module.path, expectedRoot) || (module.role !== 'verification' && below(module.path, conventions.testRoot))) throw Error(`PROJECT_MODULE_ROOT_MISMATCH:${module.id}`);
    if (!HEX64.test(module.contentSha256)) throw Error(`PROJECT_MODULE_DIGEST_INVALID:${module.id}`);
    strings(module.accepts, `PROJECT_MODULE_ACCEPTS:${module.id}`, {allowEmpty: true});
    if (module.accepts.some(kind => !kindIds.has(kind))) throw Error(`PROJECT_MODULE_CHANGE_KIND_UNKNOWN:${module.id}`);
    if (module.accepts.some(kind => registry.roleForKind(kind).id !== module.role)) throw Error(`PROJECT_MODULE_CHANGE_KIND_ROLE_MISMATCH:${module.id}`);
    strings(module.owns, `PROJECT_MODULE_OWNS:${module.id}`, {allowEmpty: true, pattern: SIGNAL});
    strings(module.directionIds, `PROJECT_MODULE_DIRECTIONS:${module.id}`, {allowEmpty: true});
    if (module.directionIds.some(id => !directionIds.has(id))) throw Error(`PROJECT_MODULE_DIRECTION_UNKNOWN:${module.id}`);
    strings(module.exports, `PROJECT_MODULE_EXPORTS:${module.id}`, {allowEmpty: true});
    strings(module.verifies, `PROJECT_MODULE_VERIFIES:${module.id}`, {allowEmpty: true});
    module.verifies.forEach(item => relativePath(item, `PROJECT_MODULE_VERIFIES_PATH:${module.id}`));
  }
  return {conventions, moduleIds, modulePaths};
}

function validateChange(change, projectMap, projectIndex) {
  if (!change || typeof change !== 'object' || Array.isArray(change)) throw Error('CHANGE_INTENT_REQUIRED');
  if (change.schema !== 'axm.code.change-intent.v1' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(change.changeId)) throw Error('CHANGE_INTENT_HEADER_INVALID');
  if (!directions.get(change.directionId)) throw Error('CHANGE_DIRECTION_UNKNOWN');
  const role = registry.roleForKind(change.kind);
  if (!role) throw Error('CHANGE_KIND_UNKNOWN');
  if (typeof change.name !== 'string' || !slug(change.name)) throw Error('CHANGE_NAME_INVALID');
  strings(change.ownerSignals, 'CHANGE_OWNER_SIGNALS', {allowEmpty: true, pattern: SIGNAL});
  strings(change.expectedExports, 'CHANGE_EXPECTED_EXPORTS', {allowEmpty: true});
  strings(change.dependencyModuleIds, 'CHANGE_DEPENDENCY_MODULES', {allowEmpty: true, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/});
  const missingDependencies = change.dependencyModuleIds.filter(id => !projectIndex.moduleIds.has(id));
  if (missingDependencies.length) throw Error(`CHANGE_DEPENDENCY_MODULE_UNKNOWN:${missingDependencies.join(',')}`);
  strings(change.requestedVerifiers, 'CHANGE_REQUESTED_VERIFIERS', {allowEmpty: true});
  const verifierIds = new Set(directions.axes().axes.verification.map(item => item.id));
  if (change.requestedVerifiers.some(id => !verifierIds.has(id))) throw Error('CHANGE_VERIFIER_UNKNOWN');
  if (projectMap.modules.some(module => module.id === change.changeId)) throw Error('CHANGE_ID_COLLIDES_WITH_MODULE');
  return role;
}

function protectedTarget(target, protectedPaths) {
  return protectedPaths.some(item => target === item || target.startsWith(`${item}/`));
}

function bindLanguage(projectMap, organ, projectIndex) {
  const conventions = projectIndex.conventions;
  const binding = conventions.languageBinding;
  const signal = binding.signal.toLowerCase();
  if (binding.kind === 'extension') {
    if (signal !== conventions.fileExtension.toLowerCase()) return {errorCode: 'PROJECT_LANGUAGE_BINDING_EXTENSION_MISMATCH'};
    if (!organ.detect.ext.map(item => item.toLowerCase()).includes(signal)) return {errorCode: 'PROJECT_EXTENSION_NOT_OWNED_BY_LANGUAGE', allowedSignals: [...organ.detect.ext]};
    if (!conventions.sourceFilePattern.includes('{name}') || !conventions.sourceFilePattern.includes('{ext}')) return {errorCode: 'PROJECT_EXTENSION_SOURCE_PATTERN_INVALID'};
  } else if (binding.kind === 'basename') {
    if (!organ.detect.base.map(item => item.toLowerCase()).includes(signal)) return {errorCode: 'PROJECT_BASENAME_NOT_OWNED_BY_LANGUAGE', allowedSignals: [...organ.detect.base]};
    if (conventions.sourceFilePattern.toLowerCase() !== signal || conventions.roleDirectory !== false) return {errorCode: 'PROJECT_BASENAME_SOURCE_PATTERN_INVALID'};
    if (!signal.endsWith(conventions.fileExtension.toLowerCase())) return {errorCode: 'PROJECT_BASENAME_EXTENSION_MISMATCH'};
  } else {
    if (!organ.detect.path.map(item => item.toLowerCase()).includes(signal)) return {errorCode: 'PROJECT_PATH_CONTEXT_NOT_OWNED_BY_LANGUAGE', allowedSignals: [...organ.detect.path]};
    const rootContext = `/${conventions.sourceRoot === '.' ? '' : conventions.sourceRoot.replace(/^\/+|\/+$/g, '')}/`.toLowerCase();
    if (!rootContext.includes(signal)) return {errorCode: 'PROJECT_SOURCE_ROOT_OUTSIDE_LANGUAGE_PATH_CONTEXT', sourceRoot: conventions.sourceRoot};
    if (!conventions.sourceFilePattern.includes('{name}') || !conventions.sourceFilePattern.includes('{ext}')) return {errorCode: 'PROJECT_PATH_CONTEXT_SOURCE_PATTERN_INVALID'};
  }
  return {kind: binding.kind, signal: binding.signal, fileExtension: conventions.fileExtension};
}

function targetMatchesLanguage(targetPath, languageSignal) {
  const target = targetPath.toLowerCase();
  const signal = languageSignal.signal.toLowerCase();
  if (languageSignal.kind === 'extension') return target.endsWith(signal);
  if (languageSignal.kind === 'basename') return path.posix.basename(target) === signal;
  return `/${target}`.includes(signal);
}

function ownerOverlap(module, signals) {
  return signals.filter(signal => module.owns.includes(signal)).length;
}

function chooseSource(projectMap, change, role, projectIndex) {
  const declaredOwners = projectMap.modules.filter(module => ownerOverlap(module, change.ownerSignals) > 0);
  if (declaredOwners.length > 1) return {hold: 'AMBIGUOUS_DECLARED_OWNER', candidates: declaredOwners.map(item => item.id).sort()};
  if (declaredOwners.length === 1) {
    const owner = declaredOwners[0];
    if (owner.role !== role.id) return {hold: 'DECLARED_OWNER_ROLE_MISMATCH', candidates: [owner.id], declaredRole: owner.role, requiredRole: role.id};
    if (owner.status !== 'active' || owner.mutable !== true || protectedTarget(owner.path, projectMap.protectedPaths)) return {hold: 'DECLARED_OWNER_NOT_MUTABLE', candidates: [owner.id]};
    return {action: 'extend-existing', target: owner, reason: 'UNIQUE_DECLARED_OWNER'};
  }

  const candidates = projectMap.modules
    .filter(module => module.role === role.id && module.status === 'active' && module.mutable === true && module.accepts.includes(change.kind) && !protectedTarget(module.path, projectMap.protectedPaths))
    .map(module => ({module, score: 40 + 25 + (module.directionIds.includes(change.directionId) ? 15 : 0)}))
    .sort((a, b) => b.score - a.score || a.module.path.localeCompare(b.module.path));
  if (candidates.length) {
    const top = candidates.filter(item => item.score === candidates[0].score);
    if (top.length > 1) return {hold: 'AMBIGUOUS_ROLE_OWNER', candidates: top.map(item => item.module.id).sort()};
    return {action: 'extend-existing', target: candidates[0].module, reason: 'UNIQUE_ROLE_AND_KIND_SEAM'};
  }

  const file = projectIndex.conventions.sourceFilePattern.replaceAll('{name}', slug(change.name)).replaceAll('{ext}', projectIndex.conventions.fileExtension);
  const directory = projectIndex.conventions.roleDirectory ? path.posix.join(projectIndex.conventions.sourceRoot, role.directory) : projectIndex.conventions.sourceRoot;
  const targetPath = path.posix.join(directory, file);
  if (below(targetPath, projectIndex.conventions.testRoot)) return {hold: 'CREATED_TARGET_INSIDE_TEST_ROOT', targetPath};
  if (protectedTarget(targetPath, projectMap.protectedPaths)) return {hold: 'CREATED_TARGET_PROTECTED', targetPath};
  const collision = projectMap.modules.find(module => module.path === targetPath);
  if (collision || projectIndex.modulePaths.has(targetPath)) return {hold: 'CREATED_TARGET_COLLISION', targetPath, candidates: collision ? [collision.id] : []};
  return {action: 'create-module', target: null, targetPath, reason: 'NO_EXISTING_OWNER_OR_ACCEPTING_SEAM'};
}

function chooseVerification(projectMap, change, role, targetPath, projectIndex) {
  const exactLocked = projectMap.modules.filter(module => module.role === 'verification' && module.verifies.includes(targetPath) && (module.status !== 'active' || module.mutable !== true || protectedTarget(module.path, projectMap.protectedPaths)));
  if (exactLocked.length) return {hold: 'DECLARED_VERIFIER_NOT_MUTABLE', candidates: exactLocked.map(item => item.id).sort()};
  const candidates = projectMap.modules
    .filter(module => module.role === 'verification' && module.status === 'active' && module.mutable === true && !protectedTarget(module.path, projectMap.protectedPaths))
    .map(module => ({module, score: (module.verifies.includes(targetPath) ? 100 : 0) + (module.accepts.includes('test') ? 25 : 0) + (module.directionIds.includes(change.directionId) ? 15 : 0)}))
    .filter(item => item.score >= 40)
    .sort((a, b) => b.score - a.score || a.module.path.localeCompare(b.module.path));
  if (candidates.length) {
    const top = candidates.filter(item => item.score === candidates[0].score);
    if (top.length > 1) return {hold: 'AMBIGUOUS_VERIFICATION_SEAM', candidates: top.map(item => item.module.id).sort()};
    return {action: 'extend-existing-test', target: candidates[0].module, reason: candidates[0].module.verifies.includes(targetPath) ? 'EXACT_EXISTING_VERIFIER' : 'UNIQUE_DIRECTION_VERIFIER'};
  }
  const file = projectIndex.conventions.testFilePattern.replaceAll('{name}', slug(change.name)).replaceAll('{ext}', projectIndex.conventions.fileExtension);
  const testPath = path.posix.join(projectIndex.conventions.testRoot, role.directory, file);
  if (protectedTarget(testPath, projectMap.protectedPaths)) return {hold: 'CREATED_VERIFIER_PROTECTED', targetPath: testPath};
  const collision = projectMap.modules.find(module => module.path === testPath);
  if (collision || projectIndex.modulePaths.has(testPath)) return {hold: 'CREATED_VERIFIER_COLLISION', targetPath: testPath, candidates: collision ? [collision.id] : []};
  return {action: 'create-test-module', target: null, targetPath: testPath, reason: 'NO_EXISTING_VERIFICATION_SEAM'};
}

function plan({projectMap = null, projectMapObservation = null, change = null} = {}) {
  let projectIndex; let role; let projectEvidence;
  try {
    const resolved = resolveProjectInput(projectMap, projectMapObservation);
    if (resolved.hold) return held('PLACEMENT_OBSERVATION_HELD', resolved.hold, resolved.details);
    projectMap = resolved.projectMap;
    projectEvidence = resolved.evidence;
    projectIndex = validateProjectMap(projectMap);
    role = validateChange(change, projectMap, projectIndex);
  } catch (error) {
    return held('PLACEMENT_INPUT_HELD', error.message);
  }
  const organ = organs.getByLanguageId(projectMap.languageId);
  if (!organ) return held('PLACEMENT_LANGUAGE_HELD', 'PROJECT_LANGUAGE_UNKNOWN', {languageId: projectMap.languageId});
  const languageSignal = bindLanguage(projectMap, organ, projectIndex);
  if (languageSignal.errorCode) return held('PLACEMENT_LANGUAGE_HELD', languageSignal.errorCode, {languageId: projectMap.languageId, binding: {...projectIndex.conventions.languageBinding}, ...languageSignal});
  const source = chooseSource(projectMap, change, role, projectIndex);
  if (source.hold) return held('PLACEMENT_DECISION_HELD', source.hold, {role: role.id, ...source});
  const targetPath = source.target ? source.target.path : source.targetPath;
  if (!targetMatchesLanguage(targetPath, languageSignal)) return held('PLACEMENT_LANGUAGE_HELD', 'PLACEMENT_TARGET_NOT_OWNED_BY_LANGUAGE_SIGNAL', {languageId: projectMap.languageId, binding: {...projectIndex.conventions.languageBinding}, targetPath});
  const verification = chooseVerification(projectMap, change, role, targetPath, projectIndex);
  if (verification.hold) return held('PLACEMENT_DECISION_HELD', verification.hold, {role: role.id, sourceDecision: source, ...verification});
  const dependencyBindings = change.dependencyModuleIds.map(id => {
    const module = projectMap.modules.find(item => item.id === id);
    return {moduleId: id, path: module.path, contentSha256: module.contentSha256, exports: [...module.exports]};
  });
  const grammarPlan = organs.plan({organId: organ.organId, requestedStages: ['projectGraph', 'dependencies', 'api', 'impact', 'affectedTests', 'architecture', 'verificationAdapters', 'evidencePassport', 'rollback']});
  const projectMapSha256 = registry.hash(projectMap);
  const changeIntentSha256 = registry.hash(change);
  const body = {
    schema: 'axm.code.placement-plan.v1',
    version: '1.0.0',
    status: 'TEST',
    result: 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY',
    projectId: projectMap.projectId,
    projectMapSha256,
    projectMapEvidence: projectEvidence,
    changeId: change.changeId,
    changeIntentSha256,
    directionId: change.directionId,
    directionRoleHints: [...registry.hint(change.directionId).preferredRoles],
    resolvedRole: {id: role.id, responsibility: role.responsibility, roleSha256: role.roleSha256},
    languageBinding: {
      languageId: organ.languageId,
      organId: organ.organId,
      organSha256: organ.sha256,
      signalKind: languageSignal.kind,
      signal: languageSignal.signal,
      fileExtension: languageSignal.fileExtension,
      grammarPlanResult: grammarPlan.result,
      grammarProfileSha256: grammarPlan.grammarProfileDigest,
      registrySnapshotSha256: grammarPlan.registrySnapshotDigest,
      toolchainCandidates: [...organ.toolchainCandidates],
      toolchainVerified: false
    },
    sourcePlacement: {
      action: source.action,
      targetPath,
      targetModuleId: source.target ? source.target.id : null,
      expectedPreMutationSha256: source.target ? source.target.contentSha256 : null,
      reason: source.reason,
      expectedExports: [...change.expectedExports]
    },
    verificationPlacement: {
      action: verification.action,
      targetPath: verification.target ? verification.target.path : verification.targetPath,
      targetModuleId: verification.target ? verification.target.id : null,
      expectedPreMutationSha256: verification.target ? verification.target.contentSha256 : null,
      verifiesSourcePath: targetPath,
      requestedVerifiers: [...change.requestedVerifiers],
      reason: verification.reason
    },
    dependencyBindings,
    orderedConstructionStages: [
      'bind-project-map',
      'bind-language-grammar',
      'resolve-code-role',
      'resolve-existing-owner',
      'plan-source-change',
      'plan-verification-change',
      'preflight-target-digests',
      'handoff-to-authorized-hands',
      'collect-parser-and-verifier-receipts',
      'accept-or-rollback'
    ],
    requiredHands: [
      'fresh-project-map-reader',
      source.action === 'create-module' ? 'language-aware-file-creator' : 'language-aware-structural-editor',
      'exact-byte-writer',
      'language-parser',
      'verification-runner',
      'rollback-writer'
    ],
    preconditions: {
      projectMapDigestMustStillMatch: projectMapSha256,
      sourceDigestMustStillMatch: source.target ? source.target.contentSha256 : null,
      verificationDigestMustStillMatch: verification.target ? verification.target.contentSha256 : null,
      targetMustRemainUnprotected: true,
      dependenciesMustRemainAtBoundDigests: true,
      stopOnDrift: true
    },
    evidenceRequired: [
      'fresh-project-map-digest',
      'pre-mutation-target-digests',
      'post-mutation-output-digests',
      'language-parse-receipt',
      'requested-verifier-receipts',
      'rollback-receipt-on-failure'
    ],
    truth: {
      callerProjectMapObservedByPlanner: false,
      plannerReadWorkspace: false,
      projectMapObservedByReadOnlyHand: projectEvidence.kind === 'read-only-project-map-hand',
      observationFreshAtPlanning: projectEvidence.freshness === 'LIVE',
      planIsSourceCode: false,
      planIsMutation: false,
      placementAcceptedWithoutFreshPreflight: false,
      deterministicPlacementReplacesCodingCompetence: false,
      explicitLanguageBindingSignalRequired: true,
      extensionLanguageBindingSupported: true,
      basenameLanguageBindingSupported: true,
      pathContextLanguageBindingSupported: true,
      targetPathMustMatchDeclaredLanguageSignal: true,
      authorizedHandsRequiredForApplication: true
    },
    authority: AUTHORITY
  };
  return freeze({...body, planSha256: registry.hash(body)});
}

module.exports = {AUTHORITY, plan, validateProjectMap};
