'use strict';

const registry = require('./adapter-registry.js');
const local = require('./local-adapters.js');

const AUTHORITY = local.AUTHORITY;
const REPORT_VERIFICATION_AUTHORITY = Object.freeze({currentNodeVersionRead: false, boundedInMemoryExecution: false, boundedInMemoryEvidenceVerification: true, workspaceRead: false, workspaceMutation: false, childProcessExecution: false, network: false, install: false, deployment: false, physicalControl: false, promotion: false, canon: false});
const REFERENCE_BUILD_AUTHORITY = Object.freeze({workspaceRead: false, workspaceMutation: false, toolExecution: false, network: false, install: false, deployment: false, physicalControl: false, promotion: false, canon: false});
const COMPLETED_RESULTS = Object.freeze(['ADAPTER_EXECUTION_PASS', 'ADAPTER_EXECUTION_PASS_WITH_UNSUPPORTED_TARGETS', 'ADAPTER_EXECUTION_FAIL']);
const HEX64 = /^[a-f0-9]{64}$/;
const MAX_REPORT_BYTES = 1024 * 1024;
const REPORT_FIELDS = Object.freeze(['adapterCoverage', 'authority', 'build', 'evidence', 'failedAdapterIds', 'packetSha256', 'registrySnapshotSha256', 'reportSha256', 'resolutionSha256', 'result', 'runtimeReceipt', 'schema', 'status', 'truth', 'unsupportedVerifierTargets', 'verifiedVerifierIds', 'verifierReceipts', 'version']);
const RUNTIME_RECEIPT_FIELDS = Object.freeze(['adapterId', 'adapterSha256', 'authority', 'deterministic', 'firstBuildSha256', 'observedNodeVersion', 'packetSha256', 'receiptSha256', 'repeatBuildSha256', 'result', 'runtimeRequirement', 'schema', 'separatelyExecutedBuilds', 'status', 'truth', 'version']);
const VERIFIER_RECEIPT_FIELDS = Object.freeze(['adapterId', 'adapterSha256', 'authority', 'buildSha256', 'observations', 'packetSha256', 'receiptSha256', 'result', 'schema', 'status', 'truth', 'verifierId', 'version']);
const REFERENCE_BUILD_FIELDS = Object.freeze(['artifactType', 'authority', 'buildSha256', 'challengeName', 'checks', 'directionId', 'evidence', 'level', 'limitations', 'output', 'packetSha256', 'result', 'schema', 'status', 'truth', 'version']);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

function held(result, errorCode = null, details = {}) {
  const body = {schema: 'axm.code.direction-adapter-resolution.v1', version: '1.0.0', status: 'TEST', result, errorCode, ...details, authority: AUTHORITY};
  return freeze({...body, resolutionSha256: registry.hash(body)});
}

function packetIdentity(packet) {
  const claimedPacketSha256 = packet.packetSha256;
  if (typeof claimedPacketSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(claimedPacketSha256)) {
    return {valid: false, result: 'ADAPTER_PACKET_DIGEST_REQUIRED', errorCode: 'PACKET_SHA256_INVALID', claimedPacketSha256: typeof claimedPacketSha256 === 'string' ? claimedPacketSha256 : null, observedPacketSha256: null};
  }
  const body = {...packet};
  delete body.packetSha256;
  let observedPacketSha256;
  try {
    observedPacketSha256 = registry.hash(body);
  } catch (error) {
    return {valid: false, result: 'ADAPTER_PACKET_DIGEST_UNVERIFIABLE', errorCode: 'PACKET_CANONICALIZATION_FAILED', claimedPacketSha256, observedPacketSha256: null};
  }
  if (observedPacketSha256 !== claimedPacketSha256) {
    return {valid: false, result: 'ADAPTER_PACKET_DIGEST_MISMATCH', errorCode: 'PACKET_SHA256_MISMATCH', claimedPacketSha256, observedPacketSha256};
  }
  return {valid: true, claimedPacketSha256, observedPacketSha256};
}

