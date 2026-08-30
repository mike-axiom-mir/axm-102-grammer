'use strict';

const placementRegistry = require('./placement-registry.js');
const activeRecipeRegistry = require('./bounded-python-recipe-registry.js');
const evidenceObserver = require('./bounded-python-recipe-evidence-observer-hand.js');
const replayIsolation = require('./bounded-python-recipe-replay-isolation-hand.js');

const HEX64 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCHEMA_ID = /^axm\.code\.[a-z0-9.-]+\.v[0-9]+$/;
const RESULT_ID = /^[A-Z][A-Z0-9_]{2,127}$/;
const EVIDENCE_KINDS = Object.freeze(['adversarial-test-receipt', 'author-contract', 'author-source', 'parameter-contract', 'verifier-contract', 'verifier-source']);
const TEST_CLAIM_KEYS = Object.freeze(['arbitraryCandidateExecutionObserved', 'authorCandidateGenerationPassed', 'authorNoWorkspaceAuthorityObserved', 'candidateSubstitutionHeld', 'crossRecipeReceiptHeld', 'verifierExactCandidatePassed', 'workspaceMutationObserved']);
const AUTHORITY = Object.freeze({proposalInspection: true, digestComputation: true, replayIsolationReceiptInspection: true, proposedSourceBytesRead: false, dynamicModuleLoading: false, candidateGeneration: false, candidateExecution: false, childProcessExecution: false, workspaceRead: false, workspaceMutation: false, registryMutation: false, recipeSelection: false, activationAuthorization: false, promotion: false, canon: false, network: false, install: false, deployment: false});

function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || placementRegistry.canon(Object.keys(value).sort()) !== placementRegistry.canon([...keys].sort())) throw Error(code + '_KEYS_INVALID');
  return value;
}

function digestReceipt(value, field, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !HEX64.test(value[field] || '')) throw Error(code + '_INVALID');
  const body = {...value}; delete body[field];
  if (placementRegistry.hash(body) !== value[field]) throw Error(code + '_DIGEST_MISMATCH');
  return value;
}

function validateProposal(value, activeRegistry) {
  digestReceipt(value, 'proposalSha256', 'RECIPE_ADMISSION_PROPOSAL');
  exactKeys(value, ['schema', 'version', 'status', 'proposalId', 'languageId', 'scope', 'recipeId', 'recipeSha256', 'builderId', 'builderSha256', 'authorReceiptSchema', 'authorReadyResult', 'verifierId', 'verifierRunnerSha256', 'provenanceClass', 'generalPythonAuthoring', 'arbitraryCandidateExecution', 'dynamicModuleLoading', 'proposalSha256'], 'RECIPE_ADMISSION_PROPOSAL');
  if (value.schema !== 'axm.code.bounded-python-recipe-admission-proposal.v1' || value.version !== '1.0.0' || value.status !== 'DRAFT' || value.languageId !== 'python' || value.scope !== 'pair') throw Error('RECIPE_ADMISSION_PROPOSAL_HEADER_INVALID');
  if (!SAFE_ID.test(value.proposalId || '') || !SAFE_ID.test(value.recipeId || '') || !SAFE_ID.test(value.builderId || '') || !SAFE_ID.test(value.verifierId || '') || !SCHEMA_ID.test(value.authorReceiptSchema || '') || !RESULT_ID.test(value.authorReadyResult || '') || !HEX64.test(value.recipeSha256 || '') || !HEX64.test(value.builderSha256 || '') || !HEX64.test(value.verifierRunnerSha256 || '')) throw Error('RECIPE_ADMISSION_PROPOSAL_IDENTIFIER_INVALID');
  if (value.provenanceClass !== 'PROPOSED_UNREVIEWED_CALLER_EVIDENCE' || value.generalPythonAuthoring !== false || value.arbitraryCandidateExecution !== false || value.dynamicModuleLoading !== false) throw Error('RECIPE_ADMISSION_PROPOSAL_AUTHORITY_INVALID');
  if (activeRegistry.entries.some(entry => entry.recipeId === value.recipeId)) throw Error('RECIPE_ADMISSION_RECIPE_ALREADY_ACTIVE');
  if (activeRegistry.entries.some(entry => entry.builderId === value.builderId || entry.verifierId === value.verifierId)) throw Error('RECIPE_ADMISSION_IMPLEMENTATION_ID_COLLISION');
  if (activeRegistry.entries.some(entry => entry.recipeSha256 === value.recipeSha256 || entry.builderSha256 === value.builderSha256 || entry.verifierRunnerSha256 === value.verifierRunnerSha256)) throw Error('RECIPE_ADMISSION_IMPLEMENTATION_DIGEST_COLLISION');
  return value;
}

