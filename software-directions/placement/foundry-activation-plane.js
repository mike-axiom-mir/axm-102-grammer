'use strict';

const path = require('path');
const registry = require('./placement-registry.js');
const foundry = require('./hand-foundry-plane.js');
const environmentHand = require('./toolchain-environment-hand.js');
const authorHand = require('./bounded-python-record-transform-author-hand.js');
const verifierFactory = require('./bounded-python-record-transform-verifier-adapter.js');
const editHand = require('./workspace-edit-hand.js');

const HEX64 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AUTHORIZATION_TTL_MS = editHand.AUTHORIZATION_TTL_MS;
const AUTHORITY = Object.freeze({handAssembly: true, candidateGeneration: true, workspaceRead: true, workspaceMutation: true, rollbackWrite: true, provenanceLockedCandidateExecution: true, arbitraryCandidateExecution: false, network: false, install: false, deployment: false, promotion: false, canon: false});

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function digestReceipt(value, field, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !HEX64.test(value[field] || '')) throw Error(code + '_INVALID');
  const body = {...value}; delete body[field];
  if (registry.hash(body) !== value[field]) throw Error(code + '_DIGEST_MISMATCH');
  return value;
}

function selection(value) {
  digestReceipt(value, 'selectionSha256', 'FOUNDRY_ACTIVATION_RECIPE_SELECTION');
  const keys = Object.keys(value).sort();
  const expectedKeys = ['builderId', 'builderSha256', 'parameters', 'recipeId', 'recipeSha256', 'schema', 'selectionSha256', 'version'].sort();
  if (registry.canon(keys) !== registry.canon(expectedKeys)) throw Error('FOUNDRY_ACTIVATION_RECIPE_SELECTION_KEYS_INVALID');
  if (value.schema !== 'axm.code.foundry-recipe-selection.v1' || value.version !== '1.0.0' || value.recipeId !== authorHand.DONOR.recipeId || value.recipeSha256 !== authorHand.DONOR.recipeSha256 || value.builderId !== authorHand.DONOR.builderId || value.builderSha256 !== authorHand.DONOR.builderSha256) throw Error('FOUNDRY_ACTIVATION_RECIPE_SELECTION_UNSUPPORTED');
  authorHand.buildPythonRecordTransform(value.parameters);
  return value;
}

function capsule(manifest, role) {
  return manifest.handCapsules.find(value => value.handRole === role) || null;
}

function validateAssembly(manifest, observation, plan, environmentObservation) {
  foundry.validateManifest(manifest);
  environmentHand.validate(environmentObservation);
  digestReceipt(observation, 'observationSha256', 'FOUNDRY_ACTIVATION_PROJECT_MAP_OBSERVATION');
  digestReceipt(plan, 'planSha256', 'FOUNDRY_ACTIVATION_PLACEMENT_PLAN');
  if (manifest.languageId !== 'python' || manifest.scope !== 'pair' || manifest.placementPlanSha256s.length !== 1 || manifest.placementPlanSha256s[0] !== plan.planSha256 || manifest.projectMapObservationSha256 !== observation.observationSha256 || manifest.environmentObservationSha256 !== environmentObservation.environmentObservationSha256 || plan.projectMapEvidence?.observationSha256 !== observation.observationSha256 || plan.languageBinding?.languageId !== 'python') throw Error('FOUNDRY_ACTIVATION_ASSEMBLY_BINDING_INVALID');
  const expectedTargets = [plan.sourcePlacement.targetPath, plan.verificationPlacement.targetPath];
  if (manifest.handCapsules.some(value => registry.canon(value.targetPaths) !== registry.canon(expectedTargets))) throw Error('FOUNDRY_ACTIVATION_TARGET_BINDING_INVALID');
  const author = capsule(manifest, plan.sourcePlacement.action === 'create-module' ? 'language-aware-file-creator' : 'language-aware-structural-editor');
  const writer = capsule(manifest, 'exact-byte-writer');
  const parser = capsule(manifest, 'language-parser');
  const verifier = capsule(manifest, 'verification-runner');
  const rollback = capsule(manifest, 'rollback-writer');
  if (!author || author.status !== 'RECIPE_INPUT_REQUIRED' || author.implementationId !== authorHand.DONOR.builderId || author.implementationSha256 !== authorHand.DONOR.builderSha256) throw Error('FOUNDRY_ACTIVATION_AUTHOR_CAPSULE_INVALID');
  if (!writer || writer.status !== 'AUTHORIZATION_REQUIRED' || writer.implementationId !== 'workspace-edit-hand-v1' || !rollback || rollback.status !== 'AUTHORIZATION_REQUIRED' || rollback.implementationId !== 'workspace-edit-hand-v1') throw Error('FOUNDRY_ACTIVATION_WRITER_CAPSULE_INVALID');
  if (!parser || parser.status !== 'SPAWNED_NO_EXECUTION_AUTHORITY' || parser.parserId !== 'python-ast-exec-syntax-v1') throw Error('FOUNDRY_ACTIVATION_PARSER_CAPSULE_INVALID');
  if (!verifier || verifier.status !== 'RECIPE_SELECTION_REQUIRED' || verifier.implementationId !== 'bounded-python-record-transform-verifier-adapter-v1') throw Error('FOUNDRY_ACTIVATION_VERIFIER_CAPSULE_INVALID');
  return {author, writer, parser, verifier, rollback};
}

