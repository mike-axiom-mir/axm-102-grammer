'use strict';

const crypto = require('crypto');
const path = require('path');
const {spawnSync} = require('child_process');
const registry = require('./placement-registry.js');
const environmentHand = require('./toolchain-environment-hand.js');
const authorHand = require('./bounded-python-required-fields-author-hand.js');

const ADAPTER_ID = 'bounded-python-required-fields-unit-test';
const PROVIDES_VERIFIER_ID = 'unit-test';
const MAX_OUTPUT_BYTES = 64 * 1024;
const AUTHORITY = Object.freeze({provenanceLockedCandidateExecution: true, arbitraryCandidateExecution: false, workspaceRead: false, workspaceMutation: false, boundedChildProcessExecution: true, network: false, install: false, deployment: false, promotion: false, canon: false});
const RUNNER = [
  'import json,sys,types',
  'payload=json.load(sys.stdin)',
  'messages=[]',
  'capability=None',
  'def candidate_import(name,globals=None,locals=None,fromlist=(),level=0):',
  ' if name=="json": return json',
  ' if name=="capability" and capability is not None: return capability',
  ' raise ImportError("candidate import refused")',
  'safe_builtins={"type":type,"dict":dict,"list":list,"str":str,"len":len,"any":any,"sorted":sorted,"TypeError":TypeError,"ValueError":ValueError,"OverflowError":OverflowError,"RecursionError":RecursionError,"__import__":candidate_import,"print":lambda *values,**kwargs:messages.append(" ".join(str(value) for value in values))}',
  'source_globals={"__builtins__":safe_builtins}',
  'exec(compile(payload["source"],payload["sourcePath"],"exec"),source_globals)',
  'if type(source_globals.get("CONFIG")) is not dict or not callable(source_globals.get("run")): raise AssertionError("SOURCE_EXPORTS_INVALID")',
  'capability=types.ModuleType("capability")',
  'capability.CONFIG=source_globals["CONFIG"]',
  'capability.run=source_globals["run"]',
  'test_globals={"__builtins__":safe_builtins}',
  'exec(compile(payload["verification"],payload["verificationPath"],"exec"),test_globals)',
  'config=capability.CONFIG',
  'run=capability.run',
  'valid={field:"semantic-"+str(index) for index,field in enumerate(config["requiredFields"])}',
  'first=run(valid)',
  'second=run(valid)',
  'assert first==second and first["ok"] is True',
  'assert list(first["output"])==config["requiredFields"]',
  'assert run({})["code"]=="REQUIRED_FIELDS_MISSING"',
  'invalid=dict(valid)',
  'invalid[config["requiredFields"][0]]=""',
  'assert run(invalid)["code"]=="REQUIRED_FIELD_VALUE_INVALID"',
  'extra=dict(valid)',
  'extra["unregistered_field"]="x"',
  'if config["allowExtraFields"]: assert run(extra)["ok"] is True',
  'else: assert run(extra)["code"]=="EXTRA_FIELDS_REFUSED"',
  'print(json.dumps({"ok":True,"capturedPrintCount":len(messages)},sort_keys=True,separators=(",",":")))',
  ''
].join('\n');
const RUNNER_SHA256 = registry.hash(RUNNER);

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function environmentBinding(observation) {
  environmentHand.validate(observation);
  const python = environmentHand.get(observation, 'python3'); const prlimit = environmentHand.get(observation, 'prlimit');
  if (!python?.usable) throw Error('BOUNDED_REQUIRED_FIELDS_VERIFIER_PYTHON_UNAVAILABLE');
  if (!prlimit?.usable || observation.resourceLimits?.usable !== true) throw Error('BOUNDED_REQUIRED_FIELDS_VERIFIER_RESOURCE_LIMITS_UNAVAILABLE');
  return {python: {toolId: python.id, executablePath: python.executablePath, executablePathSha256: python.executablePathSha256, version: python.version}, prlimit: {toolId: prlimit.id, executablePath: prlimit.executablePath, executablePathSha256: prlimit.executablePathSha256, version: prlimit.version}, resourceLimits: {...observation.resourceLimits}};
}

function expectedReceipt(receipt) {
  authorHand.validateReceipt(receipt);
  const generated = authorHand.buildPythonRequiredFields(receipt.parameters);
  const expected = {
    source: {...receipt.candidates.source, content: generated.source, contentSha256: sha256(Buffer.from(generated.source, 'utf8'))},
    verification: {...receipt.candidates.verification, content: generated.selftest, contentSha256: sha256(Buffer.from(generated.selftest, 'utf8'))}
  };
  if (registry.canon(expected) !== registry.canon(receipt.candidates)) throw Error('BOUNDED_REQUIRED_FIELDS_VERIFIER_AUTHOR_RECEIPT_CANDIDATE_MISMATCH');
  return receipt;
}

