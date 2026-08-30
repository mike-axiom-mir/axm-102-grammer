'use strict';

const crypto = require('crypto');
const {spawnSync} = require('child_process');

const placementRegistry = require('./placement-registry.js');
const evidenceObserver = require('./bounded-python-recipe-evidence-observer-hand.js');
const environmentHand = require('./toolchain-environment-hand.js');

const HEX64 = /^[a-f0-9]{64}$/;
const TIMEOUT_MS = 3000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const ADDRESS_SPACE_BYTES = 2147483648;
const QUALIFIED_RESULTS = Object.freeze([
  'RECIPE_REPLAY_ISOLATION_HELD_HOST_PROVIDER_UNAVAILABLE',
  'RECIPE_REPLAY_ISOLATION_HELD_POLICY_PROBE_FAILED',
  'RECIPE_REPLAY_ISOLATION_CERTIFIED_NO_PROPOSAL_EXECUTION'
]);
const ALL_RESULTS = Object.freeze(['RECIPE_REPLAY_ISOLATION_HELD_INPUT_INVALID', ...QUALIFIED_RESULTS]);
const AUTHORITY = Object.freeze({
  environmentRead: true,
  fixedSandboxProbeExecution: true,
  proposedSourceBytesRead: false,
  proposedModuleExecution: false,
  callerTestExecution: false,
  candidateGeneration: false,
  candidateExecution: false,
  workspaceRead: false,
  workspaceMutation: false,
  childProcessExecution: true,
  registryMutation: false,
  recipeSelection: false,
  activationAuthorization: false,
  promotion: false,
  canon: false,
  network: false,
  install: false,
  deployment: false
});

const PROBE_SOURCE = String.raw`'use strict';
const fs = require('fs');
const net = require('net');
const os = require('os');
function absent(target) { try { fs.lstatSync(target); return false; } catch (error) { return error && error.code === 'ENOENT'; } }
function deniedWrite(target) { try { fs.writeFileSync(target, 'forbidden'); return false; } catch (error) { return ['EACCES', 'EROFS', 'ENOENT'].includes(error && error.code); } }
const tempPath = '/tmp/axm-replay-policy-probe';
let tmpEphemeralWritable = false;
try { fs.writeFileSync(tempPath, 'fixed-probe'); tmpEphemeralWritable = fs.readFileSync(tempPath, 'utf8') === 'fixed-probe'; fs.unlinkSync(tempPath); } catch (_) {}
const pidCount = fs.readdirSync('/proc').filter(name => /^[0-9]+$/.test(name)).length;
const base = {schema:'axm.code.replay-isolation-policy-probe.v1', passwdHidden:absent('/etc/passwd'), workspaceHidden:absent('/workspace'), usrReadOnly:deniedWrite('/usr/axm-forbidden-write'), tmpEphemeralWritable, pidNamespaceBounded:pidCount > 0 && pidCount <= 16, uidIsNobody:process.getuid() === 65534, gidIsNobody:process.getgid() === 65534, hostnameBound:os.hostname() === 'axm-replay'};
let finished = false;
function finish(networkBlocked, networkErrorCode) { if (finished) return; finished = true; process.stdout.write(JSON.stringify({...base, networkBlocked, networkErrorCode}) + '\n'); }
const socket = net.createConnection({host:'198.51.100.1', port:9});
socket.setTimeout(500);
socket.once('connect', () => { socket.destroy(); finish(false, 'CONNECTED'); });
socket.once('error', error => finish(['ENETUNREACH', 'EHOSTUNREACH', 'EACCES'].includes(error && error.code), String(error && error.code || 'NETWORK_ERROR')));
socket.once('timeout', () => { socket.destroy(); finish(false, 'TIMEOUT'); });`;

