'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const registry = require('./placement-registry.js');
const environmentHand = require('./toolchain-environment-hand.js');
const foundry = require('./hand-foundry-plane.js');
const activationPlane = require('./foundry-activation-plane.js');
const fixtureFactory = require('./foundry-activation-test-fixture.js');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function redigest(value, field) { delete value[field]; value[field] = registry.hash(value); return value; }

const environment = environmentHand.inspect();
assert.strictEqual(environmentHand.get(environment, 'python3').usable, true);
assert.strictEqual(environmentHand.get(environment, 'prlimit').usable, true);

const roots = [];
let adversarialHolds = 0;
function fixture(prefix) { const value = fixtureFactory.create(environment, prefix); roots.push(value.harnessRoot); return value; }
function hold(fixtureValue, selection, authorization, code, mutateInput = value => value) {
  const before = fixtureFactory.snapshot(fixtureValue.workspaceRoot);
  const receipt = activationPlane.activate(mutateInput(fixtureFactory.input(fixtureValue, environment, selection, authorization)));
  assert.strictEqual(receipt.result, 'FOUNDRY_ACTIVATION_HELD');
  assert.match(receipt.errorCode, code);
  assert.deepStrictEqual(fixtureFactory.snapshot(fixtureValue.workspaceRoot), before);
  adversarialHolds += 1;
  return receipt;
}

