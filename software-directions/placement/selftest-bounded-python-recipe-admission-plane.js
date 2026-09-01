'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const originalSpawnSync = childProcess.spawnSync;
let childProcessCalls = 0;
childProcess.spawnSync = function observedSpawnSync(...args) { childProcessCalls += 1; return originalSpawnSync(...args); };

const placementRegistry = require('./placement-registry.js');
const recipeRegistry = require('./bounded-python-recipe-registry.js');
const evidenceObserver = require('./bounded-python-recipe-evidence-observer-hand.js');
const environmentHand = require('./toolchain-environment-hand.js');
const replayIsolation = require('./bounded-python-recipe-replay-isolation-hand.js');
const admissionPlane = require('./bounded-python-recipe-admission-plane.js');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function redigest(value, field) { delete value[field]; value[field] = placementRegistry.hash(value); return value; }
function digest(label) { return placementRegistry.hash('admission-test:' + label); }
function byteDigest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

const roots = [];
const EVIDENCE_PATHS = Object.freeze({
  'adversarial-test-receipt': 'proposal/testing/adversarial-receipt.json',
  'author-contract': 'proposal/contracts/author.contract.json',
  'author-source': 'proposal/source/author.js',
  'parameter-contract': 'proposal/contracts/parameters.contract.json',
  'verifier-contract': 'proposal/contracts/verifier.contract.json',
  'verifier-source': 'proposal/source/verifier.js'
});

function put(root, relative, content) {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, content);
}

function evidenceBytes() {
  return {
    'adversarial-test-receipt': Buffer.from('{"schema":"axm.code.proposed-recipe-adversarial-test-receipt.v1","status":"CALLER_REPORTED","passed":true}\n'),
    'author-contract': Buffer.from('{"schema":"axm.code.proposed-enum-map-author-contract.v1","status":"DRAFT"}\n'),
    'author-source': Buffer.from("module.exports = {author() { throw Error('observer-must-not-invoke-author'); }};\n"),
    'parameter-contract': Buffer.from('{"schema":"axm.code.proposed-enum-map-parameter-contract.v1","status":"DRAFT"}\n'),
    'verifier-contract': Buffer.from('{"schema":"axm.code.proposed-enum-map-verifier-contract.v1","status":"DRAFT"}\n'),
    'verifier-source': Buffer.from("module.exports = {verify() { throw Error('observer-must-not-invoke-verifier'); }};\n")
  };
}

function proposal(bytes = evidenceBytes()) {
  const body = {
    schema: 'axm.code.bounded-python-recipe-admission-proposal.v1', version: '1.0.0', status: 'DRAFT', proposalId: 'enum-map-proposal-v1', languageId: 'python', scope: 'pair',
    recipeId: 'bounded-python-enum-map', recipeSha256: byteDigest(bytes['parameter-contract']), builderId: 'bounded-python-enum-map-v1', builderSha256: byteDigest(bytes['author-source']),
    authorReceiptSchema: 'axm.code.bounded-python-enum-map-author-receipt.v1', authorReadyResult: 'PYTHON_ENUM_MAP_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY',
    verifierId: 'bounded-python-enum-map-unit-test', verifierRunnerSha256: byteDigest(bytes['verifier-source']), provenanceClass: 'PROPOSED_UNREVIEWED_CALLER_EVIDENCE',
    generalPythonAuthoring: false, arbitraryCandidateExecution: false, dynamicModuleLoading: false
  };
  return {...body, proposalSha256: placementRegistry.hash(body)};
}

