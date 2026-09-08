'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');
const registry = require('./placement-registry.js');
const plane = require('./placement-plane.js');
const projectMapHand = require('./project-map-hand.js');
const editHand = require('./workspace-edit-hand.js');

const WORKER = path.join(__dirname, 'workspace-edit-crash-worker.js');
const ROLLBACK_PHASES = new Set(['PREPARED', 'SOURCE_TEMP_WRITTEN', 'SOURCE_BACKED_UP', 'SOURCE_INSTALLED', 'VERIFICATION_TEMP_WRITTEN', 'VERIFICATION_BACKED_UP', 'VERIFICATION_INSTALLED', 'INSTALLED_PARSED']);
const REPLACE_PHASES = [...ROLLBACK_PHASES, 'VERIFIED', 'CLEANUP_COMPLETE', 'COMMITTED'];
const CREATE_PHASES = REPLACE_PHASES.filter(phase => !phase.endsWith('BACKED_UP'));

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function put(root, relative, content) {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, content);
}

function snapshot(root) {
  const entries = [];
  function walk(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const target = path.join(directory, name);
      const relative = path.relative(root, target).split(path.sep).join('/');
      const stat = fs.lstatSync(target);
      if (stat.isDirectory()) { entries.push({path: relative, type: 'directory'}); walk(target); }
      else entries.push({path: relative, type: 'file', sha256: sha256(fs.readFileSync(target)), mode: stat.mode & 0o777});
    }
  }
  walk(root);
  return entries;
}

function transactionArtifacts(root) {
  return snapshot(root).filter(item => path.posix.basename(item.path).startsWith('.axm-'));
}

function conventions() {
  return {sourceRoot: 'src', testRoot: 'testing', fileExtension: '.js', languageBinding: {kind: 'extension', signal: '.js'}, sourceFilePattern: '{name}{ext}', roleDirectory: true, testFilePattern: '{name}.test{ext}', naming: 'kebab-case'};
}

function module({id, modulePath, role, kind, owner, verifies = [], exports = []}) {
  return {id, path: modulePath, role, status: 'active', mutable: true, accepts: [kind], owns: [owner], directionIds: ['game'], exports, verifies};
}

function declaration(projectId, modules) {
  return {schema: 'axm.code.project-map-declaration.v1', version: '1.0.0', projectId, languageId: 'javascript', conventions: conventions(), modules, protectedPaths: []};
}

function change(changeId, ownerSignals) {
  return {schema: 'axm.code.change-intent.v1', changeId, directionId: 'game', kind: 'rule', name: 'game-seed', ownerSignals, expectedExports: ['run'], dependencyModuleIds: [], requestedVerifiers: ['unit-test']};
}

function candidate(lane, targetPath, content) {
  return {schema: 'axm.code.edit-candidate.v1', version: '1.0.0', lane, targetPath, languageId: 'javascript', content, contentSha256: sha256(Buffer.from(content, 'utf8'))};
}