function resolve(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return held('ADAPTER_PACKET_REQUIRED');
  if (packet.schema !== 'axm.code.frontier-direction-build-packet.v1' || packet.result !== 'FRONTIER_DIRECTION_BUILD_PACKET_READY_NO_EXECUTION_AUTHORITY') return held('ADAPTER_PACKET_NOT_READY');
  const identity = packetIdentity(packet);
  if (!identity.valid) return held(identity.result, identity.errorCode, {claimedPacketSha256: identity.claimedPacketSha256, observedPacketSha256: identity.observedPacketSha256});
  if (!packet.challenge || typeof packet.challenge !== 'object' || Array.isArray(packet.challenge)) return held('ADAPTER_PACKET_CHALLENGE_INVALID');
  const requested = packet.challenge.requestedVerifiers;
  if (!Array.isArray(requested) || requested.some(id => typeof id !== 'string')) return held('ADAPTER_VERIFIER_TARGETS_INVALID');
  const runtimeAdapter = registry.all().find(adapter => adapter.kind === 'runtime');
  const resolved = []; const unsupported = [];
  for (const verifierId of requested) {
    const adapter = registry.forVerifier(verifierId);
    if (adapter) resolved.push({verifierId, adapterId: adapter.id, adapterSha256: adapter.adapterSha256});
    else unsupported.push({verifierId, reason: 'NO_BOUNDED_LOCAL_ADAPTER', languageIncapabilityClaimed: false, directionFailureClaimed: false, suggestedNextBinding: `Bind an external or specialized ${verifierId} adapter and preserve its receipt.`});
  }
  const body = {
    schema: 'axm.code.direction-adapter-resolution.v1',
    version: '1.0.0',
    status: 'TEST',
    result: unsupported.length ? 'ADAPTERS_RESOLVED_WITH_UNSUPPORTED_TARGETS' : 'ALL_REQUESTED_ADAPTERS_RESOLVED',
    packetSha256: packet.packetSha256,
    observedRuntime: {name: 'node', version: process.version, major: Number(process.versions.node.split('.')[0])},
    runtimeAdapter: {adapterId: runtimeAdapter.id, adapterSha256: runtimeAdapter.adapterSha256},
    requestedVerifierIds: [...requested],
    resolvedVerifierAdapters: resolved,
    unsupportedVerifierTargets: unsupported,
    automaticInstall: false,
    automaticExternalToolUse: false,
    truth: {resolutionIsExecutionEvidence: false, unsupportedMeansLanguageIncapability: false, unsupportedMeansDirectionFailure: false},
    authority: AUTHORITY
  };
  return freeze({...body, resolutionSha256: registry.hash(body)});
}

function execute(packet) {
  const resolution = resolve(packet);
  if (!['ADAPTERS_RESOLVED_WITH_UNSUPPORTED_TARGETS', 'ALL_REQUESTED_ADAPTERS_RESOLVED'].includes(resolution.result)) {
    const body = {schema: 'axm.code.direction-adapter-execution-report.v1', version: '1.0.0', status: 'TEST', result: 'ADAPTER_EXECUTION_HELD', resolution, build: null, authority: AUTHORITY};
    return freeze({...body, reportSha256: registry.hash(body)});
  }
  const runtime = local.runtimeReceipt(packet);
  const verifierReceipts = resolution.resolvedVerifierAdapters.map(binding => local.verifierReceipt(registry.get(binding.adapterId), {packet, build: runtime.build, repeatBuild: runtime.repeatBuild}));
  const failedReceipts = verifierReceipts.filter(receipt => receipt.result !== 'VERIFIER_ADAPTER_PASS');
  const verifiedVerifierIds = verifierReceipts.filter(receipt => receipt.result === 'VERIFIER_ADAPTER_PASS').map(receipt => receipt.verifierId);
  const passed = runtime.receipt.result === 'RUNTIME_ADAPTER_PASS' && failedReceipts.length === 0;
  const body = {
    schema: 'axm.code.direction-adapter-execution-report.v1',
    version: '1.0.0',
    status: 'TEST',
    result: passed ? (resolution.unsupportedVerifierTargets.length ? 'ADAPTER_EXECUTION_PASS_WITH_UNSUPPORTED_TARGETS' : 'ADAPTER_EXECUTION_PASS') : 'ADAPTER_EXECUTION_FAIL',
    packetSha256: packet.packetSha256,
    resolutionSha256: resolution.resolutionSha256,
    registrySnapshotSha256: registry.snapshot().snapshotSha256,
    runtimeReceipt: runtime.receipt,
    verifierReceipts,
    failedAdapterIds: failedReceipts.map(receipt => receipt.adapterId),
    verifiedVerifierIds,
    unsupportedVerifierTargets: resolution.unsupportedVerifierTargets,
    adapterCoverage: {
      requestedVerifierCount: resolution.requestedVerifierIds.length,
      verifiedVerifierCount: verifiedVerifierIds.length,
      unsupportedVerifierCount: resolution.unsupportedVerifierTargets.length,
      percent: resolution.requestedVerifierIds.length ? Math.round((verifiedVerifierIds.length / resolution.requestedVerifierIds.length) * 10000) / 100 : 100
    },
    build: runtime.build,
    evidence: {capabilities: runtime.build.evidence.capabilities, verifiers: verifiedVerifierIds},
    truth: {passedReceiptIsBoundedEvidence: true, unsupportedMeansLanguageIncapability: false, productionReady: false, externalToolUsed: false, workspaceMutated: false},
    authority: AUTHORITY
  };
  return freeze({...body, reportSha256: registry.hash(body)});
}

