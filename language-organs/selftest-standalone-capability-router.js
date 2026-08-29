'use strict';

const assert = require('assert');
const router = require('./standalone-capability-router.js');
const registry = require('./registry.js');

for (const organ of registry.all()) {
  const resolved = router.resolveLanguage({
    languageId: organ.languageId,
    filePath: '',
    firstLine: '',
    preferredOrganId: null
  });
  assert.strictEqual(resolved.result, 'LANGUAGE_RESOLVED', `${organ.languageId} explicit resolution`);
  assert.strictEqual(resolved.organ.sha256, organ.sha256, `${organ.languageId} organ binding`);
}

const rustInput = {
  filePath: 'src/world.rs',
  operation: 'refactor',
  intent: 'refactor',
  role: 'native game runtime',
  signals: ['borrow semantics', 'unsafe boundaries', 'safe refactor', 'tests'],
  requestedStages: ['parse', 'dependencies', 'impact', 'refactor', 'verificationAdapters'],
  observation: {
    risks: ['unsafe boundaries', 'drop order'],
    gaps: ['verification evidence'],
    factCodes: ['LIFETIME_CHANGED', 'VERIFIER_MISSING'],
    semanticSignals: ['borrow semantics']
  }
};
const rust = router.compose(rustInput);
const rustRepeat = router.compose(rustInput);
assert.deepStrictEqual(rustRepeat, rust, 'composition is deterministic');
assert.strictEqual(rust.result, 'CAPABILITY_CAPSULE_READY_NO_EXECUTION_AUTHORITY');
assert.strictEqual(rust.languageId, 'rust');
assert.strictEqual(rust.resolution.source, 'DETERMINISTIC_DETECTION');
assert.strictEqual(rust.resolution.reason, 'LONGEST_EXTENSION');
assert.strictEqual(rust.plans.organ.organId, 'code.organ.rust.v1');
assert.strictEqual(rust.plans.grammar.languageId, 'rust');
assert.strictEqual(rust.plans.specialistEye.languageId, 'rust');
assert.strictEqual(rust.review.state, 'NATIVE_REVIEW');
assert.strictEqual(rust.cheatcodes.result, 'CHEATCODE_EVALUATION_READY_NO_ACTION');
assert(rust.cheatcodes.matchCount > 0);
assert.strictEqual(rust.influence.result, 'INFLUENCE_REPORT_READY_NO_ACTION');
assert(rust.influence.influenceCandidateCount > 0);
assert.strictEqual(rust.templates.result, 'TEMPLATES_SELECTED');
assert.strictEqual(rust.keyboard.result, 'MACHINE_KEYBOARD_READY');
assert.strictEqual(rust.keyboard.hotKeys.length, 12);
assert.strictEqual(rust.sourceCode, null);
assert.strictEqual(rust.truth.semanticCorrectnessClaimed, false);
assert.strictEqual(rust.truth.runtimeCorrectnessClaimed, false);
assert.strictEqual(rust.truth.workspaceMutated, false);
assert.strictEqual(rust.truth.toolExecuted, false);
assert.strictEqual(rust.authority.workspaceMutation, false);
assert.strictEqual(rust.authority.toolExecution, false);
assert.strictEqual(Object.isFrozen(rust), true);
assert.strictEqual(Object.isFrozen(rust.bindings), true);
assert(/^[a-f0-9]{64}$/.test(rust.capsuleSha256));
for (const digest of Object.values(rust.bindings)) assert(/^[a-f0-9]{64}$/.test(digest), `binding digest ${digest}`);

const ambiguous = router.compose({filePath: 'analysis/model.m'});
assert.strictEqual(ambiguous.result, 'LANGUAGE_SELECTION_REQUIRED');
assert.strictEqual(ambiguous.resolution.result, 'SELECTION_REQUIRED');
assert(ambiguous.resolution.candidates.length >= 2);
assert.strictEqual(ambiguous.sourceCode, null);

const matlab = router.compose({languageId: 'matlab-octave', filePath: 'analysis/model.m'});
assert.strictEqual(matlab.result, 'CAPABILITY_CAPSULE_READY_NO_EXECUTION_AUTHORITY');
assert.strictEqual(matlab.languageId, 'matlab-octave');
assert.strictEqual(matlab.resolution.reason, 'EXPLICIT_RESOLVES_DETECTION_AMBIGUITY');

const conflict = router.compose({languageId: 'rust', filePath: 'scripts/check.py'});
assert.strictEqual(conflict.result, 'LANGUAGE_RESOLUTION_HELD');
assert.strictEqual(conflict.resolution.result, 'EXPLICIT_LANGUAGE_SIGNAL_CONFLICT');
assert.strictEqual(conflict.resolution.detectedLanguageId, 'python');

const unknownPath = router.compose({filePath: 'assets/blob.unknown'});
assert.strictEqual(unknownPath.result, 'LANGUAGE_RESOLUTION_HELD');
assert.strictEqual(unknownPath.resolution.result, 'UNKNOWN_LANGUAGE');

const missing = router.compose({});
assert.strictEqual(missing.result, 'LANGUAGE_RESOLUTION_HELD');
assert.strictEqual(missing.resolution.result, 'LANGUAGE_REQUIRED');

const unknownExplicit = router.compose({languageId: 'not-a-language'});
assert.strictEqual(unknownExplicit.result, 'LANGUAGE_RESOLUTION_HELD');
assert.strictEqual(unknownExplicit.resolution.result, 'UNKNOWN_EXPLICIT_LANGUAGE');

const caseAlias = router.compose({languageId: 'Rust'});
assert.strictEqual(caseAlias.result, 'LANGUAGE_RESOLUTION_HELD');
assert.strictEqual(caseAlias.resolution.result, 'UNKNOWN_EXPLICIT_LANGUAGE');

const preferenceConflict = router.compose({languageId: 'rust', preferredOrganId: 'code.organ.python.v1'});
assert.strictEqual(preferenceConflict.result, 'LANGUAGE_RESOLUTION_HELD');
assert.strictEqual(preferenceConflict.resolution.result, 'EXPLICIT_LANGUAGE_PREFERENCE_CONFLICT');

const shebang = router.compose({firstLine: '#!/usr/bin/env python3', intent: 'debug'});
assert.strictEqual(shebang.result, 'CAPABILITY_CAPSULE_READY_NO_EXECUTION_AUTHORITY');
assert.strictEqual(shebang.languageId, 'python');
assert.strictEqual(shebang.resolution.reason, 'SHEBANG');

const invalid = router.compose({languageId: 'rust', signals: 'not-an-array'});
assert.strictEqual(invalid.result, 'INVALID_COMPOSITION_INPUT');
assert.strictEqual(invalid.errorCode, 'COMPOSITION_FIELD_NOT_ARRAY:signals');

const snapshots = router.snapshotBindings();
assert.strictEqual(Object.keys(snapshots).length, 6);
assert.strictEqual(Object.isFrozen(snapshots), true);

console.log(JSON.stringify({
  ok: true,
  readyLanguage: rust.languageId,
  readyResult: rust.result,
  hardCheatcodeActivations: rust.cheatcodes.matchCount,
  softInfluenceCandidates: rust.influence.influenceCandidateCount,
  selectedTemplates: rust.templates.selected.length,
  hotKeys: rust.keyboard.hotKeys.length,
  explicitLanguageResolutionCount: registry.all().length,
  ambiguityHeld: ambiguous.resolution.candidates,
  conflictHeld: conflict.resolution.result,
  capsuleSha256: rust.capsuleSha256,
  authority: 'NONE'
}, null, 2));
