'use strict';

const projectMapHand = require('./project-map-hand.js');
const registry = require('./placement-registry.js');

const AUTHORITY = Object.freeze({workspaceRead: false, workspaceMutation: false, toolExecution: false, codeGeneration: false, graphPlanning: true, authorization: false});
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX64 = /^[a-f0-9]{64}$/;
const MIN_ENTRIES = 2;
const MAX_ENTRIES = 4;
const MAX_DEPENDENCIES_PER_ENTRY = 3;

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function digestReceipt(value, field, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !HEX64.test(value[field] || '')) throw Error(`${code}_INVALID`);
  const body = {...value}; delete body[field];
  if (registry.hash(body) !== value[field]) throw Error(`${code}_DIGEST_MISMATCH`);
}

function validateObservation(observation) {
  digestReceipt(observation, 'observationSha256', 'EDIT_GRAPH_OBSERVATION');
  if (observation.schema !== 'axm.code.project-map-observation.v1' || observation.version !== '1.0.0' || observation.status !== 'TEST' || observation.result !== 'PROJECT_MAP_OBSERVED_READ_ONLY' || observation.authority?.workspaceRead !== true || observation.authority?.workspaceMutation !== false || registry.hash(observation.projectMap) !== observation.projectMapSha256) throw Error('EDIT_GRAPH_OBSERVATION_BINDING_INVALID');
  if (projectMapHand.freshness(observation).status !== 'LIVE') throw Error('EDIT_GRAPH_OBSERVATION_NOT_LIVE');
}

