'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const registry = require('./placement-registry.js');
const placementPlane = require('./placement-plane.js');
const projectMapHand = require('./project-map-hand.js');
const environmentHand = require('./toolchain-environment-hand.js');
const foundry = require('./hand-foundry-plane.js');
const authorHand = require('./bounded-python-record-transform-author-hand.js');
const verifierFactory = require('./bounded-python-record-transform-verifier-adapter.js');
const editHand = require('./workspace-edit-hand.js');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function redigest(value, field) { delete value[field]; value[field] = registry.hash(value); return value; }
function put(root, relative, content) { const target = path.join(root, ...relative.split('/')); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, content); }

function snapshot(root) {
  const entries = [];
  function walk(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const target = path.join(directory, name); const relative = path.relative(root, target).split(path.sep).join('/'); const stat = fs.lstatSync(target);
      if (stat.isDirectory()) { entries.push({path: relative, type: 'directory'}); walk(target); }
      else entries.push({path: relative, type: 'file', sha256: sha256(fs.readFileSync(target)), mode: stat.mode & 0o777});
    }
  }
  walk(root); return entries;
}

function moduleValue(id, modulePath, role, kind, owner, verifies, exports) {
  return {id, path: modulePath, role, status: 'active', mutable: true, accepts: [kind], owns: [owner], directionIds: ['backend-api'], exports: exports || [], verifies: verifies || []};
}