let sequence = 0;
function scenario(kind, phase, label = 'matrix') {
  sequence += 1;
  const harnessRoot = fs.mkdtempSync(path.join(os.tmpdir(), `axm-edit-recovery-${kind}-`));
  const workspaceRoot = path.join(harnessRoot, 'workspace');
  const journalRoot = path.join(harnessRoot, 'journal');
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(journalRoot);
  fs.mkdirSync(path.join(workspaceRoot, 'src', 'domain'), {recursive: true});
  fs.mkdirSync(path.join(workspaceRoot, 'testing', 'domain'), {recursive: true});
  put(workspaceRoot, 'notes/untouched.txt', `${kind} marker\n`);
  let declared;
  let requestedChange;
  if (kind === 'replace') {
    put(workspaceRoot, 'src/domain/game.js', 'module.exports = {run: () => 1};\n');
    put(workspaceRoot, 'testing/domain/game.test.js', 'const game = require("../../src/domain/game.js");\nif (game.run() !== 1) throw Error("expected one");\n');
    declared = declaration(`recovery-replace-${sequence}`, [
      module({id: 'game-core', modulePath: 'src/domain/game.js', role: 'domain', kind: 'rule', owner: 'GAME_CORE', exports: ['run']}),
      module({id: 'game-verification', modulePath: 'testing/domain/game.test.js', role: 'verification', kind: 'test', owner: 'GAME_CORE_VERIFICATION', verifies: ['src/domain/game.js']})
    ]);
    requestedChange = change(`recovery-replace-change-${sequence}`, ['GAME_CORE']);
  } else {
    declared = declaration(`recovery-create-${sequence}`, []);
    requestedChange = change(`recovery-create-change-${sequence}`, []);
  }
  const observation = projectMapHand.inspect({workspaceRoot, declaration: declared});
  assert.strictEqual(observation.result, 'PROJECT_MAP_OBSERVED_READ_ONLY');
  const plan = plane.plan({projectMapObservation: observation, change: requestedChange});
  assert.strictEqual(plan.result, 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY');
  const value = 1000 + sequence;
  const sourceName = plan.sourcePlacement.targetPath;
  const expectedImport = path.posix.relative(path.posix.dirname(plan.verificationPlacement.targetPath), sourceName);
  const importPath = expectedImport.startsWith('.') ? expectedImport : `./${expectedImport}`;
  const candidates = {
    source: candidate('source', sourceName, `module.exports = {run: () => ${value}};\n`),
    verification: candidate('verification', plan.verificationPlacement.targetPath, `const game = require("${importPath}");\nif (game.run() !== ${value}) throw Error("expected ${value}");\n`)
  };
  const adapter = {schema: 'axm.code.test-verifier-adapter.v1', id: 'durable-crash-unit-pass', providesVerifierId: 'unit-test', implementation: 'durable-crash-worker-v1'};
  const issuedMs = Date.now();
  const expiresMs = Math.min(issuedMs + editHand.AUTHORIZATION_TTL_MS, Date.parse(observation.expiresAt));
  const authorizationId = `recovery-${kind}-${sequence}-${phase.toLowerCase().replaceAll('_', '-')}-${label}`;
  const authorizationBody = {
    schema: 'axm.code.edit-authorization.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_TRANSACTION_AUTHORIZED',
    authorizationId, approval: 'EXPLICIT_SINGLE_TRANSACTION', issuedAt: new Date(issuedMs).toISOString(), expiresAt: new Date(expiresMs).toISOString(), ttlMs: expiresMs - issuedMs,
    workspaceRootIdentitySha256: registry.hash(path.resolve(workspaceRoot)), journalRootIdentitySha256: registry.hash(path.resolve(journalRoot)),
    projectMapObservationSha256: observation.observationSha256, placementPlanSha256: plan.planSha256,
    parserId: 'node-vm-script-syntax-v1', rollbackRequired: true, durableRecoveryRequired: true,
    targets: {
      source: {targetPath: plan.sourcePlacement.targetPath, action: plan.sourcePlacement.action, expectedBeforeSha256: plan.sourcePlacement.expectedPreMutationSha256, candidateSha256: candidates.source.contentSha256},
      verification: {targetPath: plan.verificationPlacement.targetPath, action: plan.verificationPlacement.action, expectedBeforeSha256: plan.verificationPlacement.expectedPreMutationSha256, candidateSha256: candidates.verification.contentSha256}
    },
    verifierBindings: [{id: adapter.id, adapterSha256: registry.hash(adapter), providesVerifierId: adapter.providesVerifierId}],
    authority: {workspaceMutation: true, rollbackWrite: true, externalJournalReadWrite: true, workspaceLease: true, network: false, install: false, deployment: false, userFileDeletion: false},
    truth: {digestIsSignerOrConsentProof: false, candidateGenerationDelegated: true}
  };
  const authorization = {...authorizationBody, authorizationSha256: registry.hash(authorizationBody)};
  const payload = {workspaceRoot, journalRoot, declaration: declared, observation, plan, candidates, authorization, adapter};
  const payloadPath = path.join(harnessRoot, 'payload.json');
  fs.writeFileSync(payloadPath, `${JSON.stringify(payload)}\n`);
  return {harnessRoot, workspaceRoot, journalRoot, kind, phase, payload, payloadPath, authorizationId, before: snapshot(workspaceRoot)};
}

function crash(item) {
  const result = spawnSync(process.execPath, [WORKER, item.payloadPath], {
    cwd: path.resolve(__dirname, '..', '..'), encoding: 'utf8',
    env: {...process.env, AXM_EDIT_ENABLE_TEST_CRASH: '1', AXM_EDIT_TEST_CRASH_AFTER: item.phase}
  });
  assert.strictEqual(result.signal, 'SIGKILL', `phase ${item.phase} must kill the worker; status=${result.status} stderr=${result.stderr}`);
  return result;
}

function recover(item) {
  return editHand.recover({workspaceRoot: item.workspaceRoot, journalRoot: item.journalRoot, authorizationId: item.authorizationId});
}

function assertCandidateState(item) {
  assert.strictEqual(fs.readFileSync(path.join(item.workspaceRoot, ...item.payload.plan.sourcePlacement.targetPath.split('/')), 'utf8'), item.payload.candidates.source.content);
  assert.strictEqual(fs.readFileSync(path.join(item.workspaceRoot, ...item.payload.plan.verificationPlacement.targetPath.split('/')), 'utf8'), item.payload.candidates.verification.content);
  assert.strictEqual(fs.readFileSync(path.join(item.workspaceRoot, 'notes/untouched.txt'), 'utf8'), `${item.kind} marker\n`);
}

function parseWorkerReceipt(result) {
  const lines = result.stdout.trim().split('\n').filter(Boolean);
  assert(lines.length > 0, `worker receipt missing: ${result.stderr}`);
  return JSON.parse(lines.at(-1));
}

const harnesses = [];
let rollbackRecoveryCount = 0;
let commitRecoveryCount = 0;
let alreadyFinalCount = 0;
try {
  for (const [kind, phases] of [['replace', REPLACE_PHASES], ['create', CREATE_PHASES]]) {
    for (const phase of phases) {
      const item = scenario(kind, phase);
      harnesses.push(item.harnessRoot);
      crash(item);
      const receipt = recover(item);
      assert.strictEqual(receipt.errorCode, null, `${kind}:${phase}:${receipt.errorCode}`);
      assert.strictEqual(receipt.truth.finalStateVerified, true);
      assert.strictEqual(receipt.leaseReleased, true);
      assert.deepStrictEqual(transactionArtifacts(item.workspaceRoot), []);
      assert.deepStrictEqual(fs.readdirSync(item.journalRoot).sort(), [`${item.authorizationId}.journal.jsonl`]);
      if (ROLLBACK_PHASES.has(phase)) {
        assert.strictEqual(receipt.result, 'EDIT_RECOVERY_ROLLED_BACK');
        assert.deepStrictEqual(snapshot(item.workspaceRoot), item.before);
        rollbackRecoveryCount += 1;
      } else {
        assertCandidateState(item);
        if (phase === 'COMMITTED') {
          assert.strictEqual(receipt.result, 'EDIT_RECOVERY_ALREADY_COMMITTED');
          alreadyFinalCount += 1;
        } else {
          assert.strictEqual(receipt.result, 'EDIT_RECOVERY_COMMITTED');
          commitRecoveryCount += 1;
        }
      }
    }
  }

  const leaseItem = scenario('replace', 'PREPARED', 'lease');
  harnesses.push(leaseItem.harnessRoot);
  crash(leaseItem);
  const contender = scenario('replace', 'PREPARED', 'contender');
  harnesses.push(contender.harnessRoot);
  contender.payload.workspaceRoot = leaseItem.workspaceRoot;
  contender.payload.journalRoot = leaseItem.journalRoot;
  contender.payload.declaration = leaseItem.payload.declaration;
  contender.payload.observation = leaseItem.payload.observation;
  contender.payload.plan = leaseItem.payload.plan;
  contender.payload.candidates = leaseItem.payload.candidates;
  const contenderBody = {...leaseItem.payload.authorization, authorizationId: contender.authorizationId};
  delete contenderBody.authorizationSha256;
  contender.payload.authorization = {...contenderBody, authorizationSha256: registry.hash(contenderBody)};
  fs.writeFileSync(contender.payloadPath, `${JSON.stringify(contender.payload)}\n`);
  const contention = spawnSync(process.execPath, [WORKER, contender.payloadPath], {cwd: path.resolve(__dirname, '..', '..'), encoding: 'utf8'});
  assert.strictEqual(contention.status, 0, contention.stderr);
  const contentionReceipt = parseWorkerReceipt(contention);
  assert.strictEqual(contentionReceipt.result, 'EDIT_TRANSACTION_HELD');
  assert.strictEqual(contentionReceipt.errorCode, 'EDIT_WORKSPACE_LEASE_HELD');
  assert.deepStrictEqual(snapshot(leaseItem.workspaceRoot), leaseItem.before);
  assert.strictEqual(recover(leaseItem).result, 'EDIT_RECOVERY_ROLLED_BACK');

  const replay = spawnSync(process.execPath, [WORKER, leaseItem.payloadPath], {cwd: path.resolve(__dirname, '..', '..'), encoding: 'utf8'});
  assert.strictEqual(replay.status, 0, replay.stderr);
  const replayReceipt = parseWorkerReceipt(replay);
  assert.strictEqual(replayReceipt.result, 'EDIT_TRANSACTION_HELD');
  assert.strictEqual(replayReceipt.errorCode, 'EDIT_AUTHORIZATION_REPLAYED_DURABLE');

  const tamperItem = scenario('replace', 'PREPARED', 'tamper');
  harnesses.push(tamperItem.harnessRoot);
  crash(tamperItem);
  const tamperJournal = path.join(tamperItem.journalRoot, `${tamperItem.authorizationId}.journal.jsonl`);
  const tampered = JSON.parse(fs.readFileSync(tamperJournal, 'utf8').trim());
  tampered.details.rollbackRequired = false;
  fs.writeFileSync(tamperJournal, `${JSON.stringify(tampered)}\n`);
  const tamperReceipt = recover(tamperItem);
  assert.strictEqual(tamperReceipt.result, 'EDIT_RECOVERY_HELD');
  assert.strictEqual(tamperReceipt.errorCode, 'EDIT_RECOVERY_JOURNAL_CHAIN_INVALID');
  assert.deepStrictEqual(snapshot(tamperItem.workspaceRoot), tamperItem.before);

  const ambiguousItem = scenario('replace', 'SOURCE_INSTALLED', 'ambiguous');
  harnesses.push(ambiguousItem.harnessRoot);
  crash(ambiguousItem);
  put(ambiguousItem.workspaceRoot, ambiguousItem.payload.plan.sourcePlacement.targetPath, 'module.exports = {run: () => "external"};\n');
  const ambiguousReceipt = recover(ambiguousItem);
  assert.strictEqual(ambiguousReceipt.result, 'EDIT_RECOVERY_HELD');
  assert.strictEqual(ambiguousReceipt.errorCode, 'EDIT_RECOVERY_WORKSPACE_STATE_AMBIGUOUS');
  assert.strictEqual(fs.readFileSync(path.join(ambiguousItem.workspaceRoot, ...ambiguousItem.payload.plan.sourcePlacement.targetPath.split('/')), 'utf8'), 'module.exports = {run: () => "external"};\n');

  const modeItem = scenario('replace', 'PREPARED', 'mode-drift');
  harnesses.push(modeItem.harnessRoot);
  crash(modeItem);
  const modeTarget = path.join(modeItem.workspaceRoot, ...modeItem.payload.plan.sourcePlacement.targetPath.split('/'));
  fs.chmodSync(modeTarget, 0o600);
  const modeReceipt = recover(modeItem);
  assert.strictEqual(modeReceipt.result, 'EDIT_RECOVERY_HELD');
  assert.strictEqual(modeReceipt.errorCode, 'EDIT_RECOVERY_WORKSPACE_STATE_AMBIGUOUS');
  assert.strictEqual(fs.statSync(modeTarget).mode & 0o777, 0o600);

  const partialItem = scenario('replace', 'SOURCE_INSTALLED', 'partial-tail');
  harnesses.push(partialItem.harnessRoot);
  crash(partialItem);
  const partialJournal = path.join(partialItem.journalRoot, `${partialItem.authorizationId}.journal.jsonl`);
  fs.appendFileSync(partialJournal, '{"torn":');
  const partialReceipt = recover(partialItem);
  assert.strictEqual(partialReceipt.result, 'EDIT_RECOVERY_ROLLED_BACK');
  assert.strictEqual(partialReceipt.trailingPartialRecordIgnored, true);
  assert.strictEqual(partialReceipt.truth.journalTailRepairAttempted, true);
  assert.deepStrictEqual(snapshot(partialItem.workspaceRoot), partialItem.before);

  console.log(JSON.stringify({
    ok: true,
    actualSigkillCrashCount: REPLACE_PHASES.length + CREATE_PHASES.length + 5,
    replacePhaseCount: REPLACE_PHASES.length,
    createPhaseCount: CREATE_PHASES.length,
    rollbackRecoveryCount,
    commitRecoveryCount,
    alreadyFinalCount,
    durableReplayAcrossProcessRestartHeld: true,
    simultaneousWorkspaceLeaseHeld: true,
    tamperedJournalHeld: true,
    ambiguousWorkspaceStateHeld: true,
    modeDriftHeld: true,
    trailingPartialJournalRecovered: true,
    universalPowerLossProofClaimed: false
  }, null, 2));
} finally {
  for (const root of harnesses) fs.rmSync(root, {recursive: true, force: true});
}
