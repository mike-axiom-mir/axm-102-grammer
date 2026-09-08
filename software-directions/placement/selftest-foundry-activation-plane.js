'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const registry = require('./placement-registry.js');
const environmentHand = require('./toolchain-environment-hand.js');
const foundry = require('./hand-foundry-plane.js');
const activationPlane = require('./foundry-activation-plane.js');
const fixtureFactory = require('./foundry-activation-test-fixture.js');
const recipeRegistry = require('./bounded-python-recipe-registry.js');

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

  const secondFixture = fixture('axm-activation-required-fields-success-');
  const secondSelection = fixtureFactory.recipeSelection(null, 'bounded-python-required-fields');
  const secondAuthorization = fixtureFactory.authorization(secondFixture, environment, secondSelection);
  const secondInput = fixtureFactory.input(secondFixture, environment, secondSelection, secondAuthorization);
  assert.strictEqual(Object.hasOwn(secondInput, 'candidates'), false);
  assert.strictEqual(Object.hasOwn(secondInput, 'parserContext'), false);
  assert.strictEqual(Object.hasOwn(secondInput, 'verifierAdapters'), false);
  const second = activationPlane.activate(secondInput);
  assert.strictEqual(second.result, 'FOUNDRY_ACTIVATION_COMMITTED', second.errorCode);
  assert.strictEqual(second.recipeId, 'bounded-python-required-fields');
  assert.strictEqual(second.recipeRegistrySha256, recipeRegistry.REGISTRY.registrySha256);
  assert.strictEqual(second.authorReceipt.result, 'PYTHON_REQUIRED_FIELDS_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY');
  assert.strictEqual(second.authorReceipt.parameters.requiredFields.length, 2);
  assert.match(second.authorReceipt.candidates.source.content, /REQUIRED_FIELDS_MISSING/);
  assert.strictEqual(second.transactionReceipt.parserReceipts.length, 4);
  assert.strictEqual(second.transactionReceipt.verifierReceipts[0].result, 'WORKSPACE_VERIFIER_PASS');
  assert.strictEqual(second.transactionReceipt.verifierReceipts[0].observations.exactRegisteredCandidateExecuted, true);
  assert.strictEqual(second.truth.candidateExecutedByProvenanceVerifier, true);
  assert.strictEqual(second.truth.crossRecipeDispatch, false);
  assert.strictEqual(fs.readFileSync(path.join(secondFixture.workspaceRoot, 'notes/human.txt'), 'utf8'), 'do not touch\n');

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

  const manifestRegistryFixture = fixture('axm-activation-manifest-registry-');
  const manifestRegistrySelection = fixtureFactory.recipeSelection();
  const registryManifest = clone(manifestRegistryFixture.manifest);
  const authorIndex = registryManifest.handCapsules.findIndex(value => ['language-aware-file-creator', 'language-aware-structural-editor'].includes(value.handRole));
  registryManifest.handCapsules[authorIndex].implementationSha256 = '0'.repeat(64);
  registryManifest.handCapsules[authorIndex].recipeRegistryBinding.registrySha256 = '0'.repeat(64);
  redigest(registryManifest.handCapsules[authorIndex], 'capsuleSha256'); redigest(registryManifest, 'manifestSha256');
  manifestRegistryFixture.manifest = registryManifest; foundry.validateManifest(registryManifest);
  const manifestRegistryAuthorization = fixtureFactory.authorization(manifestRegistryFixture, environment, manifestRegistrySelection);
  hold(manifestRegistryFixture, manifestRegistrySelection, manifestRegistryAuthorization, /AUTHOR_CAPSULE_INVALID/);

  const tamperedSelectionFixture = fixture('axm-activation-selection-digest-');
  const validTamperedSelection = fixtureFactory.recipeSelection(); const tamperedSelectionAuthorization = fixtureFactory.authorization(tamperedSelectionFixture, environment, validTamperedSelection); const tamperedSelection = clone(validTamperedSelection); tamperedSelection.parameters.sourceField = 'forged';
  hold(tamperedSelectionFixture, tamperedSelection, tamperedSelectionAuthorization, /SELECTION_DIGEST_MISMATCH/);

  const unsupportedRecipeFixture = fixture('axm-activation-recipe-');
  const supportedRecipe = fixtureFactory.recipeSelection(); const unsupportedRecipeAuthorization = fixtureFactory.authorization(unsupportedRecipeFixture, environment, supportedRecipe);
  const unsupportedRecipe = clone(supportedRecipe); unsupportedRecipe.recipeId = 'general-python'; redigest(unsupportedRecipe, 'selectionSha256');
  hold(unsupportedRecipeFixture, unsupportedRecipe, unsupportedRecipeAuthorization, /RECIPE_UNSUPPORTED/);

  const invalidParametersFixture = fixture('axm-activation-parameters-');
  const validParameters = fixtureFactory.recipeSelection(); const invalidParametersAuthorization = fixtureFactory.authorization(invalidParametersFixture, environment, validParameters);
  const invalidParameters = clone(validParameters); invalidParameters.parameters.maxInputKeys = 0; redigest(invalidParameters, 'selectionSha256');
  hold(invalidParametersFixture, invalidParameters, invalidParametersAuthorization, /maxInputKeys is outside the bounded range/);

  const registryBindingFixture = fixture('axm-activation-registry-binding-');
  const registryBindingSelection = fixtureFactory.recipeSelection();
  const registryBindingAuthorization = fixtureFactory.authorization(registryBindingFixture, environment, registryBindingSelection);
  const forgedRegistrySelection = clone(registryBindingSelection); forgedRegistrySelection.registrySha256 = '0'.repeat(64); redigest(forgedRegistrySelection, 'selectionSha256');
  hold(registryBindingFixture, forgedRegistrySelection, registryBindingAuthorization, /SELECTION_HEADER_INVALID/);

  const crossRecipeFixture = fixture('axm-activation-cross-recipe-');
  const requiredSelection = fixtureFactory.recipeSelection(null, 'bounded-python-required-fields');
  const crossRecipeAuthorization = fixtureFactory.authorization(crossRecipeFixture, environment, requiredSelection);
  const recordSelection = fixtureFactory.recipeSelection();
  const crossRecipeSelection = clone(requiredSelection); crossRecipeSelection.builderId = recordSelection.builderId; crossRecipeSelection.builderSha256 = recordSelection.builderSha256; redigest(crossRecipeSelection, 'selectionSha256');
  hold(crossRecipeFixture, crossRecipeSelection, crossRecipeAuthorization, /SELECTION_BINDING_INVALID/);

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
    registrySha256: recipeRegistry.REGISTRY.registrySha256,
    registeredRecipeCount: recipeRegistry.REGISTRY.entries.length,
    distinctRegisteredRecipesActivated: 2,
    automaticHandAssembliesCommitted: 2,
    callerSuppliedCandidateBundles: 0,
    callerSuppliedParserContexts: 0,
    callerSuppliedVerifierAdapters: 0,
    authorReceipts: 2,
    pythonParserReceipts: success.transactionReceipt.parserReceipts.length + second.transactionReceipt.parserReceipts.length,
    provenanceLockedVerifierPasses: 2,
    durableWriterTransactions: 2,
    rollbackCapsuleRequired: true,
    repeatedCommittedActivationsHeldByStateDrift: 1,
    underlyingDurableReplayProtectionReused: true,
    crossRecipeDispatches: 0,
    adversarialHolds,
    foundrySelfAuthorizations: 0,
    arbitraryCandidateExecutions: 0,
    generalPythonAuthoringClaimed: false,
    hostNamespaceSandboxUsable: environment.candidateExecutionIsolation.usable
  }, null, 2));
} finally {
  for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
}