try {
  const successFixture = fixture('axm-activation-success-');
  const successSelection = fixtureFactory.recipeSelection();
  const successAuthorization = fixtureFactory.authorization(successFixture, environment, successSelection);
  const activationInput = fixtureFactory.input(successFixture, environment, successSelection, successAuthorization);
  assert.strictEqual(Object.hasOwn(activationInput, 'candidates'), false);
  assert.strictEqual(Object.hasOwn(activationInput, 'parserContext'), false);
  assert.strictEqual(Object.hasOwn(activationInput, 'verifierAdapters'), false);
  const success = activationPlane.activate(activationInput);
  assert.strictEqual(success.result, 'FOUNDRY_ACTIVATION_COMMITTED', success.errorCode);
  assert.strictEqual(success.truth.handsAssembled, true);
  assert.strictEqual(success.truth.explicitHostAuthorizationConsumed, true);
  assert.strictEqual(success.truth.foundrySelfAuthorized, false);
  assert.strictEqual(success.truth.candidateGenerated, true);
  assert.strictEqual(success.truth.candidateExecutedByParser, false);
  assert.strictEqual(success.truth.candidateExecutedByProvenanceVerifier, true);
  assert.strictEqual(success.truth.arbitraryCandidateExecution, false);
  assert.strictEqual(success.transactionReceipt.result, 'EDIT_TRANSACTION_COMMITTED');
  assert.strictEqual(success.transactionReceipt.parserReceipts.length, 4);
  assert.strictEqual(success.transactionReceipt.verifierReceipts[0].result, 'WORKSPACE_VERIFIER_PASS');
  assert.strictEqual(success.transactionReceipt.verifierReceipts[0].observations.result, 'PROVENANCE_LOCKED_RUNTIME_PASS');
  assert.strictEqual(success.authorReceipt.result, 'PYTHON_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY');
  assert.strictEqual(success.authorReceipt.parameters.sourceField, 'status');
  assert.strictEqual(fs.readFileSync(path.join(successFixture.workspaceRoot, 'src/application/capability.py'), 'utf8'), success.authorReceipt.candidates.source.content);
  assert.strictEqual(fs.readFileSync(path.join(successFixture.workspaceRoot, 'testing/application/selftest.py'), 'utf8'), success.authorReceipt.candidates.verification.content);
  assert.strictEqual(fs.readFileSync(path.join(successFixture.workspaceRoot, 'notes/human.txt'), 'utf8'), 'do not touch\n');
  const committedSnapshot = fixtureFactory.snapshot(successFixture.workspaceRoot);

  const replay = activationPlane.activate(activationInput);
  assert.strictEqual(replay.result, 'FOUNDRY_ACTIVATION_HELD');
  assert.strictEqual(replay.transactionReceipt.errorCode, 'EDIT_WORKSPACE_DRIFT_SINCE_PLACEMENT');
  assert.deepStrictEqual(fixtureFactory.snapshot(successFixture.workspaceRoot), committedSnapshot);
  adversarialHolds += 1;

  const missingAuthorizationFixture = fixture('axm-activation-no-auth-');
  const missingAuthorizationSelection = fixtureFactory.recipeSelection();
  hold(missingAuthorizationFixture, missingAuthorizationSelection, null, /AUTHORIZATION_INVALID/);

  const tamperedManifestFixture = fixture('axm-activation-manifest-digest-');
  const tamperedManifestSelection = fixtureFactory.recipeSelection();
  const tamperedManifestAuthorization = fixtureFactory.authorization(tamperedManifestFixture, environment, tamperedManifestSelection);
  hold(tamperedManifestFixture, tamperedManifestSelection, tamperedManifestAuthorization, /MANIFEST_DIGEST_MISMATCH/, value => ({...value, manifest: {...value.manifest, projectId: 'forged'}}));

  const rollbackCapsuleFixture = fixture('axm-activation-rollback-capsule-');
  const rollbackCapsuleSelection = fixtureFactory.recipeSelection();
  const rollbackManifest = clone(rollbackCapsuleFixture.manifest);
  const rollbackIndex = rollbackManifest.handCapsules.findIndex(value => value.handRole === 'rollback-writer');
  rollbackManifest.handCapsules[rollbackIndex].implementationId = 'forged-writer-v1';
  redigest(rollbackManifest.handCapsules[rollbackIndex], 'capsuleSha256');
  redigest(rollbackManifest, 'manifestSha256');
  rollbackCapsuleFixture.manifest = rollbackManifest;
  foundry.validateManifest(rollbackManifest);
  const rollbackCapsuleAuthorization = fixtureFactory.authorization(rollbackCapsuleFixture, environment, rollbackCapsuleSelection);
  hold(rollbackCapsuleFixture, rollbackCapsuleSelection, rollbackCapsuleAuthorization, /WRITER_CAPSULE_INVALID/);

  const tamperedSelectionFixture = fixture('axm-activation-selection-digest-');
  const tamperedSelection = fixtureFactory.recipeSelection(); tamperedSelection.parameters.sourceField = 'forged';
  const tamperedSelectionAuthorization = fixtureFactory.authorization(tamperedSelectionFixture, environment, tamperedSelection);
  hold(tamperedSelectionFixture, tamperedSelection, tamperedSelectionAuthorization, /RECIPE_SELECTION_DIGEST_MISMATCH/);

  const unsupportedRecipeFixture = fixture('axm-activation-recipe-');
  const unsupportedRecipe = fixtureFactory.recipeSelection(); unsupportedRecipe.recipeId = 'general-python'; redigest(unsupportedRecipe, 'selectionSha256');
  const unsupportedRecipeAuthorization = fixtureFactory.authorization(unsupportedRecipeFixture, environment, unsupportedRecipe);
  hold(unsupportedRecipeFixture, unsupportedRecipe, unsupportedRecipeAuthorization, /RECIPE_SELECTION_UNSUPPORTED/);

  const invalidParametersFixture = fixture('axm-activation-parameters-');
  const invalidParameters = fixtureFactory.recipeSelection({...fixtureFactory.recipeSelection().parameters, maxInputKeys: 0});
  const invalidParametersAuthorization = fixtureFactory.authorization(invalidParametersFixture, environment, invalidParameters);
  hold(invalidParametersFixture, invalidParameters, invalidParametersAuthorization, /maxInputKeys is outside the bounded range/);

  const authorizationBindingFixture = fixture('axm-activation-auth-binding-');
  const authorizationBindingSelection = fixtureFactory.recipeSelection();
  const authorizationBinding = fixtureFactory.authorization(authorizationBindingFixture, environment, authorizationBindingSelection, value => ({...value, manifestSha256: '0'.repeat(64)}));
  hold(authorizationBindingFixture, authorizationBindingSelection, authorizationBinding, /AUTHORIZATION_BINDING_INVALID/);

  const authorityFixture = fixture('axm-activation-authority-');
  const authoritySelection = fixtureFactory.recipeSelection();
  const badAuthority = fixtureFactory.authorization(authorityFixture, environment, authoritySelection, value => ({...value, authority: {...value.authority, arbitraryCandidateExecution: true}}));
  hold(authorityFixture, authoritySelection, badAuthority, /AUTHORIZATION_AUTHORITY_INVALID/);

  const staleFixture = fixture('axm-activation-stale-');
  const staleSelection = fixtureFactory.recipeSelection(); const now = Date.now();
  const staleAuthorization = fixtureFactory.authorization(staleFixture, environment, staleSelection, null, {issuedMs: now - 10000, expiresMs: now - 5000});
  hold(staleFixture, staleSelection, staleAuthorization, /AUTHORIZATION_STALE/);

  const parserBindingFixture = fixture('axm-activation-parser-binding-');
  const parserBindingSelection = fixtureFactory.recipeSelection();
  const parserBindingAuthorization = fixtureFactory.authorization(parserBindingFixture, environment, parserBindingSelection, value => ({...value, parserCapsuleSha256: '0'.repeat(64)}));
  hold(parserBindingFixture, parserBindingSelection, parserBindingAuthorization, /AUTHORIZATION_BINDING_INVALID/);

  const environmentFixture = fixture('axm-activation-environment-');
  const environmentSelection = fixtureFactory.recipeSelection();
  const environmentAuthorization = fixtureFactory.authorization(environmentFixture, environment, environmentSelection);
  const forgedEnvironment = clone(environment); forgedEnvironment.platform.os = 'forged';
  hold(environmentFixture, environmentSelection, environmentAuthorization, /ENVIRONMENT_OBSERVATION_DIGEST_MISMATCH/, value => ({...value, environmentObservation: forgedEnvironment}));

  const driftFixture = fixture('axm-activation-drift-');
  const driftSelection = fixtureFactory.recipeSelection();
  const driftAuthorization = fixtureFactory.authorization(driftFixture, environment, driftSelection);
  fixtureFactory.put(driftFixture.workspaceRoot, 'src/application/capability.py', 'def run(payload):\n    return {"external": payload}\n');
  const driftBefore = fixtureFactory.snapshot(driftFixture.workspaceRoot);
  const drift = activationPlane.activate(fixtureFactory.input(driftFixture, environment, driftSelection, driftAuthorization));
  assert.strictEqual(drift.result, 'FOUNDRY_ACTIVATION_HELD');
  assert.strictEqual(drift.transactionReceipt.errorCode, 'EDIT_WORKSPACE_DRIFT_SINCE_PLACEMENT');
  assert.strictEqual(drift.truth.handsAssembled, true);
  assert.strictEqual(drift.truth.workspaceMutationAttempted, false);
  assert.deepStrictEqual(fixtureFactory.snapshot(driftFixture.workspaceRoot), driftBefore);
  adversarialHolds += 1;

  console.log(JSON.stringify({
    ok: true,
    automaticHandAssembliesCommitted: 1,
    callerSuppliedCandidateBundles: 0,
    callerSuppliedParserContexts: 0,
    callerSuppliedVerifierAdapters: 0,
    authorReceipts: 1,
    pythonParserReceipts: success.transactionReceipt.parserReceipts.length,
    provenanceLockedVerifierPasses: 1,
    durableWriterTransactions: 1,
    rollbackCapsuleRequired: true,
    repeatedCommittedActivationsHeldByStateDrift: 1,
    underlyingDurableReplayProtectionReused: true,
    adversarialHolds,
    foundrySelfAuthorizations: 0,
    arbitraryCandidateExecutions: 0,
    generalPythonAuthoringClaimed: false,
    hostNamespaceSandboxUsable: environment.candidateExecutionIsolation.usable
  }, null, 2));
} finally {
  for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
}
