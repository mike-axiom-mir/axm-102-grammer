'use strict';

const organs = require('../../language-organs/registry.js');
const registry = require('./placement-registry.js');
const editGraphPlane = require('./edit-graph-plane.js');
const environmentHand = require('./toolchain-environment-hand.js');
const spawnedParser = require('./spawned-parser-hand.js');
const pythonRecipeRegistry = require('./bounded-python-recipe-registry.js');

const MIN_PLANS = 1;
const MAX_PLANS = 4;
const HEX64 = /^[a-f0-9]{64}$/;
const AUTHORITY = Object.freeze({handParameterization: true, workspaceRead: false, workspaceMutation: false, candidateExecution: false, network: false, install: false, deployment: false, promotion: false, canon: false});

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function digestReceipt(value, field, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !HEX64.test(value[field] || '')) throw Error(`${code}_INVALID`);
  const body = {...value}; delete body[field];
  if (registry.hash(body) !== value[field]) throw Error(`${code}_DIGEST_MISMATCH`);
}

function validateObservation(observation) {
  digestReceipt(observation, 'observationSha256', 'HAND_FOUNDRY_PROJECT_MAP_OBSERVATION');
  if (observation.schema !== 'axm.code.project-map-observation.v1' || observation.version !== '1.0.0' || observation.status !== 'TEST' || observation.result !== 'PROJECT_MAP_OBSERVED_READ_ONLY') throw Error('HAND_FOUNDRY_PROJECT_MAP_OBSERVATION_HEADER_INVALID');
  if (!observation.projectMap || registry.hash(observation.projectMap) !== observation.projectMapSha256 || observation.projectMap.projectId !== observation.projectId) throw Error('HAND_FOUNDRY_PROJECT_MAP_OBSERVATION_BINDING_INVALID');
  if (Date.now() > Date.parse(observation.expiresAt)) throw Error('HAND_FOUNDRY_PROJECT_MAP_OBSERVATION_STALE');
  if (observation.truth?.workspaceMutated !== false || observation.authority?.workspaceRead !== true || observation.authority?.workspaceMutation !== false) throw Error('HAND_FOUNDRY_PROJECT_MAP_OBSERVATION_AUTHORITY_INVALID');
  return observation;
}

function expectedHands(plan) {
  const author = plan.sourcePlacement?.action === 'create-module' ? 'language-aware-file-creator' : 'language-aware-structural-editor';
  return ['fresh-project-map-reader', author, 'exact-byte-writer', 'language-parser', 'verification-runner', 'rollback-writer'];
}

