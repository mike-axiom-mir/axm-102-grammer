'use strict';

const assert = require('assert');
const childProcess = require('child_process');

const originalSpawnSync = childProcess.spawnSync;
let childProcessCalls = 0;
childProcess.spawnSync = function observedSpawnSync(...args) { childProcessCalls += 1; return originalSpawnSync(...args); };

const placementRegistry = require('./placement-registry.js');
const recipeRegistry = require('./bounded-python-recipe-registry.js');
const admissionPlane = require('./bounded-python-recipe-admission-plane.js');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function redigest(value, field) { delete value[field]; value[field] = placementRegistry.hash(value); return value; }
function digest(label) { return placementRegistry.hash('admission-test:' + label); }

function proposal() {
  const body = {
    schema: 'axm.code.bounded-python-recipe-admission-proposal.v1', version: '1.0.0', status: 'DRAFT', proposalId: 'enum-map-proposal-v1', languageId: 'python', scope: 'pair',
    recipeId: 'bounded-python-enum-map', recipeSha256: digest('recipe'), builderId: 'bounded-python-enum-map-v1', builderSha256: digest('builder'),
    authorReceiptSchema: 'axm.code.bounded-python-enum-map-author-receipt.v1', authorReadyResult: 'PYTHON_ENUM_MAP_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY',
    verifierId: 'bounded-python-enum-map-unit-test', verifierRunnerSha256: digest('verifier'), provenanceClass: 'PROPOSED_UNREVIEWED_CALLER_EVIDENCE',
    generalPythonAuthoring: false, arbitraryCandidateExecution: false, dynamicModuleLoading: false
  };
  return {...body, proposalSha256: placementRegistry.hash(body)};
}

function evidence(proposed) {
  const evidenceItems = admissionPlane.EVIDENCE_KINDS.map(kind => ({kind, sha256: digest('evidence:' + kind), status: kind === 'adversarial-test-receipt' ? 'TEST_RECEIPT_DIGEST_ONLY' : 'CURRENT_BYTES_DIGEST_ONLY'}));
  const body = {
    schema: 'axm.code.bounded-python-recipe-admission-evidence.v1', version: '1.0.0', status: 'CALLER_SUPPLIED', proposalSha256: proposed.proposalSha256, evidenceItems,
    testClaims: {authorCandidateGenerationPassed: true, authorNoWorkspaceAuthorityObserved: true, verifierExactCandidatePassed: true, candidateSubstitutionHeld: true, crossRecipeReceiptHeld: true, workspaceMutationObserved: false, arbitraryCandidateExecutionObserved: false},
    truth: {humanReviewCompleted: false, proposedSourceBytesInspectedByAdmissionPlane: false, digestsAreConsentOrIdentityProof: false}
  };
  return {...body, evidenceSha256: placementRegistry.hash(body)};
}

const activeSnapshot = placementRegistry.canon(recipeRegistry.REGISTRY);
let adversarialHolds = 0;
function hold(proposed, suppliedEvidence, activeRegistry, code) {
  const beforeCalls = childProcessCalls;
  const result = admissionPlane.stage({proposal: proposed, evidence: suppliedEvidence, activeRegistry});
  admissionPlane.validateReceipt(result);
  assert.strictEqual(result.result, 'RECIPE_ADMISSION_HELD'); assert.match(result.errorCode, code);
  assert.strictEqual(result.truth.activeRegistryMutated, false); assert.strictEqual(result.truth.proposedModuleLoaded, false); assert.strictEqual(result.truth.candidateExecuted, false);
  assert.strictEqual(childProcessCalls, beforeCalls); assert.strictEqual(placementRegistry.canon(recipeRegistry.REGISTRY), activeSnapshot);
  adversarialHolds += 1; return result;
}

