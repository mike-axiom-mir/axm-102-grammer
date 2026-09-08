'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const registry = require('./placement-registry.js');
const plane = require('./placement-plane.js');
const graphPlane = require('./edit-graph-plane.js');
const projectMapHand = require('./project-map-hand.js');
const graphHand = require('./workspace-edit-graph-hand.js');

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function put(root, relative, content) { const target = path.join(root, ...relative.split('/')); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, content); }
function conventions() { return {sourceRoot: 'src', testRoot: 'testing', fileExtension: '.js', languageBinding: {kind: 'extension', signal: '.js'}, sourceFilePattern: '{name}{ext}', roleDirectory: true, testFilePattern: '{name}.test{ext}', naming: 'kebab-case'}; }
function declaredModule({id, modulePath, role, kind, owner, verifies = [], exports = []}) { return {id, path: modulePath, role, status: 'active', mutable: true, accepts: [kind], owns: [owner], directionIds: ['backend-api'], exports, verifies}; }
function candidate(lane, targetPath, content) { return {schema: 'axm.code.edit-candidate.v1', version: '1.0.0', lane, targetPath, languageId: 'javascript', content, contentSha256: sha256(Buffer.from(content, 'utf8'))}; }

const ENTRY_DEFINITIONS = Object.freeze([
  {entryId: 'a-core', role: 'domain', kind: 'rule', owner: 'CORE_RULES', name: 'core', value: 11, dependsOnEntryIds: []},
  {entryId: 'b-application', role: 'application', kind: 'workflow', owner: 'APPLICATION_FLOW', name: 'application', value: 22, dependsOnEntryIds: ['a-core']},
  {entryId: 'c-boundary', role: 'boundary', kind: 'api', owner: 'API_BOUNDARY', name: 'boundary', value: 33, dependsOnEntryIds: ['b-application']},
  {entryId: 'd-configuration', role: 'configuration', kind: 'config', owner: 'SERVICE_CONFIGURATION', name: 'configuration', value: 44, dependsOnEntryIds: ['c-boundary']}
]);

function adapter(passed = true) {
  const metadata = {schema: 'axm.code.test-verifier-adapter.v1', id: passed ? 'graph-unit-pass' : 'graph-unit-fail', providesVerifierId: 'unit-test', implementation: 'graph-controlled-fixture-v1'};
  return {...metadata, adapterSha256: registry.hash(metadata), verify() { return {passed, observations: {fixtureResult: passed ? 'GRAPH_FIXTURE_PASS' : 'GRAPH_FIXTURE_INTENTIONAL_FAILURE'}}; }};
}

let authorizationSequence = 0;
function authorization({workspaceRoot, journalRoot, observation, editGraph, candidateEntries, verifierAdapter, authorizationId = null, mutate = value => value}) {
  authorizationSequence += 1;
  const issuedMs = Date.now(); const expiresMs = Math.min(issuedMs + 60000, Date.parse(observation.expiresAt));
  const candidates = new Map(candidateEntries.map(entry => [entry.entryId, entry]));
  const targets = editGraph.installationOrder.map(nodeId => {
    const node = editGraph.nodes.find(item => item.nodeId === nodeId); const value = candidates.get(node.entryId)[node.lane];
    return {nodeId, entryId: node.entryId, lane: node.lane, targetPath: node.targetPath, action: node.action, expectedBeforeSha256: node.expectedBeforeSha256, candidateSha256: value.contentSha256};
  });
  const body = mutate({
    schema: 'axm.code.edit-graph-authorization.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_GRAPH_TRANSACTION_AUTHORIZED', authorizationId: authorizationId || `graph-fixture-${authorizationSequence}`, approval: 'EXPLICIT_SINGLE_GRAPH_TRANSACTION',
    issuedAt: new Date(issuedMs).toISOString(), expiresAt: new Date(expiresMs).toISOString(), ttlMs: expiresMs - issuedMs,
    workspaceRootIdentitySha256: registry.hash(path.resolve(workspaceRoot)), journalRootIdentitySha256: registry.hash(path.resolve(journalRoot)), projectMapObservationSha256: observation.observationSha256, editGraphSha256: editGraph.editGraphSha256,
    parserId: 'node-vm-script-syntax-v1', rollbackRequired: true, durableRecoveryRequired: true, targets,
    verifierBindings: [{id: verifierAdapter.id, adapterSha256: verifierAdapter.adapterSha256, providesVerifierId: verifierAdapter.providesVerifierId}],
    authority: {workspaceMutation: true, rollbackWrite: true, externalJournalReadWrite: true, workspaceLease: true, network: false, install: false, deployment: false, userFileDeletion: false},
    truth: {digestIsSignerOrConsentProof: false, candidateGenerationDelegated: true, graphWasHumanOrHostAuthorized: true}
  });
  return {...body, authorizationSha256: registry.hash(body)};
}

