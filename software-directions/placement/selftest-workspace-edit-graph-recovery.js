'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const fixtureFactory = require('./edit-graph-test-fixture.js');
const graphHand = require('./workspace-edit-graph-hand.js');
const editHand = require('./workspace-edit-hand.js');
const registry = require('./placement-registry.js');

const WORKER = path.join(__dirname, 'workspace-edit-graph-crash-worker.js');
const ROOT = path.resolve(__dirname, '..', '..');
let scenarioSequence = 0;

function phaseMatrix(editGraph) {
  const phases = ['GRAPH_PREPARED'];
  for (const nodeId of editGraph.installationOrder) phases.push(`GRAPH_TARGET_TEMP_WRITTEN:${nodeId}`, `GRAPH_TARGET_BACKED_UP:${nodeId}`, `GRAPH_TARGET_INSTALLED:${nodeId}`);
  phases.push('GRAPH_INSTALLED_PARSED', 'GRAPH_VERIFIED', 'GRAPH_CLEANUP_COMPLETE', 'GRAPH_COMMITTED');
  return phases;
}

function scenario(phase, label = 'matrix') {
  scenarioSequence += 1;
  const fixture = fixtureFactory.create('axm-edit-graph-recovery-');
  const passing = fixtureFactory.adapter(true);
  const authorizationId = `graph-recovery-${scenarioSequence}-${label}`;
  const authorization = fixtureFactory.authorization({...fixture, verifierAdapter: passing, authorizationId});
  const payload = {workspaceRoot: fixture.workspaceRoot, journalRoot: fixture.journalRoot, declaration: fixture.declaration, observation: fixture.observation, editGraph: fixture.editGraph, candidateEntries: fixture.candidateEntries, authorization, adapter: {schema: passing.schema, id: passing.id, providesVerifierId: passing.providesVerifierId, implementation: passing.implementation}};
  const payloadPath = path.join(fixture.harnessRoot, 'payload.json'); fs.writeFileSync(payloadPath, `${JSON.stringify(payload)}\n`);
  return {...fixture, phase, passing, authorization, authorizationId, payload, payloadPath};
}

function crash(item) {
  const result = spawnSync(process.execPath, [WORKER, item.payloadPath], {cwd: ROOT, encoding: 'utf8', env: {...process.env, AXM_EDIT_ENABLE_TEST_CRASH: '1', AXM_EDIT_GRAPH_TEST_CRASH_AFTER: item.phase}});
  assert.strictEqual(result.signal, 'SIGKILL', `${item.phase} must SIGKILL; status=${result.status}; stderr=${result.stderr}`);
}

function recover(item) { return graphHand.recover({workspaceRoot: item.workspaceRoot, journalRoot: item.journalRoot, authorizationId: item.authorizationId}); }
function artifacts(item) { return fixtureFactory.snapshot(item.workspaceRoot).filter(entry => path.posix.basename(entry.path).startsWith('.axm-')); }
function parseWorker(result) { const lines = result.stdout.trim().split('\n').filter(Boolean); assert(lines.length, result.stderr); return JSON.parse(lines.at(-1)); }
function assertCandidates(item) {
  for (const entry of item.candidateEntries) {
    assert.strictEqual(fs.readFileSync(path.join(item.workspaceRoot, ...entry.source.targetPath.split('/')), 'utf8'), entry.source.content);
    assert.strictEqual(fs.readFileSync(path.join(item.workspaceRoot, ...entry.verification.targetPath.split('/')), 'utf8'), entry.verification.content);
  }
  assert.strictEqual(fs.readFileSync(path.join(item.workspaceRoot, 'notes/untouched.txt'), 'utf8'), 'graph marker\n');
}