function same(left, right) {
  try { return registry.canon(left) === registry.canon(right); } catch (error) { return false; }
}

function digestWithout(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const body = {...value};
    delete body[field];
    return registry.hash(body);
  } catch (error) {
    return null;
  }
}

function strictJsonSize(value) {
  const seen = new Set();
  let nodes = 0;
  function visit(item) {
    nodes += 1;
    if (nodes > 100000) throw Error('NODE_LIMIT');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw Error('NON_FINITE_NUMBER');
      return;
    }
    if (!item || typeof item !== 'object') throw Error('NON_JSON_VALUE');
    if (seen.has(item)) throw Error('CYCLIC_VALUE');
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw Error('NON_PLAIN_OBJECT');
    seen.add(item);
    for (const key of Object.keys(item)) visit(item[key]);
    seen.delete(item);
  }
  try {
    visit(value);
    return Buffer.byteLength(registry.canon(value), 'utf8');
  } catch (error) {
    return null;
  }
}

function verificationReceipt(report, options, errorCodes, observedReportSha256) {
  const expectedPacketSha256 = options && typeof options.expectedPacketSha256 === 'string' ? options.expectedPacketSha256 : null;
  const expectedReportSha256 = options && typeof options.expectedReportSha256 === 'string' ? options.expectedReportSha256 : null;
  const observedPacketSha256 = report && typeof report === 'object' && typeof report.packetSha256 === 'string' ? report.packetSha256 : null;
  const reportResult = report && typeof report === 'object' && typeof report.result === 'string' ? report.result : null;
  const errors = [...new Set(errorCodes)];
  const body = {
    schema: 'axm.code.direction-adapter-execution-verification.v1',
    version: '1.0.0',
    status: 'TEST',
    result: errors.length ? 'ADAPTER_EXECUTION_REPORT_HELD' : 'ADAPTER_EXECUTION_REPORT_VERIFIED',
    errorCodes: errors,
    expectedPacketSha256,
    observedPacketSha256,
    expectedReportSha256,
    observedReportSha256,
    registrySnapshotSha256: registry.snapshot().snapshotSha256,
    reportResult,
    truth: {
      reportBytesMatchCallerPin: Boolean(HEX64.test(expectedReportSha256 || '') && observedReportSha256 === expectedReportSha256),
      packetIdentityMatchesCallerPin: Boolean(HEX64.test(expectedPacketSha256 || '') && observedPacketSha256 === expectedPacketSha256),
      adaptersReexecuted: false,
      contentIdentityIsAuthentication: false,
      verificationIsUniversalProof: false,
      verificationIsPromotion: false
    },
    authority: REPORT_VERIFICATION_AUTHORITY
  };
  return freeze({...body, verificationSha256: registry.hash(body)});
}