try {
  const proposed = proposal(); const suppliedEvidence = evidence(proposed);
  const first = admissionPlane.stage({proposal: proposed, evidence: suppliedEvidence, activeRegistry: recipeRegistry.REGISTRY});
  const second = admissionPlane.stage({proposal: proposed, evidence: suppliedEvidence, activeRegistry: recipeRegistry.REGISTRY});
  admissionPlane.validateReceipt(first); admissionPlane.validateReceipt(second);
  assert.strictEqual(first.result, 'RECIPE_ADMISSION_STAGED_AWAITING_EXTERNAL_REVIEW_NO_REGISTRY_AUTHORITY');
  assert.strictEqual(first.admissionReceiptSha256, second.admissionReceiptSha256);
  assert.strictEqual(first.activeRegistrySha256, recipeRegistry.REGISTRY.registrySha256);
  assert.strictEqual(first.candidateEntry.recipeId, proposed.recipeId);
  assert.strictEqual(first.candidateEntry.entrySha256, first.registryPreview.proposedEntrySha256);
  assert.strictEqual(first.registryPreview.proposedEntryCount, recipeRegistry.REGISTRY.entries.length + 1);
  assert.notStrictEqual(first.registryPreview.proposedRegistrySha256, recipeRegistry.REGISTRY.registrySha256);
  assert.deepStrictEqual(first.activationGaps, ['HUMAN_REVIEW_REQUIRED', 'EXPLICIT_REGISTRY_SOURCE_CHANGE_REQUIRED', 'FULL_REGRESSION_REQUIRED', 'FRESH_FOUNDRY_MANIFEST_REQUIRED', 'FRESH_HOST_AUTHORIZATION_REQUIRED']);
  assert.strictEqual(first.truth.callerEvidenceIndependentlyVerifiedByPlane, false);
  assert.strictEqual(first.truth.humanReviewCompleted, false);
  assert.strictEqual(first.truth.proposedSourceBytesRead, false); assert.strictEqual(first.truth.proposedModuleLoaded, false);
  assert.strictEqual(first.truth.authorInvoked, false); assert.strictEqual(first.truth.verifierInvoked, false);
  assert.strictEqual(first.truth.candidateGenerated, false); assert.strictEqual(first.truth.candidateExecuted, false); assert.strictEqual(first.truth.childProcessSpawned, false);
  assert.strictEqual(first.truth.activeRegistryMutated, false); assert.strictEqual(first.truth.stagedEntryIsActive, false);
  assert.strictEqual(first.truth.recipeSelectionIssued, false); assert.strictEqual(first.truth.activationAuthorizationIssued, false); assert.strictEqual(first.truth.promotionOccurred, false); assert.strictEqual(first.truth.canonChanged, false);
  assert.strictEqual(admissionPlane.AUTHORITY.registryMutation, false); assert.strictEqual(admissionPlane.AUTHORITY.candidateExecution, false); assert.strictEqual(admissionPlane.AUTHORITY.promotion, false);
  assert.strictEqual(Object.hasOwn(admissionPlane, 'promote'), false);
  assert.strictEqual(recipeRegistry.get(proposed.recipeId), null);
  assert.throws(() => recipeRegistry.createSelection(proposed.recipeId, {}), /RECIPE_UNSUPPORTED/);
  assert.strictEqual(childProcessCalls, 0); assert.strictEqual(placementRegistry.canon(recipeRegistry.REGISTRY), activeSnapshot);

  hold(proposed, suppliedEvidence, null, /BOUNDED_RECIPE_REGISTRY_INVALID/);
  const proposalDigest = clone(proposed); proposalDigest.builderId = 'forged-builder';
  hold(proposalDigest, suppliedEvidence, recipeRegistry.REGISTRY, /PROPOSAL_DIGEST_MISMATCH/);
  const unsafeId = clone(proposed); unsafeId.recipeId = '../unsafe'; redigest(unsafeId, 'proposalSha256');
  hold(unsafeId, evidence(unsafeId), recipeRegistry.REGISTRY, /PROPOSAL_IDENTIFIER_INVALID/);
  const generalAuthor = clone(proposed); generalAuthor.generalPythonAuthoring = true; redigest(generalAuthor, 'proposalSha256');
  hold(generalAuthor, evidence(generalAuthor), recipeRegistry.REGISTRY, /PROPOSAL_AUTHORITY_INVALID/);
  const dynamicLoad = clone(proposed); dynamicLoad.dynamicModuleLoading = true; redigest(dynamicLoad, 'proposalSha256');
  hold(dynamicLoad, evidence(dynamicLoad), recipeRegistry.REGISTRY, /PROPOSAL_AUTHORITY_INVALID/);
  const activeDuplicate = clone(proposed); activeDuplicate.recipeId = recipeRegistry.REGISTRY.entries[0].recipeId; redigest(activeDuplicate, 'proposalSha256');
  hold(activeDuplicate, evidence(activeDuplicate), recipeRegistry.REGISTRY, /RECIPE_ALREADY_ACTIVE/);
  const idCollision = clone(proposed); idCollision.builderId = recipeRegistry.REGISTRY.entries[0].builderId; redigest(idCollision, 'proposalSha256');
  hold(idCollision, evidence(idCollision), recipeRegistry.REGISTRY, /IMPLEMENTATION_ID_COLLISION/);
  const digestCollision = clone(proposed); digestCollision.verifierRunnerSha256 = recipeRegistry.REGISTRY.entries[0].verifierRunnerSha256; redigest(digestCollision, 'proposalSha256');
  hold(digestCollision, evidence(digestCollision), recipeRegistry.REGISTRY, /IMPLEMENTATION_DIGEST_COLLISION/);
  const wrongProposalEvidence = clone(suppliedEvidence); wrongProposalEvidence.proposalSha256 = '0'.repeat(64); redigest(wrongProposalEvidence, 'evidenceSha256');
  hold(proposed, wrongProposalEvidence, recipeRegistry.REGISTRY, /EVIDENCE_HEADER_OR_PROPOSAL_BINDING_INVALID/);
  const missingEvidence = clone(suppliedEvidence); missingEvidence.evidenceItems.pop(); redigest(missingEvidence, 'evidenceSha256');
  hold(proposed, missingEvidence, recipeRegistry.REGISTRY, /EVIDENCE_ITEM_COUNT_INVALID/);
  const duplicateEvidence = clone(suppliedEvidence); duplicateEvidence.evidenceItems[1].sha256 = duplicateEvidence.evidenceItems[0].sha256; redigest(duplicateEvidence, 'evidenceSha256');
  hold(proposed, duplicateEvidence, recipeRegistry.REGISTRY, /EVIDENCE_ITEM_INVALID_OR_DUPLICATE/);
  const unsafeClaims = clone(suppliedEvidence); unsafeClaims.testClaims.workspaceMutationObserved = true; redigest(unsafeClaims, 'evidenceSha256');
  hold(proposed, unsafeClaims, recipeRegistry.REGISTRY, /TEST_CLAIMS_UNSAFE_OR_INCOMPLETE/);
  const forgedReview = clone(suppliedEvidence); forgedReview.truth.humanReviewCompleted = true; redigest(forgedReview, 'evidenceSha256');
  hold(proposed, forgedReview, recipeRegistry.REGISTRY, /EVIDENCE_TRUTH_INVALID/);
  const extraProposalKey = clone(proposed); extraProposalKey.modulePath = './untrusted.js'; redigest(extraProposalKey, 'proposalSha256');
  hold(extraProposalKey, evidence(extraProposalKey), recipeRegistry.REGISTRY, /PROPOSAL_KEYS_INVALID/);
  const forgedRegistry = clone(recipeRegistry.REGISTRY); forgedRegistry.entries.push(first.candidateEntry); redigest(forgedRegistry, 'registrySha256');
  hold(proposed, suppliedEvidence, forgedRegistry, /BOUNDED_RECIPE_REGISTRY_BINDING_INVALID/);

  console.log(JSON.stringify({
    ok: true,
    deterministicStageReceipts: 2,
    activeRegistryRecipeCount: recipeRegistry.REGISTRY.entries.length,
    stagedCandidateEntryCount: 1,
    hypotheticalNextRegistryEntryCount: first.registryPreview.proposedEntryCount,
    activationGapCount: first.activationGaps.length,
    callerEvidenceIndependentlyVerified: false,
    proposedSourceBytesRead: 0,
    proposedModulesLoaded: 0,
    authorsInvoked: 0,
    verifiersInvoked: 0,
    candidatesGenerated: 0,
    candidatesExecuted: 0,
    childProcessesSpawned: childProcessCalls,
    activeRegistryMutations: 0,
    selectionsIssued: 0,
    activationAuthorizationsIssued: 0,
    promotions: 0,
    adversarialHolds
  }, null, 2));
} finally {
  childProcess.spawnSync = originalSpawnSync;
}
