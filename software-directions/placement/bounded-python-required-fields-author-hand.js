'use strict';

const crypto = require('crypto');
const path = require('path');
const organs = require('../../language-organs/registry.js');
const registry = require('./placement-registry.js');

const RECIPE_BODY = Object.freeze({origin: 'axm-102-grammar-reviewed-bounded-recipe', reviewClass: 'SOURCE_AND_ADVERSARIAL_TEST_BOUND', recipeId: 'bounded-python-required-fields', version: '1.0.0', builderId: 'bounded-python-required-fields-v1'});
const RECIPE = Object.freeze({...RECIPE_BODY, recipeSha256: registry.hash(RECIPE_BODY)});
const AUTHORITY = Object.freeze({candidateGeneration: true, candidateExecution: false, workspaceRead: false, workspaceMutation: false, network: false, install: false, deployment: false, promotion: false, canon: false});
const HEX64 = /^[a-f0-9]{64}$/;

function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function receipt(body) { return freeze({...body, authorReceiptSha256: registry.hash(body)}); }

function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(label + ' must be an object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw Error(label + ' contains unsupported key ' + key);
  for (const key of keys) if (!Object.hasOwn(value, key)) throw Error(label + ' is missing ' + key);
}

function pythonField(value, label) {
  const text = String(value || '');
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(text)) throw Error(label + ' is invalid');
  return text;
}

function pythonRequiredFieldsSource(config) {
  return [
    '# Generated deterministic candidate. Static data until a separately authorized host executes it.',
    'import json',
    '',
    'CONFIG = ' + JSON.stringify(config),
    '',
    'def _json_bytes(value):',
    '    try:',
    '        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)',
    '        return len(encoded.encode("utf-8"))',
    '    except (TypeError, ValueError, OverflowError, RecursionError):',
    '        return CONFIG["maxInputBytes"] + 1',
    '',
    'def run(payload):',
    '    if type(payload) is not dict:',
    '        return {"schema": CONFIG["resultSchemaId"], "ok": False, "code": "INPUT_OBJECT_REQUIRED"}',
    '    if any(type(key) is not str for key in payload):',
    '        return {"schema": CONFIG["resultSchemaId"], "ok": False, "code": "INPUT_KEY_INVALID"}',
    '    if len(payload) > CONFIG["maxInputKeys"]:',
    '        return {"schema": CONFIG["resultSchemaId"], "ok": False, "code": "INPUT_KEY_LIMIT"}',
    '    if _json_bytes(payload) > CONFIG["maxInputBytes"]:',
    '        return {"schema": CONFIG["resultSchemaId"], "ok": False, "code": "INPUT_BYTES_EXCEEDED"}',
    '    missing = [field for field in CONFIG["requiredFields"] if field not in payload]',
    '    if missing:',
    '        return {"schema": CONFIG["resultSchemaId"], "ok": False, "code": "REQUIRED_FIELDS_MISSING", "fields": missing}',
    '    invalid = [field for field in CONFIG["requiredFields"] if type(payload[field]) is not str or not payload[field].strip()]',
    '    if invalid:',
    '        return {"schema": CONFIG["resultSchemaId"], "ok": False, "code": "REQUIRED_FIELD_VALUE_INVALID", "fields": invalid}',
    '    extra = sorted([key for key in payload if key not in CONFIG["requiredFields"]])',
    '    if extra and not CONFIG["allowExtraFields"]:',
    '        return {"schema": CONFIG["resultSchemaId"], "ok": False, "code": "EXTRA_FIELDS_REFUSED", "fields": extra}',
    '    output = {field: payload[field] for field in CONFIG["requiredFields"]}',
    '    return {"schema": CONFIG["resultSchemaId"], "ok": True, "output": output}',
    ''
  ].join('\n');
}

function pythonRequiredFieldsSelftest(config) {
  const valid = Object.fromEntries(config.requiredFields.map((field, index) => [field, 'value-' + String(index + 1)]));
  return [
    '# Emitted verification candidate. Not executed by the author Hand.',
    'from capability import CONFIG, run',
    '',
    'valid = ' + JSON.stringify(valid),
    'first = run(valid)',
    'second = run(valid)',
    'assert first == second',
    'assert first["ok"] is True',
    'assert list(first["output"]) == CONFIG["requiredFields"]',
    'assert run([])["code"] == "INPUT_OBJECT_REQUIRED"',
    'assert run({})["code"] == "REQUIRED_FIELDS_MISSING"',
    'invalid = dict(valid)',
    'invalid[CONFIG["requiredFields"][0]] = ""',
    'assert run(invalid)["code"] == "REQUIRED_FIELD_VALUE_INVALID"',
    'print("PASS bounded Python required-fields candidate")',
    ''
  ].join('\n');
}