function legacyPairContender(item) {
  const graphEntry = item.editGraph.entries[0];
  const plan = graphEntry.placementPlan;
  const entryCandidates = item.candidateEntries.find(entry => entry.entryId === graphEntry.entryId);
  const issuedMs = Date.now(); const expiresMs = Math.min(issuedMs + editHand.AUTHORIZATION_TTL_MS, Date.parse(item.observation.expiresAt));
  const body = {
    schema: 'axm.code.edit-authorization.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_TRANSACTION_AUTHORIZED', authorizationId: `pair-contender-${scenarioSequence}`, approval: 'EXPLICIT_SINGLE_TRANSACTION',
    issuedAt: new Date(issuedMs).toISOString(), expiresAt: new Date(expiresMs).toISOString(), ttlMs: expiresMs - issuedMs,
    workspaceRootIdentitySha256: registry.hash(path.resolve(item.workspaceRoot)), journalRootIdentitySha256: registry.hash(path.resolve(item.journalRoot)), projectMapObservationSha256: item.observation.observationSha256, placementPlanSha256: plan.planSha256,
    parserId: 'node-vm-script-syntax-v1', rollbackRequired: true, durableRecoveryRequired: true,
    targets: {
      source: {targetPath: plan.sourcePlacement.targetPath, action: plan.sourcePlacement.action, expectedBeforeSha256: plan.sourcePlacement.expectedPreMutationSha256, candidateSha256: entryCandidates.source.contentSha256},
      verification: {targetPath: plan.verificationPlacement.targetPath, action: plan.verificationPlacement.action, expectedBeforeSha256: plan.verificationPlacement.expectedPreMutationSha256, candidateSha256: entryCandidates.verification.contentSha256}
    },
    verifierBindings: [{id: item.passing.id, adapterSha256: item.passing.adapterSha256, providesVerifierId: item.passing.providesVerifierId}],
    authority: {workspaceMutation: true, rollbackWrite: true, network: false, install: false, deployment: false, userFileDeletion: false},
    truth: {digestIsSignerOrConsentProof: false, candidateGenerationDelegated: true}
  };
  const authorization = {...body, authorizationSha256: registry.hash(body)};
  return editHand.apply({workspaceRoot: item.workspaceRoot, journalRoot: item.journalRoot, declaration: item.declaration, projectMapObservation: item.observation, placementPlan: plan, authorization, candidates: {source: entryCandidates.source, verification: entryCandidates.verification}, verifierAdapters: [item.passing]});
}

