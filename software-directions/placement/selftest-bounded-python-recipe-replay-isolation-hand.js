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
const evidenceObserver = require('./bounded-python-recipe-evidence-observer-hand.js');
const environmentHand = require('./toolchain-environment-hand.js');
const replayIsolation = require('./bounded-python-recipe-replay-isolation-hand.js');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function redigest(value, field) { delete value[field]; value[field] = placementRegistry.hash(value); return value; }
function byteDigest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

const roots = [];
const KINDS = evidenceObserver.EVIDENCE_KINDS;
const PATHS = Object.freeze({
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

function bytes() {
  return {
    'adversarial-test-receipt': Buffer.from('{"schema":"axm.code.proposed-recipe-adversarial-test-receipt.v1","status":"CALLER_REPORTED","passed":true}\n'),
    'author-contract': Buffer.from('{"schema":"axm.code.proposed-enum-map-author-contract.v1","status":"DRAFT"}\n'),
    'author-source': Buffer.from("module.exports = {author() { throw Error('replay-gate-must-not-import-author'); }};\n"),
    'parameter-contract': Buffer.from('{"schema":"axm.code.proposed-enum-map-parameter-contract.v1","status":"DRAFT"}\n'),
    'verifier-contract': Buffer.from('{"schema":"axm.code.proposed-enum-map-verifier-contract.v1","status":"DRAFT"}\n'),
    'verifier-source': Buffer.from("module.exports = {verify() { throw Error('replay-gate-must-not-import-verifier'); }};\n")
  };
}

function proposal(fileBytes) {
  const body = {
    schema: 'axm.code.bounded-python-recipe-admission-proposal.v1', version: '1.0.0', status: 'DRAFT', proposalId: 'enum-map-proposal-v1', languageId: 'python', scope: 'pair',
    recipeId: 'bounded-python-enum-map', recipeSha256: byteDigest(fileBytes['parameter-contract']), builderId: 'bounded-python-enum-map-v1', builderSha256: byteDigest(fileBytes['author-source']),
    authorReceiptSchema: 'axm.code.bounded-python-enum-map-author-receipt.v1', authorReadyResult: 'PYTHON_ENUM_MAP_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY',
    verifierId: 'bounded-python-enum-map-unit-test', verifierRunnerSha256: byteDigest(fileBytes['verifier-source']), provenanceClass: 'PROPOSED_UNREVIEWED_CALLER_EVIDENCE',
    generalPythonAuthoring: false, arbitraryCandidateExecution: false, dynamicModuleLoading: false
  };
  return {...body, proposalSha256: placementRegistry.hash(body)};
}

function evidence(proposed, fileBytes) {
  const body = {
    schema: 'axm.code.bounded-python-recipe-admission-evidence.v1', version: '1.0.0', status: 'CALLER_SUPPLIED', proposalSha256: proposed.proposalSha256,
    evidenceItems: KINDS.map(kind => ({kind, sha256: byteDigest(fileBytes[kind]), status: kind === 'adversarial-test-receipt' ? 'TEST_RECEIPT_DIGEST_ONLY' : 'CURRENT_BYTES_DIGEST_ONLY'})),
    testClaims: {authorCandidateGenerationPassed: true, authorNoWorkspaceAuthorityObserved: true, verifierExactCandidatePassed: true, candidateSubstitutionHeld: true, crossRecipeReceiptHeld: true, workspaceMutationObserved: false, arbitraryCandidateExecutionObserved: false},
    truth: {humanReviewCompleted: false, proposedSourceBytesInspectedByAdmissionPlane: false, digestsAreConsentOrIdentityProof: false}
  };
  return {...body, evidenceSha256: placementRegistry.hash(body)};
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-replay-isolation-'));
  roots.push(root);
  const fileBytes = bytes();
  for (const kind of KINDS) put(root, PATHS[kind], fileBytes[kind]);
  const proposed = proposal(fileBytes);
  const suppliedEvidence = evidence(proposed, fileBytes);
  const declarationBody = {schema: 'axm.code.bounded-python-recipe-evidence-declaration.v1', version: '1.0.0', status: 'TEST', proposalSha256: proposed.proposalSha256, evidenceSha256: suppliedEvidence.evidenceSha256, files: KINDS.map(kind => ({kind, path: PATHS[kind]}))};
  const declaration = {...declarationBody, declarationSha256: placementRegistry.hash(declarationBody)};
  const observation = evidenceObserver.inspect({workspaceRoot: root, proposal: proposed, evidence: suppliedEvidence, declaration});
  evidenceObserver.validateObservation(observation);
  return {root, fileBytes, proposed, suppliedEvidence, declaration, observation};
}

let adversarialHolds = 0;
function hold(proposed, suppliedEvidence, observation, environmentObservation, code) {
  const beforeCalls = childProcessCalls;
  const result = replayIsolation.assess({proposal: proposed, evidence: suppliedEvidence, evidenceObservation: observation, environmentObservation});
  replayIsolation.validateReceipt(result);
  assert.strictEqual(result.result, 'RECIPE_REPLAY_ISOLATION_HELD_INPUT_INVALID');
  assert.match(result.errorCode, code);
  assert.strictEqual(result.truth.proposedSourceBytesRead, false);
  assert.strictEqual(result.truth.proposedModuleLoaded, false);
  assert.strictEqual(result.truth.callerTestClaimsReproduced, false);
  assert.strictEqual(result.truth.candidateExecuted, false);
  assert.strictEqual(result.truth.workspaceMutation, false);
  assert.strictEqual(childProcessCalls, beforeCalls);
  adversarialHolds += 1;
}

try {
  const observed = fixture();
  const environmentObservation = environmentHand.inspect();
  environmentHand.validate(environmentObservation);
  const environmentProbeProcesses = childProcessCalls;
  const first = replayIsolation.assess({proposal: observed.proposed, evidence: observed.suppliedEvidence, evidenceObservation: observed.observation, environmentObservation});
  replayIsolation.validateReceipt(first);
  assert.strictEqual(replayIsolation.isQualifiedReceipt(first), true);
  assert(replayIsolation.QUALIFIED_RESULTS.includes(first.result));
  assert.strictEqual(first.proposalSha256, observed.proposed.proposalSha256);
  assert.strictEqual(first.evidenceSha256, observed.suppliedEvidence.evidenceSha256);
  assert.strictEqual(first.evidenceObservationSha256, observed.observation.observationSha256);
  assert.strictEqual(first.environmentObservationSha256, environmentObservation.environmentObservationSha256);
  assert.strictEqual(first.evidenceWorkspaceRootIdentitySha256, observed.observation.workspaceRootIdentitySha256);
  assert.strictEqual(first.policySha256, replayIsolation.POLICY_SHA256);
  assert.strictEqual(first.truth.proposedSourceBytesRead, false);
  assert.strictEqual(first.truth.proposedBytesMountedInSandbox, false);
  assert.strictEqual(first.truth.proposedModuleLoaded, false);
  assert.strictEqual(first.truth.callerTestsMountedInSandbox, false);
  assert.strictEqual(first.truth.callerTestClaimsReproduced, false);
  assert.strictEqual(first.truth.semanticSafetyIndependentlyVerified, false);
  assert.strictEqual(first.truth.digestIsSignerConsentOrIdentityProof, false);
  assert.strictEqual(first.truth.receiptIsReplayAuthorization, false);
  assert.strictEqual(first.truth.candidateExecuted, false);
  assert.strictEqual(first.truth.workspaceRead, false);
  assert.strictEqual(first.truth.workspaceMutation, false);
  assert.strictEqual(first.truth.registryMutated, false);
  assert.strictEqual(first.truth.activationAuthorizationIssued, false);
  assert.strictEqual(first.truth.promotionOccurred, false);
  assert.strictEqual(replayIsolation.AUTHORITY.callerTestExecution, false);
  assert.strictEqual(replayIsolation.AUTHORITY.candidateExecution, false);
  assert.strictEqual(Object.hasOwn(replayIsolation, 'replay'), false);

  const policyProbeProcesses = childProcessCalls - environmentProbeProcesses;
  if (environmentObservation.candidateExecutionIsolation.usable) {
    assert.strictEqual(policyProbeProcesses, 1);
    assert(['RECIPE_REPLAY_ISOLATION_HELD_POLICY_PROBE_FAILED', 'RECIPE_REPLAY_ISOLATION_CERTIFIED_NO_PROPOSAL_EXECUTION'].includes(first.result));
  } else {
    assert.strictEqual(policyProbeProcesses, 0);
    assert.strictEqual(first.result, 'RECIPE_REPLAY_ISOLATION_HELD_HOST_PROVIDER_UNAVAILABLE');
    assert.strictEqual(first.errorCode, environmentObservation.candidateExecutionIsolation.errorCode);
    assert.strictEqual(first.truth.fixedPolicyProbeExecuted, false);
    assert.strictEqual(first.truth.isolationCertified, false);
    assert.deepStrictEqual(first.unresolvedGaps, ['USABLE_BUBBLEWRAP_REQUIRED', 'CERTIFIED_REPLAY_POLICY_REQUIRED', 'EXPLICIT_REPLAY_AUTHORIZATION_REQUIRED', 'CALLER_TEST_REPLAY_REQUIRED']);
  }

  const syntheticPass = replayIsolation.evaluateProbe({status: 0, signal: null, stdout: JSON.stringify({schema: 'axm.code.replay-isolation-policy-probe.v1', passwdHidden: true, workspaceHidden: true, usrReadOnly: true, tmpEphemeralWritable: true, pidNamespaceBounded: true, uidIsNobody: true, gidIsNobody: true, hostnameBound: true, networkBlocked: true, networkErrorCode: 'ENETUNREACH'}) + '\n', stderr: ''});
  assert.strictEqual(syntheticPass.passed, true);
  assert.strictEqual(syntheticPass.probe.assertionCount, 10);
  assert.strictEqual(syntheticPass.probe.passedAssertionCount, 10);
  const syntheticFail = replayIsolation.evaluateProbe({status: 0, signal: null, stdout: JSON.stringify({schema: 'axm.code.replay-isolation-policy-probe.v1', passwdHidden: true, workspaceHidden: true, usrReadOnly: true, tmpEphemeralWritable: true, pidNamespaceBounded: true, uidIsNobody: true, gidIsNobody: true, hostnameBound: true, networkBlocked: false, networkErrorCode: 'CONNECTED'}) + '\n', stderr: ''});
  assert.strictEqual(syntheticFail.passed, false);
  assert.strictEqual(syntheticFail.errorCode, 'REPLAY_ISOLATION_POLICY_PROBE_OUTPUT_INVALID');

  hold(null, observed.suppliedEvidence, observed.observation, environmentObservation, /RECIPE_REPLAY_PROPOSAL_INVALID/);
  const proposalDigest = clone(observed.proposed); proposalDigest.builderId = 'forged-builder';
  hold(proposalDigest, observed.suppliedEvidence, observed.observation, environmentObservation, /RECIPE_REPLAY_PROPOSAL_DIGEST_MISMATCH/);
  hold(observed.proposed, null, observed.observation, environmentObservation, /RECIPE_REPLAY_EVIDENCE_INVALID/);
  const evidenceDigest = clone(observed.suppliedEvidence); evidenceDigest.testClaims.workspaceMutationObserved = true;
  hold(observed.proposed, evidenceDigest, observed.observation, environmentObservation, /RECIPE_REPLAY_EVIDENCE_DIGEST_MISMATCH/);
  hold(observed.proposed, observed.suppliedEvidence, null, environmentObservation, /RECIPE_EVIDENCE_OBSERVATION_INVALID/);
  const observationDigest = clone(observed.observation); observationDigest.files[0].sha256 = '0'.repeat(64);
  hold(observed.proposed, observed.suppliedEvidence, observationDigest, environmentObservation, /RECIPE_EVIDENCE_OBSERVATION_DIGEST_MISMATCH/);
  const staleObservation = clone(observed.observation); staleObservation.observedAt = '2020-01-01T00:00:00.000Z'; staleObservation.expiresAt = '2020-01-01T00:05:00.000Z'; redigest(staleObservation, 'observationSha256');
  hold(observed.proposed, observed.suppliedEvidence, staleObservation, environmentObservation, /RECIPE_EVIDENCE_OBSERVATION_STALE/);
  hold(observed.proposed, observed.suppliedEvidence, observed.observation, null, /TOOLCHAIN_ENVIRONMENT_OBSERVATION_INVALID/);
  const environmentDigest = clone(environmentObservation); environmentDigest.platform.os = 'forged';
  hold(observed.proposed, observed.suppliedEvidence, observed.observation, environmentDigest, /TOOLCHAIN_ENVIRONMENT_OBSERVATION_DIGEST_MISMATCH/);
  const staleEnvironment = clone(environmentObservation); staleEnvironment.issuedAt = '2020-01-01T00:00:00.000Z'; staleEnvironment.expiresAt = '2020-01-01T00:05:00.000Z'; redigest(staleEnvironment, 'environmentObservationSha256');
  hold(observed.proposed, observed.suppliedEvidence, observed.observation, staleEnvironment, /TOOLCHAIN_ENVIRONMENT_OBSERVATION_STALE/);
  const otherProposal = clone(observed.proposed); otherProposal.proposalId = 'other-proposal-v1'; redigest(otherProposal, 'proposalSha256');
  const otherEvidence = clone(observed.suppliedEvidence); otherEvidence.proposalSha256 = otherProposal.proposalSha256; redigest(otherEvidence, 'evidenceSha256');
  hold(otherProposal, otherEvidence, observed.observation, environmentObservation, /RECIPE_REPLAY_EVIDENCE_OBSERVATION_BINDING_INVALID/);
  const driftedEvidence = clone(observed.suppliedEvidence); driftedEvidence.evidenceItems[0].sha256 = 'f'.repeat(64); redigest(driftedEvidence, 'evidenceSha256');
  hold(observed.proposed, driftedEvidence, observed.observation, environmentObservation, /RECIPE_REPLAY_EVIDENCE_OBSERVATION_BINDING_INVALID|RECIPE_REPLAY_EVIDENCE_DIGEST_SET_MISMATCH/);

  const forgedTruth = clone(first); forgedTruth.truth.callerTestClaimsReproduced = true; redigest(forgedTruth, 'replayIsolationReceiptSha256');
  assert.throws(() => replayIsolation.validateReceipt(forgedTruth), /RECEIPT_TRUTH_INVALID/); adversarialHolds += 1;
  const forgedAuthority = clone(first); forgedAuthority.authority.candidateExecution = true; redigest(forgedAuthority, 'replayIsolationReceiptSha256');
  assert.throws(() => replayIsolation.validateReceipt(forgedAuthority), /HEADER_OR_AUTHORITY_INVALID/); adversarialHolds += 1;
  const forgedPolicy = clone(first); forgedPolicy.policySha256 = '0'.repeat(64); redigest(forgedPolicy, 'replayIsolationReceiptSha256');
  assert.throws(() => replayIsolation.validateReceipt(forgedPolicy), /HEADER_OR_AUTHORITY_INVALID/); adversarialHolds += 1;
  const staleReceipt = clone(first); staleReceipt.validFrom = '2020-01-01T00:00:00.000Z'; staleReceipt.expiresAt = '2020-01-01T00:05:00.000Z'; redigest(staleReceipt, 'replayIsolationReceiptSha256');
  assert.throws(() => replayIsolation.validateReceipt(staleReceipt), /RECEIPT_STALE/); adversarialHolds += 1;

  const source = fs.readFileSync(path.join(__dirname, 'bounded-python-recipe-replay-isolation-hand.js'), 'utf8');
  assert.strictEqual(source.includes("require('vm')"), false);
  assert.strictEqual(source.includes('module.createRequire'), false);
  assert.strictEqual(source.includes('proposal.source'), false);

  console.log(JSON.stringify({
    ok: true,
    hostIsolationProvider: environmentObservation.candidateExecutionIsolation.providerId,
    hostIsolationInstalled: environmentObservation.candidateExecutionIsolation.installed,
    hostIsolationUsable: environmentObservation.candidateExecutionIsolation.usable,
    hostIsolationErrorCode: environmentObservation.candidateExecutionIsolation.errorCode,
    result: first.result,
    isolationCertified: first.truth.isolationCertified,
    fixedPolicyProbeProcesses: policyProbeProcesses,
    proposedSourceFilesReadByGate: 0,
    proposedBytesMountedInSandbox: 0,
    proposedModulesLoaded: 0,
    callerTestsExecuted: 0,
    callerTestClaimsReproduced: false,
    candidatesExecuted: 0,
    workspaceMutations: 0,
    registryMutations: 0,
    activationAuthorizations: 0,
    syntheticPolicyEvaluatorPasses: 1,
    syntheticPolicyEvaluatorHolds: 1,
    unresolvedGapCount: first.unresolvedGaps.length,
    adversarialHolds
  }, null, 2));
} finally {
  childProcess.spawnSync = originalSpawnSync;
  for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
}
