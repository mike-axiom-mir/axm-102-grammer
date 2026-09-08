'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fixtureFactory = require('./edit-graph-test-fixture.js');

const roots = [];
try {
  const commitFixture = fixtureFactory.create('axm-edit-graph-commit-'); roots.push(commitFixture.harnessRoot);
  const passing = fixtureFactory.adapter(true);
  const commitAuthorization = fixtureFactory.authorization({...commitFixture, verifierAdapter: passing});
  const commitReceipt = fixtureFactory.apply(commitFixture, commitAuthorization, passing);
  assert.strictEqual(commitReceipt.result, 'EDIT_GRAPH_TRANSACTION_COMMITTED', commitReceipt.errorCode);
  assert.strictEqual(commitReceipt.targets.length, 6);
  assert.deepStrictEqual(commitReceipt.installationOrder, commitFixture.editGraph.installationOrder);
  assert.strictEqual(commitReceipt.parserReceipts.length, 12);
  assert(commitReceipt.parserReceipts.every(item => item.parserReceipt.result === 'LANGUAGE_PARSE_PASS'));
  assert.strictEqual(commitReceipt.verifierReceipts.length, 3);
  assert(commitReceipt.verifierReceipts.every(item => item.verifierReceipt.result === 'WORKSPACE_VERIFIER_PASS'));
  assert.strictEqual(commitReceipt.truth.dependencyOrderFollowed, true);
  assert.strictEqual(commitReceipt.truth.multiFileAtomicityClaimed, false);
  assert.strictEqual(fs.readFileSync(path.join(commitFixture.workspaceRoot, 'notes/untouched.txt'), 'utf8'), 'graph marker\n');
  assert.deepStrictEqual(fs.readdirSync(commitFixture.journalRoot), [`${commitAuthorization.authorizationId}.journal.jsonl`]);
  for (const entry of commitFixture.candidateEntries) {
    assert.strictEqual(fs.readFileSync(path.join(commitFixture.workspaceRoot, ...entry.source.targetPath.split('/')), 'utf8'), entry.source.content);
    assert.strictEqual(fs.readFileSync(path.join(commitFixture.workspaceRoot, ...entry.verification.targetPath.split('/')), 'utf8'), entry.verification.content);
  }

  const rollbackFixture = fixtureFactory.create('axm-edit-graph-rollback-'); roots.push(rollbackFixture.harnessRoot);
  const failing = fixtureFactory.adapter(false);
  const rollbackAuthorization = fixtureFactory.authorization({...rollbackFixture, verifierAdapter: failing});
  const rollbackReceipt = fixtureFactory.apply(rollbackFixture, rollbackAuthorization, failing);
  assert.strictEqual(rollbackReceipt.result, 'EDIT_GRAPH_TRANSACTION_ROLLED_BACK');
  assert(rollbackReceipt.errorCode.startsWith('EDIT_GRAPH_VERIFIER_FAILED:'));
  assert.strictEqual(rollbackReceipt.rollbackReceipt.result, 'ROLLBACK_PASS');
  assert.strictEqual(rollbackReceipt.rollbackReceipt.outcomes.length, 6);
  assert.deepStrictEqual(fixtureFactory.snapshot(rollbackFixture.workspaceRoot), rollbackFixture.before);

  const replay = fixtureFactory.apply(rollbackFixture, rollbackAuthorization, failing);
  assert.strictEqual(replay.result, 'EDIT_GRAPH_TRANSACTION_HELD');
  assert.strictEqual(replay.errorCode, 'EDIT_GRAPH_AUTHORIZATION_REPLAYED');

  const candidateFixture = fixtureFactory.create('axm-edit-graph-candidate-hold-'); roots.push(candidateFixture.harnessRoot);
  const candidateAuth = fixtureFactory.authorization({...candidateFixture, verifierAdapter: passing});
  const missingCandidate = {...candidateFixture, candidateEntries: candidateFixture.candidateEntries.slice(0, 2)};
  const candidateHold = fixtureFactory.apply(missingCandidate, candidateAuth, passing);
  assert.strictEqual(candidateHold.result, 'EDIT_GRAPH_TRANSACTION_HELD');
  assert.strictEqual(candidateHold.errorCode, 'EDIT_GRAPH_CANDIDATE_ENTRY_COUNT_INVALID');
  assert.deepStrictEqual(fixtureFactory.snapshot(candidateFixture.workspaceRoot), candidateFixture.before);
  const tamperedCandidateEntries = candidateFixture.candidateEntries.map((entry, index) => index === 0 ? {...entry, source: {...entry.source, content: `${entry.source.content}// changed after digest\n`}} : entry);
  const candidateDigestHold = fixtureFactory.apply({...candidateFixture, candidateEntries: tamperedCandidateEntries}, candidateAuth, passing);
  assert.strictEqual(candidateDigestHold.result, 'EDIT_GRAPH_TRANSACTION_HELD');
  assert.strictEqual(candidateDigestHold.errorCode, 'EDIT_GRAPH_SOURCE_CANDIDATE_DIGEST_MISMATCH');
  assert.deepStrictEqual(fixtureFactory.snapshot(candidateFixture.workspaceRoot), candidateFixture.before);

  const tamperFixture = fixtureFactory.create('axm-edit-graph-auth-hold-'); roots.push(tamperFixture.harnessRoot);
  const validAuth = fixtureFactory.authorization({...tamperFixture, verifierAdapter: passing});
  const tamperedAuth = {...validAuth, targets: validAuth.targets.slice(1)};
  const authHold = fixtureFactory.apply(tamperFixture, tamperedAuth, passing);
  assert.strictEqual(authHold.errorCode, 'EDIT_GRAPH_AUTHORIZATION_DIGEST_MISMATCH');

  const driftFixture = fixtureFactory.create('axm-edit-graph-drift-'); roots.push(driftFixture.harnessRoot);
  const driftAuth = fixtureFactory.authorization({...driftFixture, verifierAdapter: passing});
  fixtureFactory.put(driftFixture.workspaceRoot, driftFixture.candidateEntries[0].source.targetPath, 'module.exports = {run: () => "external"};\n');
  const driftBefore = fixtureFactory.snapshot(driftFixture.workspaceRoot);
  const driftHold = fixtureFactory.apply(driftFixture, driftAuth, passing);
  assert.strictEqual(driftHold.errorCode, 'EDIT_GRAPH_WORKSPACE_DRIFT_SINCE_PLACEMENT');
  assert.deepStrictEqual(fixtureFactory.snapshot(driftFixture.workspaceRoot), driftBefore);

  console.log(JSON.stringify({ok: true, graphEntryCount: 3, exactTargetCount: 6, successfulGraphTransactions: 1, rollbackGraphTransactions: 1, parserReceiptCount: commitReceipt.parserReceipts.length + rollbackReceipt.parserReceipts.length, verifierReceiptCount: commitReceipt.verifierReceipts.length + rollbackReceipt.verifierReceipts.length, adversarialHoldCount: 5, legacyTwoTargetApiPreserved: true, productionRepositoryTrialClaimed: false}, null, 2));
} finally {
  for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
}
