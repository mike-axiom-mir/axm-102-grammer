'use strict';

const assert = require('assert');
const registry = require('./direction-registry.js');
const directions = require('./direction-stack.js');
const gaps = require('./direction-gap-detector.js');

for (const profile of registry.all()) {
  const stack = directions.compose({directionIds: [profile.id]});
  assert.strictEqual(stack.result, 'DIRECTION_STACK_READY_NO_AUTHORITY', profile.id);
  assert.strictEqual(stack.selectedProfiles.length, 1, profile.id);
  assert.strictEqual(stack.selectedProfiles[0].profileSha256, profile.profileSha256, profile.id);
  assert.strictEqual(stack.expectations.capabilities.length, profile.capabilityNeeds.length, profile.id);
  assert.strictEqual(stack.truth.directionIsAuthority, false, profile.id);
  assert.strictEqual(stack.authority.selection, false, profile.id);
  assert(/^[a-f0-9]{64}$/.test(stack.stackSha256), profile.id);
}

const gameInput = {
  directionIds: ['game', 'collaboration-multiplayer', 'game'],
  execution: ['hard-real-time'],
  risk: ['public-facing']
};
const game = directions.compose(gameInput);
const gameRepeat = directions.compose(gameInput);
assert.deepStrictEqual(gameRepeat, game, 'same direction stack input is deterministic');
assert.strictEqual(game.result, 'DIRECTION_STACK_READY_NO_AUTHORITY');
assert.deepStrictEqual(game.directionIds, ['game', 'collaboration-multiplayer']);
assert.strictEqual(game.duplicateDirectionCount, 1);
assert(game.expectations.capabilities.some(item => item.id === 'FRAME_LOOP' && item.sourceDirections.includes('game')));
assert(game.expectations.capabilities.some(item => item.id === 'SHARED_STATE_PROTOCOL' && item.sourceDirections.includes('collaboration-multiplayer')));
assert(game.tensions.some(item => item.id === 'REAL_TIME_DISTRIBUTED_STATE_TENSION'));
assert(game.tensions.every(item => item.automaticRejection === false));

const safetyExperiment = directions.compose({directionIds: ['simulation', 'robotics-industrial-control']});
assert(safetyExperiment.tensions.some(item => item.id === 'SAFETY_EXPERIMENT_TENSION'));

const browserInterrupt = directions.compose({directionIds: ['information-website'], execution: ['interrupt-driven']});
assert(browserInterrupt.tensions.some(item => item.id === 'BROWSER_INTERRUPT_MODEL_TENSION'));

const irreversible = directions.compose({directionIds: ['smart-contract-ledger']});
assert(irreversible.tensions.every(item => item.id !== 'IRREVERSIBLE_WITHOUT_SECURITY_REVIEW_TENSION'), 'profile supplies security review');
const irreversibleAxisOnly = directions.compose({risk: ['irreversible-deployment']});
assert(irreversibleAxisOnly.tensions.some(item => item.id === 'IRREVERSIBLE_WITHOUT_SECURITY_REVIEW_TENSION'));

assert.strictEqual(directions.compose({}).result, 'DIRECTION_INPUT_REQUIRED');
assert.strictEqual(directions.compose({directionIds: ['Game']}).result, 'UNKNOWN_DIRECTION', 'case aliases fail closed');
assert.strictEqual(directions.compose({directionIds: ['not-a-direction']}).result, 'UNKNOWN_DIRECTION');
assert.strictEqual(directions.compose({directionIds: ['game'], runtime: ['not-a-runtime']}).result, 'UNKNOWN_DIRECTION_AXIS_VALUE');
assert.strictEqual(directions.compose({directionIds: 'game'}).result, 'INVALID_DIRECTION_INPUT');