function buildPythonRequiredFields(parameters) {
  exactObject(parameters, ['resultSchemaId', 'requiredFields', 'allowExtraFields', 'maxInputKeys', 'maxInputBytes'], 'parameters');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/+-]{2,179}$/.test(parameters.resultSchemaId || '')) throw Error('resultSchemaId is invalid');
  if (!Array.isArray(parameters.requiredFields) || parameters.requiredFields.length < 1 || parameters.requiredFields.length > 16) throw Error('requiredFields is outside the bounded range');
  const requiredFields = parameters.requiredFields.map((value, index) => pythonField(value, 'requiredFields[' + index + ']'));
  if (new Set(requiredFields).size !== requiredFields.length) throw Error('requiredFields contains a duplicate');
  requiredFields.sort();
  if (typeof parameters.allowExtraFields !== 'boolean') throw Error('allowExtraFields must be boolean');
  if (!Number.isInteger(parameters.maxInputKeys) || parameters.maxInputKeys < requiredFields.length || parameters.maxInputKeys > 128) throw Error('maxInputKeys is outside the bounded range');
  if (!Number.isInteger(parameters.maxInputBytes) || parameters.maxInputBytes < 128 || parameters.maxInputBytes > 65536) throw Error('maxInputBytes is outside the bounded range');
  const config = {resultSchemaId: parameters.resultSchemaId, requiredFields, allowExtraFields: parameters.allowExtraFields ? 1 : 0, maxInputKeys: parameters.maxInputKeys, maxInputBytes: parameters.maxInputBytes};
  return {capabilityKind: 'HAND', source: pythonRequiredFieldsSource(config), selftest: pythonRequiredFieldsSelftest(config), provides: [parameters.resultSchemaId], consumes: ['application/json'], summary: 'Pure bounded Python validator for one exact set of required non-empty string fields.'};
}

function implementationSha256() {
  const material = {id: RECIPE.builderId, capabilityKind: 'HAND', status: 'SOURCE_AND_ADVERSARIAL_TEST_BOUND', implementation: [exactObject, pythonField, pythonRequiredFieldsSource, pythonRequiredFieldsSelftest, buildPythonRequiredFields].map(value => String(value).replace(/\r\n/g, '\n'))};
  return registry.hash(material);
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || !HEX64.test(plan.planSha256 || '')) throw Error('PYTHON_REQUIRED_FIELDS_AUTHOR_PLACEMENT_PLAN_INVALID');
  const body = {...plan}; delete body.planSha256;
  if (registry.hash(body) !== plan.planSha256) throw Error('PYTHON_REQUIRED_FIELDS_AUTHOR_PLACEMENT_PLAN_DIGEST_MISMATCH');
  const organ = organs.getByLanguageId('python'); const profile = organs.grammarProfile('python');
  if (plan.schema !== 'axm.code.placement-plan.v1' || plan.result !== 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY' || plan.languageBinding?.languageId !== 'python' || plan.languageBinding?.organSha256 !== organ?.sha256 || plan.languageBinding?.grammarProfileSha256 !== profile?.profileSha256) throw Error('PYTHON_REQUIRED_FIELDS_AUTHOR_PLACEMENT_PLAN_BINDING_INVALID');
  if (path.posix.basename(plan.sourcePlacement?.targetPath || '') !== 'capability.py' || path.posix.basename(plan.verificationPlacement?.targetPath || '') !== 'selftest.py' || !plan.sourcePlacement.expectedExports?.includes('run')) throw Error('PYTHON_REQUIRED_FIELDS_AUTHOR_LAYOUT_REQUIRED');
  return plan;
}