function absoluteRoot(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw Error(code + '_MUST_BE_ABSOLUTE');
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) throw Error(code + '_TOO_BROAD');
  return resolved;
}

function validateAuthorization(value, context) {
  digestReceipt(value, 'authorizationSha256', 'FOUNDRY_ACTIVATION_AUTHORIZATION');
  if (value.schema !== 'axm.code.foundry-activation-authorization.v1' || value.version !== '1.0.0' || value.status !== 'TEST' || value.result !== 'FOUNDRY_ACTIVATION_AUTHORIZED' || value.approval !== 'EXPLICIT_SINGLE_ACTIVATION' || !SAFE_ID.test(value.activationId || '')) throw Error('FOUNDRY_ACTIVATION_AUTHORIZATION_HEADER_INVALID');
  const issuedAt = Date.parse(value.issuedAt); const expiresAt = Date.parse(value.expiresAt); const now = Date.now();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || new Date(issuedAt).toISOString() !== value.issuedAt || new Date(expiresAt).toISOString() !== value.expiresAt || expiresAt <= issuedAt || value.ttlMs !== expiresAt - issuedAt || value.ttlMs > AUTHORIZATION_TTL_MS || issuedAt > now + 5000) throw Error('FOUNDRY_ACTIVATION_AUTHORIZATION_TIME_INVALID');
  if (now > expiresAt || expiresAt > Date.parse(context.observation.expiresAt) || expiresAt > Date.parse(context.environment.expiresAt)) throw Error('FOUNDRY_ACTIVATION_AUTHORIZATION_STALE');
  if (value.workspaceRootIdentitySha256 !== registry.hash(context.workspaceRoot) || value.journalRootIdentitySha256 !== registry.hash(context.journalRoot) || value.projectMapObservationSha256 !== context.observation.observationSha256 || value.placementPlanSha256 !== context.plan.planSha256 || value.manifestSha256 !== context.manifest.manifestSha256 || value.environmentObservationSha256 !== context.environment.environmentObservationSha256 || value.recipeSelectionSha256 !== context.recipeSelection.selectionSha256 || value.authorImplementationSha256 !== authorHand.DONOR.builderSha256 || value.parserCapsuleSha256 !== context.capsules.parser.capsuleSha256 || value.verifierImplementationSha256 !== context.capsules.verifier.implementationSha256 || value.rollbackRequired !== true || value.durableRecoveryRequired !== true) throw Error('FOUNDRY_ACTIVATION_AUTHORIZATION_BINDING_INVALID');
  if (value.authority?.workspaceMutation !== true || value.authority?.rollbackWrite !== true || value.authority?.provenanceLockedCandidateExecution !== true || value.authority?.arbitraryCandidateExecution !== false || value.authority?.network !== false || value.authority?.install !== false || value.authority?.deployment !== false || value.truth?.digestIsSignerOrConsentProof !== false || value.truth?.foundryMaySelfAuthorize !== false) throw Error('FOUNDRY_ACTIVATION_AUTHORIZATION_AUTHORITY_INVALID');
  return value;
}

