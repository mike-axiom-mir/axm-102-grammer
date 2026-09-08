'use strict';

const assert = require('assert');
const directionRegistry = require('../direction-registry.js');
const workbench = require('../frontier-direction-workbench.js');
const registry = require('./adapter-registry.js');
const plane = require('./adapter-plane.js');

const adapters = registry.all();
const snapshot = registry.snapshot();
assert.strictEqual(adapters.length, 10);
assert.strictEqual(adapters.filter(item => item.kind === 'runtime').length, 1);
assert.strictEqual(adapters.filter(item => item.kind === 'verifier').length, 9);
assert.strictEqual(new Set(adapters.map(item => item.adapterSha256)).size, 10);
assert(adapters.every(item => /^[a-f0-9]{64}$/.test(item.adapterSha256)));
assert.strictEqual(snapshot.supportedVerifierIds.length, 9);
assert.strictEqual(snapshot.unsupportedVerifierIds.length, 11);
assert.strictEqual(snapshot.supportedVerifierIds.length + snapshot.unsupportedVerifierIds.length, directionRegistry.axes().axes.verification.length);
assert.strictEqual(new Set([...snapshot.supportedVerifierIds, ...snapshot.unsupportedVerifierIds]).size, 20);
assert(/^[a-f0-9]{64}$/.test(snapshot.snapshotSha256));

const sitePacket = workbench.prepare({directionId: 'information-website', level: 'seed'});
const site = plane.execute(sitePacket);
assert.strictEqual(site.result, 'ADAPTER_EXECUTION_PASS');
assert.strictEqual(site.runtimeReceipt.result, 'RUNTIME_ADAPTER_PASS');
assert.deepStrictEqual(site.verifiedVerifierIds, ['structural-parse']);
assert.strictEqual(site.adapterCoverage.percent, 100);
assert.strictEqual(site.verifierReceipts[0].observations.boundedParser, 'reference-html-structure');

const gamePacket = workbench.prepare({directionId: 'game', level: 'stretch'});
const game = plane.execute(gamePacket);
const gameRepeat = plane.execute(gamePacket);
assert.deepStrictEqual(gameRepeat, game, 'adapter execution is deterministic in the same runtime');
assert.strictEqual(game.result, 'ADAPTER_EXECUTION_PASS');
assert.deepStrictEqual([...game.verifiedVerifierIds].sort(), ['deterministic-replay', 'unit-test']);
assert(game.verifierReceipts.every(receipt => receipt.result === 'VERIFIER_ADAPTER_PASS'));
assert.strictEqual(game.runtimeReceipt.separatelyExecutedBuilds, 2);
assert.strictEqual(game.runtimeReceipt.deterministic, true);

const xrPacket = workbench.prepare({directionId: 'xr-spatial', level: 'stretch'});
const xrResolution = plane.resolve(xrPacket);
const xr = plane.execute(xrPacket);
assert.strictEqual(xrResolution.result, 'ADAPTERS_RESOLVED_WITH_UNSUPPORTED_TARGETS');
assert.strictEqual(xr.result, 'ADAPTER_EXECUTION_PASS_WITH_UNSUPPORTED_TARGETS');
assert.strictEqual(xr.runtimeReceipt.result, 'RUNTIME_ADAPTER_PASS');
assert.deepStrictEqual(xr.verifiedVerifierIds, []);
assert.strictEqual(xr.adapterCoverage.percent, 0);
assert.deepStrictEqual(xr.unsupportedVerifierTargets.map(item => item.verifierId), ['conformance-suite']);
assert(xr.unsupportedVerifierTargets.every(item => item.languageIncapabilityClaimed === false));
assert(xr.unsupportedVerifierTargets.every(item => item.directionFailureClaimed === false));

const firmware = plane.execute(workbench.prepare({directionId: 'embedded-firmware-iot', level: 'stretch'}));
assert.strictEqual(firmware.result, 'ADAPTER_EXECUTION_PASS');
assert.deepStrictEqual([...firmware.verifiedVerifierIds].sort(), ['recovery-test', 'simulation']);
assert(firmware.verifierReceipts.find(item => item.verifierId === 'simulation').observations.explicitlySimulation);

assert.strictEqual(plane.resolve(null).result, 'ADAPTER_PACKET_REQUIRED');
assert.strictEqual(plane.resolve({schema: 'wrong'}).result, 'ADAPTER_PACKET_NOT_READY');
assert.strictEqual(plane.execute(null).result, 'ADAPTER_EXECUTION_HELD');

let buildCount = 0; let runtimeReceiptCount = 0; let verifierReceiptCount = 0; let unsupportedTargetCount = 0; let zeroCoverageBuildCount = 0;
for (const profile of directionRegistry.all()) {
  for (const level of workbench.LEVELS) {
    const packet = workbench.prepare({directionId: profile.id, level});
    const report = plane.execute(packet);
    assert(['ADAPTER_EXECUTION_PASS', 'ADAPTER_EXECUTION_PASS_WITH_UNSUPPORTED_TARGETS'].includes(report.result), `${profile.id}:${level}`);
    assert.strictEqual(report.runtimeReceipt.result, 'RUNTIME_ADAPTER_PASS', `${profile.id}:${level}`);
    assert.strictEqual(report.runtimeReceipt.truth.workspaceUsed, false);
    assert.strictEqual(report.runtimeReceipt.truth.childProcessUsed, false);
    assert(report.verifierReceipts.every(receipt => receipt.result === 'VERIFIER_ADAPTER_PASS'), `${profile.id}:${level}`);
    assert(report.verifierReceipts.every(receipt => receipt.truth.externalToolUsed === false));
    assert.strictEqual(report.adapterCoverage.requestedVerifierCount, report.adapterCoverage.verifiedVerifierCount + report.adapterCoverage.unsupportedVerifierCount);
    assert.strictEqual(report.truth.unsupportedMeansLanguageIncapability, false);
    assert.strictEqual(report.truth.productionReady, false);
    assert.strictEqual(report.authority.workspaceRead, false);
    assert.strictEqual(report.authority.workspaceMutation, false);
    assert.strictEqual(report.authority.childProcessExecution, false);
    assert.strictEqual(report.authority.network, false);
    assert(/^[a-f0-9]{64}$/.test(report.reportSha256));
    buildCount += 1;
    runtimeReceiptCount += 1;
    verifierReceiptCount += report.verifierReceipts.length;
    unsupportedTargetCount += report.unsupportedVerifierTargets.length;
    if (report.adapterCoverage.percent === 0) zeroCoverageBuildCount += 1;
  }
}

assert.strictEqual(buildCount, 58);
assert.strictEqual(runtimeReceiptCount, 58);
assert.strictEqual(verifierReceiptCount, 76);
assert.strictEqual(unsupportedTargetCount, 20);
assert(zeroCoverageBuildCount > 0, 'unsupported-only builds remain visible');

console.log(JSON.stringify({
  ok: true,
  adapterCount: adapters.length,
  supportedVerifierAdapterCount: snapshot.supportedVerifierIds.length,
  unsupportedVerifierIdCount: snapshot.unsupportedVerifierIds.length,
  buildCount,
  runtimeReceiptCount,
  verifierReceiptCount,
  unsupportedTargetCount,
  zeroCoverageBuildCount,
  snapshotSha256: snapshot.snapshotSha256,
  authority: 'BOUNDED_LOCAL_ADAPTER_ONLY'
}, null, 2));