function verifyExecutionReport(report, options = {}) {
  const errors = [];
  const add = code => { if (!errors.includes(code)) errors.push(code); };
  const expectedPacketSha256 = options && options.expectedPacketSha256;
  const expectedReportSha256 = options && options.expectedReportSha256;
  if (!HEX64.test(expectedPacketSha256 || '')) add('EXPECTED_PACKET_SHA256_INVALID');
  if (!HEX64.test(expectedReportSha256 || '')) add('EXPECTED_REPORT_SHA256_INVALID');
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    add('REPORT_REQUIRED');
    return verificationReceipt(report, options, errors, null);
  }
  const reportBytes = strictJsonSize(report);
  if (reportBytes === null) add('REPORT_STRICT_JSON_INVALID');
  else if (reportBytes > MAX_REPORT_BYTES) add('REPORT_SIZE_LIMIT_EXCEEDED');
  const observedReportSha256 = digestWithout(report, 'reportSha256');
  if (!HEX64.test(report.reportSha256 || '')) add('REPORT_SHA256_INVALID');
  if (!observedReportSha256) add('REPORT_CANONICALIZATION_FAILED');
  else if (observedReportSha256 !== report.reportSha256) add('REPORT_SHA256_MISMATCH');
  if (HEX64.test(expectedReportSha256 || '') && observedReportSha256 !== expectedReportSha256) add('EXPECTED_REPORT_SHA256_MISMATCH');
  if (report.schema !== 'axm.code.direction-adapter-execution-report.v1' || report.version !== '1.0.0' || report.status !== 'TEST') add('REPORT_HEADER_INVALID');
  if (!same(Object.keys(report).sort(), REPORT_FIELDS)) add('REPORT_FIELDS_INVALID');
  if (!COMPLETED_RESULTS.includes(report.result)) {
    add('REPORT_EXECUTION_RESULT_NOT_COMPLETED');
    return verificationReceipt(report, options, errors, observedReportSha256);
  }
  if (!HEX64.test(report.packetSha256 || '')) add('REPORT_PACKET_SHA256_INVALID');
  if (HEX64.test(expectedPacketSha256 || '') && report.packetSha256 !== expectedPacketSha256) add('EXPECTED_PACKET_SHA256_MISMATCH');
  if (!same(report.authority, AUTHORITY)) add('REPORT_AUTHORITY_MISMATCH');
  if (report.registrySnapshotSha256 !== registry.snapshot().snapshotSha256) add('REGISTRY_SNAPSHOT_SHA256_MISMATCH');

  const runtime = report.runtimeReceipt;
  const build = report.build;
  const verifierReceipts = report.verifierReceipts;
  const unsupported = report.unsupportedVerifierTargets;
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) add('RUNTIME_RECEIPT_REQUIRED');
  if (!build || typeof build !== 'object' || Array.isArray(build)) add('REFERENCE_BUILD_REQUIRED');
  if (!Array.isArray(verifierReceipts)) add('VERIFIER_RECEIPTS_INVALID');
  if (!Array.isArray(unsupported)) add('UNSUPPORTED_VERIFIER_TARGETS_INVALID');
  if (errors.includes('RUNTIME_RECEIPT_REQUIRED') || errors.includes('REFERENCE_BUILD_REQUIRED') || errors.includes('VERIFIER_RECEIPTS_INVALID') || errors.includes('UNSUPPORTED_VERIFIER_TARGETS_INVALID')) {
    return verificationReceipt(report, options, errors, observedReportSha256);
  }

  const runtimeAdapter = registry.all().find(adapter => adapter.kind === 'runtime');
  if (runtime.schema !== 'axm.code.direction-runtime-adapter-receipt.v1' || runtime.version !== '1.0.0' || runtime.status !== 'TEST') add('RUNTIME_RECEIPT_HEADER_INVALID');
  if (!same(Object.keys(runtime).sort(), RUNTIME_RECEIPT_FIELDS)) add('RUNTIME_RECEIPT_FIELDS_INVALID');
  if (digestWithout(runtime, 'receiptSha256') !== runtime.receiptSha256) add('RUNTIME_RECEIPT_SHA256_MISMATCH');
  if (runtime.packetSha256 !== report.packetSha256) add('RUNTIME_PACKET_SHA256_MISMATCH');
  if (!runtimeAdapter || runtime.adapterId !== runtimeAdapter.id || runtime.adapterSha256 !== runtimeAdapter.adapterSha256) add('RUNTIME_ADAPTER_BINDING_MISMATCH');
  if (!same(runtime.authority, AUTHORITY)) add('RUNTIME_AUTHORITY_MISMATCH');
  if (runtime.firstBuildSha256 !== build.buildSha256) add('RUNTIME_BUILD_SHA256_MISMATCH');
  if (runtime.separatelyExecutedBuilds !== 2) add('RUNTIME_REPLAY_COUNT_MISMATCH');
  const replayMatches = runtime.firstBuildSha256 === runtime.repeatBuildSha256;
  if (runtime.deterministic !== replayMatches) add('RUNTIME_DETERMINISM_SUMMARY_MISMATCH');
  if (!['RUNTIME_ADAPTER_PASS', 'RUNTIME_ADAPTER_FAIL'].includes(runtime.result)) add('RUNTIME_RESULT_INVALID');
  if (runtime.result === 'RUNTIME_ADAPTER_PASS' && !replayMatches) add('RUNTIME_PASS_REPLAY_MISMATCH');

  if (build.schema !== 'axm.code.frontier-direction-reference-build.v1' || build.version !== '1.0.0' || build.status !== 'TEST' || build.result !== 'REFERENCE_BUILD_EXECUTED') add('REFERENCE_BUILD_HEADER_INVALID');
  if (!same(Object.keys(build).sort(), REFERENCE_BUILD_FIELDS)) add('REFERENCE_BUILD_FIELDS_INVALID');
  if (digestWithout(build, 'buildSha256') !== build.buildSha256) add('REFERENCE_BUILD_SHA256_MISMATCH');
  if (build.packetSha256 !== report.packetSha256) add('REFERENCE_BUILD_PACKET_SHA256_MISMATCH');
  if (!same(build.authority, REFERENCE_BUILD_AUTHORITY)) add('REFERENCE_BUILD_AUTHORITY_MISMATCH');

  const requestedVerifierIds = build.evidence && Array.isArray(build.evidence.verifierTargets) ? build.evidence.verifierTargets : null;
  if (!requestedVerifierIds || requestedVerifierIds.some(id => typeof id !== 'string')) add('REFERENCE_BUILD_VERIFIER_TARGETS_INVALID');
  const expectedBindings = requestedVerifierIds ? requestedVerifierIds.map(verifierId => ({verifierId, adapter: registry.forVerifier(verifierId)})).filter(item => item.adapter) : [];
  const expectedUnsupported = requestedVerifierIds ? requestedVerifierIds.filter(verifierId => !registry.forVerifier(verifierId)).map(verifierId => ({verifierId, reason: 'NO_BOUNDED_LOCAL_ADAPTER', languageIncapabilityClaimed: false, directionFailureClaimed: false, suggestedNextBinding: `Bind an external or specialized ${verifierId} adapter and preserve its receipt.`})) : [];
  if (!same(unsupported, expectedUnsupported)) add('UNSUPPORTED_VERIFIER_TARGETS_MISMATCH');
  const runtimeVersionMatch = typeof runtime.observedNodeVersion === 'string' ? /^v(\d+)\./.exec(runtime.observedNodeVersion) : null;
  if (!runtimeVersionMatch) add('RUNTIME_OBSERVED_NODE_VERSION_INVALID');
  if (requestedVerifierIds && runtimeVersionMatch && runtimeAdapter) {
    const resolutionBody = {
      schema: 'axm.code.direction-adapter-resolution.v1',
      version: '1.0.0',
      status: 'TEST',
      result: expectedUnsupported.length ? 'ADAPTERS_RESOLVED_WITH_UNSUPPORTED_TARGETS' : 'ALL_REQUESTED_ADAPTERS_RESOLVED',
      packetSha256: report.packetSha256,
      observedRuntime: {name: 'node', version: runtime.observedNodeVersion, major: Number(runtimeVersionMatch[1])},
      runtimeAdapter: {adapterId: runtimeAdapter.id, adapterSha256: runtimeAdapter.adapterSha256},
      requestedVerifierIds: requestedVerifierIds,
      resolvedVerifierAdapters: expectedBindings.map(item => ({verifierId: item.verifierId, adapterId: item.adapter.id, adapterSha256: item.adapter.adapterSha256})),
      unsupportedVerifierTargets: expectedUnsupported,
      automaticInstall: false,
      automaticExternalToolUse: false,
      truth: {resolutionIsExecutionEvidence: false, unsupportedMeansLanguageIncapability: false, unsupportedMeansDirectionFailure: false},
      authority: AUTHORITY
    };
    if (report.resolutionSha256 !== registry.hash(resolutionBody)) add('RESOLUTION_SHA256_MISMATCH');
  }
  if (verifierReceipts.length !== expectedBindings.length) add('VERIFIER_RECEIPT_COUNT_MISMATCH');

  for (let index = 0; index < verifierReceipts.length; index += 1) {
    const receipt = verifierReceipts[index];
    const binding = expectedBindings[index];
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) { add('VERIFIER_RECEIPT_INVALID'); continue; }
    if (receipt.schema !== 'axm.code.direction-verifier-adapter-receipt.v1' || receipt.version !== '1.0.0' || receipt.status !== 'TEST') add('VERIFIER_RECEIPT_HEADER_INVALID');
    if (!same(Object.keys(receipt).sort(), VERIFIER_RECEIPT_FIELDS)) add('VERIFIER_RECEIPT_FIELDS_INVALID');
    if (digestWithout(receipt, 'receiptSha256') !== receipt.receiptSha256) add('VERIFIER_RECEIPT_SHA256_MISMATCH');
    if (receipt.packetSha256 !== report.packetSha256) add('VERIFIER_RECEIPT_PACKET_SHA256_MISMATCH');
    if (receipt.buildSha256 !== build.buildSha256) add('VERIFIER_RECEIPT_BUILD_SHA256_MISMATCH');
    if (!binding || receipt.verifierId !== binding.verifierId || receipt.adapterId !== binding.adapter.id || receipt.adapterSha256 !== binding.adapter.adapterSha256) add('VERIFIER_ADAPTER_BINDING_MISMATCH');
    if (!['VERIFIER_ADAPTER_PASS', 'VERIFIER_ADAPTER_FAIL'].includes(receipt.result)) add('VERIFIER_RECEIPT_RESULT_INVALID');
    if (!same(receipt.authority, AUTHORITY)) add('VERIFIER_RECEIPT_AUTHORITY_MISMATCH');
  }

  const passingReceipts = verifierReceipts.filter(receipt => receipt && receipt.result === 'VERIFIER_ADAPTER_PASS');
  const failedReceipts = verifierReceipts.filter(receipt => !receipt || receipt.result !== 'VERIFIER_ADAPTER_PASS');
  const expectedVerifiedIds = passingReceipts.map(receipt => receipt.verifierId);
  const expectedFailedAdapterIds = failedReceipts.map(receipt => receipt && receipt.adapterId).filter(Boolean);
  if (!same(report.verifiedVerifierIds, expectedVerifiedIds)) add('VERIFIED_VERIFIER_IDS_MISMATCH');
  if (!same(report.failedAdapterIds, expectedFailedAdapterIds)) add('FAILED_ADAPTER_IDS_MISMATCH');
  const expectedCoverage = {
    requestedVerifierCount: requestedVerifierIds ? requestedVerifierIds.length : 0,
    verifiedVerifierCount: expectedVerifiedIds.length,
    unsupportedVerifierCount: expectedUnsupported.length,
    percent: requestedVerifierIds && requestedVerifierIds.length ? Math.round((expectedVerifiedIds.length / requestedVerifierIds.length) * 10000) / 100 : 100
  };
  if (!same(report.adapterCoverage, expectedCoverage)) add('ADAPTER_COVERAGE_MISMATCH');
  if (!report.evidence || !same(report.evidence.capabilities, build.evidence && build.evidence.capabilities) || !same(report.evidence.verifiers, expectedVerifiedIds)) add('REPORT_EVIDENCE_SUMMARY_MISMATCH');
  const passed = runtime.result === 'RUNTIME_ADAPTER_PASS' && failedReceipts.length === 0;
  const expectedResult = passed ? (expectedUnsupported.length ? 'ADAPTER_EXECUTION_PASS_WITH_UNSUPPORTED_TARGETS' : 'ADAPTER_EXECUTION_PASS') : 'ADAPTER_EXECUTION_FAIL';
  if (report.result !== expectedResult) add('REPORT_RESULT_MISMATCH');
  const expectedTruth = {passedReceiptIsBoundedEvidence: true, unsupportedMeansLanguageIncapability: false, productionReady: false, externalToolUsed: false, workspaceMutated: false};
  if (!same(report.truth, expectedTruth)) add('REPORT_TRUTH_BOUNDARY_MISMATCH');
  return verificationReceipt(report, options, errors, observedReportSha256);
}

module.exports = {AUTHORITY, REPORT_VERIFICATION_AUTHORITY, resolve, execute, verifyExecutionReport};
