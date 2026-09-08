'use strict';

const assert = require('assert');
const registry = require('./placement-registry.js');
const hand = require('./toolchain-environment-hand.js');

const observation = hand.inspect();
hand.validate(observation);
assert.strictEqual(observation.tools.length, 4);
assert.strictEqual(hand.get(observation, 'node').usable, true);
assert.strictEqual(hand.get(observation, 'python3').usable, true);
assert.strictEqual(observation.truth.candidateCodeExecuted, false);
assert.strictEqual(observation.truth.workspaceRead, false);
assert.strictEqual(observation.truth.workspaceMutation, false);
assert.strictEqual(observation.authority.candidateExecution, false);
const bubblewrap = hand.get(observation, 'bubblewrap');
if (bubblewrap.usable) {
  assert.strictEqual(observation.candidateExecutionIsolation.hostEnforcedFilesystemIsolation, true);
  assert.strictEqual(observation.candidateExecutionIsolation.hostEnforcedNetworkIsolation, true);
} else {
  assert(observation.environmentSeams.includes(`HOST_SANDBOX_UNAVAILABLE:${bubblewrap.errorCode}`));
  assert.strictEqual(observation.candidateExecutionIsolation.hostEnforcedFilesystemIsolation, false);
  assert.strictEqual(observation.candidateExecutionIsolation.hostEnforcedNetworkIsolation, false);
}

const tampered = JSON.parse(JSON.stringify(observation)); tampered.platform.os = 'forged';
assert.throws(() => hand.validate(tampered), /DIGEST_MISMATCH/);
const stale = JSON.parse(JSON.stringify(observation));
const staleIssuedMs = Date.now() - hand.TTL_MS - 1000;
stale.issuedAt = new Date(staleIssuedMs).toISOString(); stale.expiresAt = new Date(staleIssuedMs + hand.TTL_MS).toISOString(); stale.ttlMs = hand.TTL_MS;
delete stale.environmentObservationSha256; stale.environmentObservationSha256 = registry.hash(stale);
assert.throws(() => hand.validate(stale), /STALE/);
const forgedPath = JSON.parse(JSON.stringify(observation)); const python = forgedPath.tools.find(value => value.id === 'python3'); python.executablePath = '/bin/false'; python.executablePathSha256 = registry.hash(python.executablePath); delete forgedPath.environmentObservationSha256; forgedPath.environmentObservationSha256 = registry.hash(forgedPath);
assert.throws(() => hand.validate(forgedPath), /TOOL_PATH_BINDING_INVALID/);

console.log(JSON.stringify({ok: true, installedToolCount: observation.tools.filter(value => value.installed).length, usableToolCount: observation.tools.filter(value => value.usable).length, fixedProbeCount: observation.tools.length, liveToolPathBindings: observation.tools.length, candidateExecutions: 0, workspaceReads: 0, workspaceMutations: 0, sandboxProvider: bubblewrap.id, sandboxUsable: bubblewrap.usable, sandboxErrorCode: bubblewrap.errorCode, adversarialHolds: 3}, null, 2));
