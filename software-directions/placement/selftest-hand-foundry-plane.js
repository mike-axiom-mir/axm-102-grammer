'use strict';

const assert = require('assert');
const fs = require('fs');
const registry = require('./placement-registry.js');
const foundry = require('./hand-foundry-plane.js');
const parser = require('./spawned-parser-hand.js');
const environmentHand = require('./toolchain-environment-hand.js');
const pythonFixtureFactory = require('./python-hand-foundry-test-fixture.js');
const graphFixtureFactory = require('./edit-graph-test-fixture.js');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function redigest(value, field) { delete value[field]; value[field] = registry.hash(value); return value; }
function capsule(manifest, role) { return manifest.handCapsules.find(value => value.handRole === role); }
function hold(input, code) { const result = foundry.spawn(input); assert.strictEqual(result.result, 'HAND_SPAWN_MANIFEST_HELD'); assert.match(result.errorCode, code); return result; }

const environment = environmentHand.inspect();
const pythonFixture = pythonFixtureFactory.create();
const graphFixture = graphFixtureFactory.create('axm-hand-foundry-graph-');
try {
  const pythonBefore = pythonFixtureFactory.snapshot(pythonFixture.workspaceRoot);
  const pythonManifest = foundry.spawn({projectMapObservation: pythonFixture.observation, placementPlans: [pythonFixture.placementPlan], environmentObservation: environment});
  foundry.validateManifest(pythonManifest);
  assert.strictEqual(pythonManifest.result, 'HAND_SPAWN_MANIFEST_READY_WITH_HOLDS');
  assert.strictEqual(pythonManifest.languageId, 'python'); assert.strictEqual(pythonManifest.scope, 'pair'); assert.strictEqual(pythonManifest.handCapsuleCount, 6);
  const pythonAuthor = capsule(pythonManifest, 'language-aware-structural-editor');
  assert.strictEqual(pythonAuthor.status, 'RECIPE_INPUT_REQUIRED'); assert.strictEqual(pythonAuthor.errorCode, 'BOUNDED_RECIPE_LAYOUT_AND_PARAMETERS_REQUIRED'); assert.strictEqual(pythonAuthor.truth.donorMetadataMeansSourcePresent, true); assert.strictEqual(pythonAuthor.truth.generalLanguageAuthoringAvailable, false); assert.strictEqual(pythonAuthor.donorBinding.runtimeCorrectness, 'UNKNOWN');
  assert.strictEqual(capsule(pythonManifest, 'exact-byte-writer').status, 'AUTHORIZATION_REQUIRED');
  assert.strictEqual(capsule(pythonManifest, 'exact-byte-writer').implementationId, 'workspace-edit-hand-v1');
  assert.strictEqual(capsule(pythonManifest, 'rollback-writer').status, 'AUTHORIZATION_REQUIRED');
  const pythonParser = capsule(pythonManifest, 'language-parser'); assert.strictEqual(pythonParser.status, 'SPAWNED_NO_EXECUTION_AUTHORITY');
  const validSource = parser.parse({capsule: pythonParser, environmentObservation: environment, candidate: pythonFixture.candidates.source});
  const validVerification = parser.parse({capsule: pythonParser, environmentObservation: environment, candidate: pythonFixture.candidates.verification});
  const invalidSource = parser.parse({capsule: pythonParser, environmentObservation: environment, candidate: pythonFixture.candidates.invalidSource});
  assert.strictEqual(validSource.result, 'SPAWNED_PARSER_PASS'); assert.strictEqual(validVerification.result, 'SPAWNED_PARSER_PASS');
  assert.strictEqual(invalidSource.result, 'SPAWNED_PARSER_HOLD'); assert.strictEqual(invalidSource.errorCode, 'PYTHON_SYNTAX_ERROR');
  for (const receipt of [validSource, validVerification, invalidSource]) { assert.strictEqual(receipt.truth.candidateExecuted, false); assert.strictEqual(receipt.truth.workspaceRead, false); assert.strictEqual(receipt.truth.workspaceMutation, false); }
  const pythonVerifier = capsule(pythonManifest, 'verification-runner');
  assert.strictEqual(pythonVerifier.status, 'RECIPE_SELECTION_REQUIRED');
  assert.strictEqual(pythonVerifier.implementationId, 'bounded-python-record-transform-verifier-adapter-v1');
  assert.strictEqual(pythonVerifier.errorCode, 'BOUNDED_AUTHOR_RECEIPT_OR_HOST_VERIFIER_REQUIRED');
  assert.strictEqual(pythonVerifier.truth.arbitraryCandidateExecutionAvailable, false);
  assert.deepStrictEqual(pythonFixtureFactory.snapshot(pythonFixture.workspaceRoot), pythonBefore);

  const graphPlans = graphFixture.graphEntries.map(value => value.placementPlan);
  const graphManifest = foundry.spawn({projectMapObservation: graphFixture.observation, placementPlans: graphPlans, editGraph: graphFixture.editGraph, environmentObservation: environment});
  foundry.validateManifest(graphManifest);
  const reverseInputManifest = foundry.spawn({projectMapObservation: graphFixture.observation, placementPlans: [...graphPlans].reverse(), editGraph: graphFixture.editGraph, environmentObservation: environment});
  assert.strictEqual(reverseInputManifest.manifestSha256, graphManifest.manifestSha256);
  assert.strictEqual(graphManifest.languageId, 'javascript'); assert.strictEqual(graphManifest.scope, 'graph'); assert.strictEqual(graphManifest.targetCount, 6); assert.strictEqual(graphManifest.handCapsuleCount, 6);
  assert.strictEqual(graphManifest.editGraphSha256, graphFixture.editGraph.editGraphSha256); assert.deepStrictEqual(graphManifest.installationOrder, graphFixture.editGraph.installationOrder);
  assert.strictEqual(capsule(graphManifest, 'language-aware-structural-editor').status, 'DELEGATED');
  assert.strictEqual(capsule(graphManifest, 'exact-byte-writer').implementationId, 'workspace-edit-graph-hand-v1'); assert.strictEqual(capsule(graphManifest, 'exact-byte-writer').status, 'AUTHORIZATION_REQUIRED');
  assert.strictEqual(capsule(graphManifest, 'rollback-writer').status, 'AUTHORIZATION_REQUIRED');
  assert.strictEqual(capsule(graphManifest, 'language-parser').status, 'SPAWNED_NO_EXECUTION_AUTHORITY');
  assert.strictEqual(capsule(graphManifest, 'verification-runner').status, 'HOST_BINDING_REQUIRED');
  const jsParse = parser.parse({capsule: capsule(graphManifest, 'language-parser'), environmentObservation: environment, candidate: graphFixture.candidateEntries[0].source});
  assert.strictEqual(jsParse.result, 'SPAWNED_PARSER_PASS'); assert.strictEqual(jsParse.truth.candidateExecuted, false);
  const forgedParserCapsule = clone(pythonParser); forgedParserCapsule.toolBinding.executablePath = '/bin/false'; redigest(forgedParserCapsule, 'capsuleSha256');
  const forgedParserHold = parser.parse({capsule: forgedParserCapsule, environmentObservation: environment, candidate: pythonFixture.candidates.source});
  assert.strictEqual(forgedParserHold.result, 'SPAWNED_PARSER_HOLD'); assert.strictEqual(forgedParserHold.errorCode, 'SPAWNED_PARSER_TOOL_BINDING_INVALID');
  const missingEnvironmentHold = parser.parse({capsule: pythonParser, candidate: pythonFixture.candidates.source});
  assert.strictEqual(missingEnvironmentHold.result, 'SPAWNED_PARSER_HOLD'); assert.strictEqual(missingEnvironmentHold.errorCode, 'SPAWNED_PARSER_TOOLCHAIN_ENVIRONMENT_OBSERVATION_INVALID');
  assert.deepStrictEqual(graphFixtureFactory.snapshot(graphFixture.workspaceRoot), graphFixture.before);

  const badEnvironment = clone(environment); badEnvironment.platform.os = 'forged';
  hold({projectMapObservation: pythonFixture.observation, placementPlans: [pythonFixture.placementPlan], environmentObservation: badEnvironment}, /ENVIRONMENT_OBSERVATION_DIGEST_MISMATCH/);
  hold({projectMapObservation: graphFixture.observation, placementPlans: [graphPlans[0], graphPlans[0]], editGraph: graphFixture.editGraph, environmentObservation: environment}, /PLACEMENT_PLAN_DUPLICATE/);
  const tamperedPlan = clone(pythonFixture.placementPlan); tamperedPlan.changeId = 'forged';
  hold({projectMapObservation: pythonFixture.observation, placementPlans: [tamperedPlan], environmentObservation: environment}, /PLACEMENT_PLAN_DIGEST_MISMATCH/);
  const forgedHands = clone(pythonFixture.placementPlan); forgedHands.requiredHands.pop(); redigest(forgedHands, 'planSha256');
  hold({projectMapObservation: pythonFixture.observation, placementPlans: [forgedHands], environmentObservation: environment}, /REQUIRED_HANDS_FORGED/);
  const badObservation = clone(pythonFixture.observation); badObservation.projectId = 'forged';
  hold({projectMapObservation: badObservation, placementPlans: [pythonFixture.placementPlan], environmentObservation: environment}, /OBSERVATION_DIGEST_MISMATCH/);
  const duplicateTarget = clone(graphPlans[1]); duplicateTarget.sourcePlacement.targetPath = graphPlans[0].sourcePlacement.targetPath; redigest(duplicateTarget, 'planSha256');
  hold({projectMapObservation: graphFixture.observation, placementPlans: [graphPlans[0], duplicateTarget], editGraph: graphFixture.editGraph, environmentObservation: environment}, /TARGET_INVALID_OR_DUPLICATE/);
  const staleEnvironment = clone(environment); const staleIssuedMs = Date.now() - environmentHand.TTL_MS - 1000; staleEnvironment.issuedAt = new Date(staleIssuedMs).toISOString(); staleEnvironment.expiresAt = new Date(staleIssuedMs + environmentHand.TTL_MS).toISOString(); staleEnvironment.ttlMs = environmentHand.TTL_MS; redigest(staleEnvironment, 'environmentObservationSha256');
  hold({projectMapObservation: pythonFixture.observation, placementPlans: [pythonFixture.placementPlan], environmentObservation: staleEnvironment}, /ENVIRONMENT_OBSERVATION_STALE/);
  hold({projectMapObservation: graphFixture.observation, placementPlans: graphPlans, environmentObservation: environment}, /EDIT_GRAPH_REQUIRED/);
  const tamperedGraph = clone(graphFixture.editGraph); tamperedGraph.installationOrder.reverse();
  hold({projectMapObservation: graphFixture.observation, placementPlans: graphPlans, editGraph: tamperedGraph, environmentObservation: environment}, /EDIT_GRAPH_DIGEST_MISMATCH/);

  console.log(JSON.stringify({ok: true, manifests: 2, pythonPlacementPlans: 1, javascriptPlacementPlans: graphPlans.length, graphDigestBound: true, graphInstallationOrderBound: true, graphInputOrderCanonicalized: true, spawnedCapsules: pythonManifest.handCapsuleCount + graphManifest.handCapsuleCount, spawnedParserPasses: 3, spawnedParserSyntaxHolds: 1, spawnedParserBindingHolds: 2, candidateExecutions: 0, workspaceMutations: 0, environmentSandboxUsable: environment.candidateExecutionIsolation.usable, explicitCapabilityHolds: pythonManifest.handCapsules.filter(value => value.errorCode).length + graphManifest.handCapsules.filter(value => value.errorCode).length, adversarialManifestHolds: 9}, null, 2));
} finally {
  fs.rmSync(pythonFixture.harnessRoot, {recursive: true, force: true});
  fs.rmSync(graphFixture.harnessRoot, {recursive: true, force: true});
}
