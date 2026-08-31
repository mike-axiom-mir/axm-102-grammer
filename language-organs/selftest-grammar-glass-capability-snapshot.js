'use strict';

const assert = require('assert');
const Exporter = require('./export-grammar-glass-capability-snapshot.js');

const source = {
  repoFullName: 'mike-axiom-mir/axm-102-grammer',
  commitSha: '1'.repeat(40),
  treeSha: '2'.repeat(40),
  branch: 'selftest'
};

const a = Exporter.buildSnapshot({source});
const b = Exporter.buildSnapshot({source});

assert.deepStrictEqual(a, b, 'same source tree must export deterministically');
assert.strictEqual(a.schema, 'axm.grammar-102.capability-snapshot.v1');
assert.strictEqual(a.grammarIdentity.profileCount, 102);
assert.strictEqual(a.grammarIdentity.languageIds.length, 102);
assert.strictEqual(new Set(a.grammarIdentity.languageIds).size, 102);

assert.strictEqual(a.layers.specialistEyes.state, 'PRESENT');
assert.strictEqual(a.layers.specialistEyes.eyeCount, 102);
assert.strictEqual(a.layers.specialistEyes.items.length, 102);

assert.strictEqual(a.layers.semanticKeyboards.state, 'PRESENT');
assert.strictEqual(a.layers.semanticKeyboards.bankCount, 102);
assert.strictEqual(a.layers.semanticKeyboards.keysPerBank, 48);
assert.strictEqual(a.layers.semanticKeyboards.totalStableKeyCount, 4896);
assert.strictEqual(a.layers.semanticKeyboards.items.length, 4896);
assert.strictEqual(new Set(a.layers.semanticKeyboards.items.map(x => x.id)).size, 4896);

assert.strictEqual(a.layers.cheatcodeInfluence.state, 'PRESENT');
assert.strictEqual(a.layers.cheatcodeInfluence.meshCount, 102);
assert.strictEqual(a.layers.cheatcodeInfluence.nodeCount, 5100);
assert(a.layers.cheatcodeInfluence.edgeCount > 0);
assert.strictEqual(a.layers.cheatcodeInfluence.items.length, 5100);
assert.strictEqual(new Set(a.layers.cheatcodeInfluence.items.map(x => x.id)).size, 5100);

assert.strictEqual(a.layers.softwareDirections.state, 'UNKNOWN');
assert.strictEqual(a.layers.capabilityPassports.state, 'UNKNOWN');
assert.strictEqual(a.layers.grammarBridgeAtlas.state, 'UNKNOWN');

assert.strictEqual(a.truth.sourceRepositoryRuntimeDependency, false);
assert.strictEqual(a.truth.networkUsed, false);
assert.strictEqual(a.truth.grammarGlassImported, false);
assert.strictEqual(a.truth.missingLayerIsNotLanguageIncapability, true);
assert.strictEqual(a.truth.authority, 'NONE');
assert(/^[a-f0-9]{64}$/.test(a.capabilitySnapshotSha256));

assert.throws(
  () => Exporter.sourceMetadata({commitSha: 'bad', treeSha: '2'.repeat(40)}),
  /SOURCE_COMMIT_REQUIRED/
);

console.log(JSON.stringify({
  ok: true,
  profileCount: a.grammarIdentity.profileCount,
  specialistEyeCount: a.layers.specialistEyes.eyeCount,
  semanticKeyCount: a.layers.semanticKeyboards.totalStableKeyCount,
  cheatcodeNodeCount: a.layers.cheatcodeInfluence.nodeCount,
  cheatcodeEdgeCount: a.layers.cheatcodeInfluence.edgeCount,
  capabilitySnapshotSha256: a.capabilitySnapshotSha256,
  authority: a.truth.authority
}, null, 2));