function validateEvidence(value, proposal) {
  digestReceipt(value, 'evidenceSha256', 'RECIPE_ADMISSION_EVIDENCE');
  exactKeys(value, ['schema', 'version', 'status', 'proposalSha256', 'evidenceItems', 'testClaims', 'truth', 'evidenceSha256'], 'RECIPE_ADMISSION_EVIDENCE');
  if (value.schema !== 'axm.code.bounded-python-recipe-admission-evidence.v1' || value.version !== '1.0.0' || value.status !== 'CALLER_SUPPLIED' || value.proposalSha256 !== proposal.proposalSha256) throw Error('RECIPE_ADMISSION_EVIDENCE_HEADER_OR_PROPOSAL_BINDING_INVALID');
  if (!Array.isArray(value.evidenceItems) || value.evidenceItems.length !== EVIDENCE_KINDS.length) throw Error('RECIPE_ADMISSION_EVIDENCE_ITEM_COUNT_INVALID');
  const seen = new Set(); const digests = new Set();
  for (const item of value.evidenceItems) {
    exactKeys(item, ['kind', 'sha256', 'status'], 'RECIPE_ADMISSION_EVIDENCE_ITEM');
    if (!EVIDENCE_KINDS.includes(item.kind) || seen.has(item.kind) || !HEX64.test(item.sha256 || '') || digests.has(item.sha256)) throw Error('RECIPE_ADMISSION_EVIDENCE_ITEM_INVALID_OR_DUPLICATE');
    const expectedStatus = item.kind === 'adversarial-test-receipt' ? 'TEST_RECEIPT_DIGEST_ONLY' : 'CURRENT_BYTES_DIGEST_ONLY';
    if (item.status !== expectedStatus) throw Error('RECIPE_ADMISSION_EVIDENCE_ITEM_STATUS_INVALID');
    seen.add(item.kind); digests.add(item.sha256);
  }
  if (placementRegistry.canon([...seen].sort()) !== placementRegistry.canon([...EVIDENCE_KINDS])) throw Error('RECIPE_ADMISSION_EVIDENCE_KINDS_INCOMPLETE');
  exactKeys(value.testClaims, TEST_CLAIM_KEYS, 'RECIPE_ADMISSION_TEST_CLAIMS');
  if (value.testClaims.authorCandidateGenerationPassed !== true || value.testClaims.authorNoWorkspaceAuthorityObserved !== true || value.testClaims.verifierExactCandidatePassed !== true || value.testClaims.candidateSubstitutionHeld !== true || value.testClaims.crossRecipeReceiptHeld !== true || value.testClaims.workspaceMutationObserved !== false || value.testClaims.arbitraryCandidateExecutionObserved !== false) throw Error('RECIPE_ADMISSION_TEST_CLAIMS_UNSAFE_OR_INCOMPLETE');
  exactKeys(value.truth, ['digestsAreConsentOrIdentityProof', 'humanReviewCompleted', 'proposedSourceBytesInspectedByAdmissionPlane'], 'RECIPE_ADMISSION_EVIDENCE_TRUTH');
  if (value.truth.digestsAreConsentOrIdentityProof !== false || value.truth.humanReviewCompleted !== false || value.truth.proposedSourceBytesInspectedByAdmissionPlane !== false) throw Error('RECIPE_ADMISSION_EVIDENCE_TRUTH_INVALID');
  return value;
}

function validateEvidenceObservation(value, proposal, evidence) {
  evidenceObserver.validateObservation(value);
  if (value.proposalSha256 !== proposal.proposalSha256 || value.evidenceSha256 !== evidence.evidenceSha256) throw Error('RECIPE_ADMISSION_EVIDENCE_OBSERVATION_BINDING_INVALID');
  const observed = new Map(value.files.map(item => [item.kind, item]));
  for (const item of evidence.evidenceItems) {
    if (observed.get(item.kind)?.sha256 !== item.sha256) throw Error('RECIPE_ADMISSION_EVIDENCE_OBSERVATION_DIGEST_SET_MISMATCH');
  }
  if (observed.get('author-source')?.sha256 !== proposal.builderSha256 || observed.get('parameter-contract')?.sha256 !== proposal.recipeSha256 || observed.get('verifier-source')?.sha256 !== proposal.verifierRunnerSha256) throw Error('RECIPE_ADMISSION_EVIDENCE_OBSERVATION_PROPOSAL_DIGEST_MISMATCH');
  if (value.truth.currentByteDigestsMatchedEvidence !== true || value.truth.filesParsedWithoutImport !== true || value.truth.callerTestClaimsReproduced !== false || value.truth.semanticSafetyIndependentlyVerified !== false || value.truth.humanReviewCompleted !== false || value.truth.workspaceMutated !== false || value.truth.proposedModuleLoaded !== false || value.truth.candidateExecuted !== false || value.truth.registryMutated !== false || value.truth.promotionOccurred !== false) throw Error('RECIPE_ADMISSION_EVIDENCE_OBSERVATION_TRUTH_INVALID');
  return value;
}

