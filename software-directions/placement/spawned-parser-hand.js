'use strict';

const crypto = require('crypto');
const path = require('path');
const vm = require('vm');
const {spawnSync} = require('child_process');
const registry = require('./placement-registry.js');
const environmentHand = require('./toolchain-environment-hand.js');

const MAX_CANDIDATE_BYTES = 1024 * 1024;
const PYTHON_AST_PROGRAM = [
  'import ast,json,sys',
  'source=sys.stdin.read()',
  'try:',
  ' tree=ast.parse(source,filename=sys.argv[1],mode="exec")',
  ' print(json.dumps({"ok":True,"nodeCount":sum(1 for _ in ast.walk(tree))},separators=(",",":")))',
  'except SyntaxError as error:',
  ' print(json.dumps({"ok":False,"line":error.lineno,"offset":error.offset},separators=(",",":")))',
  ' raise SystemExit(2)'
].join('\n');
const IMPLEMENTATIONS = Object.freeze({
  javascript: {implementationId: 'spawned-node-vm-script-parser-v1', parserId: 'node-vm-script-syntax-v1', toolId: 'node', programSha256: registry.hash('node:vm.Script')},
  python: {implementationId: 'spawned-python-ast-parser-v1', parserId: 'python-ast-exec-syntax-v1', toolId: 'python3', programSha256: registry.hash(PYTHON_AST_PROGRAM)}
});
const AUTHORITY = Object.freeze({candidateParse: true, candidateExecution: false, workspaceRead: false, workspaceMutation: false, network: false, install: false, deployment: false, promotion: false, canon: false});

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function implementationFor(languageId, environmentObservation) {
  environmentHand.validate(environmentObservation);
  const implementation = IMPLEMENTATIONS[languageId];
  if (!implementation) return null;
  const tool = environmentHand.get(environmentObservation, implementation.toolId);
  if (!tool?.usable) return null;
  const resourceLimits = languageId === 'python'
    ? {...environmentObservation.resourceLimits}
    : {providerId: null, usable: false, cpuSeconds: null, addressSpaceBytes: null, openFileLimit: null, wallTimeoutMs: null};
  return freeze({
    ...implementation,
    implementationSha256: registry.hash(implementation),
    toolBinding: {toolId: tool.id, executablePath: tool.executablePath, executablePathSha256: tool.executablePathSha256, version: tool.version},
    resourceLimits,
    truth: {candidateExecuted: false, parserProcessMayRun: languageId === 'python', sandboxRequiredForCandidateExecution: true},
    authority: AUTHORITY
  });
}

function validateCapsule(capsule) {
  if (!capsule || typeof capsule !== 'object' || Array.isArray(capsule) || !/^[a-f0-9]{64}$/.test(capsule.capsuleSha256 || '')) throw Error('SPAWNED_PARSER_CAPSULE_INVALID');
  const body = {...capsule}; delete body.capsuleSha256;
  if (registry.hash(body) !== capsule.capsuleSha256) throw Error('SPAWNED_PARSER_CAPSULE_DIGEST_MISMATCH');
  const implementation = IMPLEMENTATIONS[capsule.languageId];
  if (capsule.schema !== 'axm.code.spawned-hand-capsule.v1' || capsule.version !== '1.0.0' || capsule.status !== 'SPAWNED_NO_EXECUTION_AUTHORITY' || capsule.handRole !== 'language-parser' || !implementation || capsule.implementationId !== implementation.implementationId || capsule.parserId !== implementation.parserId || capsule.implementationSha256 !== registry.hash(implementation) || capsule.truth?.foundryGrantedExecutionAuthority !== false || capsule.authority?.candidateExecution !== false) throw Error('SPAWNED_PARSER_CAPSULE_BINDING_INVALID');
  return capsule;
}

function validateExecutionBinding(capsule, environmentObservation) {
  validateCapsule(capsule);
  try { environmentHand.validate(environmentObservation); }
  catch (error) { throw Error(`SPAWNED_PARSER_${String(error?.message || 'ENVIRONMENT_OBSERVATION_INVALID')}`); }
  if (capsule.environmentObservationSha256 !== environmentObservation.environmentObservationSha256) throw Error('SPAWNED_PARSER_ENVIRONMENT_BINDING_MISMATCH');
  const implementation = implementationFor(capsule.languageId, environmentObservation);
  if (!implementation || capsule.implementationId !== implementation.implementationId || capsule.implementationSha256 !== implementation.implementationSha256 || registry.canon(capsule.toolBinding) !== registry.canon(implementation.toolBinding) || registry.canon(capsule.resourceLimits) !== registry.canon(implementation.resourceLimits)) throw Error('SPAWNED_PARSER_TOOL_BINDING_INVALID');
  const prlimit = environmentHand.get(environmentObservation, 'prlimit');
  const expectedResourceTool = implementation.resourceLimits.usable && prlimit?.usable
    ? {toolId: prlimit.id, executablePath: prlimit.executablePath, executablePathSha256: prlimit.executablePathSha256, version: prlimit.version}
    : null;
  if (registry.canon(capsule.resourceLimitToolBinding) !== registry.canon(expectedResourceTool)) throw Error('SPAWNED_PARSER_RESOURCE_LIMIT_BINDING_INVALID');
  return capsule;
}