const siteSuggestion = directions.suggest({goals: ['luxury marketing site and local page']});
assert.strictEqual(siteSuggestion.result, 'DIRECTION_CANDIDATES_READY_NO_SELECTION');
assert.strictEqual(siteSuggestion.candidates[0].directionId, 'information-website');
assert.strictEqual(siteSuggestion.automaticSelection, false);
assert(siteSuggestion.candidates.every(candidate => candidate.candidateIsSelection === false));

const gameSuggestion = directions.suggest({goals: ['multiplayer RTS game with world simulation']});
assert.strictEqual(gameSuggestion.candidates[0].directionId, 'game');
assert(gameSuggestion.candidates.some(candidate => candidate.directionId === 'collaboration-multiplayer'));
assert(gameSuggestion.candidates.some(candidate => candidate.directionId === 'simulation'));

const embeddedSuggestion = directions.suggest({goals: ['low power microcontroller sensor firmware']});
assert.strictEqual(embeddedSuggestion.candidates[0].directionId, 'embedded-firmware-iot');
assert(!embeddedSuggestion.candidates.some(candidate => candidate.directionId === 'analytics-bi'), 'Power BI phrase cannot match power alone');

const quietSuggestion = directions.suggest({goals: ['do something useful']});
assert.strictEqual(quietSuggestion.result, 'NO_DIRECTION_CANDIDATE');
assert.deepStrictEqual(quietSuggestion.candidates, []);

const robotics = directions.compose({directionIds: ['robotics-industrial-control']});
const partial = gaps.evaluate({
  stack: robotics,
  languageId: 'rust',
  observed: {capabilities: ['CONTROL_LOOP', 'FAIL_SAFE_STATE'], verifiers: ['simulation']}
});
assert.strictEqual(partial.result, 'DIRECTION_GAPS_FOUND');
assert.strictEqual(partial.languageId, 'rust');
assert(partial.missingCapabilities.length > 0);
assert(partial.missingVerifiers.length > 0);
assert(partial.missingCapabilities.every(gap => gap.severity === 'HIGH'));
assert(partial.missingCapabilities.every(gap => gap.languageIncapabilityClaimed === false));
assert.strictEqual(partial.truth.missingEvidenceMeansImpossible, false);
assert.strictEqual(partial.truth.automaticLanguageSwitch, false);

const complete = gaps.evaluate({
  stack: robotics,
  languageId: 'rust',
  observed: {
    capabilities: robotics.expectations.capabilities.map(item => item.id),
    verifiers: robotics.expectations.verifiers.map(item => item.id)
  }
});
assert.strictEqual(complete.result, 'DIRECTION_EXPECTATIONS_EVIDENCED_CALLER_SUPPLIED');
assert.strictEqual(complete.coverage.capabilityPercent, 100);
assert.strictEqual(complete.coverage.verifierPercent, 100);
assert.strictEqual(complete.truth.callerEvidenceOnly, true);

const invalidEvidence = gaps.evaluate({stack: game, observed: {capabilities: 'FRAME_LOOP'}});
assert.strictEqual(invalidEvidence.result, 'INVALID_DIRECTION_GAP_EVIDENCE');

const allDirections = directions.compose({directionIds: registry.all().map(profile => profile.id)});
assert.strictEqual(allDirections.selectedProfiles.length, 29);
assert(allDirections.expectations.capabilities.length > 150);
assert(allDirections.expectations.verifiers.length >= 18);

console.log(JSON.stringify({
  ok: true,
  individuallyComposedProfiles: registry.all().length,
  hybridDirectionCount: game.directionIds.length,
  hybridCapabilityCount: game.expectations.capabilities.length,
  hybridVerifierCount: game.expectations.verifiers.length,
  hybridTensionCount: game.tensions.length,
  gameSuggestionCount: gameSuggestion.candidateCount,
  roboticsCapabilityCoverage: partial.coverage.capabilityPercent,
  roboticsVerifierCoverage: partial.coverage.verifierPercent,
  allDirectionCapabilityCount: allDirections.expectations.capabilities.length,
  authority: 'NONE'
}, null, 2));