let fixtureSequence = 0;
function fixture(prefix) {
  fixtureSequence += 1;
  const harnessRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workspaceRoot = path.join(harnessRoot, 'workspace'); const journalRoot = path.join(harnessRoot, 'journal');
  fs.mkdirSync(workspaceRoot); fs.mkdirSync(journalRoot);
  put(workspaceRoot, 'src/application/capability.py', 'def run(payload):\n    return {"legacy": payload}\n');
  put(workspaceRoot, 'testing/application/selftest.py', 'from capability import run\n\nassert run({}) == {"legacy": {}}\n');
  put(workspaceRoot, 'notes/untouched.txt', 'human note stays untouched\n');
  const declaration = {
    schema: 'axm.code.project-map-declaration.v1', version: '1.0.0', projectId: 'bounded-python-application-' + fixtureSequence, languageId: 'python',
    conventions: {sourceRoot: 'src', testRoot: 'testing', fileExtension: '.py', languageBinding: {kind: 'extension', signal: '.py'}, sourceFilePattern: '{name}{ext}', roleDirectory: true, testFilePattern: '{name}_test{ext}', naming: 'kebab-case'},
    modules: [
      moduleValue('status-capability', 'src/application/capability.py', 'application', 'workflow', 'STATUS_TRANSFORM', [], ['run']),
      moduleValue('status-selftest', 'testing/application/selftest.py', 'verification', 'test', 'STATUS_TRANSFORM_TEST', ['src/application/capability.py'], [])
    ],
    protectedPaths: []
  };
  const change = {schema: 'axm.code.change-intent.v1', changeId: 'normalize-status-' + fixtureSequence, directionId: 'backend-api', kind: 'workflow', name: 'status-transform', ownerSignals: ['STATUS_TRANSFORM'], expectedExports: ['run'], dependencyModuleIds: [], requestedVerifiers: ['unit-test']};
  const observation = projectMapHand.inspect({workspaceRoot, declaration});
  assert.strictEqual(observation.result, 'PROJECT_MAP_OBSERVED_READ_ONLY', observation.errorCode);
  const plan = placementPlane.plan({projectMapObservation: observation, change});
  assert.strictEqual(plan.result, 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY', plan.errorCode);
  assert.strictEqual(plan.sourcePlacement.targetPath, 'src/application/capability.py');
  assert.strictEqual(plan.verificationPlacement.targetPath, 'testing/application/selftest.py');
  return {harnessRoot, workspaceRoot, journalRoot, declaration, change, observation, plan};
}

const parameters = Object.freeze({resultSchemaId: 'axm.python.status-normalized/v1', sourceField: 'status', targetField: 'normalized_status', defaultValue: 'unknown', maxInputKeys: 16, maxInputBytes: 4096});

function bind(fixtureValue, environment) {
  const manifest = foundry.spawn({projectMapObservation: fixtureValue.observation, placementPlans: [fixtureValue.plan], environmentObservation: environment});
  foundry.validateManifest(manifest);
  const parserCapsule = manifest.handCapsules.find(value => value.handRole === 'language-parser');
  assert.strictEqual(parserCapsule.status, 'SPAWNED_NO_EXECUTION_AUTHORITY');
  const authorReceipt = authorHand.author({placementPlan: fixtureValue.plan, parameters});
  assert.strictEqual(authorReceipt.result, 'PYTHON_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY', authorReceipt.errorCode);
  const verifier = verifierFactory.create({authorReceipt, environmentObservation: environment});
  return {manifest, parserContext: {capsule: parserCapsule, environmentObservation: environment}, authorReceipt, candidates: authorReceipt.candidates, verifier};
}

let authorizationSequence = 0;
function authorization(fixtureValue, binding, adapter, mutate, times) {
  authorizationSequence += 1;
  const issuedMs = times?.issuedMs ?? Date.now();
  const expiresMs = times?.expiresMs ?? Math.min(issuedMs + editHand.AUTHORIZATION_TTL_MS, Date.parse(fixtureValue.observation.expiresAt));
  const body = (mutate || (value => value))({
    schema: 'axm.code.edit-authorization.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_TRANSACTION_AUTHORIZED',
    authorizationId: 'python-recipe-' + authorizationSequence, approval: 'EXPLICIT_SINGLE_TRANSACTION',
    issuedAt: new Date(issuedMs).toISOString(), expiresAt: new Date(expiresMs).toISOString(), ttlMs: expiresMs - issuedMs,
    workspaceRootIdentitySha256: registry.hash(path.resolve(fixtureValue.workspaceRoot)),
    journalRootIdentitySha256: registry.hash(path.resolve(fixtureValue.journalRoot)),
    projectMapObservationSha256: fixtureValue.observation.observationSha256, placementPlanSha256: fixtureValue.plan.planSha256,
    parserId: binding.parserContext.capsule.parserId, parserCapsuleSha256: binding.parserContext.capsule.capsuleSha256,
    parserEnvironmentObservationSha256: binding.parserContext.environmentObservation.environmentObservationSha256,
    rollbackRequired: true, durableRecoveryRequired: true,
    targets: {
      source: {targetPath: fixtureValue.plan.sourcePlacement.targetPath, action: fixtureValue.plan.sourcePlacement.action, expectedBeforeSha256: fixtureValue.plan.sourcePlacement.expectedPreMutationSha256, candidateSha256: binding.candidates.source.contentSha256},
      verification: {targetPath: fixtureValue.plan.verificationPlacement.targetPath, action: fixtureValue.plan.verificationPlacement.action, expectedBeforeSha256: fixtureValue.plan.verificationPlacement.expectedPreMutationSha256, candidateSha256: binding.candidates.verification.contentSha256}
    },
    verifierBindings: [{id: adapter.id, adapterSha256: adapter.adapterSha256, providesVerifierId: adapter.providesVerifierId}],
    authority: {workspaceMutation: true, rollbackWrite: true, network: false, install: false, deployment: false, userFileDeletion: false},
    truth: {digestIsSignerOrConsentProof: false, candidateGenerationDelegated: true}
  });
  return {...body, authorizationSha256: registry.hash(body)};
}

function apply(fixtureValue, binding, authorized, adapter, parserContext) {
  return editHand.apply({
    workspaceRoot: fixtureValue.workspaceRoot, journalRoot: fixtureValue.journalRoot, declaration: fixtureValue.declaration,
    projectMapObservation: fixtureValue.observation, placementPlan: fixtureValue.plan, authorization: authorized,
    candidates: binding.candidates, parserContext: parserContext === undefined ? binding.parserContext : parserContext, verifierAdapters: [adapter]
  });
}

const roots = [];
let adversarialHolds = 0;
let runtimePasses = 0;
let rollbackPasses = 0;
const environment = environmentHand.inspect();
assert.strictEqual(environmentHand.get(environment, 'python3').usable, true);
assert.strictEqual(environmentHand.get(environment, 'prlimit').usable, true);

try {
  assert.strictEqual(authorHand.donorImplementationSha256(), authorHand.DONOR.builderSha256);

  const commitFixture = fixture('axm-bounded-python-commit-'); roots.push(commitFixture.harnessRoot);
  const commitBinding = bind(commitFixture, environment);
  const commitAuthorization = authorization(commitFixture, commitBinding, commitBinding.verifier);
  const commitReceipt = apply(commitFixture, commitBinding, commitAuthorization, commitBinding.verifier);
  assert.strictEqual(commitReceipt.result, 'EDIT_TRANSACTION_COMMITTED', commitReceipt.errorCode);
  assert.strictEqual(commitReceipt.parserReceipts.length, 4);
  assert(commitReceipt.parserReceipts.every(value => value.result === 'LANGUAGE_PARSE_PASS' && value.parserId === 'python-ast-exec-syntax-v1' && value.truth.sourceExecuted === false));
  assert(commitReceipt.parserReceipts.every(value => /^[a-f0-9]{64}$/.test(value.spawnedParserReceiptSha256)));
  assert.strictEqual(commitReceipt.verifierReceipts[0].result, 'WORKSPACE_VERIFIER_PASS');
  assert.strictEqual(commitReceipt.verifierReceipts[0].observations.result, 'PROVENANCE_LOCKED_RUNTIME_PASS');
  assert.strictEqual(commitReceipt.verifierReceipts[0].observations.hostNamespaceSandbox, false);
  assert.strictEqual(commitReceipt.verifierReceipts[0].observations.arbitraryCandidateExecution, false);
  assert.strictEqual(fs.readFileSync(path.join(commitFixture.workspaceRoot, 'src/application/capability.py'), 'utf8'), commitBinding.candidates.source.content);
  assert.strictEqual(fs.readFileSync(path.join(commitFixture.workspaceRoot, 'testing/application/selftest.py'), 'utf8'), commitBinding.candidates.verification.content);
  assert.strictEqual(fs.readFileSync(path.join(commitFixture.workspaceRoot, 'notes/untouched.txt'), 'utf8'), 'human note stays untouched\n');
  runtimePasses += 1;

  const rollbackFixture = fixture('axm-bounded-python-rollback-'); roots.push(rollbackFixture.harnessRoot);
  const rollbackBinding = bind(rollbackFixture, environment); const rollbackBefore = snapshot(rollbackFixture.workspaceRoot);
  const failureMetadata = {schema: 'axm.code.test-verifier-adapter.v1', id: 'bounded-python-intentional-failure', providesVerifierId: 'unit-test', implementation: 'controlled-failure-v1'};
  const failureAdapter = {...failureMetadata, adapterSha256: registry.hash(failureMetadata), verify() { return {passed: false, observations: {fixtureResult: 'INTENTIONAL_FAILURE'}}; }};
  const rollbackAuthorization = authorization(rollbackFixture, rollbackBinding, failureAdapter);
  const rollbackReceipt = apply(rollbackFixture, rollbackBinding, rollbackAuthorization, failureAdapter);
  assert.strictEqual(rollbackReceipt.result, 'EDIT_TRANSACTION_ROLLED_BACK');
  assert.strictEqual(rollbackReceipt.rollbackReceipt.result, 'ROLLBACK_PASS');
  assert.deepStrictEqual(snapshot(rollbackFixture.workspaceRoot), rollbackBefore);
  rollbackPasses += 1;

  const noParserFixture = fixture('axm-bounded-python-no-parser-'); roots.push(noParserFixture.harnessRoot);
  const noParserBinding = bind(noParserFixture, environment); const noParserBefore = snapshot(noParserFixture.workspaceRoot);
  const noParserAuthorization = authorization(noParserFixture, noParserBinding, noParserBinding.verifier);
  const noParserReceipt = apply(noParserFixture, noParserBinding, noParserAuthorization, noParserBinding.verifier, null);
  assert.strictEqual(noParserReceipt.result, 'EDIT_TRANSACTION_HELD'); assert.strictEqual(noParserReceipt.errorCode, 'EDIT_PYTHON_PARSER_CONTEXT_REQUIRED');
  assert.deepStrictEqual(snapshot(noParserFixture.workspaceRoot), noParserBefore); adversarialHolds += 1;

  const parserAuthFixture = fixture('axm-bounded-python-parser-auth-'); roots.push(parserAuthFixture.harnessRoot);
  const parserAuthBinding = bind(parserAuthFixture, environment); const parserAuthBefore = snapshot(parserAuthFixture.workspaceRoot);
  const badParserAuthorization = authorization(parserAuthFixture, parserAuthBinding, parserAuthBinding.verifier, value => ({...value, parserCapsuleSha256: '0'.repeat(64)}));
  const badParserReceipt = apply(parserAuthFixture, parserAuthBinding, badParserAuthorization, parserAuthBinding.verifier);
  assert.strictEqual(badParserReceipt.result, 'EDIT_TRANSACTION_HELD'); assert.strictEqual(badParserReceipt.errorCode, 'EDIT_AUTHORIZATION_PYTHON_PARSER_BINDING_INVALID');
  assert.deepStrictEqual(snapshot(parserAuthFixture.workspaceRoot), parserAuthBefore); adversarialHolds += 1;

  const syntaxFixture = fixture('axm-bounded-python-syntax-'); roots.push(syntaxFixture.harnessRoot);
  const syntaxBinding = bind(syntaxFixture, environment); const syntaxBefore = snapshot(syntaxFixture.workspaceRoot);
  const invalidContent = 'def run(payload)\n    return payload\n';
  syntaxBinding.candidates = {...syntaxBinding.candidates, source: {...syntaxBinding.candidates.source, content: invalidContent, contentSha256: sha256(Buffer.from(invalidContent, 'utf8'))}};
  const syntaxAuthorization = authorization(syntaxFixture, syntaxBinding, syntaxBinding.verifier);
  const syntaxReceipt = apply(syntaxFixture, syntaxBinding, syntaxAuthorization, syntaxBinding.verifier);
  assert.strictEqual(syntaxReceipt.result, 'EDIT_TRANSACTION_HELD'); assert.strictEqual(syntaxReceipt.errorCode, 'EDIT_SOURCE_PARSE_FAILED');
  assert.strictEqual(syntaxReceipt.parserReceipts[0].errorCode, 'PYTHON_SYNTAX_ERROR');
  assert.deepStrictEqual(snapshot(syntaxFixture.workspaceRoot), syntaxBefore); adversarialHolds += 1;

  const driftFixture = fixture('axm-bounded-python-drift-'); roots.push(driftFixture.harnessRoot);
  const driftBinding = bind(driftFixture, environment);
  const driftAuthorization = authorization(driftFixture, driftBinding, driftBinding.verifier);
  put(driftFixture.workspaceRoot, 'src/application/capability.py', 'def run(payload):\n    return {"external": payload}\n');
  const driftBefore = snapshot(driftFixture.workspaceRoot);
  const driftReceipt = apply(driftFixture, driftBinding, driftAuthorization, driftBinding.verifier);
  assert.strictEqual(driftReceipt.result, 'EDIT_TRANSACTION_HELD'); assert.strictEqual(driftReceipt.errorCode, 'EDIT_WORKSPACE_DRIFT_SINCE_PLACEMENT');
  assert.deepStrictEqual(snapshot(driftFixture.workspaceRoot), driftBefore); adversarialHolds += 1;

  const staleFixture = fixture('axm-bounded-python-stale-'); roots.push(staleFixture.harnessRoot);
  const staleBinding = bind(staleFixture, environment); const staleBefore = snapshot(staleFixture.workspaceRoot);
  const now = Date.now();
  const staleAuthorization = authorization(staleFixture, staleBinding, staleBinding.verifier, null, {issuedMs: now - 10000, expiresMs: now - 5000});
  const staleReceipt = apply(staleFixture, staleBinding, staleAuthorization, staleBinding.verifier);
  assert.strictEqual(staleReceipt.result, 'EDIT_TRANSACTION_HELD'); assert.strictEqual(staleReceipt.errorCode, 'EDIT_AUTHORIZATION_STALE');
  assert.deepStrictEqual(snapshot(staleFixture.workspaceRoot), staleBefore); adversarialHolds += 1;

  const wrongLayoutPlan = clone(commitFixture.plan);
  wrongLayoutPlan.sourcePlacement.targetPath = 'src/application/not-capability.py';
  wrongLayoutPlan.verificationPlacement.targetPath = 'testing/application/not-selftest.py';
  wrongLayoutPlan.verificationPlacement.verifiesSourcePath = wrongLayoutPlan.sourcePlacement.targetPath;
  redigest(wrongLayoutPlan, 'planSha256');
  const wrongLayout = authorHand.author({placementPlan: wrongLayoutPlan, parameters});
  assert.strictEqual(wrongLayout.result, 'PYTHON_AUTHOR_HELD'); assert.strictEqual(wrongLayout.errorCode, 'PYTHON_AUTHOR_DONOR_LAYOUT_REQUIRED'); adversarialHolds += 1;

  const invalidParameters = authorHand.author({placementPlan: commitFixture.plan, parameters: {...parameters, maxInputKeys: 0}});
  assert.strictEqual(invalidParameters.result, 'PYTHON_AUTHOR_HELD'); assert.match(invalidParameters.errorCode, /bounded range/); adversarialHolds += 1;

  const tamperedPlan = clone(commitFixture.plan); tamperedPlan.changeId = 'tampered-plan';
  const tamperedPlanReceipt = authorHand.author({placementPlan: tamperedPlan, parameters});
  assert.strictEqual(tamperedPlanReceipt.result, 'PYTHON_AUTHOR_HELD'); assert.strictEqual(tamperedPlanReceipt.errorCode, 'PYTHON_AUTHOR_PLACEMENT_PLAN_DIGEST_MISMATCH'); adversarialHolds += 1;

  const forgedReceipt = clone(commitBinding.authorReceipt);
  forgedReceipt.candidates.source.content += '\n# forged\n';
  forgedReceipt.candidates.source.contentSha256 = sha256(Buffer.from(forgedReceipt.candidates.source.content, 'utf8'));
  redigest(forgedReceipt, 'authorReceiptSha256');
  assert.throws(() => verifierFactory.create({authorReceipt: forgedReceipt, environmentObservation: environment}), /AUTHOR_RECEIPT_CANDIDATE_MISMATCH/); adversarialHolds += 1;

  const tamperedRuntimeContext = {
    placementPlanSha256: commitFixture.plan.planSha256,
    source: {...commitBinding.candidates.source, content: commitBinding.candidates.source.content + '\n# substitute\n'},
    verification: commitBinding.candidates.verification
  };
  const tamperedRuntimeResult = commitBinding.verifier.verify(tamperedRuntimeContext);
  assert.strictEqual(tamperedRuntimeResult.passed, false); assert.strictEqual(tamperedRuntimeResult.observations.errorCode, 'EXACT_DONOR_CANDIDATE_REQUIRED'); adversarialHolds += 1;

  const forgedEnvironment = clone(environment);
  const pythonTool = forgedEnvironment.tools.find(value => value.id === 'python3');
  pythonTool.executablePath = '/bin/false'; pythonTool.executablePathSha256 = registry.hash('/bin/false');
  redigest(forgedEnvironment, 'environmentObservationSha256');
  assert.throws(() => verifierFactory.create({authorReceipt: commitBinding.authorReceipt, environmentObservation: forgedEnvironment}), /TOOL_PATH_BINDING_INVALID/); adversarialHolds += 1;

  console.log(JSON.stringify({
    ok: true,
    donorImplementationDigestReproduced: true,
    pythonApplicationTransactionsCommitted: 1,
    provenanceLockedRuntimePasses: runtimePasses,
    pythonRollbackPasses: rollbackPasses,
    pythonParserReceipts: 8,
    adversarialHolds,
    exactTargetsPerTransaction: 2,
    hostNamespaceSandboxUsable: environment.candidateExecutionIsolation.usable,
    arbitraryPythonExecutionClaimed: false,
    generalPythonAuthoringClaimed: false
  }, null, 2));
} finally {
  for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
}
