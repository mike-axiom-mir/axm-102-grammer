'use strict';

const crypto = require('crypto');
const path = require('path');
const organs = require('../../language-organs/registry.js');
const registry = require('./placement-registry.js');

const DONOR = Object.freeze({repository: 'mike-axiom-mir/axm-collaboration-platform', pullRequest: 51, head: '085a4b4e32d626d212babbfa0c5fd1d33e8f7ff4', builderId: 'bounded-python-record-transform-v1', builderSha256: 'ad281fa5a1381de86d71e1c4a2ffbad30ee20683cb705b4a09d778464ea5227c', recipeId: 'bounded-python-record-transform', recipeSha256: '82d04d8b78e44978f4d5a42c8c7fb62b944279c89dd498f1268d3cfa97bc5637'});
const AUTHORITY = Object.freeze({candidateGeneration: true, candidateExecution: false, workspaceRead: false, workspaceMutation: false, network: false, install: false, deployment: false, promotion: false, canon: false});
const HEX64 = /^[a-f0-9]{64}$/;

function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function receipt(body) { return freeze({...body, authorReceiptSha256: registry.hash(body)}); }

// The six functions below retain the exact PR #51 donor contribution. Their
// Function#toString values reproduce the donor implementation digest.
function htmlExact(value,keys,label){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(label+' must be an object');
    Object.keys(value).forEach(function(key){if(!keys.includes(key))throw new Error(label+' contains unsupported key '+key);});
    keys.forEach(function(key){if(!Object.prototype.hasOwnProperty.call(value,key))throw new Error(label+' is missing '+key);});
  }
function pythonField(value,label){
    const text=String(value||'');
    if(!/^[a-z][a-z0-9_]{0,63}$/.test(text))throw new Error(label+' is invalid');
    return text;
  }
function pythonText(value,label,maximum){
    const text=String(value==null?'':value);
    if(!text.trim()||text.length>maximum||text.includes('\u0000'))throw new Error(label+' is invalid');
    return text;
  }
function pythonRecordTransformSource(config){
    return [
      '# Generated deterministic candidate. Static data until a separately authorized host executes it.',
      'import json',
      '',
      'CONFIG = '+JSON.stringify(config),
      '',
      'def _json_bytes(value):',
      '    try:',
      '        encoded = json.dumps(value, sort_keys=True, separators=(\",\", \":\"), ensure_ascii=False, allow_nan=False)',
      '        return len(encoded.encode(\"utf-8\"))',
      '    except (TypeError, ValueError, OverflowError, RecursionError):',
      '        return CONFIG[\"maxInputBytes\"] + 1',
      '',
      'def run(payload):',
      '    if type(payload) is not dict:',
      '        return {\"schema\": CONFIG[\"resultSchemaId\"], \"ok\": False, \"code\": \"INPUT_OBJECT_REQUIRED\"}',
      '    if any(type(key) is not str for key in payload):',
      '        return {\"schema\": CONFIG[\"resultSchemaId\"], \"ok\": False, \"code\": \"INPUT_KEY_INVALID\"}',
      '    if len(payload) > CONFIG[\"maxInputKeys\"]:',
      '        return {\"schema\": CONFIG[\"resultSchemaId\"], \"ok\": False, \"code\": \"INPUT_KEY_LIMIT\"}',
      '    if any(value is not None and type(value) is not str for value in payload.values()):',
      '        return {\"schema\": CONFIG[\"resultSchemaId\"], \"ok\": False, \"code\": \"INPUT_VALUE_UNSUPPORTED\"}',
      '    if _json_bytes(payload) > CONFIG[\"maxInputBytes\"]:',
      '        return {\"schema\": CONFIG[\"resultSchemaId\"], \"ok\": False, \"code\": \"INPUT_BYTES_EXCEEDED\"}',
      '    value = payload.get(CONFIG[\"sourceField\"], CONFIG[\"defaultValue\"])',
      '    if type(value) is not str:',
      '        return {\"schema\": CONFIG[\"resultSchemaId\"], \"ok\": False, \"code\": \"SOURCE_VALUE_INVALID\"}',
      '    return {\"schema\": CONFIG[\"resultSchemaId\"], \"ok\": True, \"output\": {CONFIG[\"targetField\"]: value}}',
      ''
    ].join('\n');
  }
