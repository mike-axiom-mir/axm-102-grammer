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

function reseal(value, digestField) {
  const body = mutableClone(value);
  delete body[digestField];
  body[digestField] = registry.hash(body);
  return body;
}

const gameVerification = plane.verifyExecutionReport(game, {
  expectedPacketSha256: gamePacket.packetSha256,
  expectedReportSha256: game.reportSha256
});
assert.strictEqual(gameVerification.result, 'ADAPTER_EXECUTION_REPORT_VERIFIED');
assert.deepStrictEqual(gameVerification.errorCodes, []);
assert.strictEqual(gameVerification.observedReportSha256, game.reportSha256);
assert.deepStrictEqual(plane.verifyExecutionReport(game, {
  expectedPacketSha256: gamePacket.packetSha256,
  expectedReportSha256: game.reportSha256
}), gameVerification, 'report verification is deterministic and does not rerun adapters');

const resealedObservation = mutableClone(game);
resealedObservation.verifierReceipts[0].observations = {forged: true};
resealedObservation.verifierReceipts[0] = reseal(resealedObservation.verifierReceipts[0], 'receiptSha256');
const resealedObservationReport = reseal(resealedObservation, 'reportSha256');
const resealedObservationVerification = plane.verifyExecutionReport(resealedObservationReport, {
  expectedPacketSha256: gamePacket.packetSha256,
  expectedReportSha256: game.reportSha256
});
assert.strictEqual(resealedObservationVerification.result, 'ADAPTER_EXECUTION_REPORT_HELD');
assert(resealedObservationVerification.errorCodes.includes('EXPECTED_REPORT_SHA256_MISMATCH'));

const staleRegistry = reseal({...mutableClone(game), registrySnapshotSha256: '0'.repeat(64)}, 'reportSha256');
const staleRegistryVerification = plane.verifyExecutionReport(staleRegistry, {
  expectedPacketSha256: gamePacket.packetSha256,
  expectedReportSha256: staleRegistry.reportSha256
});
assert(staleRegistryVerification.errorCodes.includes('REGISTRY_SNAPSHOT_SHA256_MISMATCH'));

const falseEvidence = mutableClone(game);
falseEvidence.verifiedVerifierIds = [];
falseEvidence.evidence.verifiers = [];
falseEvidence.adapterCoverage.verifiedVerifierCount = 0;
falseEvidence.adapterCoverage.percent = 0;
const falseEvidenceReport = reseal(falseEvidence, 'reportSha256');
const falseEvidenceVerification = plane.verifyExecutionReport(falseEvidenceReport, {
  expectedPacketSha256: gamePacket.packetSha256,
  expectedReportSha256: falseEvidenceReport.reportSha256
});
assert.strictEqual(falseEvidenceVerification.result, 'ADAPTER_EXECUTION_REPORT_HELD');
assert(falseEvidenceVerification.errorCodes.includes('VERIFIED_VERIFIER_IDS_MISMATCH'));

const widenedAuthority = mutableClone(game);
widenedAuthority.authority.workspaceMutation = true;
const widenedAuthorityReport = reseal(widenedAuthority, 'reportSha256');
const widenedAuthorityVerification = plane.verifyExecutionReport(widenedAuthorityReport, {
  expectedPacketSha256: gamePacket.packetSha256,
  expectedReportSha256: widenedAuthorityReport.reportSha256
});
assert(widenedAuthorityVerification.errorCodes.includes('REPORT_AUTHORITY_MISMATCH'));

const extendedReport = reseal({...mutableClone(game), unversionedExtension: true}, 'reportSha256');
const extendedVerification = plane.verifyExecutionReport(extendedReport, {
  expectedPacketSha256: gamePacket.packetSha256,
  expectedReportSha256: extendedReport.reportSha256
});
assert(extendedVerification.errorCodes.includes('REPORT_FIELDS_INVALID'));

const oversizedReport = reseal({...mutableClone(game), unversionedExtension: 'x'.repeat(1024 * 1024)}, 'reportSha256');
const oversizedVerification = plane.verifyExecutionReport(oversizedReport, {
  expectedPacketSha256: gamePacket.packetSha256,
  expectedReportSha256: oversizedReport.reportSha256
});
assert(oversizedVerification.errorCodes.includes('REPORT_SIZE_LIMIT_EXCEEDED'));

const wrongPacketVerification = plane.verifyExecutionReport(game, {
  expectedPacketSha256: 'f'.repeat(64),
  expectedReportSha256: game.reportSha256
});
assert(wrongPacketVerification.errorCodes.includes('EXPECTED_PACKET_SHA256_MISMATCH'));