const POLICY = Object.freeze({
  schema: 'axm.code.bounded-python-recipe-replay-isolation-policy.v1',
  version: '1.0.0',
  providerId: 'bubblewrap',
  resourceLimitProviderId: 'prlimit',
  rootFilesystem: 'anonymous-empty-tmpfs',
  namespaces: Object.freeze(['user', 'pid', 'ipc', 'uts', 'network', 'cgroup-try']),
  identity: Object.freeze({uid: 65534, gid: 65534, hostname: 'axm-replay'}),
  capabilities: 'drop-all',
  readOnlyHostMounts: Object.freeze(['/usr', 'observed-node-executable:file-only']),
  writableMounts: Object.freeze(['ephemeral-tmpfs:/tmp:01777']),
  hiddenHostPaths: Object.freeze(['/etc', '/workspace', '/home', '/root']),
  environment: Object.freeze({PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', TMPDIR: '/tmp', LANG: 'C', LC_ALL: 'C'}),
  resourceLimits: Object.freeze({cpuSeconds: 1, addressSpaceBytes: ADDRESS_SPACE_BYTES, openFileLimit: 64, processLimit: 16, fileSizeBytes: 1048576, coreBytes: 0, wallTimeoutMs: TIMEOUT_MS}),
  probeSourceSha256: crypto.createHash('sha256').update(PROBE_SOURCE).digest('hex'),
  proposalBytesMounted: false,
  proposalCodeExecuted: false
});
const POLICY_SHA256 = placementRegistry.hash(POLICY);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function digestReceipt(value, field, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !HEX64.test(value[field] || '')) throw Error(`${code}_INVALID`);
  const body = {...value};
  delete body[field];
  if (placementRegistry.hash(body) !== value[field]) throw Error(`${code}_DIGEST_MISMATCH`);
  return value;
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || placementRegistry.canon(Object.keys(value).sort()) !== placementRegistry.canon([...keys].sort())) throw Error(`${code}_KEYS_INVALID`);
  return value;
}

function truth({inputsBound = false, probeExecuted = false, probePassed = false, isolationCertified = false} = {}) {
  return {
    inputsBound,
    fixedPolicyProbeExecuted: probeExecuted,
    fixedPolicyProbePassed: probePassed,
    isolationCertified,
    hostFilesystemIsolationObserved: isolationCertified,
    hostNetworkIsolationObserved: isolationCertified,
    proposedSourceBytesRead: false,
    proposedBytesMountedInSandbox: false,
    proposedModuleLoaded: false,
    callerTestsMountedInSandbox: false,
    callerTestClaimsReproduced: false,
    semanticSafetyIndependentlyVerified: false,
    humanReviewCompleted: false,
    digestIsSignerConsentOrIdentityProof: false,
    receiptIsReplayAuthorization: false,
    candidateGenerated: false,
    candidateExecuted: false,
    workspaceRead: false,
    workspaceMutation: false,
    childProcessSpawned: probeExecuted,
    registryMutated: false,
    recipeSelectionIssued: false,
    activationAuthorizationIssued: false,
    promotionOccurred: false,
    canonChanged: false
  };
}

function gaps(result) {
  if (result === 'RECIPE_REPLAY_ISOLATION_CERTIFIED_NO_PROPOSAL_EXECUTION') return ['EXPLICIT_REPLAY_AUTHORIZATION_REQUIRED', 'CALLER_TEST_REPLAY_REQUIRED'];
  if (result === 'RECIPE_REPLAY_ISOLATION_HELD_POLICY_PROBE_FAILED') return ['CERTIFIED_REPLAY_POLICY_REQUIRED', 'EXPLICIT_REPLAY_AUTHORIZATION_REQUIRED', 'CALLER_TEST_REPLAY_REQUIRED'];
  return ['USABLE_BUBBLEWRAP_REQUIRED', 'CERTIFIED_REPLAY_POLICY_REQUIRED', 'EXPLICIT_REPLAY_AUTHORIZATION_REQUIRED', 'CALLER_TEST_REPLAY_REQUIRED'];
}

function receipt({result, errorCode, context = {}, provider = null, probe = null, probeExecuted = false, probePassed = false, isolationCertified = false}) {
  const body = {
    schema: 'axm.code.bounded-python-recipe-replay-isolation-receipt.v1',
    version: '1.0.0',
    status: 'TEST',
    result,
    errorCode,
    proposalSha256: context.proposalSha256 || null,
    evidenceSha256: context.evidenceSha256 || null,
    evidenceObservationSha256: context.evidenceObservationSha256 || null,
    environmentObservationSha256: context.environmentObservationSha256 || null,
    evidenceWorkspaceRootIdentitySha256: context.evidenceWorkspaceRootIdentitySha256 || null,
    validFrom: context.validFrom || null,
    expiresAt: context.expiresAt || null,
    policySha256: POLICY_SHA256,
    provider,
    probe,
    unresolvedGaps: gaps(result),
    truth: truth({inputsBound: Boolean(context.proposalSha256), probeExecuted, probePassed, isolationCertified}),
    authority: AUTHORITY
  };
  return freeze({...body, replayIsolationReceiptSha256: placementRegistry.hash(body)});
}

