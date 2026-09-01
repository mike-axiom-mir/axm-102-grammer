'use strict';

const assert = require('assert');
const registry = require('./direction-registry.js');

const profiles = registry.all();
assert.strictEqual(profiles.length, 29, 'exactly 29 main software directions');
assert.strictEqual(new Set(profiles.map(profile => profile.id)).size, 29, 'unique direction ids');
assert.strictEqual(new Set(profiles.map(profile => profile.profileSha256)).size, 29, 'unique profile digests');

const familyCounts = profiles.reduce((counts, profile) => {
  counts[profile.family] = (counts[profile.family] || 0) + 1;
  return counts;
}, {});
assert.deepStrictEqual(familyCounts, {
  'human-interface': 8,
  'service-network': 8,
  'data-intelligence': 6,
  'system-hardware': 3,
  'creation-operations': 4
});

for (const profile of profiles) {
  assert.strictEqual(profile.schema, 'axm.code.software-direction-profile.v1');
  assert.strictEqual(profile.status, 'TEST');
  assert.strictEqual(profile.authority, 'NONE');
  assert(profile.capabilityNeeds.length >= 5, `${profile.id} capability depth`);
  assert(profile.verifierNeeds.length >= 4, `${profile.id} verifier depth`);
  assert(profile.signals.length >= 5, `${profile.id} suggestion signals`);
  assert(profile.gapQuestions.length >= 3, `${profile.id} gap questions`);
  assert.strictEqual(Object.isFrozen(profile), true, `${profile.id} frozen`);
  assert(/^[a-f0-9]{64}$/.test(profile.profileSha256), `${profile.id} digest`);
}

const axes = registry.axes();
assert.strictEqual(axes.axes.runtime.length, 11);
assert.strictEqual(axes.axes.execution.length, 10);
assert.strictEqual(axes.axes.state.length, 9);
assert.strictEqual(axes.axes.quality.length, 12);
assert.strictEqual(axes.axes.risk.length, 9);
assert.strictEqual(axes.axes.verification.length, 20);
assert.strictEqual(axes.axes.distribution.length, 12);

const game = registry.get('game');
assert(game.capabilityNeeds.includes('FRAME_LOOP'));
assert(game.capabilityNeeds.includes('DETERMINISTIC_REPLAY'));
assert(game.executionModels.includes('frame-loop'));

const embedded = registry.get('embedded-firmware-iot');
assert(embedded.capabilityNeeds.includes('BOUNDED_MEMORY'));
assert(embedded.capabilityNeeds.includes('SAFE_OTA_ROLLBACK'));
assert(embedded.typicalRuntimes.includes('embedded-controller'));

const streaming = registry.get('live-media-streaming');
assert(streaming.capabilityNeeds.includes('BUFFER_JITTER_CONTROL'));
assert(streaming.verifierNeeds.includes('latency-budget'));

const provenance = registry.provenanceRecord();
assert(provenance.sources.length >= 12);
assert.strictEqual(provenance.boundaries.singleUniversalTaxonomyClaimed, false);
assert.strictEqual(provenance.boundaries.profilesAreMutuallyExclusive, false);
assert.strictEqual(provenance.authority, 'NONE');

const snapshot = registry.snapshot();
assert.strictEqual(snapshot.profileCount, 29);
assert.strictEqual(snapshot.familyCount, 5);
assert(/^[a-f0-9]{64}$/.test(snapshot.axisCatalogSha256));
assert(/^[a-f0-9]{64}$/.test(snapshot.provenanceSha256));
assert(/^[a-f0-9]{64}$/.test(snapshot.snapshotSha256));

console.log(JSON.stringify({
  ok: true,
  profileCount: profiles.length,
  familyCounts,
  runtimeAxisCount: axes.axes.runtime.length,
  verificationAxisCount: axes.axes.verification.length,
  sourceCount: provenance.sources.length,
  snapshotSha256: snapshot.snapshotSha256,
  authority: 'NONE'
}, null, 2));