const heldExecution = plane.execute(null);
const heldVerification = plane.verifyExecutionReport(heldExecution, {
  expectedPacketSha256: gamePacket.packetSha256,
  expectedReportSha256: heldExecution.reportSha256
});
assert(heldVerification.errorCodes.includes('REPORT_EXECUTION_RESULT_NOT_COMPLETED'));
assert.strictEqual(plane.verifyExecutionReport(null, {}).result, 'ADAPTER_EXECUTION_REPORT_HELD');

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

function mutableClone(value) {
  return JSON.parse(JSON.stringify(value));
}

const renamedChallenge = mutableClone(gamePacket);
renamedChallenge.challenge.name = `${renamedChallenge.challenge.name} (changed after packet hash)`;
const renamedResolution = plane.resolve(renamedChallenge);
const renamedExecution = plane.execute(renamedChallenge);
assert.strictEqual(renamedResolution.result, 'ADAPTER_PACKET_DIGEST_MISMATCH');
assert.strictEqual(renamedResolution.errorCode, 'PACKET_SHA256_MISMATCH');
assert.strictEqual(renamedResolution.claimedPacketSha256, gamePacket.packetSha256);
assert(/^[a-f0-9]{64}$/.test(renamedResolution.observedPacketSha256));
assert.notStrictEqual(renamedResolution.observedPacketSha256, renamedResolution.claimedPacketSha256);
assert.strictEqual(renamedExecution.result, 'ADAPTER_EXECUTION_HELD');
assert.strictEqual(renamedExecution.build, null);

const changedPolicy = mutableClone(gamePacket);
changedPolicy.runPolicy.productionReadinessClaimed = true;
assert.strictEqual(plane.resolve(changedPolicy).result, 'ADAPTER_PACKET_DIGEST_MISMATCH');
assert.strictEqual(plane.execute(changedPolicy).build, null);

const extraField = mutableClone(gamePacket);
extraField.unboundCallerNote = 'this field was not part of the prepared packet';
assert.strictEqual(plane.resolve(extraField).result, 'ADAPTER_PACKET_DIGEST_MISMATCH');

const missingDigest = mutableClone(gamePacket);
delete missingDigest.packetSha256;
const missingDigestResolution = plane.resolve(missingDigest);
assert.strictEqual(missingDigestResolution.result, 'ADAPTER_PACKET_DIGEST_REQUIRED');
assert.strictEqual(missingDigestResolution.errorCode, 'PACKET_SHA256_INVALID');
assert.strictEqual(plane.execute(missingDigest).result, 'ADAPTER_EXECUTION_HELD');

const malformedDigest = mutableClone(gamePacket);
malformedDigest.packetSha256 = 'not-a-sha256';
assert.strictEqual(plane.resolve(malformedDigest).result, 'ADAPTER_PACKET_DIGEST_REQUIRED');
assert.strictEqual(plane.execute(malformedDigest).build, null);

let buildCount = 0; let runtimeReceiptCount = 0; let verifierReceiptCount = 0; let unsupportedTargetCount = 0; let zeroCoverageBuildCount = 0; let verifiedReportCount = 0;
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
    const verification = plane.verifyExecutionReport(report, {expectedPacketSha256: packet.packetSha256, expectedReportSha256: report.reportSha256});
    assert.strictEqual(verification.result, 'ADAPTER_EXECUTION_REPORT_VERIFIED', `${profile.id}:${level}:${verification.errorCodes.join(',')}`);
    assert(/^[a-f0-9]{64}$/.test(verification.verificationSha256));
    buildCount += 1;
    verifiedReportCount += 1;
    runtimeReceiptCount += 1;
    verifierReceiptCount += report.verifierReceipts.length;
    unsupportedTargetCount += report.unsupportedVerifierTargets.length;
    if (report.adapterCoverage.percent === 0) zeroCoverageBuildCount += 1;
  }
}

assert.strictEqual(buildCount, 58);
assert.strictEqual(runtimeReceiptCount, 58);
assert.strictEqual(verifiedReportCount, 58);
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
  verifiedReportCount,
  verifierReceiptCount,
  unsupportedTargetCount,
  zeroCoverageBuildCount,
  packetIdentityRegressionCount: 5,
  executionReportAdmissionRegressionCount: 9,
  snapshotSha256: snapshot.snapshotSha256,
  authority: 'BOUNDED_LOCAL_ADAPTER_ONLY'
}, null, 2));