function validateReplayIsolation(value, proposal, evidence, observation) {
  replayIsolation.validateReceipt(value);
  if (!replayIsolation.QUALIFIED_RESULTS.includes(value.result)) throw Error('RECIPE_ADMISSION_REPLAY_ISOLATION_RECEIPT_NOT_QUALIFIED');
  if (value.proposalSha256 !== proposal.proposalSha256 || value.evidenceSha256 !== evidence.evidenceSha256 || value.evidenceObservationSha256 !== observation.observationSha256 || value.evidenceWorkspaceRootIdentitySha256 !== observation.workspaceRootIdentitySha256) throw Error('RECIPE_ADMISSION_REPLAY_ISOLATION_BINDING_INVALID');
  if (value.policySha256 !== replayIsolation.POLICY_SHA256 || value.truth?.callerTestClaimsReproduced !== false || value.truth?.proposedModuleLoaded !== false || value.truth?.candidateExecuted !== false || value.truth?.workspaceMutation !== false || value.truth?.registryMutated !== false || value.truth?.activationAuthorizationIssued !== false || value.truth?.promotionOccurred !== false) throw Error('RECIPE_ADMISSION_REPLAY_ISOLATION_TRUTH_INVALID');
  return value;
}

function candidateEntry(proposal) {
  const body = {
    recipeId: proposal.recipeId, recipeSha256: proposal.recipeSha256,
    builderId: proposal.builderId, builderSha256: proposal.builderSha256,
    authorReceiptSchema: proposal.authorReceiptSchema, authorReadyResult: proposal.authorReadyResult,
    verifierId: proposal.verifierId, verifierRunnerSha256: proposal.verifierRunnerSha256,
    provenanceClass: proposal.provenanceClass, generalPythonAuthoring: false, arbitraryCandidateExecution: false
  };
  return freeze({...body, entrySha256: placementRegistry.hash(body)});
}

function previewRegistry(activeRegistry, entry) {
  const entries = [...activeRegistry.entries, entry].sort((left, right) => left.recipeId.localeCompare(right.recipeId));
  const body = {schema: activeRegistry.schema, version: activeRegistry.version, status: activeRegistry.status, registryId: activeRegistry.registryId, entries};
  return freeze({schema: 'axm.code.bounded-python-recipe-registry-preview.v1', activeRegistrySha256: activeRegistry.registrySha256, proposedEntryCount: entries.length, proposedEntrySha256: entry.entrySha256, proposedRegistrySha256: placementRegistry.hash(body), truth: {previewIsActiveRegistry: false, previewIsSelectionAuthority: false, previewIsActivationAuthority: false}});
}

function activationGaps() {
  return Object.freeze(['ISOLATED_ADVERSARIAL_REPLAY_REQUIRED', 'HUMAN_REVIEW_REQUIRED', 'EXPLICIT_REGISTRY_SOURCE_CHANGE_REQUIRED', 'FULL_REGRESSION_REQUIRED', 'FRESH_FOUNDRY_MANIFEST_REQUIRED', 'FRESH_HOST_AUTHORIZATION_REQUIRED']);
}

function receipt(body) { return freeze({...body, admissionReceiptSha256: placementRegistry.hash(body)}); }

function held(errorCode) {
  return receipt({schema: 'axm.code.bounded-python-recipe-admission-receipt.v1', version: '1.2.0', status: 'TEST', result: 'RECIPE_ADMISSION_HELD', errorCode, truth: {proposalStructurallyValidated: false, callerEvidenceBound: false, evidenceFilesObservedByReadOnlyHand: false, currentEvidenceByteDigestsObserved: false, evidenceFilesParsedWithoutImport: false, replayIsolationReceiptBound: false, replayIsolationCertified: false, fixedIsolationPolicyProbePassed: false, callerTestClaimsReproduced: false, semanticSafetyIndependentlyVerified: false, proposedSourceBytesReadByAdmissionPlane: false, proposedSourceBytesReadByObserver: false, proposedModuleLoaded: false, authorInvoked: false, verifierInvoked: false, candidateGenerated: false, candidateExecuted: false, childProcessSpawned: false, activeRegistryMutated: false, recipeSelectionIssued: false, activationAuthorizationIssued: false, promotionOccurred: false, canonChanged: false}, authority: AUTHORITY});
}