function pythonRecordTransformSelftest(config){
    return [
      '# Emitted verification candidate. Not executed by Capability Fabric.',
      'from capability import CONFIG, run',
      '',
      'assert CONFIG[\"sourceField\"] == '+JSON.stringify(config.sourceField),
      'first = run({'+JSON.stringify(config.sourceField)+': \"proof\"})',
      'second = run({'+JSON.stringify(config.sourceField)+': \"proof\"})',
      'assert first == second',
      'assert first[\"ok\"] is True',
      'assert first[\"output\"]['+JSON.stringify(config.targetField)+'] == \"proof\"',
      'assert run({})[\"output\"]['+JSON.stringify(config.targetField)+'] == '+JSON.stringify(config.defaultValue),
      'assert run([])[\"code\"] == \"INPUT_OBJECT_REQUIRED\"',
      'assert run({'+JSON.stringify(config.sourceField)+': 7})[\"code\"] == \"INPUT_VALUE_UNSUPPORTED\"',
      'print(\"PASS bounded Python record transform candidate\")',
      ''
    ].join('\n');
  }
function buildPythonRecordTransform(parameters){
    htmlExact(parameters,['resultSchemaId','sourceField','targetField','defaultValue','maxInputKeys','maxInputBytes'],'parameters');
    if(!/^[A-Za-z0-9][A-Za-z0-9._:/+-]{2,179}$/.test(parameters.resultSchemaId||''))throw new Error('resultSchemaId is invalid');
    if(!Number.isInteger(parameters.maxInputKeys)||parameters.maxInputKeys<1||parameters.maxInputKeys>128)throw new Error('maxInputKeys is outside the bounded range');
    if(!Number.isInteger(parameters.maxInputBytes)||parameters.maxInputBytes<128||parameters.maxInputBytes>65536)throw new Error('maxInputBytes is outside the bounded range');
    const config={resultSchemaId:parameters.resultSchemaId,sourceField:pythonField(parameters.sourceField,'sourceField'),targetField:pythonField(parameters.targetField,'targetField'),defaultValue:pythonText(parameters.defaultValue,'defaultValue',256),maxInputKeys:parameters.maxInputKeys,maxInputBytes:parameters.maxInputBytes};
    return {capabilityKind:'HAND',source:pythonRecordTransformSource(config),selftest:pythonRecordTransformSelftest(config),provides:[parameters.resultSchemaId],consumes:['application/json'],summary:'Pure bounded Python record-field transform candidate using only the standard-library json module.'};
  }

function donorImplementationSha256() {
  const material = {id: DONOR.builderId, capabilityKind: 'HAND', status: 'ACTIVE_SOURCE_REVIEWED', proposalDigest: null, implementation: [htmlExact, pythonField, pythonText, pythonRecordTransformSource, pythonRecordTransformSelftest, buildPythonRecordTransform].map(value => String(value).replace(/\r\n/g, '\n'))};
  return registry.hash(material);
}

function donorContribution() {
  return [htmlExact, pythonField, pythonText, pythonRecordTransformSource, pythonRecordTransformSelftest, buildPythonRecordTransform].map(value => String(value).replace(/\r\n/g, '\n'));
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || !HEX64.test(plan.planSha256 || '')) throw Error('PYTHON_AUTHOR_PLACEMENT_PLAN_INVALID');
  const body = {...plan}; delete body.planSha256;
  if (registry.hash(body) !== plan.planSha256) throw Error('PYTHON_AUTHOR_PLACEMENT_PLAN_DIGEST_MISMATCH');
  const organ = organs.getByLanguageId('python'); const profile = organs.grammarProfile('python');
  if (plan.schema !== 'axm.code.placement-plan.v1' || plan.result !== 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY' || plan.languageBinding?.languageId !== 'python' || plan.languageBinding?.organSha256 !== organ?.sha256 || plan.languageBinding?.grammarProfileSha256 !== profile?.profileSha256) throw Error('PYTHON_AUTHOR_PLACEMENT_PLAN_BINDING_INVALID');
  if (path.posix.basename(plan.sourcePlacement?.targetPath || '') !== 'capability.py' || path.posix.basename(plan.verificationPlacement?.targetPath || '') !== 'selftest.py' || !plan.sourcePlacement.expectedExports?.includes('run')) throw Error('PYTHON_AUTHOR_DONOR_LAYOUT_REQUIRED');
  return plan;
}