function evidence(proposed, bytes = evidenceBytes()) {
  const evidenceItems = admissionPlane.EVIDENCE_KINDS.map(kind => ({kind, sha256: byteDigest(bytes[kind]), status: kind === 'adversarial-test-receipt' ? 'TEST_RECEIPT_DIGEST_ONLY' : 'CURRENT_BYTES_DIGEST_ONLY'}));
  const body = {
    schema: 'axm.code.bounded-python-recipe-admission-evidence.v1', version: '1.0.0', status: 'CALLER_SUPPLIED', proposalSha256: proposed.proposalSha256, evidenceItems,
    testClaims: {authorCandidateGenerationPassed: true, authorNoWorkspaceAuthorityObserved: true, verifierExactCandidatePassed: true, candidateSubstitutionHeld: true, crossRecipeReceiptHeld: true, workspaceMutationObserved: false, arbitraryCandidateExecutionObserved: false},
    truth: {humanReviewCompleted: false, proposedSourceBytesInspectedByAdmissionPlane: false, digestsAreConsentOrIdentityProof: false}
  };
  return {...body, evidenceSha256: placementRegistry.hash(body)};
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-recipe-admission-'));
  roots.push(root);
  const bytes = evidenceBytes();
  for (const kind of admissionPlane.EVIDENCE_KINDS) put(root, EVIDENCE_PATHS[kind], bytes[kind]);
  const proposed = proposal(bytes);
  const suppliedEvidence = evidence(proposed, bytes);
  const declarationBody = {schema: 'axm.code.bounded-python-recipe-evidence-declaration.v1', version: '1.0.0', status: 'TEST', proposalSha256: proposed.proposalSha256, evidenceSha256: suppliedEvidence.evidenceSha256, files: admissionPlane.EVIDENCE_KINDS.map(kind => ({kind, path: EVIDENCE_PATHS[kind]}))};
  const declaration = {...declarationBody, declarationSha256: placementRegistry.hash(declarationBody)};
  const evidenceObservation = evidenceObserver.inspect({workspaceRoot: root, proposal: proposed, evidence: suppliedEvidence, declaration});
  evidenceObserver.validateObservation(evidenceObservation);
  const environmentObservation = environmentHand.inspect();
  environmentHand.validate(environmentObservation);
  const replayIsolationReceipt = replayIsolation.assess({proposal: proposed, evidence: suppliedEvidence, evidenceObservation, environmentObservation});
  replayIsolation.validateReceipt(replayIsolationReceipt);
  assert.strictEqual(replayIsolation.isQualifiedReceipt(replayIsolationReceipt), true);
  return {root, bytes, proposed, suppliedEvidence, declaration, evidenceObservation, environmentObservation, replayIsolationReceipt};
}

const activeSnapshot = placementRegistry.canon(recipeRegistry.REGISTRY);
let adversarialHolds = 0;
function hold(proposed, suppliedEvidence, evidenceObservation, replayIsolationReceipt, activeRegistry, code) {
  const beforeCalls = childProcessCalls;
  const result = admissionPlane.stage({proposal: proposed, evidence: suppliedEvidence, evidenceObservation, replayIsolationReceipt, activeRegistry});
  admissionPlane.validateReceipt(result);
  assert.strictEqual(result.result, 'RECIPE_ADMISSION_HELD'); assert.match(result.errorCode, code);
  assert.strictEqual(result.truth.activeRegistryMutated, false); assert.strictEqual(result.truth.proposedModuleLoaded, false); assert.strictEqual(result.truth.candidateExecuted, false);
  assert.strictEqual(childProcessCalls, beforeCalls); assert.strictEqual(placementRegistry.canon(recipeRegistry.REGISTRY), activeSnapshot);
  adversarialHolds += 1; return result;
}