function validatePlacementPlan(plan, observation) {
  digestReceipt(plan, 'planSha256', 'EDIT_GRAPH_PLACEMENT_PLAN');
  if (plan.schema !== 'axm.code.placement-plan.v1' || plan.version !== '1.0.0' || plan.status !== 'TEST' || plan.result !== 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY' || plan.projectMapSha256 !== observation.projectMapSha256 || plan.projectMapEvidence?.kind !== 'read-only-project-map-hand' || plan.projectMapEvidence?.observationSha256 !== observation.observationSha256 || plan.authority?.workspaceMutation !== false || plan.truth?.authorizedHandsRequiredForApplication !== true || plan.languageBinding?.languageId !== 'javascript') throw Error('EDIT_GRAPH_PLACEMENT_PLAN_BINDING_INVALID');
  if (!['extend-existing', 'create-module'].includes(plan.sourcePlacement?.action) || !['extend-existing-test', 'create-test-module'].includes(plan.verificationPlacement?.action) || plan.verificationPlacement?.verifiesSourcePath !== plan.sourcePlacement?.targetPath || plan.sourcePlacement?.targetPath === plan.verificationPlacement?.targetPath) throw Error('EDIT_GRAPH_PLACEMENT_TARGETS_INVALID');
}

function held(errorCode, details = {}) {
  const body = {schema: 'axm.code.edit-graph.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_GRAPH_HELD', errorCode, ...details, truth: {graphIsMutationAuthority: false, dependencyOrderGuessed: false}, authority: AUTHORITY};
  return freeze({...body, editGraphSha256: registry.hash(body)});
}

function topologicalOrder(nodes) {
  const byId = new Map(nodes.map(node => [node.nodeId, node]));
  const remaining = new Map(nodes.map(node => [node.nodeId, new Set(node.dependsOnNodeIds)]));
  const order = [];
  while (remaining.size) {
    const ready = [...remaining.entries()].filter(([, dependencies]) => dependencies.size === 0).map(([id]) => id).sort();
    if (!ready.length) throw Error('EDIT_GRAPH_DEPENDENCY_CYCLE');
    for (const id of ready) {
      order.push(id); remaining.delete(id);
      for (const dependencies of remaining.values()) dependencies.delete(id);
    }
  }
  if (order.some(id => !byId.has(id))) throw Error('EDIT_GRAPH_NODE_ORDER_INVALID');
  return order;
}

function nodesForEntries(entries) {
  return entries.flatMap(entry => {
    const sourceNodeId = `${entry.entryId}-source`;
    return [
      {nodeId: sourceNodeId, entryId: entry.entryId, lane: 'source', targetPath: entry.placementPlan.sourcePlacement.targetPath, action: entry.placementPlan.sourcePlacement.action, expectedBeforeSha256: entry.placementPlan.sourcePlacement.expectedPreMutationSha256, dependsOnNodeIds: entry.dependsOnEntryIds.map(id => `${id}-verification`).sort()},
      {nodeId: `${entry.entryId}-verification`, entryId: entry.entryId, lane: 'verification', targetPath: entry.placementPlan.verificationPlacement.targetPath, action: entry.placementPlan.verificationPlacement.action, expectedBeforeSha256: entry.placementPlan.verificationPlacement.expectedPreMutationSha256, dependsOnNodeIds: [sourceNodeId]}
    ];
  });
}

function validateGraph(graph, observation = null) {
  digestReceipt(graph, 'editGraphSha256', 'EDIT_GRAPH');
  if (graph.schema !== 'axm.code.edit-graph.v1' || graph.version !== '1.0.0' || graph.status !== 'TEST' || graph.result !== 'EDIT_GRAPH_READY_NO_MUTATION_AUTHORITY' || graph.authority?.workspaceMutation !== false || graph.truth?.graphIsMutationAuthority !== false || !Array.isArray(graph.entries) || graph.entries.length < MIN_ENTRIES || graph.entries.length > MAX_ENTRIES || !Array.isArray(graph.nodes) || graph.nodes.length !== graph.entries.length * 2 || !Array.isArray(graph.installationOrder) || graph.installationOrder.length !== graph.nodes.length) throw Error('EDIT_GRAPH_INVALID');
  if (observation && (graph.projectMapObservationSha256 !== observation.observationSha256 || graph.projectMapSha256 !== observation.projectMapSha256)) throw Error('EDIT_GRAPH_OBSERVATION_MISMATCH');
  const entryIds = graph.entries.map(entry => entry.entryId);
  const nodeIds = graph.nodes.map(node => node.nodeId);
  const paths = graph.nodes.map(node => node.targetPath);
  if (new Set(entryIds).size !== entryIds.length || new Set(nodeIds).size !== nodeIds.length || new Set(paths).size !== paths.length || new Set(graph.installationOrder).size !== graph.installationOrder.length || graph.installationOrder.some(id => !nodeIds.includes(id))) throw Error('EDIT_GRAPH_DUPLICATE_OR_UNKNOWN_BINDING');
  if (graph.entries.some((entry, index) => !entry || !SAFE_ID.test(entry.entryId || '') || entry.entryId !== [...entryIds].sort()[index] || !Array.isArray(entry.dependsOnEntryIds) || entry.dependsOnEntryIds.length > MAX_DEPENDENCIES_PER_ENTRY || new Set(entry.dependsOnEntryIds).size !== entry.dependsOnEntryIds.length || entry.dependsOnEntryIds.some(id => !entryIds.includes(id) || id === entry.entryId))) throw Error('EDIT_GRAPH_ENTRY_BINDING_INVALID');
  for (const entry of graph.entries) validatePlacementPlan(entry.placementPlan, observation || {projectMapSha256: graph.projectMapSha256, observationSha256: graph.projectMapObservationSha256});
  const expectedNodes = nodesForEntries(graph.entries);
  const expectedOrder = topologicalOrder(expectedNodes);
  if (registry.canon(graph.nodes) !== registry.canon(expectedNodes) || registry.canon(graph.installationOrder) !== registry.canon(expectedOrder)) throw Error('EDIT_GRAPH_NODE_ORDER_INVALID');
  return graph;
}

function compose({projectMapObservation = null, entries = null} = {}) {
  try {
    validateObservation(projectMapObservation);
    if (!Array.isArray(entries) || entries.length < MIN_ENTRIES || entries.length > MAX_ENTRIES) throw Error('EDIT_GRAPH_ENTRY_COUNT_INVALID');
    const normalized = entries.map(entry => {
      if (!entry || typeof entry !== 'object' || !SAFE_ID.test(entry.entryId || '') || !Array.isArray(entry.dependsOnEntryIds) || entry.dependsOnEntryIds.length > MAX_DEPENDENCIES_PER_ENTRY || new Set(entry.dependsOnEntryIds).size !== entry.dependsOnEntryIds.length || entry.dependsOnEntryIds.some(id => !SAFE_ID.test(id || '') || id === entry.entryId)) throw Error('EDIT_GRAPH_ENTRY_INVALID');
      validatePlacementPlan(entry.placementPlan, projectMapObservation);
      return {entryId: entry.entryId, dependsOnEntryIds: [...entry.dependsOnEntryIds].sort(), placementPlan: entry.placementPlan};
    }).sort((a, b) => a.entryId.localeCompare(b.entryId));
    const entryIds = normalized.map(entry => entry.entryId);
    if (new Set(entryIds).size !== entryIds.length) throw Error('EDIT_GRAPH_ENTRY_ID_DUPLICATE');
    for (const entry of normalized) if (entry.dependsOnEntryIds.some(id => !entryIds.includes(id))) throw Error('EDIT_GRAPH_DEPENDENCY_UNKNOWN');
    const targetPaths = normalized.flatMap(entry => [entry.placementPlan.sourcePlacement.targetPath, entry.placementPlan.verificationPlacement.targetPath]);
    if (new Set(targetPaths).size !== targetPaths.length) throw Error('EDIT_GRAPH_TARGET_DUPLICATE');
    const nodes = nodesForEntries(normalized);
    const installationOrder = topologicalOrder(nodes);
    const body = {
      schema: 'axm.code.edit-graph.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_GRAPH_READY_NO_MUTATION_AUTHORITY', errorCode: null,
      projectMapObservationSha256: projectMapObservation.observationSha256,
      projectMapSha256: projectMapObservation.projectMapSha256,
      entries: normalized,
      nodes,
      installationOrder,
      limits: {minEntries: MIN_ENTRIES, maxEntries: MAX_ENTRIES, minTargets: MIN_ENTRIES * 2, maxTargets: MAX_ENTRIES * 2, maxDependenciesPerEntry: MAX_DEPENDENCIES_PER_ENTRY},
      truth: {graphIsMutationAuthority: false, placementPlansRemainAuthoritative: true, dependencyOrderDeterministic: true, dependencyOrderGuessed: false, graphIsFilesystemAtomicityProof: false, codeGeneratedByGraph: false},
      authority: AUTHORITY
    };
    const graph = freeze({...body, editGraphSha256: registry.hash(body)});
    validateGraph(graph, projectMapObservation);
    return graph;
  } catch (error) {
    const message = String(error?.message || 'EDIT_GRAPH_FAILED');
    return held(message.startsWith('EDIT_GRAPH_') ? message : 'EDIT_GRAPH_FAILED');
  }
}

module.exports = {AUTHORITY, MIN_ENTRIES, MAX_ENTRIES, MAX_DEPENDENCIES_PER_ENTRY, compose, validateGraph};