const harnesses = [];
let rollbackCount = 0; let recoveredCommitCount = 0; let alreadyCommittedCount = 0; let matrix;
try {
  const probe = scenario('GRAPH_PREPARED', 'phase-probe'); harnesses.push(probe.harnessRoot);
  matrix = phaseMatrix(probe.editGraph);
  fs.rmSync(probe.harnessRoot, {recursive: true, force: true}); harnesses.pop();

  for (const phase of matrix) {
    const item = scenario(phase); harnesses.push(item.harnessRoot); crash(item);
    const receipt = recover(item);
    assert.strictEqual(receipt.errorCode, null, `${phase}:${receipt.errorCode}`);
    assert.strictEqual(receipt.truth.finalStateVerified, true);
    assert.strictEqual(receipt.leaseReleased, true);
    assert.deepStrictEqual(artifacts(item), []);
    assert.deepStrictEqual(fs.readdirSync(item.journalRoot), [`${item.authorizationId}.journal.jsonl`]);
    if (phase === 'GRAPH_VERIFIED' || phase === 'GRAPH_CLEANUP_COMPLETE') {
      assert.strictEqual(receipt.result, 'EDIT_GRAPH_RECOVERY_COMMITTED'); assertCandidates(item); recoveredCommitCount += 1;
    } else if (phase === 'GRAPH_COMMITTED') {
      assert.strictEqual(receipt.result, 'EDIT_GRAPH_RECOVERY_ALREADY_COMMITTED'); assertCandidates(item); alreadyCommittedCount += 1;
    } else {
      assert.strictEqual(receipt.result, 'EDIT_GRAPH_RECOVERY_ROLLED_BACK'); assert.deepStrictEqual(fixtureFactory.snapshot(item.workspaceRoot), item.before); rollbackCount += 1;
    }
  }

  const leaseItem = scenario('GRAPH_PREPARED', 'lease'); harnesses.push(leaseItem.harnessRoot); crash(leaseItem);
  const contenderAuthorization = fixtureFactory.authorization({...leaseItem, verifierAdapter: leaseItem.passing, authorizationId: `graph-contender-${scenarioSequence}`});
  const contention = fixtureFactory.apply(leaseItem, contenderAuthorization, leaseItem.passing);
  assert.strictEqual(contention.result, 'EDIT_GRAPH_TRANSACTION_HELD');
  assert.strictEqual(contention.errorCode, 'EDIT_GRAPH_WORKSPACE_LEASE_HELD');
  const legacyContention = legacyPairContender(leaseItem);
  assert.strictEqual(legacyContention.result, 'EDIT_TRANSACTION_HELD');
  assert.strictEqual(legacyContention.errorCode, 'EDIT_WORKSPACE_LEASE_HELD');
  assert.deepStrictEqual(fixtureFactory.snapshot(leaseItem.workspaceRoot), leaseItem.before);
  assert.strictEqual(recover(leaseItem).result, 'EDIT_GRAPH_RECOVERY_ROLLED_BACK');
  const replay = spawnSync(process.execPath, [WORKER, leaseItem.payloadPath], {cwd: ROOT, encoding: 'utf8'});
  assert.strictEqual(replay.status, 0, replay.stderr);
  const replayReceipt = parseWorker(replay);
  assert.strictEqual(replayReceipt.result, 'EDIT_GRAPH_TRANSACTION_HELD');
  assert.strictEqual(replayReceipt.errorCode, 'EDIT_GRAPH_AUTHORIZATION_REPLAYED_DURABLE');

  const tamperItem = scenario('GRAPH_PREPARED', 'tamper'); harnesses.push(tamperItem.harnessRoot); crash(tamperItem);
  const tamperJournal = path.join(tamperItem.journalRoot, `${tamperItem.authorizationId}.journal.jsonl`);
  const tampered = JSON.parse(fs.readFileSync(tamperJournal, 'utf8').trim()); tampered.details.rollbackRequired = false; fs.writeFileSync(tamperJournal, `${JSON.stringify(tampered)}\n`);
  const tamperReceipt = recover(tamperItem);
  assert.strictEqual(tamperReceipt.result, 'EDIT_GRAPH_RECOVERY_HELD');
  assert.strictEqual(tamperReceipt.errorCode, 'EDIT_GRAPH_RECOVERY_JOURNAL_CHAIN_INVALID');
  assert.deepStrictEqual(fixtureFactory.snapshot(tamperItem.workspaceRoot), tamperItem.before);

  const middleNode = 'b-application-source';
  const ambiguousItem = scenario(`GRAPH_TARGET_INSTALLED:${middleNode}`, 'ambiguous'); harnesses.push(ambiguousItem.harnessRoot); crash(ambiguousItem);
  const ambiguousPath = ambiguousItem.editGraph.nodes.find(node => node.nodeId === middleNode).targetPath;
  fixtureFactory.put(ambiguousItem.workspaceRoot, ambiguousPath, 'module.exports = {run: () => "external"};\n');
  const ambiguousReceipt = recover(ambiguousItem);
  assert.strictEqual(ambiguousReceipt.result, 'EDIT_GRAPH_RECOVERY_HELD');
  assert.strictEqual(ambiguousReceipt.errorCode, 'EDIT_GRAPH_RECOVERY_WORKSPACE_STATE_AMBIGUOUS');
  assert.strictEqual(fs.readFileSync(path.join(ambiguousItem.workspaceRoot, ...ambiguousPath.split('/')), 'utf8'), 'module.exports = {run: () => "external"};\n');

  const modeItem = scenario('GRAPH_PREPARED', 'mode'); harnesses.push(modeItem.harnessRoot); crash(modeItem);
  const modePath = modeItem.editGraph.nodes[0].targetPath; const modeAbsolute = path.join(modeItem.workspaceRoot, ...modePath.split('/')); fs.chmodSync(modeAbsolute, 0o600);
  const modeReceipt = recover(modeItem);
  assert.strictEqual(modeReceipt.result, 'EDIT_GRAPH_RECOVERY_HELD');
  assert.strictEqual(modeReceipt.errorCode, 'EDIT_GRAPH_RECOVERY_WORKSPACE_STATE_AMBIGUOUS');
  assert.strictEqual(fs.statSync(modeAbsolute).mode & 0o777, 0o600);

  const partialItem = scenario(`GRAPH_TARGET_INSTALLED:${middleNode}`, 'partial'); harnesses.push(partialItem.harnessRoot); crash(partialItem);
  const partialJournal = path.join(partialItem.journalRoot, `${partialItem.authorizationId}.journal.jsonl`); fs.appendFileSync(partialJournal, '{"torn":');
  const partialReceipt = recover(partialItem);
  assert.strictEqual(partialReceipt.result, 'EDIT_GRAPH_RECOVERY_ROLLED_BACK');
  assert.strictEqual(partialReceipt.trailingPartialRecordIgnored, true);
  assert.strictEqual(partialReceipt.truth.journalTailRepairAttempted, true);
  assert.deepStrictEqual(fixtureFactory.snapshot(partialItem.workspaceRoot), partialItem.before);

  console.log(JSON.stringify({ok: true, graphEntryCount: 3, exactTargetCount: 6, journalBoundaryCount: matrix.length, actualSigkillCrashCount: matrix.length + 5, rollbackRecoveryCount: rollbackCount, recoveredCommitCount, alreadyCommittedCount, durableReplayAcrossProcessRestartHeld: true, simultaneousGraphWorkspaceLeaseHeld: true, legacyPairHandHeldByGraphLease: true, tamperedJournalHeld: true, ambiguousWorkspaceStateHeld: true, modeDriftHeld: true, trailingPartialJournalRecovered: true, universalPowerLossProofClaimed: false}, null, 2));
} finally {
  for (const root of harnesses) fs.rmSync(root, {recursive: true, force: true});
}
