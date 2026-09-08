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
assert.strictEqual(rust.directions.selected, null);
assert.strictEqual(rust.directions.gaps, null);
assert.strictEqual(rust.directions.automaticSelection, false);
assert.strictEqual(rust.directions.authority, 'NONE');
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

const suggestionOnly = router.compose({
  languageId: 'typescript',
  observation: {goals: ['Build a marketing site and local information page.']}
});
assert.strictEqual(suggestionOnly.result, 'CAPABILITY_CAPSULE_READY_NO_EXECUTION_AUTHORITY');
assert.strictEqual(suggestionOnly.directions.selected, null);
assert.strictEqual(suggestionOnly.directions.gaps, null);
assert.strictEqual(suggestionOnly.directions.suggestions.result, 'DIRECTION_CANDIDATES_READY_NO_SELECTION');
assert.strictEqual(suggestionOnly.directions.suggestions.candidates[0].directionId, 'information-website');
assert.strictEqual(suggestionOnly.directions.suggestions.candidates[0].candidateIsSelection, false);
assert.strictEqual(suggestionOnly.directions.automaticSelection, false);

const directedGame = router.compose({
  ...rustInput,
  observation: {
    ...rustInput.observation,
    goals: ['Build a multiplayer RTS game with world simulation.']
  },
  directions: {
    directionIds: ['game', 'collaboration-multiplayer'],
    execution: ['hard-real-time'],
    observed: {
      capabilities: ['FRAME_LOOP', 'SHARED_STATE_PROTOCOL'],
      verifiers: ['unit-test', 'deterministic-replay']
    }
  }
});
assert.strictEqual(directedGame.result, 'CAPABILITY_CAPSULE_READY_NO_EXECUTION_AUTHORITY');
assert.deepStrictEqual(directedGame.directions.selected.directionIds, ['game', 'collaboration-multiplayer']);
assert.strictEqual(directedGame.directions.selected.selectedProfiles.length, 2);
assert.strictEqual(directedGame.directions.selected.tensions.some(item => item.id === 'REAL_TIME_DISTRIBUTED_STATE_TENSION'), true);
assert.strictEqual(directedGame.directions.gaps.result, 'DIRECTION_GAPS_FOUND');
assert.strictEqual(directedGame.directions.gaps.languageId, 'rust');
assert.strictEqual(directedGame.directions.gaps.coverage.evidencedCapabilityCount, 2);
assert.strictEqual(directedGame.directions.gaps.coverage.evidencedVerifierCount, 2);
assert.strictEqual(directedGame.directions.gaps.truth.languageIncapabilityClaimed, false);
assert.strictEqual(directedGame.truth.directionGapIsNotLanguageIncapability, true);
assert.strictEqual(directedGame.directions.suggestions.candidates.some(item => item.directionId === 'game'), true);
assert.strictEqual(directedGame.directions.suggestions.candidates.some(item => item.directionId === 'collaboration-multiplayer'), true);
assert.strictEqual(directedGame.directions.automaticSelection, false);
assert(/^[a-f0-9]{64}$/.test(directedGame.bindings.directionStackSha256));
assert(/^[a-f0-9]{64}$/.test(directedGame.bindings.directionGapReportSha256));

const unknownDirection = router.compose({languageId: 'rust', directions: {directionIds: ['Game']}});
assert.strictEqual(unknownDirection.result, 'DIRECTION_RESOLUTION_HELD');
assert.strictEqual(unknownDirection.directionStack.result, 'UNKNOWN_DIRECTION');
assert.deepStrictEqual(unknownDirection.directionStack.unknownDirections, ['Game']);

const invalidDirectionEvidence = router.compose({languageId: 'rust', directions: {observed: 'not-an-object'}});
assert.strictEqual(invalidDirectionEvidence.result, 'INVALID_COMPOSITION_INPUT');
assert.strictEqual(invalidDirectionEvidence.errorCode, 'COMPOSITION_DIRECTION_EVIDENCE_NOT_OBJECT');

const snapshots = router.snapshotBindings();
assert.strictEqual(Object.keys(snapshots).length, 7);
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
  directionProfileCount: 29,
  suggestionOnlyTopCandidate: suggestionOnly.directions.suggestions.candidates[0].directionId,
  hybridDirections: directedGame.directions.selected.directionIds,
  hybridGapCount: directedGame.directions.gaps.missingCapabilities.length + directedGame.directions.gaps.missingVerifiers.length,
  invalidDirectionHeld: unknownDirection.directionStack.result,
  capsuleSha256: rust.capsuleSha256,
  authority: 'NONE'
}, null, 2));