function author({placementPlan = null, parameters = null} = {}) {
  try {
    validatePlan(placementPlan);
    const generated = buildPythonRequiredFields(parameters);
    const source = {schema: 'axm.code.edit-candidate.v1', version: '1.0.0', lane: 'source', targetPath: placementPlan.sourcePlacement.targetPath, languageId: 'python', content: generated.source, contentSha256: sha256(Buffer.from(generated.source, 'utf8'))};
    const verification = {schema: 'axm.code.edit-candidate.v1', version: '1.0.0', lane: 'verification', targetPath: placementPlan.verificationPlacement.targetPath, languageId: 'python', content: generated.selftest, contentSha256: sha256(Buffer.from(generated.selftest, 'utf8'))};
    const body = {schema: 'axm.code.bounded-python-required-fields-author-receipt.v1', version: '1.0.0', status: 'TEST', result: 'PYTHON_REQUIRED_FIELDS_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY', errorCode: null, placementPlanSha256: placementPlan.planSha256, parameters: JSON.parse(registry.canon(parameters)), recipe: {...RECIPE, builderSha256: implementationSha256()}, candidates: {source, verification}, provides: generated.provides, consumes: generated.consumes, summary: generated.summary, truth: {implementationDigestBound: true, candidateGenerated: true, candidateExecuted: false, workspaceRead: false, workspaceMutation: false, generalPythonAuthoringClaimed: false, runtimeCorrectnessClaimedByAuthor: false}, authority: AUTHORITY};
    return receipt(body);
  } catch (error) {
    return receipt({schema: 'axm.code.bounded-python-required-fields-author-receipt.v1', version: '1.0.0', status: 'TEST', result: 'PYTHON_REQUIRED_FIELDS_AUTHOR_HELD', errorCode: String(error?.message || 'PYTHON_REQUIRED_FIELDS_AUTHOR_FAILED'), truth: {candidateGenerated: false, candidateExecuted: false, workspaceRead: false, workspaceMutation: false, generalPythonAuthoringClaimed: false, runtimeCorrectnessClaimedByAuthor: false}, authority: AUTHORITY});
  }
}

function validateReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !HEX64.test(value.authorReceiptSha256 || '')) throw Error('PYTHON_REQUIRED_FIELDS_AUTHOR_RECEIPT_INVALID');
  const body = {...value}; delete body.authorReceiptSha256;
  if (registry.hash(body) !== value.authorReceiptSha256) throw Error('PYTHON_REQUIRED_FIELDS_AUTHOR_RECEIPT_DIGEST_MISMATCH');
  if (value.schema !== 'axm.code.bounded-python-required-fields-author-receipt.v1' || value.version !== '1.0.0' || value.status !== 'TEST' || value.result !== 'PYTHON_REQUIRED_FIELDS_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY' || value.errorCode !== null || !HEX64.test(value.placementPlanSha256 || '') || value.recipe?.recipeId !== RECIPE.recipeId || value.recipe?.recipeSha256 !== RECIPE.recipeSha256 || value.recipe?.builderId !== RECIPE.builderId || value.recipe?.builderSha256 !== implementationSha256() || value.truth?.candidateExecuted !== false || value.truth?.generalPythonAuthoringClaimed !== false || value.authority?.workspaceMutation !== false) throw Error('PYTHON_REQUIRED_FIELDS_AUTHOR_RECEIPT_BINDING_INVALID');
  const generated = buildPythonRequiredFields(value.parameters);
  if (registry.canon({provides: value.provides, consumes: value.consumes, summary: value.summary}) !== registry.canon({provides: generated.provides, consumes: generated.consumes, summary: generated.summary})) throw Error('PYTHON_REQUIRED_FIELDS_AUTHOR_RECEIPT_OUTPUT_METADATA_MISMATCH');
  for (const [lane, content, basename] of [['source', generated.source, 'capability.py'], ['verification', generated.selftest, 'selftest.py']]) {
    const candidate = value.candidates?.[lane];
    if (!candidate || candidate.schema !== 'axm.code.edit-candidate.v1' || candidate.version !== '1.0.0' || candidate.lane !== lane || candidate.languageId !== 'python' || path.posix.basename(candidate.targetPath || '') !== basename || candidate.content !== content || candidate.contentSha256 !== sha256(Buffer.from(content, 'utf8'))) throw Error('PYTHON_REQUIRED_FIELDS_AUTHOR_RECEIPT_CANDIDATE_MISMATCH');
  }
  return value;
}

module.exports = {AUTHORITY, RECIPE, implementationSha256, buildPythonRequiredFields, author, validateReceipt};