function candidate(value, languageId) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schema !== 'axm.code.edit-candidate.v1' || value.version !== '1.0.0' || value.languageId !== languageId || !['source', 'verification'].includes(value.lane) || typeof value.targetPath !== 'string' || value.targetPath.includes('\\') || value.targetPath.includes('\0') || value.targetPath.startsWith('/') || path.posix.normalize(value.targetPath) !== value.targetPath || value.targetPath.split('/').some(part => !part || part === '.' || part === '..') || typeof value.content !== 'string' || value.content.includes('\0')) throw Error('SPAWNED_PARSER_CANDIDATE_INVALID');
  const bytes = Buffer.from(value.content, 'utf8');
  if (bytes.length === 0 || bytes.length > MAX_CANDIDATE_BYTES || !/^[a-f0-9]{64}$/.test(value.contentSha256 || '') || sha256(bytes) !== value.contentSha256) throw Error('SPAWNED_PARSER_CANDIDATE_DIGEST_OR_SIZE_INVALID');
  return {value, bytes};
}

function pythonParse(capsule, value) {
  const python = capsule.toolBinding.executablePath;
  let command = python; let args = ['-I', '-S', '-c', PYTHON_AST_PROGRAM, value.targetPath];
  if (capsule.resourceLimits?.usable) {
    const environment = capsule.resourceLimits;
    const prlimit = capsule.resourceLimitToolBinding?.executablePath;
    if (!prlimit) throw Error('SPAWNED_PARSER_RESOURCE_LIMIT_BINDING_MISSING');
    command = prlimit;
    args = [`--cpu=${environment.cpuSeconds}`, `--as=${environment.addressSpaceBytes}`, `--nofile=${environment.openFileLimit}`, '--', python, ...args];
  }
  const result = spawnSync(command, args, {
    input: value.content, encoding: 'utf8', cwd: path.parse(process.cwd()).root,
    timeout: capsule.resourceLimits?.wallTimeoutMs || 3000, maxBuffer: 64 * 1024,
    env: {PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1'}
  });
  let parsed = null;
  try { parsed = JSON.parse(String(result.stdout || '').trim()); } catch (error) { /* process failure is reported without raw output */ }
  const passed = result.status === 0 && parsed?.ok === true;
  const errorCode = result.status === 2 && parsed?.ok === false
    ? 'PYTHON_SYNTAX_ERROR'
    : (passed ? null : (result.error?.code === 'ETIMEDOUT' ? 'PYTHON_PARSER_TIMEOUT' : (result.status === 0 ? 'PYTHON_PARSER_OUTPUT_INVALID' : 'PYTHON_PARSER_PROCESS_FAILED')));
  return {passed, errorCode, observations: {processStatus: result.status, processSignal: result.signal || null, astNodeCount: parsed?.ok === true ? parsed.nodeCount : null, syntaxLine: parsed?.ok === false ? parsed.line : null, syntaxOffset: parsed?.ok === false ? parsed.offset : null, stdoutSha256: sha256(String(result.stdout || '')), stderrSha256: sha256(String(result.stderr || ''))}};
}

function javascriptParse(value) {
  try { new vm.Script(value.content, {filename: value.targetPath, displayErrors: true}); return {passed: true, errorCode: null, observations: {processStatus: null, processSignal: null, astNodeCount: null, syntaxLine: null, syntaxOffset: null, stdoutSha256: null, stderrSha256: null}}; }
  catch (error) { return {passed: false, errorCode: 'JAVASCRIPT_SYNTAX_ERROR', observations: {processStatus: null, processSignal: null, astNodeCount: null, syntaxLine: null, syntaxOffset: null, stdoutSha256: null, stderrSha256: null}}; }
}

function parse({capsule = null, environmentObservation = null, candidate: input = null, phase = 'candidate-preflight'} = {}) {
  try {
    validateExecutionBinding(capsule, environmentObservation);
    const {value} = candidate(input, capsule.languageId);
    const outcome = capsule.languageId === 'python' ? pythonParse(capsule, value) : javascriptParse(value);
    const body = {
      schema: 'axm.code.spawned-parser-hand-receipt.v1', version: '1.0.0', status: 'TEST', result: outcome.passed ? 'SPAWNED_PARSER_PASS' : 'SPAWNED_PARSER_HOLD', errorCode: outcome.errorCode,
      handId: capsule.handId, capsuleSha256: capsule.capsuleSha256, parserId: capsule.parserId, languageId: capsule.languageId, phase, lane: value.lane, targetPath: value.targetPath, contentSha256: value.contentSha256,
      observations: outcome.observations,
      truth: {candidateExecuted: false, syntaxPassIsBehaviorProof: false, workspaceRead: false, workspaceMutation: false, sandboxExecutionClaimed: false}, authority: AUTHORITY
    };
    return freeze({...body, receiptSha256: registry.hash(body)});
  } catch (error) {
    const message = String(error?.message || 'SPAWNED_PARSER_FAILED');
    const body = {schema: 'axm.code.spawned-parser-hand-receipt.v1', version: '1.0.0', status: 'TEST', result: 'SPAWNED_PARSER_HOLD', errorCode: message.startsWith('SPAWNED_') ? message : 'SPAWNED_PARSER_FAILED', truth: {candidateExecuted: false, workspaceRead: false, workspaceMutation: false, sandboxExecutionClaimed: false}, authority: AUTHORITY};
    return freeze({...body, receiptSha256: registry.hash(body)});
  }
}

module.exports = {AUTHORITY, MAX_CANDIDATE_BYTES, implementationFor, validateCapsule, validateExecutionBinding, parse};