function create({authorReceipt = null, environmentObservation = null} = {}) {
  const boundReceipt = expectedReceipt(authorReceipt); const binding = environmentBinding(environmentObservation);
  const metadata = {
    schema: 'axm.code.bounded-python-verifier-adapter.v1', version: '1.0.0', id: ADAPTER_ID, providesVerifierId: PROVIDES_VERIFIER_ID,
    authorReceiptSha256: boundReceipt.authorReceiptSha256, placementPlanSha256: boundReceipt.placementPlanSha256,
    recipeSha256: authorHand.RECIPE.recipeSha256, builderSha256: authorHand.implementationSha256(), runnerSha256: RUNNER_SHA256,
    environmentObservationSha256: environmentObservation.environmentObservationSha256,
    pythonToolSha256: binding.python.executablePathSha256, resourceLimitToolSha256: binding.prlimit.executablePathSha256,
    truth: {hostNamespaceSandbox: false, hostFilesystemIsolation: false, hostNetworkIsolation: false, arbitraryCandidateExecution: false, exactRegisteredCandidateRequired: true, candidateRuntimeCorrectnessUniversallyClaimed: false},
    authority: AUTHORITY
  };
  return Object.freeze({
    ...metadata, adapterSha256: registry.hash(metadata),
    verify(context) {
      try { if (registry.canon(environmentBinding(environmentObservation)) !== registry.canon(binding)) return {passed: false, observations: {errorCode: 'ENVIRONMENT_BINDING_DRIFT'}}; }
      catch (error) { return {passed: false, observations: {errorCode: 'ENVIRONMENT_BINDING_INVALID'}}; }
      if (!context || context.placementPlanSha256 !== boundReceipt.placementPlanSha256) return {passed: false, observations: {errorCode: 'PLACEMENT_PLAN_BINDING_INVALID'}};
      if (context.source.targetPath !== boundReceipt.candidates.source.targetPath || context.verification.targetPath !== boundReceipt.candidates.verification.targetPath || context.source.contentSha256 !== boundReceipt.candidates.source.contentSha256 || context.verification.contentSha256 !== boundReceipt.candidates.verification.contentSha256 || context.source.content !== boundReceipt.candidates.source.content || context.verification.content !== boundReceipt.candidates.verification.content) return {passed: false, observations: {errorCode: 'EXACT_REGISTERED_CANDIDATE_REQUIRED'}};
      const limits = binding.resourceLimits;
      const args = ['--cpu=' + limits.cpuSeconds, '--as=' + limits.addressSpaceBytes, '--nofile=' + limits.openFileLimit, '--', binding.python.executablePath, '-I', '-S', '-c', RUNNER];
      const payload = JSON.stringify({source: context.source.content, sourcePath: context.source.targetPath, verification: context.verification.content, verificationPath: context.verification.targetPath});
      const outcome = spawnSync(binding.prlimit.executablePath, args, {input: payload, encoding: 'utf8', cwd: path.parse(process.cwd()).root, timeout: limits.wallTimeoutMs, maxBuffer: MAX_OUTPUT_BYTES, env: {PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1'}});
      const stdout = String(outcome.stdout || ''); const stderr = String(outcome.stderr || ''); let parsed = null;
      try { parsed = JSON.parse(stdout.trim()); } catch (error) { /* failure remains digest-only */ }
      const passed = outcome.status === 0 && parsed?.ok === true;
      return {passed, observations: {result: passed ? 'PROVENANCE_LOCKED_RUNTIME_PASS' : 'PROVENANCE_LOCKED_RUNTIME_FAIL', errorCode: passed ? null : (outcome.error?.code === 'ETIMEDOUT' ? 'CANDIDATE_TIMEOUT' : 'CANDIDATE_PROCESS_OR_OUTPUT_FAILED'), processStatus: outcome.status, processSignal: outcome.signal || null, capturedSelftestPrintCount: parsed?.capturedPrintCount ?? null, stdoutSha256: sha256(stdout), stderrSha256: sha256(stderr), recipeSha256: authorHand.RECIPE.recipeSha256, builderSha256: authorHand.implementationSha256(), runnerSha256: RUNNER_SHA256, hostNamespaceSandbox: false, arbitraryCandidateExecution: false, exactRegisteredCandidateExecuted: true}};
    }
  });
}

module.exports = {ADAPTER_ID, PROVIDES_VERIFIER_ID, RUNNER_SHA256, AUTHORITY, create};
