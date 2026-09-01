'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const registry = require('./placement-registry.js');
const plane = require('./placement-plane.js');
const projectMapHand = require('./project-map-hand.js');
const editHand = require('./workspace-edit-hand.js');

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
      if (stat.isSymbolicLink()) entries.push({path: relative, type: 'symlink', target: fs.readlinkSync(target)});
      else if (stat.isDirectory()) {
        entries.push({path: relative, type: 'directory'});
        walk(target);
      } else entries.push({path: relative, type: 'file', sha256: sha256(fs.readFileSync(target)), mode: stat.mode & 0o777});
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

function observeAndPlan(root, declared, requestedChange) {
  const observation = projectMapHand.inspect({workspaceRoot: root, declaration: declared});
  assert.strictEqual(observation.result, 'PROJECT_MAP_OBSERVED_READ_ONLY', observation.errorCode);
  const plan = plane.plan({projectMapObservation: observation, change: requestedChange});
  assert.strictEqual(plan.result, 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY', plan.errorCode);
  return {observation, plan};
}

function candidate(lane, targetPath, content) {
  return {schema: 'axm.code.edit-candidate.v1', version: '1.0.0', lane, targetPath, languageId: 'javascript', content, contentSha256: sha256(Buffer.from(content, 'utf8'))};
}

function verifierAdapter({id, passed}) {
  const metadata = {schema: 'axm.code.test-verifier-adapter.v1', id, providesVerifierId: 'unit-test', implementation: 'controlled-commonjs-fixture-v1'};
  return {
    ...metadata,
    adapterSha256: registry.hash(metadata),
    verify(context) {
      if (!passed) return {passed: false, observations: {fixtureResult: 'INTENTIONAL_FAILURE'}};
      const sourceModule = {exports: {}};
      Function('module', 'exports', `'use strict';\n${context.source.content}`)(sourceModule, sourceModule.exports);
      const verificationModule = {exports: {}};
      const expectedImport = path.posix.relative(path.posix.dirname(context.verification.targetPath), context.source.targetPath);
      const normalizedImport = expectedImport.startsWith('.') ? expectedImport : `./${expectedImport}`;
      const fixtureRequire = request => {
        if (request !== normalizedImport) throw Error('FIXTURE_REQUIRE_OUTSIDE_BOUND_SOURCE');
        return sourceModule.exports;
      };
      Function('module', 'exports', 'require', `'use strict';\n${context.verification.content}`)(verificationModule, verificationModule.exports, fixtureRequire);
      return {passed: true, observations: {fixtureResult: 'CONTROLLED_COMMONJS_EXECUTION_PASS', sourceReturn: sourceModule.exports.run()}};
    }
  };
}

let authorizationSequence = 0;
function authorization({root, observation, plan, candidates, adapter, times = null, mutate = value => value}) {
  authorizationSequence += 1;
  const issuedMs = times?.issuedMs ?? Date.now();
  const expiresMs = times?.expiresMs ?? Math.min(issuedMs + editHand.AUTHORIZATION_TTL_MS, Date.parse(observation.expiresAt));
  const body = mutate({
    schema: 'axm.code.edit-authorization.v1',
    version: '1.0.0',
    status: 'TEST',
    result: 'EDIT_TRANSACTION_AUTHORIZED',
    authorizationId: `fixture-edit-${authorizationSequence}`,
    approval: 'EXPLICIT_SINGLE_TRANSACTION',
    issuedAt: new Date(issuedMs).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
    ttlMs: expiresMs - issuedMs,
    workspaceRootIdentitySha256: registry.hash(path.resolve(root)),
    journalRootIdentitySha256: registry.hash(journalRoots.get(path.resolve(root))),
    projectMapObservationSha256: observation.observationSha256,
    placementPlanSha256: plan.planSha256,
    parserId: 'node-vm-script-syntax-v1',
    rollbackRequired: true,
    durableRecoveryRequired: true,
    targets: {
      source: {targetPath: plan.sourcePlacement.targetPath, action: plan.sourcePlacement.action, expectedBeforeSha256: plan.sourcePlacement.expectedPreMutationSha256, candidateSha256: candidates.source.contentSha256},
      verification: {targetPath: plan.verificationPlacement.targetPath, action: plan.verificationPlacement.action, expectedBeforeSha256: plan.verificationPlacement.expectedPreMutationSha256, candidateSha256: candidates.verification.contentSha256}
    },
    verifierBindings: [{id: adapter.id, adapterSha256: adapter.adapterSha256, providesVerifierId: adapter.providesVerifierId}],
    authority: {workspaceMutation: true, rollbackWrite: true, network: false, install: false, deployment: false, userFileDeletion: false},
    truth: {digestIsSignerOrConsentProof: false, candidateGenerationDelegated: true}
  });
  return {...body, authorizationSha256: registry.hash(body)};
}

function apply(root, declared, observation, plan, candidates, authorized, adapter) {
  return editHand.apply({workspaceRoot: root, journalRoot: journalRoots.get(path.resolve(root)), declaration: declared, projectMapObservation: observation, placementPlan: plan, authorization: authorized, candidates, verifierAdapters: [adapter]});
}

function existingFixture(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  put(root, 'src/domain/game.js', 'module.exports = {run: () => 1};\n');
  put(root, 'testing/domain/game.test.js', 'const game = require("../../src/domain/game.js");\nif (game.run() !== 1) throw Error("expected one");\n');
  put(root, 'notes/untouched.txt', 'must remain unchanged\n');
  const declared = declaration('edit-hand-existing', [
    module({id: 'game-core', modulePath: 'src/domain/game.js', role: 'domain', kind: 'rule', owner: 'GAME_CORE', exports: ['run']}),
    module({id: 'game-verification', modulePath: 'testing/domain/game.test.js', role: 'verification', kind: 'test', owner: 'GAME_CORE_VERIFICATION', verifies: ['src/domain/game.js']})
  ]);
  return {root, declared, requestedChange: change('edit-existing-game', ['GAME_CORE'])};
}

const roots = [];
const journalRoots = new Map();
function trackJournalRoot(root, prefix) {
  const journalRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-journal-`));
  roots.push(root, journalRoot);
  journalRoots.set(path.resolve(root), journalRoot);
  return journalRoot;
}

function trackedExistingFixture(prefix) {
  const fixture = existingFixture(prefix);
  fixture.journalRoot = trackJournalRoot(fixture.root, prefix);
  return fixture;
}

function journalFiles(root) {
  const journalRoot = journalRoots.get(path.resolve(root));
  return fs.readdirSync(journalRoot).sort();
}

function replacementCandidates(plan, value) {
  const sourceContent = `module.exports = {run: () => ${value}};\n`;
  const verificationContent = `const game = require("../../src/domain/game.js");\nif (game.run() !== ${value}) throw Error("expected ${value}");\n`;
  return {source: candidate('source', plan.sourcePlacement.targetPath, sourceContent), verification: candidate('verification', plan.verificationPlacement.targetPath, verificationContent)};
}

let adversarialHoldCount = 0;
try {
  const commitFixture = trackedExistingFixture('axm-workspace-edit-commit-');
  const commitBinding = observeAndPlan(commitFixture.root, commitFixture.declared, commitFixture.requestedChange);
  const commitCandidates = replacementCandidates(commitBinding.plan, 2);
  const passingAdapter = verifierAdapter({id: 'fixture-commonjs-unit-pass', passed: true});
  const commitAuthorization = authorization({root: commitFixture.root, ...commitBinding, candidates: commitCandidates, adapter: passingAdapter});
  const commitReceipt = apply(commitFixture.root, commitFixture.declared, commitBinding.observation, commitBinding.plan, commitCandidates, commitAuthorization, passingAdapter);
  assert.strictEqual(commitReceipt.result, 'EDIT_TRANSACTION_COMMITTED');
  assert.strictEqual(commitReceipt.targets.length, 2);
  assert.strictEqual(commitReceipt.parserReceipts.length, 4);
  assert(commitReceipt.parserReceipts.every(item => item.result === 'LANGUAGE_PARSE_PASS'));
  assert.strictEqual(commitReceipt.verifierReceipts.length, 1);
  assert.strictEqual(commitReceipt.verifierReceipts[0].result, 'WORKSPACE_VERIFIER_PASS');
  assert.strictEqual(commitReceipt.truth.codeGeneratedByHand, false);
  assert.strictEqual(commitReceipt.truth.multiFileAtomicityClaimed, false);
  assert.strictEqual(commitReceipt.truth.concurrentMutationRaceEliminated, false);
  assert.strictEqual(commitReceipt.truth.processCrashRecoveryProvided, true);
  assert.strictEqual(commitReceipt.truth.replayProtectionSurvivesRestart, true);
  assert.strictEqual(commitReceipt.truth.simultaneousHandMutationPreventedByLease, true);
  assert.strictEqual(commitReceipt.durableJournal.latestPhase, 'COMMITTED');
  assert.strictEqual(fs.readFileSync(path.join(commitFixture.root, 'src/domain/game.js'), 'utf8'), commitCandidates.source.content);
  assert.strictEqual(fs.readFileSync(path.join(commitFixture.root, 'testing/domain/game.test.js'), 'utf8'), commitCandidates.verification.content);
  assert.strictEqual(fs.readFileSync(path.join(commitFixture.root, 'notes/untouched.txt'), 'utf8'), 'must remain unchanged\n');
  assert.deepStrictEqual(transactionArtifacts(commitFixture.root), []);
  assert.deepStrictEqual(journalFiles(commitFixture.root), [`${commitAuthorization.authorizationId}.journal.jsonl`]);

  const rollbackFixture = trackedExistingFixture('axm-workspace-edit-rollback-');
  const rollbackBinding = observeAndPlan(rollbackFixture.root, rollbackFixture.declared, rollbackFixture.requestedChange);
  const rollbackCandidates = replacementCandidates(rollbackBinding.plan, 3);
  const failingAdapter = verifierAdapter({id: 'fixture-commonjs-unit-fail', passed: false});
  const rollbackAuthorization = authorization({root: rollbackFixture.root, ...rollbackBinding, candidates: rollbackCandidates, adapter: failingAdapter});
  const rollbackBefore = snapshot(rollbackFixture.root);
  const rollbackReceipt = apply(rollbackFixture.root, rollbackFixture.declared, rollbackBinding.observation, rollbackBinding.plan, rollbackCandidates, rollbackAuthorization, failingAdapter);
  assert.strictEqual(rollbackReceipt.result, 'EDIT_TRANSACTION_ROLLED_BACK');
  assert.strictEqual(rollbackReceipt.errorCode, `EDIT_VERIFIER_FAILED:${failingAdapter.id}`);
  assert.strictEqual(rollbackReceipt.rollbackReceipt.result, 'ROLLBACK_PASS');
  assert.strictEqual(rollbackReceipt.rollbackReceipt.outcomes.length, 2);
  assert(rollbackReceipt.rollbackReceipt.outcomes.every(item => item.restored));
  assert.deepStrictEqual(snapshot(rollbackFixture.root), rollbackBefore, 'failed verification must restore both target bytes and modes');
  assert.deepStrictEqual(transactionArtifacts(rollbackFixture.root), []);
  assert.deepStrictEqual(journalFiles(rollbackFixture.root), [`${rollbackAuthorization.authorizationId}.journal.jsonl`]);
  adversarialHoldCount += 1;

  const replayReceipt = apply(rollbackFixture.root, rollbackFixture.declared, rollbackBinding.observation, rollbackBinding.plan, rollbackCandidates, rollbackAuthorization, failingAdapter);
  assert.strictEqual(replayReceipt.result, 'EDIT_TRANSACTION_HELD');
  assert.strictEqual(replayReceipt.errorCode, 'EDIT_AUTHORIZATION_REPLAYED');
  assert.deepStrictEqual(snapshot(rollbackFixture.root), rollbackBefore);
  adversarialHoldCount += 1;

  const parseFixture = trackedExistingFixture('axm-workspace-edit-parse-');
  const parseBinding = observeAndPlan(parseFixture.root, parseFixture.declared, parseFixture.requestedChange);
  const parseCandidates = replacementCandidates(parseBinding.plan, 4);
  parseCandidates.source = candidate('source', parseBinding.plan.sourcePlacement.targetPath, 'module.exports = {run: (};\n');
  const parseBefore = snapshot(parseFixture.root);
  const parseAuthorization = authorization({root: parseFixture.root, ...parseBinding, candidates: parseCandidates, adapter: passingAdapter});
  const parseReceipt = apply(parseFixture.root, parseFixture.declared, parseBinding.observation, parseBinding.plan, parseCandidates, parseAuthorization, passingAdapter);
  assert.strictEqual(parseReceipt.result, 'EDIT_TRANSACTION_HELD');
  assert.strictEqual(parseReceipt.errorCode, 'EDIT_SOURCE_PARSE_FAILED');
  assert.deepStrictEqual(snapshot(parseFixture.root), parseBefore);
  adversarialHoldCount += 1;

  const driftFixture = trackedExistingFixture('axm-workspace-edit-drift-');
  const driftBinding = observeAndPlan(driftFixture.root, driftFixture.declared, driftFixture.requestedChange);
  const driftCandidates = replacementCandidates(driftBinding.plan, 5);
  const driftAuthorization = authorization({root: driftFixture.root, ...driftBinding, candidates: driftCandidates, adapter: passingAdapter});
  put(driftFixture.root, 'src/domain/game.js', 'module.exports = {run: () => "external-change"};\n');
  const driftBeforeApply = snapshot(driftFixture.root);
  const driftReceipt = apply(driftFixture.root, driftFixture.declared, driftBinding.observation, driftBinding.plan, driftCandidates, driftAuthorization, passingAdapter);
  assert.strictEqual(driftReceipt.result, 'EDIT_TRANSACTION_HELD');
  assert.strictEqual(driftReceipt.errorCode, 'EDIT_WORKSPACE_DRIFT_SINCE_PLACEMENT');
  assert.deepStrictEqual(snapshot(driftFixture.root), driftBeforeApply, 'drift hold must preserve the externally changed workspace');
  adversarialHoldCount += 1;

  const authorizationFixture = trackedExistingFixture('axm-workspace-edit-auth-');
  const authorizationBinding = observeAndPlan(authorizationFixture.root, authorizationFixture.declared, authorizationFixture.requestedChange);
  const authorizationCandidates = replacementCandidates(authorizationBinding.plan, 6);
  const authorizationBefore = snapshot(authorizationFixture.root);
  const expiredAuthorization = authorization({root: authorizationFixture.root, ...authorizationBinding, candidates: authorizationCandidates, adapter: passingAdapter, times: {issuedMs: Date.now() - 2000, expiresMs: Date.now() - 1000}});
  const expiredReceipt = apply(authorizationFixture.root, authorizationFixture.declared, authorizationBinding.observation, authorizationBinding.plan, authorizationCandidates, expiredAuthorization, passingAdapter);
  assert.strictEqual(expiredReceipt.errorCode, 'EDIT_AUTHORIZATION_STALE');
  adversarialHoldCount += 1;
  const validAuthorization = authorization({root: authorizationFixture.root, ...authorizationBinding, candidates: authorizationCandidates, adapter: passingAdapter});
  const tamperedAuthorization = {...validAuthorization, approval: 'IMPLICIT'};
  const tamperedReceipt = apply(authorizationFixture.root, authorizationFixture.declared, authorizationBinding.observation, authorizationBinding.plan, authorizationCandidates, tamperedAuthorization, passingAdapter);
  assert.strictEqual(tamperedReceipt.errorCode, 'EDIT_AUTHORIZATION_DIGEST_MISMATCH');
  adversarialHoldCount += 1;
  const unboundAuthorization = authorization({root: authorizationFixture.root, ...authorizationBinding, candidates: authorizationCandidates, adapter: passingAdapter, mutate: value => ({...value, verifierBindings: []})});
  const unboundReceipt = apply(authorizationFixture.root, authorizationFixture.declared, authorizationBinding.observation, authorizationBinding.plan, authorizationCandidates, unboundAuthorization, passingAdapter);
  assert.strictEqual(unboundReceipt.errorCode, 'EDIT_AUTHORIZATION_VERIFIERS_INVALID');
  adversarialHoldCount += 1;
  const wrongTargetCandidates = {...authorizationCandidates, source: {...authorizationCandidates.source, targetPath: '../outside.js'}};
  const wrongTargetReceipt = apply(authorizationFixture.root, authorizationFixture.declared, authorizationBinding.observation, authorizationBinding.plan, wrongTargetCandidates, validAuthorization, passingAdapter);
  assert.strictEqual(wrongTargetReceipt.errorCode, 'EDIT_SOURCE_CANDIDATE_INVALID');
  assert.deepStrictEqual(snapshot(authorizationFixture.root), authorizationBefore);
  adversarialHoldCount += 1;

  const inconsistentObservationBody = {...authorizationBinding.observation, projectMap: {...authorizationBinding.observation.projectMap, projectId: 'forged-internal-map'}};
  delete inconsistentObservationBody.observationSha256;
  const inconsistentObservation = {...inconsistentObservationBody, observationSha256: registry.hash(inconsistentObservationBody)};
  const inconsistentReceipt = apply(authorizationFixture.root, authorizationFixture.declared, inconsistentObservation, authorizationBinding.plan, authorizationCandidates, validAuthorization, passingAdapter);
  assert.strictEqual(inconsistentReceipt.errorCode, 'EDIT_PROJECT_MAP_CONTENT_DIGEST_MISMATCH');
  assert.deepStrictEqual(snapshot(authorizationFixture.root), authorizationBefore);
  adversarialHoldCount += 1;

  const protectedDeclaration = {...authorizationFixture.declared, protectedPaths: ['src/domain/game.js']};
  const protectedObservation = projectMapHand.inspect({workspaceRoot: authorizationFixture.root, declaration: protectedDeclaration});
  assert.strictEqual(protectedObservation.result, 'PROJECT_MAP_OBSERVED_READ_ONLY');
  const forgedPlanBody = {...authorizationBinding.plan, projectMapSha256: protectedObservation.projectMapSha256, projectMapEvidence: {...authorizationBinding.plan.projectMapEvidence, observationSha256: protectedObservation.observationSha256}};
  delete forgedPlanBody.planSha256;
  const forgedProtectedPlan = {...forgedPlanBody, planSha256: registry.hash(forgedPlanBody)};
  const protectedCandidates = replacementCandidates(forgedProtectedPlan, 7);
  const protectedAuthorization = authorization({root: authorizationFixture.root, observation: protectedObservation, plan: forgedProtectedPlan, candidates: protectedCandidates, adapter: passingAdapter});
  const protectedReceipt = apply(authorizationFixture.root, protectedDeclaration, protectedObservation, forgedProtectedPlan, protectedCandidates, protectedAuthorization, passingAdapter);
  assert.strictEqual(protectedReceipt.errorCode, 'EDIT_PLACEMENT_TARGET_PROTECTED');
  assert.deepStrictEqual(snapshot(authorizationFixture.root), authorizationBefore);
  adversarialHoldCount += 1;

  const createRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-workspace-edit-create-'));
  trackJournalRoot(createRoot, 'axm-workspace-edit-create');
  fs.mkdirSync(path.join(createRoot, 'src', 'domain'), {recursive: true});
  fs.mkdirSync(path.join(createRoot, 'testing', 'domain'), {recursive: true});
  put(createRoot, 'notes/untouched.txt', 'create marker\n');
  const createDeclaration = declaration('edit-hand-create', []);
  const createBinding = observeAndPlan(createRoot, createDeclaration, change('create-game-seed', []));
  assert.strictEqual(createBinding.plan.sourcePlacement.action, 'create-module');
  assert.strictEqual(createBinding.plan.verificationPlacement.action, 'create-test-module');
  const createCandidates = {
    source: candidate('source', createBinding.plan.sourcePlacement.targetPath, 'module.exports = {run: () => 7};\n'),
    verification: candidate('verification', createBinding.plan.verificationPlacement.targetPath, 'const game = require("../../src/domain/game-seed.js");\nif (game.run() !== 7) throw Error("expected seven");\n')
  };
  const createAuthorization = authorization({root: createRoot, ...createBinding, candidates: createCandidates, adapter: passingAdapter});
  const createReceipt = apply(createRoot, createDeclaration, createBinding.observation, createBinding.plan, createCandidates, createAuthorization, passingAdapter);
  assert.strictEqual(createReceipt.result, 'EDIT_TRANSACTION_COMMITTED');
  assert.strictEqual(createReceipt.truth.declarationUpdateRequired, true);
  assert.strictEqual(fs.readFileSync(path.join(createRoot, createBinding.plan.sourcePlacement.targetPath), 'utf8'), createCandidates.source.content);
  assert.strictEqual(fs.readFileSync(path.join(createRoot, createBinding.plan.verificationPlacement.targetPath), 'utf8'), createCandidates.verification.content);
  assert.strictEqual(fs.readFileSync(path.join(createRoot, 'notes/untouched.txt'), 'utf8'), 'create marker\n');
  assert.deepStrictEqual(transactionArtifacts(createRoot), []);

  console.log(JSON.stringify({
    ok: true,
    successfulTransactionCount: 2,
    rollbackTransactionCount: 1,
    adversarialHoldCount,
    languageParseReceiptCount: commitReceipt.parserReceipts.length + rollbackReceipt.parserReceipts.length + parseReceipt.parserReceipts.length + createReceipt.parserReceipts.length,
    registeredVerifierReceiptCount: commitReceipt.verifierReceipts.length + rollbackReceipt.verifierReceipts.length + createReceipt.verifierReceipts.length,
    exactTargetCountPerTransaction: 2,
    maxAuthorizationTtlMs: editHand.AUTHORIZATION_TTL_MS,
    maxCandidateBytes: editHand.MAX_CANDIDATE_BYTES,
    codeGeneratedByHand: false,
    productionRepositoryTrialClaimed: false,
    durableJournalProvided: true,
    workspaceLeaseProvided: true,
    authority: 'EXPLICIT_SINGLE_TRANSACTION_WORKSPACE_EDIT'
  }, null, 2));
} finally {
  for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
}
