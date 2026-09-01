'use strict';

const placementRegistry = require('./placement-registry.js');
const recordAuthor = require('./bounded-python-record-transform-author-hand.js');
const recordVerifier = require('./bounded-python-record-transform-verifier-adapter.js');
const requiredFieldsAuthor = require('./bounded-python-required-fields-author-hand.js');
const requiredFieldsVerifier = require('./bounded-python-required-fields-verifier-adapter.js');

const HEX64 = /^[a-f0-9]{64}$/;
const REGISTRY_ID = 'bounded-python-recipe-registry-v1';

function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }

function descriptor(body) { return freeze({...body, entrySha256: placementRegistry.hash(body)}); }

const RUNTIMES = freeze([
  freeze({
    descriptor: descriptor({
      recipeId: recordAuthor.DONOR.recipeId, recipeSha256: recordAuthor.DONOR.recipeSha256,
      builderId: recordAuthor.DONOR.builderId, builderSha256: recordAuthor.DONOR.builderSha256,
      authorReceiptSchema: 'axm.code.bounded-python-record-transform-author-receipt.v1', authorReadyResult: 'PYTHON_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY',
      verifierId: recordVerifier.ADAPTER_ID, verifierRunnerSha256: recordVerifier.RUNNER_SHA256,
      provenanceClass: 'EXTERNAL_REVIEWED_DONOR_DIGEST_BOUND', generalPythonAuthoring: false, arbitraryCandidateExecution: false
    }),
    author: recordAuthor.author, validateAuthorReceipt: recordAuthor.validateReceipt, createVerifier: recordVerifier.create,
    validateParameters(parameters) { return recordAuthor.buildPythonRecordTransform(parameters); }
  }),
  freeze({
    descriptor: descriptor({
      recipeId: requiredFieldsAuthor.RECIPE.recipeId, recipeSha256: requiredFieldsAuthor.RECIPE.recipeSha256,
      builderId: requiredFieldsAuthor.RECIPE.builderId, builderSha256: requiredFieldsAuthor.implementationSha256(),
      authorReceiptSchema: 'axm.code.bounded-python-required-fields-author-receipt.v1', authorReadyResult: 'PYTHON_REQUIRED_FIELDS_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY',
      verifierId: requiredFieldsVerifier.ADAPTER_ID, verifierRunnerSha256: requiredFieldsVerifier.RUNNER_SHA256,
      provenanceClass: 'CURRENT_SOURCE_AND_ADVERSARIAL_TEST_BOUND', generalPythonAuthoring: false, arbitraryCandidateExecution: false
    }),
    author: requiredFieldsAuthor.author, validateAuthorReceipt: requiredFieldsAuthor.validateReceipt, createVerifier: requiredFieldsVerifier.create,
    validateParameters(parameters) { return requiredFieldsAuthor.buildPythonRequiredFields(parameters); }
  })
].sort((left, right) => left.descriptor.recipeId.localeCompare(right.descriptor.recipeId)));

const REGISTRY_BODY = freeze({schema: 'axm.code.bounded-python-recipe-registry.v1', version: '1.0.0', status: 'TEST', registryId: REGISTRY_ID, entries: RUNTIMES.map(value => value.descriptor)});
const REGISTRY = freeze({...REGISTRY_BODY, registrySha256: placementRegistry.hash(REGISTRY_BODY)});

function validateRegistry(value = REGISTRY) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !HEX64.test(value.registrySha256 || '')) throw Error('BOUNDED_RECIPE_REGISTRY_INVALID');
  const body = {...value}; delete body.registrySha256;
  if (placementRegistry.hash(body) !== value.registrySha256) throw Error('BOUNDED_RECIPE_REGISTRY_DIGEST_MISMATCH');
  if (value.schema !== REGISTRY.schema || value.version !== REGISTRY.version || value.status !== 'TEST' || value.registryId !== REGISTRY_ID || value.registrySha256 !== REGISTRY.registrySha256 || placementRegistry.canon(value.entries) !== placementRegistry.canon(REGISTRY.entries)) throw Error('BOUNDED_RECIPE_REGISTRY_BINDING_INVALID');
  return value;
}

function get(recipeId) {
  validateRegistry();
  return RUNTIMES.find(value => value.descriptor.recipeId === recipeId) || null;
}

function selectionBody(runtime, parameters) {
  return {
    schema: 'axm.code.foundry-recipe-selection.v1', version: '1.0.0', registrySha256: REGISTRY.registrySha256,
    recipeId: runtime.descriptor.recipeId, recipeSha256: runtime.descriptor.recipeSha256, entrySha256: runtime.descriptor.entrySha256,
    builderId: runtime.descriptor.builderId, builderSha256: runtime.descriptor.builderSha256,
    verifierId: runtime.descriptor.verifierId, verifierRunnerSha256: runtime.descriptor.verifierRunnerSha256,
    parameters: JSON.parse(placementRegistry.canon(parameters))
  };
}

function createSelection(recipeId, parameters) {
  const runtime = get(recipeId);
  if (!runtime) throw Error('BOUNDED_RECIPE_REGISTRY_RECIPE_UNSUPPORTED');
  runtime.validateParameters(parameters);
  const body = selectionBody(runtime, parameters);
  return freeze({...body, selectionSha256: placementRegistry.hash(body)});
}

function validateSelection(value) {
  validateRegistry();
  if (!value || typeof value !== 'object' || Array.isArray(value) || !HEX64.test(value.selectionSha256 || '')) throw Error('BOUNDED_RECIPE_REGISTRY_SELECTION_INVALID');
  const body = {...value}; delete body.selectionSha256;
  if (placementRegistry.hash(body) !== value.selectionSha256) throw Error('BOUNDED_RECIPE_REGISTRY_SELECTION_DIGEST_MISMATCH');
  const expectedKeys = ['builderId', 'builderSha256', 'entrySha256', 'parameters', 'recipeId', 'recipeSha256', 'registrySha256', 'schema', 'selectionSha256', 'verifierId', 'verifierRunnerSha256', 'version'].sort();
  if (placementRegistry.canon(Object.keys(value).sort()) !== placementRegistry.canon(expectedKeys)) throw Error('BOUNDED_RECIPE_REGISTRY_SELECTION_KEYS_INVALID');
  if (value.schema !== 'axm.code.foundry-recipe-selection.v1' || value.version !== '1.0.0' || value.registrySha256 !== REGISTRY.registrySha256) throw Error('BOUNDED_RECIPE_REGISTRY_SELECTION_HEADER_INVALID');
  const runtime = get(value.recipeId);
  if (!runtime) throw Error('BOUNDED_RECIPE_REGISTRY_RECIPE_UNSUPPORTED');
  const expected = selectionBody(runtime, value.parameters);
  if (placementRegistry.canon(body) !== placementRegistry.canon(expected)) throw Error('BOUNDED_RECIPE_REGISTRY_SELECTION_BINDING_INVALID');
  runtime.validateParameters(value.parameters);
  return runtime;
}

function capsuleBinding() {
  return freeze({registryId: REGISTRY_ID, registrySha256: REGISTRY.registrySha256, recipeCount: REGISTRY.entries.length, recipeIds: REGISTRY.entries.map(value => value.recipeId), entrySha256s: REGISTRY.entries.map(value => value.entrySha256)});
}

module.exports = {REGISTRY_ID, REGISTRY, validateRegistry, get, createSelection, validateSelection, capsuleBinding};