function validatePlans(plans, observation) {
  if (!Array.isArray(plans) || plans.length < MIN_PLANS || plans.length > MAX_PLANS) throw Error('HAND_FOUNDRY_PLACEMENT_PLAN_COUNT_INVALID');
  const digests = new Set(); const targets = new Set(); let languageId = null;
  for (const plan of plans) {
    digestReceipt(plan, 'planSha256', 'HAND_FOUNDRY_PLACEMENT_PLAN');
    if (plan.schema !== 'axm.code.placement-plan.v1' || plan.version !== '1.0.0' || plan.status !== 'TEST' || plan.result !== 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY') throw Error('HAND_FOUNDRY_PLACEMENT_PLAN_HEADER_INVALID');
    if (digests.has(plan.planSha256)) throw Error('HAND_FOUNDRY_PLACEMENT_PLAN_DUPLICATE');
    digests.add(plan.planSha256);
    if (plan.projectMapSha256 !== observation.projectMapSha256 || plan.projectMapEvidence?.observationSha256 !== observation.observationSha256 || plan.projectId !== observation.projectId) throw Error('HAND_FOUNDRY_PLACEMENT_PLAN_PROJECT_BINDING_INVALID');
    if (registry.canon(plan.requiredHands) !== registry.canon(expectedHands(plan))) throw Error('HAND_FOUNDRY_REQUIRED_HANDS_FORGED');
    if (plan.authority?.workspaceMutation !== false || plan.authority?.toolExecution !== false) throw Error('HAND_FOUNDRY_PLACEMENT_PLAN_AUTHORITY_INVALID');
    const currentOrgan = organs.getByLanguageId(plan.languageBinding?.languageId);
    const currentProfile = currentOrgan ? organs.grammarProfile(currentOrgan.languageId) : null;
    if (!currentOrgan || !currentProfile || plan.languageBinding.organId !== currentOrgan.organId || plan.languageBinding.organSha256 !== currentOrgan.sha256 || plan.languageBinding.grammarProfileSha256 !== currentProfile.profileSha256) throw Error('HAND_FOUNDRY_LANGUAGE_BINDING_STALE_OR_INVALID');
    if (languageId && languageId !== currentOrgan.languageId) throw Error('HAND_FOUNDRY_MIXED_LANGUAGES');
    languageId = currentOrgan.languageId;
    for (const target of [plan.sourcePlacement?.targetPath, plan.verificationPlacement?.targetPath]) {
      if (typeof target !== 'string' || !target || targets.has(target)) throw Error('HAND_FOUNDRY_TARGET_INVALID_OR_DUPLICATE');
      targets.add(target);
    }
  }
  return {languageId, organ: organs.getByLanguageId(languageId)};
}

function validateGraphBinding(editGraph, plans, observation) {
  if (plans.length === 1) {
    if (editGraph) throw Error('HAND_FOUNDRY_EDIT_GRAPH_UNEXPECTED_FOR_PAIR');
    return null;
  }
  if (!editGraph) throw Error('HAND_FOUNDRY_EDIT_GRAPH_REQUIRED');
  editGraphPlane.validateGraph(editGraph, observation);
  const planDigests = plans.map(value => value.planSha256).sort();
  const graphPlanDigests = editGraph.entries.map(value => value.placementPlan.planSha256).sort();
  if (registry.canon(planDigests) !== registry.canon(graphPlanDigests)) throw Error('HAND_FOUNDRY_EDIT_GRAPH_PLAN_BINDING_INVALID');
  const orderedPlans = editGraph.entries.map(entry => plans.find(value => value.planSha256 === entry.placementPlan.planSha256));
  return {editGraphSha256: editGraph.editGraphSha256, entryIds: editGraph.entries.map(value => value.entryId), installationOrder: [...editGraph.installationOrder], orderedPlans};
}

function capsule(base, details) {
  const body = {...base, ...details, authority: {...(details.authority || AUTHORITY)}};
  return freeze({...body, capsuleSha256: registry.hash(body)});
}

function sourceAuthorDetails(organ) {
  if (organ.execution === 'PR51_SOURCE_REVIEWED_DONOR_BOUND_RUNTIME_UNKNOWN' && organ.donor) {
    return {
      status: 'RECIPE_SELECTION_REQUIRED', implementationId: pythonRecipeRegistry.REGISTRY_ID, implementationSha256: pythonRecipeRegistry.REGISTRY.registrySha256,
      recipeRegistryBinding: pythonRecipeRegistry.capsuleBinding(),
      donorBinding: {pr: organ.donor.pr, head: organ.donor.head, profile: organ.donor.profile, profileSha256: organ.donor.profileSha256, recipe: organ.donor.recipe, recipeSha256: organ.donor.recipeSha256, builder: organ.donor.builder, builderSha256: organ.donor.builderSha256, candidateEntry: organ.donor.candidateEntry, runtimeCorrectness: organ.donor.runtimeCorrectness},
      errorCode: 'BOUNDED_RECIPE_SELECTION_LAYOUT_AND_PARAMETERS_REQUIRED',
      truth: {donorMetadataMeansSourcePresent: true, implementationPresent: true, boundedRecipeRegistryPresent: true, registeredRecipeCount: pythonRecipeRegistry.REGISTRY.entries.length, boundedRecipeOnly: true, generalLanguageAuthoringAvailable: false, runtimeCorrectnessRequiresBoundVerifier: true, codeGenerated: false, foundryGrantedExecutionAuthority: false}
    };
  }
  return {status: 'DELEGATED', implementationId: null, implementationSha256: null, errorCode: 'EXACT_CANDIDATE_AUTHOR_REQUIRED', truth: {donorMetadataMeansSourcePresent: false, implementationRuntimeProven: false, codeGenerated: false, foundryGrantedExecutionAuthority: false}};
}

function writerDetails(languageId, planCount) {
  if (languageId === 'javascript' || (languageId === 'python' && planCount === 1)) {
    const implementationId = planCount === 1 ? 'workspace-edit-hand-v1' : 'workspace-edit-graph-hand-v1';
    return {status: 'AUTHORIZATION_REQUIRED', implementationId, implementationSha256: registry.hash(implementationId), errorCode: 'EXPLICIT_HOST_AUTHORIZATION_REQUIRED', truth: {implementationPresent: true, supportedLanguagePair: true, codeGenerated: false, foundryGrantedExecutionAuthority: false}};
  }
  return {status: 'IMPLEMENTATION_HELD', implementationId: null, implementationSha256: null, errorCode: 'LANGUAGE_EXACT_BYTE_WRITER_NOT_BOUND', truth: {implementationPresent: false, codeGenerated: false, foundryGrantedExecutionAuthority: false}};
}

function parserDetails(languageId, environmentObservation) {
  const implementation = spawnedParser.implementationFor(languageId, environmentObservation);
  if (!implementation) return {status: 'ENVIRONMENT_HELD', implementationId: null, implementationSha256: null, parserId: null, errorCode: 'LANGUAGE_PARSER_TOOL_UNAVAILABLE', truth: {implementationPresent: true, codeGenerated: false, foundryGrantedExecutionAuthority: false}};
  const prlimit = environmentHand.get(environmentObservation, 'prlimit');
  return {
    status: 'SPAWNED_NO_EXECUTION_AUTHORITY', implementationId: implementation.implementationId, implementationSha256: implementation.implementationSha256, parserId: implementation.parserId,
    toolBinding: implementation.toolBinding, resourceLimits: implementation.resourceLimits,
    resourceLimitToolBinding: implementation.resourceLimits.usable && prlimit?.usable ? {toolId: prlimit.id, executablePath: prlimit.executablePath, executablePathSha256: prlimit.executablePathSha256, version: prlimit.version} : null,
    errorCode: null,
    truth: {implementationPresent: true, parserProcessMayRun: implementation.truth.parserProcessMayRun, candidateExecuted: false, codeGenerated: false, foundryGrantedExecutionAuthority: false}, authority: spawnedParser.AUTHORITY
  };
}

function verifierDetails(languageId, environmentObservation) {
  const sandbox = environmentObservation.candidateExecutionIsolation;
  if (languageId === 'python') {
    const implementationId = 'bounded-python-recipe-registry-verifier-router-v1';
    return {status: 'RECIPE_SELECTION_REQUIRED', implementationId, implementationSha256: pythonRecipeRegistry.REGISTRY.registrySha256, recipeRegistryBinding: pythonRecipeRegistry.capsuleBinding(), errorCode: 'REGISTERED_BOUNDED_AUTHOR_RECEIPT_REQUIRED', truth: {implementationPresent: true, boundedRecipeRegistryPresent: true, registeredRecipeCount: pythonRecipeRegistry.REGISTRY.entries.length, provenanceLockedRecipeOnly: true, arbitraryCandidateExecutionAvailable: false, hostSandboxUsable: sandbox?.usable === true, candidateExecuted: false, codeGenerated: false, foundryGrantedExecutionAuthority: false}};
  }
  if (languageId === 'javascript') return {status: 'HOST_BINDING_REQUIRED', implementationId: 'host-digest-bound-verifier-adapter-v1', implementationSha256: registry.hash('host-digest-bound-verifier-adapter-v1'), errorCode: 'REQUESTED_VERIFIER_ADAPTER_REQUIRED', truth: {hostSandboxUsable: sandbox?.usable === true, candidateExecuted: false, codeGenerated: false, foundryGrantedExecutionAuthority: false}};
  return {status: 'IMPLEMENTATION_HELD', implementationId: null, implementationSha256: null, errorCode: 'LANGUAGE_VERIFICATION_RUNNER_NOT_BOUND', truth: {hostSandboxUsable: sandbox?.usable === true, candidateExecuted: false, codeGenerated: false, foundryGrantedExecutionAuthority: false}};
}

function buildCapsules({plans, observation, environmentObservation, languageId, organ, graphBinding}) {
  const roles = [];
  for (const plan of plans) for (const role of plan.requiredHands) if (!roles.includes(role)) roles.push(role);
  const targetPaths = plans.flatMap(plan => [plan.sourcePlacement.targetPath, plan.verificationPlacement.targetPath]);
  const requestedVerifierIds = [...new Set(plans.flatMap(plan => plan.verificationPlacement.requestedVerifiers))].sort();
  const common = {
    schema: 'axm.code.spawned-hand-capsule.v1', version: '1.0.0', languageId, scope: plans.length === 1 ? 'pair' : 'graph',
    projectId: observation.projectId, projectMapObservationSha256: observation.observationSha256, projectMapSha256: observation.projectMapSha256,
    placementPlanSha256s: plans.map(plan => plan.planSha256), environmentObservationSha256: environmentObservation.environmentObservationSha256,
    editGraphSha256: graphBinding?.editGraphSha256 || null, installationOrder: graphBinding ? [...graphBinding.installationOrder] : null,
    organId: organ.organId, organSha256: organ.sha256, grammarProfileSha256: plans[0].languageBinding.grammarProfileSha256,
    targetPaths, requestedVerifierIds
  };
  return roles.map((handRole, index) => {
    let details;
    if (handRole === 'fresh-project-map-reader') details = {status: 'SPAWNED_NO_EXECUTION_AUTHORITY', implementationId: 'project-map-hand-v1', implementationSha256: registry.hash('project-map-hand-v1'), errorCode: null, truth: {implementationPresent: true, codeGenerated: false, foundryGrantedExecutionAuthority: false}};
    else if (handRole === 'language-aware-file-creator' || handRole === 'language-aware-structural-editor') details = sourceAuthorDetails(organ);
    else if (handRole === 'exact-byte-writer' || handRole === 'rollback-writer') details = writerDetails(languageId, plans.length);
    else if (handRole === 'language-parser') details = parserDetails(languageId, environmentObservation);
    else if (handRole === 'verification-runner') details = verifierDetails(languageId, environmentObservation);
    else details = {status: 'IMPLEMENTATION_HELD', implementationId: null, implementationSha256: null, errorCode: 'UNKNOWN_HAND_IMPLEMENTATION', truth: {implementationPresent: false, codeGenerated: false, foundryGrantedExecutionAuthority: false}};
    return capsule({...common, handId: `${languageId}-${handRole}-${String(index + 1).padStart(2, '0')}`, handRole}, details);
  });
}

function held(errorCode) {
  const body = {schema: 'axm.code.hand-spawn-manifest.v1', version: '1.0.0', status: 'TEST', result: 'HAND_SPAWN_MANIFEST_HELD', errorCode, handCapsules: [], truth: {grammarParameterizedHands: false, foundryGrantedMutationAuthority: false, foundryGrantedCandidateExecutionAuthority: false, missingImplementationInvented: false, failedSandboxPromoted: false, codeGenerated: false}, authority: AUTHORITY};
  return freeze({...body, manifestSha256: registry.hash(body)});
}

function spawn({projectMapObservation = null, placementPlans = null, editGraph = null, environmentObservation = null} = {}) {
  try {
    validateObservation(projectMapObservation);
    environmentHand.validate(environmentObservation);
    const {languageId, organ} = validatePlans(placementPlans, projectMapObservation);
    const graphBinding = validateGraphBinding(editGraph, placementPlans, projectMapObservation);
    const boundPlans = graphBinding ? graphBinding.orderedPlans : placementPlans;
    const handCapsules = buildCapsules({plans: boundPlans, observation: projectMapObservation, environmentObservation, languageId, organ, graphBinding});
    const statusCounts = {};
    for (const value of handCapsules) statusCounts[value.status] = (statusCounts[value.status] || 0) + 1;
    const body = {
      schema: 'axm.code.hand-spawn-manifest.v1', version: '1.0.0', status: 'TEST', result: handCapsules.some(value => value.errorCode) ? 'HAND_SPAWN_MANIFEST_READY_WITH_HOLDS' : 'HAND_SPAWN_MANIFEST_READY', errorCode: null,
      languageId, scope: placementPlans.length === 1 ? 'pair' : 'graph', projectId: projectMapObservation.projectId,
      projectMapObservationSha256: projectMapObservation.observationSha256, environmentObservationSha256: environmentObservation.environmentObservationSha256,
      placementPlanSha256s: boundPlans.map(plan => plan.planSha256), editGraphSha256: graphBinding?.editGraphSha256 || null, installationOrder: graphBinding ? [...graphBinding.installationOrder] : null,
      targetCount: boundPlans.length * 2, handCapsuleCount: handCapsules.length, statusCounts, handCapsules,
      truth: {grammarParameterizedHands: true, foundryGrantedMutationAuthority: false, foundryGrantedCandidateExecutionAuthority: false, missingImplementationInvented: false, failedSandboxPromoted: false, codeGenerated: false}, authority: AUTHORITY
    };
    return freeze({...body, manifestSha256: registry.hash(body)});
  } catch (error) {
    return held(String(error?.message || 'HAND_FOUNDRY_FAILED'));
  }
}

function validateManifest(manifest) {
  digestReceipt(manifest, 'manifestSha256', 'HAND_FOUNDRY_MANIFEST');
  if (manifest.schema !== 'axm.code.hand-spawn-manifest.v1' || manifest.version !== '1.0.0' || manifest.status !== 'TEST' || !['HAND_SPAWN_MANIFEST_READY', 'HAND_SPAWN_MANIFEST_READY_WITH_HOLDS'].includes(manifest.result) || !Array.isArray(manifest.handCapsules) || manifest.handCapsules.length < 1 || manifest.handCapsules.length > 8) throw Error('HAND_FOUNDRY_MANIFEST_CONTRACT_INVALID');
  if (manifest.handCapsuleCount !== manifest.handCapsules.length || manifest.targetCount !== manifest.placementPlanSha256s.length * 2 || new Set(manifest.placementPlanSha256s).size !== manifest.placementPlanSha256s.length) throw Error('HAND_FOUNDRY_MANIFEST_COUNT_OR_PLAN_BINDING_INVALID');
  const statusCounts = {}; const handIds = new Set(); const handRoles = new Set();
  for (const value of manifest.handCapsules) {
    digestReceipt(value, 'capsuleSha256', 'HAND_FOUNDRY_CAPSULE');
    if (handIds.has(value.handId) || handRoles.has(value.handRole)) throw Error('HAND_FOUNDRY_CAPSULE_DUPLICATE');
    handIds.add(value.handId); handRoles.add(value.handRole); statusCounts[value.status] = (statusCounts[value.status] || 0) + 1;
    if (value.languageId !== manifest.languageId || value.scope !== manifest.scope || value.projectId !== manifest.projectId || value.projectMapObservationSha256 !== manifest.projectMapObservationSha256 || value.environmentObservationSha256 !== manifest.environmentObservationSha256 || value.editGraphSha256 !== manifest.editGraphSha256 || registry.canon(value.installationOrder) !== registry.canon(manifest.installationOrder) || registry.canon(value.placementPlanSha256s) !== registry.canon(manifest.placementPlanSha256s) || value.truth?.foundryGrantedExecutionAuthority !== false || value.authority?.candidateExecution !== false || value.authority?.workspaceMutation !== false) throw Error('HAND_FOUNDRY_CAPSULE_BINDING_OR_AUTHORITY_INVALID');
    if (value.handRole === 'language-parser' && value.status === 'SPAWNED_NO_EXECUTION_AUTHORITY') spawnedParser.validateCapsule(value);
  }
  if (registry.canon(statusCounts) !== registry.canon(manifest.statusCounts)) throw Error('HAND_FOUNDRY_MANIFEST_STATUS_COUNTS_INVALID');
  if (manifest.truth?.foundryGrantedMutationAuthority !== false || manifest.truth?.foundryGrantedCandidateExecutionAuthority !== false || manifest.authority?.workspaceMutation !== false) throw Error('HAND_FOUNDRY_MANIFEST_AUTHORITY_INVALID');
  return manifest;
}

module.exports = {AUTHORITY, MIN_PLANS, MAX_PLANS, spawn, validateManifest};