function derivedEditAuthorization(hostAuthorization, context, authorReceipt, verifier) {
  const body = {
    schema: 'axm.code.edit-authorization.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_TRANSACTION_AUTHORIZED',
    authorizationId: hostAuthorization.activationId, approval: 'EXPLICIT_SINGLE_TRANSACTION',
    issuedAt: hostAuthorization.issuedAt, expiresAt: hostAuthorization.expiresAt, ttlMs: hostAuthorization.ttlMs,
    workspaceRootIdentitySha256: hostAuthorization.workspaceRootIdentitySha256, journalRootIdentitySha256: hostAuthorization.journalRootIdentitySha256,
    projectMapObservationSha256: context.observation.observationSha256, placementPlanSha256: context.plan.planSha256,
    parserId: context.capsules.parser.parserId, parserCapsuleSha256: context.capsules.parser.capsuleSha256,
    parserEnvironmentObservationSha256: context.environment.environmentObservationSha256,
    rollbackRequired: true, durableRecoveryRequired: true,
    targets: {
      source: {targetPath: context.plan.sourcePlacement.targetPath, action: context.plan.sourcePlacement.action, expectedBeforeSha256: context.plan.sourcePlacement.expectedPreMutationSha256, candidateSha256: authorReceipt.candidates.source.contentSha256},
      verification: {targetPath: context.plan.verificationPlacement.targetPath, action: context.plan.verificationPlacement.action, expectedBeforeSha256: context.plan.verificationPlacement.expectedPreMutationSha256, candidateSha256: authorReceipt.candidates.verification.contentSha256}
    },
    verifierBindings: [{id: verifier.id, adapterSha256: verifier.adapterSha256, providesVerifierId: verifier.providesVerifierId}],
    activationAuthorizationSha256: hostAuthorization.authorizationSha256, manifestSha256: context.manifest.manifestSha256,
    recipeSelectionSha256: context.recipeSelection.selectionSha256, authorReceiptSha256: authorReceipt.authorReceiptSha256,
    authority: {workspaceMutation: true, rollbackWrite: true, network: false, install: false, deployment: false, userFileDeletion: false},
    truth: {digestIsSignerOrConsentProof: false, candidateGenerationDelegated: true, derivedFromExplicitFoundryActivation: true}
  };
  return freeze({...body, authorizationSha256: registry.hash(body)});
}

function receipt(body) {
  return freeze({...body, activationReceiptSha256: registry.hash(body)});
}

function held(errorCode, details = {}, truthDetails = {}) {
  return receipt({
    schema: 'axm.code.foundry-activation-receipt.v1', version: '1.0.0', status: 'TEST', result: 'FOUNDRY_ACTIVATION_HELD', errorCode,
    ...details,
    truth: {handsAssembled: false, explicitHostAuthorizationValidated: false, explicitHostAuthorizationConsumed: false, foundrySelfAuthorized: false, workspaceMutationAttempted: false, candidateGenerated: false, candidateExecuted: false, arbitraryCandidateExecution: false, generalPythonAuthoringClaimed: false, ...truthDetails},
    authority: AUTHORITY
  });
}