function snapshot(root) {
  const entries = [];
  function walk(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const target = path.join(directory, name); const relative = path.relative(root, target).split(path.sep).join('/'); const stat = fs.lstatSync(target);
      if (stat.isDirectory()) { entries.push({path: relative, type: 'directory'}); walk(target); }
      else entries.push({path: relative, type: 'file', sha256: sha256(fs.readFileSync(target)), mode: stat.mode & 0o777});
    }
  }
  walk(root); return entries;
}

function create(prefix = 'axm-edit-graph-fixture-') {
  const harnessRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workspaceRoot = path.join(harnessRoot, 'workspace'); const journalRoot = path.join(harnessRoot, 'journal');
  fs.mkdirSync(workspaceRoot); fs.mkdirSync(journalRoot); put(workspaceRoot, 'notes/untouched.txt', 'graph marker\n');
  const modules = [];
  for (const entry of ENTRY_DEFINITIONS) {
    const source = `src/${entry.role}/${entry.name}.js`; const verification = `testing/${entry.role}/${entry.name}.test.js`;
    put(workspaceRoot, source, `module.exports = {run: () => ${entry.value}};\n`);
    const importPath = path.posix.relative(path.posix.dirname(verification), source); const normalizedImport = importPath.startsWith('.') ? importPath : `./${importPath}`;
    put(workspaceRoot, verification, `const subject = require("${normalizedImport}");\nif (subject.run() !== ${entry.value}) throw Error("expected ${entry.value}");\n`);
    modules.push(declaredModule({id: `${entry.entryId}-source-module`, modulePath: source, role: entry.role, kind: entry.kind, owner: entry.owner, exports: ['run']}));
    modules.push(declaredModule({id: `${entry.entryId}-verification-module`, modulePath: verification, role: 'verification', kind: 'test', owner: `${entry.owner}_VERIFICATION`, verifies: [source]}));
  }
  const declaration = {schema: 'axm.code.project-map-declaration.v1', version: '1.0.0', projectId: `graph-fixture-${authorizationSequence + 1}`, languageId: 'javascript', conventions: conventions(), modules, protectedPaths: []};
  const observation = projectMapHand.inspect({workspaceRoot, declaration});
  if (observation.result !== 'PROJECT_MAP_OBSERVED_READ_ONLY') throw Error(`GRAPH_FIXTURE_OBSERVATION_FAILED:${observation.errorCode}`);
  const allGraphEntries = ENTRY_DEFINITIONS.map(entry => {
    const change = {schema: 'axm.code.change-intent.v1', changeId: `${entry.entryId}-change`, directionId: 'backend-api', kind: entry.kind, name: entry.name, ownerSignals: [entry.owner], expectedExports: ['run'], dependencyModuleIds: [], requestedVerifiers: ['unit-test']};
    const placementPlan = plane.plan({projectMapObservation: observation, change});
    if (placementPlan.result !== 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY') throw Error(`GRAPH_FIXTURE_PLAN_FAILED:${entry.entryId}:${placementPlan.errorCode}`);
    return {entryId: entry.entryId, dependsOnEntryIds: [...entry.dependsOnEntryIds], placementPlan};
  });
  const graphEntries = allGraphEntries.slice(0, 3);
  const editGraph = graphPlane.compose({projectMapObservation: observation, entries: graphEntries});
  if (editGraph.result !== 'EDIT_GRAPH_READY_NO_MUTATION_AUTHORITY') throw Error(`GRAPH_FIXTURE_GRAPH_FAILED:${editGraph.errorCode}`);
  const candidateEntries = graphEntries.map((entry, index) => {
    const value = ENTRY_DEFINITIONS.find(definition => definition.entryId === entry.entryId).value + 100;
    const sourcePath = entry.placementPlan.sourcePlacement.targetPath; const verificationPath = entry.placementPlan.verificationPlacement.targetPath;
    const importPath = path.posix.relative(path.posix.dirname(verificationPath), sourcePath); const normalized = importPath.startsWith('.') ? importPath : `./${importPath}`;
    return {entryId: entry.entryId, source: candidate('source', sourcePath, `module.exports = {run: () => ${value}};\n`), verification: candidate('verification', verificationPath, `const subject = require("${normalized}");\nif (subject.run() !== ${value}) throw Error("expected ${value}");\n`)};
  });
  return {harnessRoot, workspaceRoot, journalRoot, declaration, observation, allGraphEntries, graphEntries, editGraph, candidateEntries, before: snapshot(workspaceRoot)};
}

function apply(fixture, authorizationValue, verifierAdapter) {
  return graphHand.apply({workspaceRoot: fixture.workspaceRoot, journalRoot: fixture.journalRoot, declaration: fixture.declaration, projectMapObservation: fixture.observation, editGraph: fixture.editGraph, candidateEntries: fixture.candidateEntries, authorization: authorizationValue, verifierAdapters: [verifierAdapter]});
}

module.exports = {ENTRY_DEFINITIONS, adapter, authorization, snapshot, create, apply, put, sha256};
