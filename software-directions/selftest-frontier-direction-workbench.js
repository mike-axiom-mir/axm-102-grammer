'use strict';

const assert = require('assert');
const registry = require('./direction-registry.js');
const workbench = require('./frontier-direction-workbench.js');

const index = workbench.validateCatalog();
assert.strictEqual(index.size, 29);

let executedBuilds = 0;
for (const profile of registry.all()) {
  for (const level of workbench.LEVELS) {
    const packet = workbench.prepare({directionId: profile.id, level});
    assert.strictEqual(packet.result, 'FRONTIER_DIRECTION_BUILD_PACKET_READY_NO_EXECUTION_AUTHORITY', `${profile.id}:${level}:packet`);
    assert.strictEqual(packet.directionId, profile.id);
    assert.strictEqual(packet.level, level);
    assert.strictEqual(packet.runPolicy.humanInterventionDuringRun, false);
    assert.strictEqual(packet.runPolicy.productionReadinessClaimed, false);
    assert.strictEqual(Object.isFrozen(packet), true);
    assert(/^[a-f0-9]{64}$/.test(packet.packetSha256));

    const trial = workbench.runTrial({directionId: profile.id, level});
    const repeat = workbench.runTrial({directionId: profile.id, level});
    assert.deepStrictEqual(repeat, trial, `${profile.id}:${level}:deterministic`);
    assert.strictEqual(trial.result, 'FRONTIER_DIRECTION_REFERENCE_BUILD_PASS', `${profile.id}:${level}:${trial.failedChecks.join(',')}`);
    assert.strictEqual(trial.checkSurfaceMatches, true);
    assert.deepStrictEqual(trial.failedChecks, []);
    assert.strictEqual(trial.capabilityEvidenceComplete, true);
    assert.strictEqual(trial.verifierEvidenceComplete, true);
    assert.strictEqual(trial.truth.productionReady, false);
    assert.strictEqual(trial.truth.fullDirectionCapabilityClaimed, false);
    assert.strictEqual(trial.build.truth.humanInterventionDuringRun, false);
    assert.strictEqual(trial.build.truth.realDeploymentPerformed, false);
    assert.strictEqual(trial.build.authority.workspaceMutation, false);
    assert.strictEqual(trial.build.authority.toolExecution, false);
    assert(trial.modeledCapabilityCoveragePercent > 0 && trial.modeledCapabilityCoveragePercent <= 100);
    assert(trial.modeledVerifierCoveragePercent > 0 && trial.modeledVerifierCoveragePercent <= 100);
    assert(trial.missingRealWorldCapabilities.length > 0, `${profile.id}:${level}:reference probe must retain real-world capability gaps`);
    assert(trial.missingRealWorldVerifiers.length > 0, `${profile.id}:${level}:reference probe must retain real-world verifier gaps`);
    assert(/^[a-f0-9]{64}$/.test(trial.trialSha256));
    assert(/^[a-f0-9]{64}$/.test(trial.buildSha256));
    executedBuilds += 1;
  }
}

assert.strictEqual(workbench.prepare({directionId: 'Game', level: 'seed'}).result, 'UNKNOWN_DIRECTION');
assert.strictEqual(workbench.prepare({directionId: 'game', level: 'large'}).result, 'TRIAL_LEVEL_REQUIRED');
assert.strictEqual(workbench.prepare({level: 'seed'}).result, 'DIRECTION_REQUIRED');
assert.strictEqual(workbench.runTrial({directionId: 'not-a-direction', level: 'seed'}).result, 'FRONTIER_DIRECTION_TRIAL_HELD');

const report = workbench.runAll();
const reportRepeat = workbench.runAll();
assert.deepStrictEqual(reportRepeat, report, 'aggregate frontier-user report is deterministic');
assert.strictEqual(report.result, 'ALL_DIRECTIONS_BEGINNER_REFERENCE_READY');
assert.strictEqual(report.directionCount, 29);
assert.strictEqual(report.buildCount, 58);
assert.strictEqual(report.passedBuildCount, 58);
assert.strictEqual(report.beginnerReferenceReadyCount, 29);
assert.strictEqual(report.productionReadyCount, 0);
assert.strictEqual(report.directionReports.length, 29);
assert(report.directionReports.every(item => item.beginnerReferenceReady));
assert(report.directionReports.every(item => item.productionReady === false));
assert(report.directionReports.every(item => item.helpfulForFrontierModel.length > 80));
assert(report.directionReports.every(item => item.needsTuning.length > 70));
assert.strictEqual(report.truth.singleFrontierModelTrial, true);
assert.strictEqual(report.truth.productionReadinessClaimed, false);
assert.strictEqual(Object.isFrozen(report), true);
assert(/^[a-f0-9]{64}$/.test(report.reportSha256));

const byId = new Map(report.directionReports.map(item => [item.directionId, item]));
assert.strictEqual(byId.get('xr-spatial').stretch.verifierCoveragePercent, 20, 'XR retains hardware and live UI gaps');
assert(byId.get('kernel-driver-runtime').needsTuning.includes('userspace model'));
assert(byId.get('robotics-industrial-control').needsTuning.includes('hardware-in-loop'));
assert(byId.get('security-identity-cryptography').needsTuning.includes('certify security'));

console.log(JSON.stringify({
  ok: true,
  directionCount: report.directionCount,
  executedBuildCount: executedBuilds,
  passedBuildCount: report.passedBuildCount,
  beginnerReferenceReadyCount: report.beginnerReferenceReadyCount,
  productionReadyCount: report.productionReadyCount,
  singleFrontierModelTrial: report.truth.singleFrontierModelTrial,
  reportSha256: report.reportSha256,
  result: report.result,
  authority: 'NONE'
}, null, 2));
