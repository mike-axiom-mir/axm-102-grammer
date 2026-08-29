'use strict';

const registry = require('./adapter-registry.js');
const local = require('./local-adapters.js');

const AUTHORITY = local.AUTHORITY;

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

function resolve(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return held('ADAPTER_PACKET_REQUIRED');
  if (packet.schema !== 'axm.code.frontier-direction-build-packet.v1' || packet.result !== 'FRONTIER_DIRECTION_BUILD_PACKET_READY_NO_EXECUTION_AUTHORITY') return held('ADAPTER_PACKET_NOT_READY');
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

module.exports = {AUTHORITY, resolve, execute};
