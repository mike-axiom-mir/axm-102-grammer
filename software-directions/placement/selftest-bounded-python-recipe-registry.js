'use strict';

const assert = require('assert');
const fs = require('fs');
const placementRegistry = require('./placement-registry.js');
const environmentHand = require('./toolchain-environment-hand.js');
const recipeRegistry = require('./bounded-python-recipe-registry.js');
const fixtureFactory = require('./foundry-activation-test-fixture.js');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function redigest(value, field) { delete value[field]; value[field] = placementRegistry.hash(value); return value; }

const environment = environmentHand.inspect();
const fixture = fixtureFactory.create(environment, 'axm-recipe-registry-');
let adversarialHolds = 0;
function rejects(action, code) { assert.throws(action, code); adversarialHolds += 1; }

try {
  const before = fixtureFactory.snapshot(fixture.workspaceRoot);
  const validated = recipeRegistry.validateRegistry();
  assert.strictEqual(validated.registrySha256, recipeRegistry.REGISTRY.registrySha256);
  assert.deepStrictEqual(validated.entries.map(value => value.recipeId), ['bounded-python-record-transform', 'bounded-python-required-fields']);
  assert.strictEqual(new Set(validated.entries.map(value => value.entrySha256)).size, 2);
  assert.strictEqual(validated.entries.every(value => value.generalPythonAuthoring === false && value.arbitraryCandidateExecution === false), true);

  const recordSelection = fixtureFactory.recipeSelection();
  const requiredSelection = fixtureFactory.recipeSelection(null, 'bounded-python-required-fields');
  const recordRuntime = recipeRegistry.validateSelection(recordSelection);
  const requiredRuntime = recipeRegistry.validateSelection(requiredSelection);
  assert.strictEqual(recordRuntime.descriptor.recipeId, 'bounded-python-record-transform');
  assert.strictEqual(requiredRuntime.descriptor.recipeId, 'bounded-python-required-fields');
  assert.strictEqual(Object.isFrozen(recordRuntime), true); assert.strictEqual(Object.isFrozen(requiredRuntime), true);
  assert.strictEqual(Object.hasOwn(recordRuntime, 'authorHand'), false); assert.strictEqual(Object.hasOwn(requiredRuntime, 'verifierFactory'), false);
  assert.notStrictEqual(recordRuntime.descriptor.builderSha256, requiredRuntime.descriptor.builderSha256);
  assert.notStrictEqual(recordRuntime.descriptor.verifierRunnerSha256, requiredRuntime.descriptor.verifierRunnerSha256);

  const authorReceipt = requiredRuntime.author({placementPlan: fixture.placementPlan, parameters: requiredSelection.parameters});
  requiredRuntime.validateAuthorReceipt(authorReceipt);
  assert.strictEqual(authorReceipt.result, requiredRuntime.descriptor.authorReadyResult);
  const verifier = requiredRuntime.createVerifier({authorReceipt, environmentObservation: environment});
  const verification = verifier.verify({placementPlanSha256: fixture.placementPlan.planSha256, source: authorReceipt.candidates.source, verification: authorReceipt.candidates.verification});
  assert.strictEqual(verification.passed, true, verification.observations.errorCode);
  assert.strictEqual(verification.observations.exactRegisteredCandidateExecuted, true);
  assert.strictEqual(verification.observations.arbitraryCandidateExecution, false);
  const substitutedContent = authorReceipt.candidates.source.content + '# substituted\n';
  const substituted = verifier.verify({placementPlanSha256: fixture.placementPlan.planSha256, source: {...authorReceipt.candidates.source, content: substitutedContent, contentSha256: fixtureFactory.sha256(Buffer.from(substitutedContent, 'utf8'))}, verification: authorReceipt.candidates.verification});
  assert.strictEqual(substituted.passed, false); assert.strictEqual(substituted.observations.errorCode, 'EXACT_REGISTERED_CANDIDATE_REQUIRED'); adversarialHolds += 1;

  const forgedRegistry = clone(recipeRegistry.REGISTRY); forgedRegistry.entries[0].builderId = 'forged';
  rejects(() => recipeRegistry.validateRegistry(forgedRegistry), /REGISTRY_DIGEST_MISMATCH/);
  const badSelectionDigest = clone(recordSelection); badSelectionDigest.parameters.sourceField = 'forged';
  rejects(() => recipeRegistry.validateSelection(badSelectionDigest), /SELECTION_DIGEST_MISMATCH/);
  const unknownRecipe = clone(recordSelection); unknownRecipe.recipeId = 'unregistered-python'; redigest(unknownRecipe, 'selectionSha256');
  rejects(() => recipeRegistry.validateSelection(unknownRecipe), /RECIPE_UNSUPPORTED/);
  const wrongBuilder = clone(requiredSelection); wrongBuilder.builderSha256 = recordSelection.builderSha256; redigest(wrongBuilder, 'selectionSha256');
  rejects(() => recipeRegistry.validateSelection(wrongBuilder), /SELECTION_BINDING_INVALID/);
  const wrongVerifier = clone(requiredSelection); wrongVerifier.verifierRunnerSha256 = recordSelection.verifierRunnerSha256; redigest(wrongVerifier, 'selectionSha256');
  rejects(() => recipeRegistry.validateSelection(wrongVerifier), /SELECTION_BINDING_INVALID/);
  rejects(() => recipeRegistry.createSelection('bounded-python-required-fields', {...requiredSelection.parameters, requiredFields: []}), /requiredFields is outside the bounded range/);
  const recordReceipt = recordRuntime.author({placementPlan: fixture.placementPlan, parameters: recordSelection.parameters});
  recordRuntime.validateAuthorReceipt(recordReceipt);
  rejects(() => requiredRuntime.createVerifier({authorReceipt: recordReceipt, environmentObservation: environment}), /PYTHON_REQUIRED_FIELDS_AUTHOR_RECEIPT_BINDING_INVALID/);

  assert.deepStrictEqual(fixtureFactory.snapshot(fixture.workspaceRoot), before);
  console.log(JSON.stringify({
    ok: true,
    registrySha256: recipeRegistry.REGISTRY.registrySha256,
    registeredRecipeCount: validated.entries.length,
    independentlyBoundBuilderCount: new Set(validated.entries.map(value => value.builderSha256)).size,
    independentlyBoundVerifierRunnerCount: new Set(validated.entries.map(value => value.verifierRunnerSha256)).size,
    requiredFieldsAuthorReceipts: 1,
    requiredFieldsProvenanceLockedVerifierPasses: 1,
    crossRecipeDispatches: 0,
    mutableModuleRouterSurfaces: 0,
    arbitraryCandidateExecutions: 0,
    workspaceMutations: 0,
    adversarialHolds
  }, null, 2));
} finally {
  fs.rmSync(fixture.harnessRoot, {recursive: true, force: true});
}