try {
  const observedFixture = fixture();
  const {proposed, suppliedEvidence, evidenceObservation, replayIsolationReceipt} = observedFixture;
  const prerequisiteChildProcessCalls = childProcessCalls;
  const first = admissionPlane.stage({proposal: proposed, evidence: suppliedEvidence, evidenceObservation, replayIsolationReceipt, activeRegistry: recipeRegistry.REGISTRY});
  const second = admissionPlane.stage({proposal: proposed, evidence: suppliedEvidence, evidenceObservation, replayIsolationReceipt, activeRegistry: recipeRegistry.REGISTRY});
  admissionPlane.validateReceipt(first); admissionPlane.validateReceipt(second);
  assert.strictEqual(first.result, 'RECIPE_ADMISSION_STAGED_WITH_REPLAY_ISOLATION_GATE_AWAITING_EXTERNAL_REVIEW_NO_REGISTRY_AUTHORITY');
  assert.strictEqual(first.admissionReceiptSha256, second.admissionReceiptSha256);
  assert.strictEqual(first.evidenceObservationSha256, evidenceObservation.observationSha256);
  assert.strictEqual(first.evidenceDeclarationSha256, observedFixture.declaration.declarationSha256);
  assert.strictEqual(first.evidenceWorkspaceRootIdentitySha256, evidenceObservation.workspaceRootIdentitySha256);
  assert.strictEqual(first.replayIsolationReceiptSha256, replayIsolationReceipt.replayIsolationReceiptSha256);
  assert.strictEqual(first.environmentObservationSha256, observedFixture.environmentObservation.environmentObservationSha256);
  assert.strictEqual(first.replayIsolationPolicySha256, replayIsolation.POLICY_SHA256);
  assert.strictEqual(first.replayIsolationResult, replayIsolationReceipt.result);
  assert.deepStrictEqual(first.replayIsolationGaps, replayIsolationReceipt.unresolvedGaps);
  assert.strictEqual(first.activeRegistrySha256, recipeRegistry.REGISTRY.registrySha256);
  assert.strictEqual(first.candidateEntry.recipeId, proposed.recipeId);
  assert.strictEqual(first.candidateEntry.entrySha256, first.registryPreview.proposedEntrySha256);
  assert.strictEqual(first.registryPreview.proposedEntryCount, recipeRegistry.REGISTRY.entries.length + 1);
  assert.notStrictEqual(first.registryPreview.proposedRegistrySha256, recipeRegistry.REGISTRY.registrySha256);
  assert.deepStrictEqual(first.activationGaps, ['ISOLATED_ADVERSARIAL_REPLAY_REQUIRED', 'HUMAN_REVIEW_REQUIRED', 'EXPLICIT_REGISTRY_SOURCE_CHANGE_REQUIRED', 'FULL_REGRESSION_REQUIRED', 'FRESH_FOUNDRY_MANIFEST_REQUIRED', 'FRESH_HOST_AUTHORIZATION_REQUIRED']);
  assert.strictEqual(first.truth.evidenceFilesObservedByReadOnlyHand, true);
  assert.strictEqual(first.truth.currentEvidenceByteDigestsObserved, true);
  assert.strictEqual(first.truth.evidenceFilesParsedWithoutImport, true);
  assert.strictEqual(first.truth.replayIsolationReceiptBound, true);
  assert.strictEqual(first.truth.replayIsolationCertified, replayIsolationReceipt.truth.isolationCertified);
  assert.strictEqual(first.truth.fixedIsolationPolicyProbePassed, replayIsolationReceipt.truth.fixedPolicyProbePassed);
  assert.strictEqual(first.truth.callerTestClaimsReproduced, false);
  assert.strictEqual(first.truth.semanticSafetyIndependentlyVerified, false);
  assert.strictEqual(first.truth.humanReviewCompleted, false);
  assert.strictEqual(first.truth.proposedSourceBytesReadByAdmissionPlane, false); assert.strictEqual(first.truth.proposedSourceBytesReadByObserver, true); assert.strictEqual(first.truth.proposedModuleLoaded, false);
  assert.strictEqual(first.truth.authorInvoked, false); assert.strictEqual(first.truth.verifierInvoked, false);
  assert.strictEqual(first.truth.candidateGenerated, false); assert.strictEqual(first.truth.candidateExecuted, false); assert.strictEqual(first.truth.childProcessSpawned, false);
  assert.strictEqual(first.truth.activeRegistryMutated, false); assert.strictEqual(first.truth.stagedEntryIsActive, false);
  assert.strictEqual(first.truth.recipeSelectionIssued, false); assert.strictEqual(first.truth.activationAuthorizationIssued, false); assert.strictEqual(first.truth.promotionOccurred, false); assert.strictEqual(first.truth.canonChanged, false);
  assert.strictEqual(admissionPlane.AUTHORITY.registryMutation, false); assert.strictEqual(admissionPlane.AUTHORITY.candidateExecution, false); assert.strictEqual(admissionPlane.AUTHORITY.promotion, false);
  assert.strictEqual(Object.hasOwn(admissionPlane, 'promote'), false);
  assert.strictEqual(recipeRegistry.get(proposed.recipeId), null);
  assert.throws(() => recipeRegistry.createSelection(proposed.recipeId, {}), /RECIPE_UNSUPPORTED/);
  assert.strictEqual(childProcessCalls, prerequisiteChildProcessCalls); assert.strictEqual(placementRegistry.canon(recipeRegistry.REGISTRY), activeSnapshot);

  hold(proposed, suppliedEvidence, evidenceObservation, replayIsolationReceipt, null, /BOUNDED_RECIPE_REGISTRY_INVALID/);
  const proposalDigest = clone(proposed); proposalDigest.builderId = 'forged-builder';
  hold(proposalDigest, suppliedEvidence, evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /PROPOSAL_DIGEST_MISMATCH/);
  const unsafeId = clone(proposed); unsafeId.recipeId = '../unsafe'; redigest(unsafeId, 'proposalSha256');
  hold(unsafeId, evidence(unsafeId, observedFixture.bytes), evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /PROPOSAL_IDENTIFIER_INVALID/);
  const generalAuthor = clone(proposed); generalAuthor.generalPythonAuthoring = true; redigest(generalAuthor, 'proposalSha256');
  hold(generalAuthor, evidence(generalAuthor, observedFixture.bytes), evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /PROPOSAL_AUTHORITY_INVALID/);
  const dynamicLoad = clone(proposed); dynamicLoad.dynamicModuleLoading = true; redigest(dynamicLoad, 'proposalSha256');
  hold(dynamicLoad, evidence(dynamicLoad, observedFixture.bytes), evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /PROPOSAL_AUTHORITY_INVALID/);
  const activeDuplicate = clone(proposed); activeDuplicate.recipeId = recipeRegistry.REGISTRY.entries[0].recipeId; redigest(activeDuplicate, 'proposalSha256');
  hold(activeDuplicate, evidence(activeDuplicate, observedFixture.bytes), evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /RECIPE_ALREADY_ACTIVE/);
  const idCollision = clone(proposed); idCollision.builderId = recipeRegistry.REGISTRY.entries[0].builderId; redigest(idCollision, 'proposalSha256');
  hold(idCollision, evidence(idCollision, observedFixture.bytes), evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /IMPLEMENTATION_ID_COLLISION/);
  const digestCollision = clone(proposed); digestCollision.verifierRunnerSha256 = recipeRegistry.REGISTRY.entries[0].verifierRunnerSha256; redigest(digestCollision, 'proposalSha256');
  hold(digestCollision, evidence(digestCollision, observedFixture.bytes), evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /IMPLEMENTATION_DIGEST_COLLISION/);
  const wrongProposalEvidence = clone(suppliedEvidence); wrongProposalEvidence.proposalSha256 = '0'.repeat(64); redigest(wrongProposalEvidence, 'evidenceSha256');
  hold(proposed, wrongProposalEvidence, evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /EVIDENCE_HEADER_OR_PROPOSAL_BINDING_INVALID/);
  const missingEvidence = clone(suppliedEvidence); missingEvidence.evidenceItems.pop(); redigest(missingEvidence, 'evidenceSha256');
  hold(proposed, missingEvidence, evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /EVIDENCE_ITEM_COUNT_INVALID/);
  const duplicateEvidence = clone(suppliedEvidence); duplicateEvidence.evidenceItems[1].sha256 = duplicateEvidence.evidenceItems[0].sha256; redigest(duplicateEvidence, 'evidenceSha256');
  hold(proposed, duplicateEvidence, evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /EVIDENCE_ITEM_INVALID_OR_DUPLICATE/);
  const unsafeClaims = clone(suppliedEvidence); unsafeClaims.testClaims.workspaceMutationObserved = true; redigest(unsafeClaims, 'evidenceSha256');
  hold(proposed, unsafeClaims, evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /TEST_CLAIMS_UNSAFE_OR_INCOMPLETE/);
  const forgedReview = clone(suppliedEvidence); forgedReview.truth.humanReviewCompleted = true; redigest(forgedReview, 'evidenceSha256');
  hold(proposed, forgedReview, evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /EVIDENCE_TRUTH_INVALID/);
  const extraProposalKey = clone(proposed); extraProposalKey.modulePath = './untrusted.js'; redigest(extraProposalKey, 'proposalSha256');
  hold(extraProposalKey, evidence(extraProposalKey, observedFixture.bytes), evidenceObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /PROPOSAL_KEYS_INVALID/);
  const forgedRegistry = clone(recipeRegistry.REGISTRY); forgedRegistry.entries.push(first.candidateEntry); redigest(forgedRegistry, 'registrySha256');
  hold(proposed, suppliedEvidence, evidenceObservation, replayIsolationReceipt, forgedRegistry, /BOUNDED_RECIPE_REGISTRY_BINDING_INVALID/);

  hold(proposed, suppliedEvidence, null, replayIsolationReceipt, recipeRegistry.REGISTRY, /RECIPE_EVIDENCE_OBSERVATION_INVALID/);
  const tamperedObservation = clone(evidenceObservation); tamperedObservation.files[0].sha256 = '0'.repeat(64);
  hold(proposed, suppliedEvidence, tamperedObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /RECIPE_EVIDENCE_OBSERVATION_DIGEST_MISMATCH/);
  const staleObservation = clone(evidenceObservation); staleObservation.observedAt = '2020-01-01T00:00:00.000Z'; staleObservation.expiresAt = '2020-01-01T00:05:00.000Z'; redigest(staleObservation, 'observationSha256');
  hold(proposed, suppliedEvidence, staleObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /RECIPE_EVIDENCE_OBSERVATION_STALE/);
  const futureObservation = clone(evidenceObservation); futureObservation.observedAt = '2999-01-01T00:00:00.000Z'; futureObservation.expiresAt = '2999-01-01T00:05:00.000Z'; redigest(futureObservation, 'observationSha256');
  hold(proposed, suppliedEvidence, futureObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /RECIPE_EVIDENCE_OBSERVATION_FUTURE_OR_UNTIMED/);
  const mismatchedObservation = clone(evidenceObservation); mismatchedObservation.evidenceSha256 = 'f'.repeat(64); redigest(mismatchedObservation, 'observationSha256');
  hold(proposed, suppliedEvidence, mismatchedObservation, replayIsolationReceipt, recipeRegistry.REGISTRY, /EVIDENCE_OBSERVATION_BINDING_INVALID/);

  hold(proposed, suppliedEvidence, evidenceObservation, null, recipeRegistry.REGISTRY, /RECIPE_REPLAY_ISOLATION_RECEIPT_INVALID/);
  const tamperedReplayReceipt = clone(replayIsolationReceipt); tamperedReplayReceipt.policySha256 = '0'.repeat(64);
  hold(proposed, suppliedEvidence, evidenceObservation, tamperedReplayReceipt, recipeRegistry.REGISTRY, /RECIPE_REPLAY_ISOLATION_RECEIPT_DIGEST_MISMATCH/);
  const mismatchedReplayReceipt = clone(replayIsolationReceipt); mismatchedReplayReceipt.proposalSha256 = '0'.repeat(64); redigest(mismatchedReplayReceipt, 'replayIsolationReceiptSha256');
  hold(proposed, suppliedEvidence, evidenceObservation, mismatchedReplayReceipt, recipeRegistry.REGISTRY, /REPLAY_ISOLATION_BINDING_INVALID/);
  const staleReplayReceipt = clone(replayIsolationReceipt); staleReplayReceipt.validFrom = '2020-01-01T00:00:00.000Z'; staleReplayReceipt.expiresAt = '2020-01-01T00:05:00.000Z'; redigest(staleReplayReceipt, 'replayIsolationReceiptSha256');
  hold(proposed, suppliedEvidence, evidenceObservation, staleReplayReceipt, recipeRegistry.REGISTRY, /RECIPE_REPLAY_ISOLATION_RECEIPT_STALE/);

  console.log(JSON.stringify({
    ok: true,
    deterministicStageReceipts: 2,
    activeRegistryRecipeCount: recipeRegistry.REGISTRY.entries.length,
    stagedCandidateEntryCount: 1,
    hypotheticalNextRegistryEntryCount: first.registryPreview.proposedEntryCount,
    activationGapCount: first.activationGaps.length,
    evidenceFilesObservedByReadOnlyHand: evidenceObservation.files.length,
    currentEvidenceByteDigestMatches: evidenceObservation.files.length,
    evidenceFilesParsedWithoutImport: evidenceObservation.files.length,
    replayIsolationResult: replayIsolationReceipt.result,
    replayIsolationCertified: replayIsolationReceipt.truth.isolationCertified,
    replayIsolationReceiptBound: true,
    callerTestClaimsReproduced: false,
    semanticSafetyIndependentlyVerified: false,
    proposedSourceBytesReadByAdmissionPlane: 0,
    proposedSourceFilesReadByObserver: 2,
    proposedModulesLoaded: 0,
    authorsInvoked: 0,
    verifiersInvoked: 0,
    candidatesGenerated: 0,
    candidatesExecuted: 0,
    childProcessesSpawnedByAdmissionPlane: childProcessCalls - prerequisiteChildProcessCalls,
    activeRegistryMutations: 0,
    selectionsIssued: 0,
    activationAuthorizationsIssued: 0,
    promotions: 0,
    adversarialHolds
  }, null, 2));
} finally {
  childProcess.spawnSync = originalSpawnSync;
  for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
}