function author({placementPlan = null, parameters = null} = {}) {
  try {
    validatePlan(placementPlan);
    const implementationSha256 = donorImplementationSha256();
    if (implementationSha256 !== DONOR.builderSha256) throw Error('PYTHON_AUTHOR_DONOR_IMPLEMENTATION_DIGEST_MISMATCH');
    const generated = buildPythonRecordTransform(parameters);
    const source = {schema: 'axm.code.edit-candidate.v1', version: '1.0.0', lane: 'source', targetPath: placementPlan.sourcePlacement.targetPath, languageId: 'python', content: generated.source, contentSha256: sha256(Buffer.from(generated.source, 'utf8'))};
    const verification = {schema: 'axm.code.edit-candidate.v1', version: '1.0.0', lane: 'verification', targetPath: placementPlan.verificationPlacement.targetPath, languageId: 'python', content: generated.selftest, contentSha256: sha256(Buffer.from(generated.selftest, 'utf8'))};
    const body = {schema: 'axm.code.bounded-python-record-transform-author-receipt.v1', version: '1.0.0', status: 'TEST', result: 'PYTHON_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY', errorCode: null, placementPlanSha256: placementPlan.planSha256, parameters: JSON.parse(registry.canon(parameters)), donor: DONOR, donorImplementationSha256: implementationSha256, candidates: {source, verification}, provides: generated.provides, consumes: generated.consumes, summary: generated.summary, truth: {donorImplementationDigestReproduced: true, candidateGenerated: true, candidateExecuted: false, workspaceRead: false, workspaceMutation: false, generalPythonAuthoringClaimed: false, runtimeCorrectnessClaimedByAuthor: false}, authority: AUTHORITY};
    return receipt(body);
  } catch (error) {
    const body = {schema: 'axm.code.bounded-python-record-transform-author-receipt.v1', version: '1.0.0', status: 'TEST', result: 'PYTHON_AUTHOR_HELD', errorCode: String(error?.message || 'PYTHON_AUTHOR_FAILED'), truth: {candidateGenerated: false, candidateExecuted: false, workspaceRead: false, workspaceMutation: false, generalPythonAuthoringClaimed: false, runtimeCorrectnessClaimedByAuthor: false}, authority: AUTHORITY};
    return receipt(body);
  }
}

function validateReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !HEX64.test(value.authorReceiptSha256 || '')) throw Error('PYTHON_AUTHOR_RECEIPT_INVALID');
  const body = {...value}; delete body.authorReceiptSha256;
  if (registry.hash(body) !== value.authorReceiptSha256) throw Error('PYTHON_AUTHOR_RECEIPT_DIGEST_MISMATCH');
  if (value.schema !== 'axm.code.bounded-python-record-transform-author-receipt.v1' || value.version !== '1.0.0' || value.status !== 'TEST' || value.result !== 'PYTHON_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY' || value.errorCode !== null || !HEX64.test(value.placementPlanSha256 || '') || registry.canon(value.donor) !== registry.canon(DONOR) || value.donorImplementationSha256 !== DONOR.builderSha256 || value.donorImplementationSha256 !== donorImplementationSha256() || value.truth?.candidateExecuted !== false || value.truth?.generalPythonAuthoringClaimed !== false || value.authority?.workspaceMutation !== false) throw Error('PYTHON_AUTHOR_RECEIPT_BINDING_INVALID');
  const generated = buildPythonRecordTransform(value.parameters);
  const expectedGenerated = {provides: generated.provides, consumes: generated.consumes, summary: generated.summary};
  if (registry.canon({provides: value.provides, consumes: value.consumes, summary: value.summary}) !== registry.canon(expectedGenerated)) throw Error('PYTHON_AUTHOR_RECEIPT_OUTPUT_METADATA_MISMATCH');
  for (const [lane, content, basename] of [['source', generated.source, 'capability.py'], ['verification', generated.selftest, 'selftest.py']]) {
    const candidate = value.candidates?.[lane];
    if (!candidate || candidate.schema !== 'axm.code.edit-candidate.v1' || candidate.version !== '1.0.0' || candidate.lane !== lane || candidate.languageId !== 'python' || path.posix.basename(candidate.targetPath || '') !== basename || candidate.content !== content || candidate.contentSha256 !== sha256(Buffer.from(content, 'utf8'))) throw Error('PYTHON_AUTHOR_RECEIPT_CANDIDATE_MISMATCH');
  }
  return value;
}

module.exports = {AUTHORITY, DONOR, donorContribution, donorImplementationSha256, buildPythonRecordTransform, author, validateReceipt};
