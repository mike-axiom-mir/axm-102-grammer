'use strict';

const assert = require('assert');
const fs = require('fs');
const registry = require('./placement-registry.js');
const graphPlane = require('./edit-graph-plane.js');
const fixtureFactory = require('./edit-graph-test-fixture.js');

const fixture = fixtureFactory.create('axm-edit-graph-plane-');
try {
  const graph = fixture.editGraph;
  assert.strictEqual(graph.result, 'EDIT_GRAPH_READY_NO_MUTATION_AUTHORITY');
  assert.strictEqual(graph.entries.length, 3);
  assert.strictEqual(graph.nodes.length, 6);
  assert.deepStrictEqual(graph.installationOrder, ['a-core-source', 'a-core-verification', 'b-application-source', 'b-application-verification', 'c-boundary-source', 'c-boundary-verification']);
  assert.strictEqual(graph.truth.dependencyOrderDeterministic, true);
  assert.strictEqual(graph.truth.graphIsMutationAuthority, false);
  assert.strictEqual(graph.authority.workspaceMutation, false);

  const minimum = graphPlane.compose({projectMapObservation: fixture.observation, entries: fixture.allGraphEntries.slice(0, 2)});
  assert.strictEqual(minimum.result, 'EDIT_GRAPH_READY_NO_MUTATION_AUTHORITY');
  assert.strictEqual(minimum.nodes.length, 4);
  const maximum = graphPlane.compose({projectMapObservation: fixture.observation, entries: fixture.allGraphEntries});
  assert.strictEqual(maximum.result, 'EDIT_GRAPH_READY_NO_MUTATION_AUTHORITY');
  assert.strictEqual(maximum.nodes.length, 8);
  assert.deepStrictEqual(maximum.installationOrder, ['a-core-source', 'a-core-verification', 'b-application-source', 'b-application-verification', 'c-boundary-source', 'c-boundary-verification', 'd-configuration-source', 'd-configuration-verification']);

  const reverse = graphPlane.compose({projectMapObservation: fixture.observation, entries: [...fixture.graphEntries].reverse()});
  assert.deepStrictEqual(reverse, graph, 'entry input order must not change the graph');

  const cycleEntries = fixture.graphEntries.map(entry => entry.entryId === 'a-core' ? {...entry, dependsOnEntryIds: ['c-boundary']} : entry);
  const cycle = graphPlane.compose({projectMapObservation: fixture.observation, entries: cycleEntries});
  assert.strictEqual(cycle.result, 'EDIT_GRAPH_HELD');
  assert.strictEqual(cycle.errorCode, 'EDIT_GRAPH_DEPENDENCY_CYCLE');

  const unknownEntries = fixture.graphEntries.map(entry => entry.entryId === 'b-application' ? {...entry, dependsOnEntryIds: ['missing']} : entry);
  assert.strictEqual(graphPlane.compose({projectMapObservation: fixture.observation, entries: unknownEntries}).errorCode, 'EDIT_GRAPH_DEPENDENCY_UNKNOWN');

  const duplicateTargetEntries = [fixture.graphEntries[0], fixture.graphEntries[1], {...fixture.graphEntries[0], entryId: 'duplicate'}];
  assert.strictEqual(graphPlane.compose({projectMapObservation: fixture.observation, entries: duplicateTargetEntries}).errorCode, 'EDIT_GRAPH_TARGET_DUPLICATE');

  const overLimit = [...fixture.graphEntries, {...fixture.graphEntries[0], entryId: 'd-extra', dependsOnEntryIds: []}, {...fixture.graphEntries[0], entryId: 'e-extra', dependsOnEntryIds: []}];
  assert.strictEqual(graphPlane.compose({projectMapObservation: fixture.observation, entries: overLimit}).errorCode, 'EDIT_GRAPH_ENTRY_COUNT_INVALID');

  const tampered = {...graph, installationOrder: [...graph.installationOrder].reverse()};
  assert.throws(() => graphPlane.validateGraph(tampered, fixture.observation), /EDIT_GRAPH_DIGEST_MISMATCH/);

  const forgedBody = {...graph, installationOrder: [...graph.installationOrder].reverse()}; delete forgedBody.editGraphSha256;
  const forged = {...forgedBody, editGraphSha256: registry.hash(forgedBody)};
  assert.throws(() => graphPlane.validateGraph(forged, fixture.observation), /EDIT_GRAPH_NODE_ORDER_INVALID|EDIT_GRAPH_INVALID/);

  console.log(JSON.stringify({ok: true, focusedEntryCount: graph.entries.length, focusedTargetNodeCount: graph.nodes.length, verifiedBoundaryTargetCounts: [minimum.nodes.length, graph.nodes.length, maximum.nodes.length], deterministicTopologicalOrder: true, adversarialHoldCount: 6, authority: graph.authority}, null, 2));
} finally {
  fs.rmSync(fixture.harnessRoot, {recursive: true, force: true});
}