function inputHeld(errorCode) {
  return receipt({result: 'RECIPE_REPLAY_ISOLATION_HELD_INPUT_INVALID', errorCode});
}

function validateBindings(proposal, evidence, observation) {
  digestReceipt(proposal, 'proposalSha256', 'RECIPE_REPLAY_PROPOSAL');
  digestReceipt(evidence, 'evidenceSha256', 'RECIPE_REPLAY_EVIDENCE');
  if (proposal.schema !== 'axm.code.bounded-python-recipe-admission-proposal.v1' || proposal.version !== '1.0.0' || proposal.status !== 'DRAFT') throw Error('RECIPE_REPLAY_PROPOSAL_HEADER_INVALID');
  if (evidence.schema !== 'axm.code.bounded-python-recipe-admission-evidence.v1' || evidence.version !== '1.0.0' || evidence.status !== 'CALLER_SUPPLIED' || evidence.proposalSha256 !== proposal.proposalSha256) throw Error('RECIPE_REPLAY_EVIDENCE_HEADER_OR_PROPOSAL_BINDING_INVALID');
  evidenceObserver.validateObservation(observation);
  if (observation.proposalSha256 !== proposal.proposalSha256 || observation.evidenceSha256 !== evidence.evidenceSha256) throw Error('RECIPE_REPLAY_EVIDENCE_OBSERVATION_BINDING_INVALID');
  if (!Array.isArray(evidence.evidenceItems) || evidence.evidenceItems.length !== evidenceObserver.EVIDENCE_KINDS.length) throw Error('RECIPE_REPLAY_EVIDENCE_ITEM_COUNT_INVALID');
  const observed = new Map(observation.files.map(item => [item.kind, item.sha256]));
  for (const item of evidence.evidenceItems) {
    if (!evidenceObserver.EVIDENCE_KINDS.includes(item?.kind) || observed.get(item.kind) !== item.sha256) throw Error('RECIPE_REPLAY_EVIDENCE_DIGEST_SET_MISMATCH');
  }
  if (observed.get('author-source') !== proposal.builderSha256 || observed.get('parameter-contract') !== proposal.recipeSha256 || observed.get('verifier-source') !== proposal.verifierRunnerSha256) throw Error('RECIPE_REPLAY_PROPOSAL_DIGEST_BINDING_MISMATCH');
}

function providerReceipt(environmentObservation) {
  const bubblewrap = environmentHand.get(environmentObservation, 'bubblewrap');
  const prlimit = environmentHand.get(environmentObservation, 'prlimit');
  const node = environmentHand.get(environmentObservation, 'node');
  return {
    providerId: 'bubblewrap',
    installed: bubblewrap.installed,
    usable: bubblewrap.usable && prlimit.usable && node.usable,
    errorCode: !bubblewrap.usable ? bubblewrap.errorCode : (!prlimit.usable ? 'RESOURCE_LIMIT_PROVIDER_UNAVAILABLE' : (!node.usable ? 'FIXED_PROBE_RUNTIME_UNAVAILABLE' : null)),
    bubblewrapExecutablePathSha256: bubblewrap.executablePathSha256,
    resourceLimitProviderId: 'prlimit',
    prlimitExecutablePathSha256: prlimit.executablePathSha256,
    fixedProbeRuntimeId: 'node',
    nodeExecutablePathSha256: node.executablePathSha256
  };
}

function buildInvocation(environmentObservation) {
  environmentHand.validate(environmentObservation);
  const bubblewrap = environmentHand.get(environmentObservation, 'bubblewrap');
  const prlimit = environmentHand.get(environmentObservation, 'prlimit');
  const node = environmentHand.get(environmentObservation, 'node');
  if (!bubblewrap.usable || !prlimit.usable || !node.usable) throw Error('RECIPE_REPLAY_REQUIRED_ISOLATION_TOOL_UNAVAILABLE');
  const sandboxArgs = [
    '--die-with-parent', '--new-session',
    '--unshare-user', '--unshare-pid', '--unshare-ipc', '--unshare-uts', '--unshare-net', '--unshare-cgroup-try',
    '--uid', '65534', '--gid', '65534', '--cap-drop', 'ALL', '--hostname', 'axm-replay',
    '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
    '--proc', '/proc', '--dev', '/dev', '--perms', '1777', '--tmpfs', '/tmp', '--dir', '/runtime', '--ro-bind', node.executablePath, '/runtime/node', '--dir', '/sandbox', '--chdir', '/sandbox',
    '--clearenv', '--setenv', 'PATH', POLICY.environment.PATH, '--setenv', 'HOME', POLICY.environment.HOME, '--setenv', 'TMPDIR', POLICY.environment.TMPDIR, '--setenv', 'LANG', 'C', '--setenv', 'LC_ALL', 'C',
    '--', '/runtime/node', '-e', PROBE_SOURCE
  ];
  const args = [
    '--cpu=1', `--as=${ADDRESS_SPACE_BYTES}`, '--nofile=64', '--nproc=16', '--fsize=1048576', '--core=0', '--',
    bubblewrap.executablePath, ...sandboxArgs
  ];
  return freeze({command: prlimit.executablePath, args});
}