function stage({proposal = null, evidence = null, evidenceObservation = null, replayIsolationReceipt = null, activeRegistry = null} = {}) {
  try {
    activeRecipeRegistry.validateRegistry(activeRegistry);
    const validatedProposal = validateProposal(proposal, activeRegistry);
    const validatedEvidence = validateEvidence(evidence, validatedProposal);
    const validatedObservation = validateEvidenceObservation(evidenceObservation, validatedProposal, validatedEvidence);
    const validatedReplayIsolation = validateReplayIsolation(replayIsolationReceipt, validatedProposal, validatedEvidence, validatedObservation);
    const entry = candidateEntry(validatedProposal); const registryPreview = previewRegistry(activeRegistry, entry); const gaps = activationGaps();
    return receipt({
      schema: 'axm.code.bounded-python-recipe-admission-receipt.v1', version: '1.2.0', status: 'TEST', result: 'RECIPE_ADMISSION_STAGED_WITH_REPLAY_ISOLATION_GATE_AWAITING_EXTERNAL_REVIEW_NO_REGISTRY_AUTHORITY', errorCode: null,
      proposalId: validatedProposal.proposalId, proposalSha256: validatedProposal.proposalSha256, evidenceSha256: validatedEvidence.evidenceSha256,
      evidenceObservationSha256: validatedObservation.observationSha256, evidenceDeclarationSha256: validatedObservation.declarationSha256, evidenceWorkspaceRootIdentitySha256: validatedObservation.workspaceRootIdentitySha256,
      replayIsolationReceiptSha256: validatedReplayIsolation.replayIsolationReceiptSha256, environmentObservationSha256: validatedReplayIsolation.environmentObservationSha256, replayIsolationPolicySha256: validatedReplayIsolation.policySha256, replayIsolationResult: validatedReplayIsolation.result, replayIsolationGaps: validatedReplayIsolation.unresolvedGaps,
      activeRegistrySha256: activeRegistry.registrySha256, candidateEntry: entry, registryPreview, activationGaps: gaps,
      truth: {proposalStructurallyValidated: true, callerEvidenceBound: true, evidenceFilesObservedByReadOnlyHand: true, currentEvidenceByteDigestsObserved: true, evidenceFilesParsedWithoutImport: true, replayIsolationReceiptBound: true, replayIsolationCertified: validatedReplayIsolation.truth.isolationCertified, fixedIsolationPolicyProbePassed: validatedReplayIsolation.truth.fixedPolicyProbePassed, callerTestClaimsReproduced: false, semanticSafetyIndependentlyVerified: false, humanReviewCompleted: false, proposedSourceBytesReadByAdmissionPlane: false, proposedSourceBytesReadByObserver: true, proposedModuleLoaded: false, authorInvoked: false, verifierInvoked: false, candidateGenerated: false, candidateExecuted: false, childProcessSpawned: false, activeRegistryMutated: false, stagedEntryIsActive: false, recipeSelectionIssued: false, activationAuthorizationIssued: false, promotionOccurred: false, canonChanged: false, digestIsConsentOrIdentityProof: false},
      authority: AUTHORITY
    });
  } catch (error) {
    return held(String(error?.message || 'RECIPE_ADMISSION_FAILED'));
  }
}

function validateReceipt(value) {
  digestReceipt(value, 'admissionReceiptSha256', 'RECIPE_ADMISSION_RECEIPT');
  if (value.schema !== 'axm.code.bounded-python-recipe-admission-receipt.v1' || value.version !== '1.2.0' || value.status !== 'TEST' || !['RECIPE_ADMISSION_HELD', 'RECIPE_ADMISSION_STAGED_WITH_REPLAY_ISOLATION_GATE_AWAITING_EXTERNAL_REVIEW_NO_REGISTRY_AUTHORITY'].includes(value.result) || value.truth?.activeRegistryMutated !== false || value.truth?.candidateExecuted !== false || value.truth?.callerTestClaimsReproduced !== false || value.truth?.promotionOccurred !== false || value.authority?.registryMutation !== false || value.authority?.activationAuthorization !== false) throw Error('RECIPE_ADMISSION_RECEIPT_BINDING_OR_AUTHORITY_INVALID');
  return value;
}

module.exports = {AUTHORITY, EVIDENCE_KINDS, TEST_CLAIM_KEYS, stage, validateReceipt};