function activate({workspaceRoot = null, journalRoot = null, declaration = null, projectMapObservation = null, placementPlan = null, manifest = null, environmentObservation = null, recipeSelection = null, authorization = null} = {}) {
  let explicitHostAuthorizationValidated = false; let candidateGenerated = false; let handsAssembled = false;
  try {
    const resolvedWorkspace = absoluteRoot(workspaceRoot, 'FOUNDRY_ACTIVATION_WORKSPACE_ROOT');
    const resolvedJournal = absoluteRoot(journalRoot, 'FOUNDRY_ACTIVATION_JOURNAL_ROOT');
    const selected = selection(recipeSelection);
    const capsules = validateAssembly(manifest, projectMapObservation, placementPlan, environmentObservation);
    const context = {workspaceRoot: resolvedWorkspace, journalRoot: resolvedJournal, observation: projectMapObservation, plan: placementPlan, manifest, environment: environmentObservation, recipeSelection: selected, capsules};
    validateAuthorization(authorization, context);
    explicitHostAuthorizationValidated = true;
    const authorReceipt = authorHand.author({placementPlan, parameters: selected.parameters});
    if (authorReceipt.result !== 'PYTHON_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY') throw Error('FOUNDRY_ACTIVATION_AUTHOR_HELD:' + authorReceipt.errorCode);
    authorHand.validateReceipt(authorReceipt);
    candidateGenerated = true;
    const verifier = verifierFactory.create({authorReceipt, environmentObservation});
    const editAuthorization = derivedEditAuthorization(authorization, context, authorReceipt, verifier);
    handsAssembled = true;
    const transactionReceipt = editHand.apply({
      workspaceRoot: resolvedWorkspace, journalRoot: resolvedJournal, declaration,
      projectMapObservation, placementPlan, authorization: editAuthorization,
      candidates: authorReceipt.candidates, parserContext: {capsule: capsules.parser, environmentObservation},
      verifierAdapters: [verifier]
    });
    let result = 'FOUNDRY_ACTIVATION_FAILED';
    if (transactionReceipt.result === 'EDIT_TRANSACTION_COMMITTED') result = 'FOUNDRY_ACTIVATION_COMMITTED';
    else if (transactionReceipt.result === 'EDIT_TRANSACTION_COMMITTED_WITH_CLEANUP_HOLD' || transactionReceipt.result === 'EDIT_TRANSACTION_COMMITTED_WITH_RECOVERY_HOLD') result = 'FOUNDRY_ACTIVATION_COMMITTED_WITH_RECOVERY_HOLD';
    else if (transactionReceipt.result === 'EDIT_TRANSACTION_ROLLED_BACK' || transactionReceipt.result === 'EDIT_TRANSACTION_ROLLED_BACK_WITH_JOURNAL_HOLD') result = 'FOUNDRY_ACTIVATION_ROLLED_BACK';
    else if (transactionReceipt.result === 'EDIT_TRANSACTION_HELD') result = 'FOUNDRY_ACTIVATION_HELD';
    const mutationAttempted = transactionReceipt.truth?.workspaceMutationAttempted === true;
    const body = {
      schema: 'axm.code.foundry-activation-receipt.v1', version: '1.0.0', status: 'TEST', result, errorCode: transactionReceipt.errorCode,
      activationId: authorization.activationId, activationAuthorizationSha256: authorization.authorizationSha256,
      manifestSha256: manifest.manifestSha256, recipeSelectionSha256: selected.selectionSha256,
      placementPlanSha256: placementPlan.planSha256, projectMapObservationSha256: projectMapObservation.observationSha256,
      authorReceipt, verifierAdapter: {id: verifier.id, adapterSha256: verifier.adapterSha256, providesVerifierId: verifier.providesVerifierId},
      derivedEditAuthorizationSha256: editAuthorization.authorizationSha256, transactionReceipt,
      truth: {handsAssembled: true, explicitHostAuthorizationValidated: true, explicitHostAuthorizationConsumed: true, foundrySelfAuthorized: false, candidateGenerated: true, candidateExecutedByParser: false, candidateExecutedByProvenanceVerifier: transactionReceipt.verifierReceipts?.some(value => value.observations?.exactDonorCandidateExecuted === true) === true, workspaceMutationAttempted: mutationAttempted, arbitraryCandidateExecution: false, generalPythonAuthoringClaimed: false, recipeApplicabilityProvesGeneralCompetence: false},
      authority: AUTHORITY
    };
    return receipt(body);
  } catch (error) {
    return held(String(error?.message || 'FOUNDRY_ACTIVATION_FAILED'), {}, {handsAssembled, explicitHostAuthorizationValidated, candidateGenerated});
  }
}

module.exports = {AUTHORITY, AUTHORIZATION_TTL_MS, activate};