function evaluateProbe(outcome) {
  const stdout = String(outcome?.stdout || '');
  const stderr = String(outcome?.stderr || '');
  const base = {
    status: Number.isInteger(outcome?.status) ? outcome.status : null,
    signal: outcome?.signal || null,
    timedOut: outcome?.error?.code === 'ETIMEDOUT',
    stdoutSha256: crypto.createHash('sha256').update(stdout).digest('hex'),
    stderrSha256: crypto.createHash('sha256').update(stderr).digest('hex'),
    assertionCount: 9,
    passedAssertionCount: 0
  };
  if (base.status !== 0 || base.signal !== null || base.timedOut) return {passed: false, errorCode: base.timedOut ? 'REPLAY_ISOLATION_POLICY_PROBE_TIMEOUT' : 'REPLAY_ISOLATION_POLICY_PROBE_PROCESS_FAILED', probe: base};
  let value;
  try { value = JSON.parse(stdout.trim()); } catch (_) { return {passed: false, errorCode: 'REPLAY_ISOLATION_POLICY_PROBE_OUTPUT_INVALID', probe: base}; }
  const probeKeys = ['schema', 'passwdHidden', 'workspaceHidden', 'usrReadOnly', 'tmpEphemeralWritable', 'pidNamespaceBounded', 'uidIsNobody', 'gidIsNobody', 'hostnameBound', 'networkBlocked', 'networkErrorCode'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || placementRegistry.canon(Object.keys(value).sort()) !== placementRegistry.canon(probeKeys.sort()) || !['ENETUNREACH', 'EHOSTUNREACH', 'EACCES'].includes(value.networkErrorCode)) return {passed: false, errorCode: 'REPLAY_ISOLATION_POLICY_PROBE_OUTPUT_INVALID', probe: base};
  const assertions = [
    value.schema === 'axm.code.replay-isolation-policy-probe.v1', value.passwdHidden === true, value.workspaceHidden === true,
    value.usrReadOnly === true, value.tmpEphemeralWritable === true, value.pidNamespaceBounded === true,
    value.uidIsNobody === true, value.gidIsNobody === true, value.hostnameBound === true, value.networkBlocked === true
  ];
  base.assertionCount = assertions.length;
  base.passedAssertionCount = assertions.filter(Boolean).length;
  if (!assertions.every(Boolean)) return {passed: false, errorCode: 'REPLAY_ISOLATION_POLICY_ASSERTION_FAILED', probe: base};
  return {passed: true, errorCode: null, probe: base};
}

function assess({proposal = null, evidence = null, evidenceObservation = null, environmentObservation = null} = {}) {
  try {
    validateBindings(proposal, evidence, evidenceObservation);
    environmentHand.validate(environmentObservation);
    const context = {
      proposalSha256: proposal.proposalSha256,
      evidenceSha256: evidence.evidenceSha256,
      evidenceObservationSha256: evidenceObservation.observationSha256,
      environmentObservationSha256: environmentObservation.environmentObservationSha256,
      evidenceWorkspaceRootIdentitySha256: evidenceObservation.workspaceRootIdentitySha256,
      validFrom: new Date(Math.max(Date.parse(evidenceObservation.observedAt), Date.parse(environmentObservation.issuedAt))).toISOString(),
      expiresAt: new Date(Math.min(Date.parse(evidenceObservation.expiresAt), Date.parse(environmentObservation.expiresAt))).toISOString()
    };
    const provider = providerReceipt(environmentObservation);
    if (!provider.usable) {
      return receipt({result: 'RECIPE_REPLAY_ISOLATION_HELD_HOST_PROVIDER_UNAVAILABLE', errorCode: provider.errorCode || 'REPLAY_ISOLATION_PROVIDER_UNAVAILABLE', context, provider});
    }
    const invocation = buildInvocation(environmentObservation);
    const outcome = spawnSync(invocation.command, invocation.args, {
      encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES,
      env: {PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C', LC_ALL: 'C'}
    });
    const evaluated = evaluateProbe(outcome);
    if (!evaluated.passed) {
      return receipt({result: 'RECIPE_REPLAY_ISOLATION_HELD_POLICY_PROBE_FAILED', errorCode: evaluated.errorCode, context, provider, probe: evaluated.probe, probeExecuted: true});
    }
    return receipt({result: 'RECIPE_REPLAY_ISOLATION_CERTIFIED_NO_PROPOSAL_EXECUTION', errorCode: null, context, provider, probe: evaluated.probe, probeExecuted: true, probePassed: true, isolationCertified: true});
  } catch (error) {
    return inputHeld(String(error?.message || 'RECIPE_REPLAY_ISOLATION_ASSESSMENT_FAILED'));
  }
}

function validateReceipt(value, {now = Date.now()} = {}) {
  digestReceipt(value, 'replayIsolationReceiptSha256', 'RECIPE_REPLAY_ISOLATION_RECEIPT');
  exactKeys(value, ['schema', 'version', 'status', 'result', 'errorCode', 'proposalSha256', 'evidenceSha256', 'evidenceObservationSha256', 'environmentObservationSha256', 'evidenceWorkspaceRootIdentitySha256', 'validFrom', 'expiresAt', 'policySha256', 'provider', 'probe', 'unresolvedGaps', 'truth', 'authority', 'replayIsolationReceiptSha256'], 'RECIPE_REPLAY_ISOLATION_RECEIPT');
  exactKeys(value.truth, Object.keys(truth()), 'RECIPE_REPLAY_ISOLATION_RECEIPT_TRUTH');
  if (value.schema !== 'axm.code.bounded-python-recipe-replay-isolation-receipt.v1' || value.version !== '1.0.0' || value.status !== 'TEST' || !ALL_RESULTS.includes(value.result) || value.policySha256 !== POLICY_SHA256 || placementRegistry.canon(value.authority) !== placementRegistry.canon(AUTHORITY)) throw Error('RECIPE_REPLAY_ISOLATION_RECEIPT_HEADER_OR_AUTHORITY_INVALID');
  if (value.truth?.proposedSourceBytesRead !== false || value.truth?.proposedBytesMountedInSandbox !== false || value.truth?.proposedModuleLoaded !== false || value.truth?.callerTestsMountedInSandbox !== false || value.truth?.callerTestClaimsReproduced !== false || value.truth?.semanticSafetyIndependentlyVerified !== false || value.truth?.humanReviewCompleted !== false || value.truth?.digestIsSignerConsentOrIdentityProof !== false || value.truth?.receiptIsReplayAuthorization !== false || value.truth?.candidateGenerated !== false || value.truth?.candidateExecuted !== false || value.truth?.workspaceRead !== false || value.truth?.workspaceMutation !== false || value.truth?.registryMutated !== false || value.truth?.recipeSelectionIssued !== false || value.truth?.activationAuthorizationIssued !== false || value.truth?.promotionOccurred !== false || value.truth?.canonChanged !== false || value.truth?.hostFilesystemIsolationObserved !== value.truth?.isolationCertified || value.truth?.hostNetworkIsolationObserved !== value.truth?.isolationCertified || value.truth?.childProcessSpawned !== value.truth?.fixedPolicyProbeExecuted || (value.truth?.fixedPolicyProbePassed && !value.truth?.fixedPolicyProbeExecuted) || (value.truth?.isolationCertified && !value.truth?.fixedPolicyProbePassed)) throw Error('RECIPE_REPLAY_ISOLATION_RECEIPT_TRUTH_INVALID');
  if (value.result === 'RECIPE_REPLAY_ISOLATION_HELD_INPUT_INVALID') {
    if (value.truth.inputsBound !== false || value.truth.fixedPolicyProbeExecuted !== false || value.truth.isolationCertified !== false || value.provider !== null || value.probe !== null) throw Error('RECIPE_REPLAY_ISOLATION_INPUT_HOLD_INVALID');
    return value;
  }
  for (const field of ['proposalSha256', 'evidenceSha256', 'evidenceObservationSha256', 'environmentObservationSha256', 'evidenceWorkspaceRootIdentitySha256']) if (!HEX64.test(value[field] || '')) throw Error('RECIPE_REPLAY_ISOLATION_RECEIPT_BINDING_INVALID');
  const validFrom = Date.parse(value.validFrom); const expiresAt = Date.parse(value.expiresAt);
  if (!Number.isFinite(validFrom) || !Number.isFinite(expiresAt) || expiresAt <= validFrom || expiresAt - validFrom > environmentHand.TTL_MS) throw Error('RECIPE_REPLAY_ISOLATION_RECEIPT_TIME_INVALID');
  if (now < validFrom) throw Error('RECIPE_REPLAY_ISOLATION_RECEIPT_FUTURE_OR_UNTIMED');
  if (now > expiresAt) throw Error('RECIPE_REPLAY_ISOLATION_RECEIPT_STALE');
  exactKeys(value.provider, ['providerId', 'installed', 'usable', 'errorCode', 'bubblewrapExecutablePathSha256', 'resourceLimitProviderId', 'prlimitExecutablePathSha256', 'fixedProbeRuntimeId', 'nodeExecutablePathSha256'], 'RECIPE_REPLAY_ISOLATION_RECEIPT_PROVIDER');
  if (value.truth.inputsBound !== true || value.provider.providerId !== 'bubblewrap' || value.provider.resourceLimitProviderId !== 'prlimit' || value.provider.fixedProbeRuntimeId !== 'node' || typeof value.provider.installed !== 'boolean' || typeof value.provider.usable !== 'boolean' || (value.provider.usable && (!value.provider.installed || value.provider.errorCode !== null || !HEX64.test(value.provider.bubblewrapExecutablePathSha256 || '') || !HEX64.test(value.provider.prlimitExecutablePathSha256 || '') || !HEX64.test(value.provider.nodeExecutablePathSha256 || '')))) throw Error('RECIPE_REPLAY_ISOLATION_RECEIPT_PROVIDER_INVALID');
  if (value.result === 'RECIPE_REPLAY_ISOLATION_HELD_HOST_PROVIDER_UNAVAILABLE') {
    if (value.provider.usable !== false || value.truth.fixedPolicyProbeExecuted !== false || value.truth.childProcessSpawned !== false || value.truth.isolationCertified !== false || value.probe !== null || placementRegistry.canon(value.unresolvedGaps) !== placementRegistry.canon(gaps(value.result))) throw Error('RECIPE_REPLAY_ISOLATION_PROVIDER_HOLD_INVALID');
  } else if (value.result === 'RECIPE_REPLAY_ISOLATION_HELD_POLICY_PROBE_FAILED') {
    exactKeys(value.probe, ['status', 'signal', 'timedOut', 'stdoutSha256', 'stderrSha256', 'assertionCount', 'passedAssertionCount'], 'RECIPE_REPLAY_ISOLATION_RECEIPT_PROBE');
    if (value.provider.usable !== true || value.truth.fixedPolicyProbeExecuted !== true || value.truth.fixedPolicyProbePassed !== false || value.truth.childProcessSpawned !== true || value.truth.isolationCertified !== false || !value.probe || placementRegistry.canon(value.unresolvedGaps) !== placementRegistry.canon(gaps(value.result))) throw Error('RECIPE_REPLAY_ISOLATION_POLICY_HOLD_INVALID');
  } else {
    exactKeys(value.probe, ['status', 'signal', 'timedOut', 'stdoutSha256', 'stderrSha256', 'assertionCount', 'passedAssertionCount'], 'RECIPE_REPLAY_ISOLATION_RECEIPT_PROBE');
    if (value.provider.usable !== true || value.errorCode !== null || value.truth.fixedPolicyProbeExecuted !== true || value.truth.fixedPolicyProbePassed !== true || value.truth.childProcessSpawned !== true || value.truth.isolationCertified !== true || value.truth.hostFilesystemIsolationObserved !== true || value.truth.hostNetworkIsolationObserved !== true || value.probe.passedAssertionCount !== value.probe.assertionCount || placementRegistry.canon(value.unresolvedGaps) !== placementRegistry.canon(gaps(value.result))) {
    throw Error('RECIPE_REPLAY_ISOLATION_CERTIFICATION_INVALID');
    }
  }
  return value;
}

function isQualifiedReceipt(value) {
  validateReceipt(value);
  return QUALIFIED_RESULTS.includes(value.result);
}

module.exports = {ADDRESS_SPACE_BYTES, AUTHORITY, MAX_OUTPUT_BYTES, POLICY, POLICY_SHA256, QUALIFIED_RESULTS, TIMEOUT_MS, assess, buildInvocation, evaluateProbe, isQualifiedReceipt, validateReceipt};
