'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const registry = require('./placement-registry.js');
const placementPlane = require('./placement-plane.js');
const projectMapHand = require('./project-map-hand.js');
const foundry = require('./hand-foundry-plane.js');
const authorHand = require('./bounded-python-record-transform-author-hand.js');
const activationPlane = require('./foundry-activation-plane.js');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function put(root, relative, content) { const target = path.join(root, ...relative.split('/')); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, content); }

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

function moduleValue(id, modulePath, role, kind, owner, verifies, exports) {
  return {id, path: modulePath, role, status: 'active', mutable: true, accepts: [kind], owns: [owner], directionIds: ['backend-api'], exports: exports || [], verifies: verifies || []};
}

let sequence = 0;
function create(environmentObservation, prefix = 'axm-foundry-activation-') {
  sequence += 1;
  const harnessRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const workspaceRoot = path.join(harnessRoot, 'workspace'); const journalRoot = path.join(harnessRoot, 'journal');
  fs.mkdirSync(workspaceRoot); fs.mkdirSync(journalRoot);
  put(workspaceRoot, 'src/application/capability.py', 'def run(payload):\n    return {"legacy": payload}\n');
  put(workspaceRoot, 'testing/application/selftest.py', 'from capability import run\n\nassert run({}) == {"legacy": {}}\n');
  put(workspaceRoot, 'notes/human.txt', 'do not touch\n');
  const declaration = {
    schema: 'axm.code.project-map-declaration.v1', version: '1.0.0', projectId: 'foundry-activation-' + sequence, languageId: 'python',
    conventions: {sourceRoot: 'src', testRoot: 'testing', fileExtension: '.py', languageBinding: {kind: 'extension', signal: '.py'}, sourceFilePattern: '{name}{ext}', roleDirectory: true, testFilePattern: '{name}_test{ext}', naming: 'kebab-case'},
    modules: [
      moduleValue('status-capability', 'src/application/capability.py', 'application', 'workflow', 'STATUS_TRANSFORM', [], ['run']),
      moduleValue('status-selftest', 'testing/application/selftest.py', 'verification', 'test', 'STATUS_TRANSFORM_TEST', ['src/application/capability.py'], [])
    ],
    protectedPaths: []
  };
  const change = {schema: 'axm.code.change-intent.v1', changeId: 'activate-status-' + sequence, directionId: 'backend-api', kind: 'workflow', name: 'status-transform', ownerSignals: ['STATUS_TRANSFORM'], expectedExports: ['run'], dependencyModuleIds: [], requestedVerifiers: ['unit-test']};
  const observation = projectMapHand.inspect({workspaceRoot, declaration});
  if (observation.result !== 'PROJECT_MAP_OBSERVED_READ_ONLY') throw Error('ACTIVATION_FIXTURE_OBSERVATION_FAILED:' + observation.errorCode);
  const placementPlan = placementPlane.plan({projectMapObservation: observation, change});
  if (placementPlan.result !== 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY') throw Error('ACTIVATION_FIXTURE_PLAN_FAILED:' + placementPlan.errorCode);
  const manifest = foundry.spawn({projectMapObservation: observation, placementPlans: [placementPlan], environmentObservation});
  foundry.validateManifest(manifest);
  return {harnessRoot, workspaceRoot, journalRoot, declaration, change, observation, placementPlan, manifest};
}

function recipeSelection(parameters = null) {
  const body = {
    schema: 'axm.code.foundry-recipe-selection.v1', version: '1.0.0',
    recipeId: authorHand.DONOR.recipeId, recipeSha256: authorHand.DONOR.recipeSha256,
    builderId: authorHand.DONOR.builderId, builderSha256: authorHand.DONOR.builderSha256,
    parameters: parameters || {resultSchemaId: 'axm.python.status-normalized/v1', sourceField: 'status', targetField: 'normalized_status', defaultValue: 'unknown', maxInputKeys: 16, maxInputBytes: 4096}
  };
  return {...body, selectionSha256: registry.hash(body)};
}

let authorizationSequence = 0;
function authorization(fixture, environmentObservation, selection, mutate = null, times = null) {
  authorizationSequence += 1;
  const parser = fixture.manifest.handCapsules.find(value => value.handRole === 'language-parser');
  const verifier = fixture.manifest.handCapsules.find(value => value.handRole === 'verification-runner');
  const issuedMs = times?.issuedMs ?? Date.now();
  const expiresMs = times?.expiresMs ?? Math.min(issuedMs + activationPlane.AUTHORIZATION_TTL_MS, Date.parse(fixture.observation.expiresAt), Date.parse(environmentObservation.expiresAt));
  const body = (mutate || (value => value))({
    schema: 'axm.code.foundry-activation-authorization.v1', version: '1.0.0', status: 'TEST', result: 'FOUNDRY_ACTIVATION_AUTHORIZED',
    activationId: 'foundry-activation-' + authorizationSequence, approval: 'EXPLICIT_SINGLE_ACTIVATION',
    issuedAt: new Date(issuedMs).toISOString(), expiresAt: new Date(expiresMs).toISOString(), ttlMs: expiresMs - issuedMs,
    workspaceRootIdentitySha256: registry.hash(path.resolve(fixture.workspaceRoot)), journalRootIdentitySha256: registry.hash(path.resolve(fixture.journalRoot)),
    projectMapObservationSha256: fixture.observation.observationSha256, placementPlanSha256: fixture.placementPlan.planSha256,
    manifestSha256: fixture.manifest.manifestSha256, environmentObservationSha256: environmentObservation.environmentObservationSha256,
    recipeSelectionSha256: selection.selectionSha256, authorImplementationSha256: authorHand.DONOR.builderSha256,
    parserCapsuleSha256: parser.capsuleSha256, verifierImplementationSha256: verifier.implementationSha256,
    rollbackRequired: true, durableRecoveryRequired: true,
    authority: {workspaceMutation: true, rollbackWrite: true, provenanceLockedCandidateExecution: true, arbitraryCandidateExecution: false, network: false, install: false, deployment: false},
    truth: {digestIsSignerOrConsentProof: false, foundryMaySelfAuthorize: false}
  });
  return {...body, authorizationSha256: registry.hash(body)};
}

function input(fixture, environmentObservation, selection, authorized) {
  return {
    workspaceRoot: fixture.workspaceRoot, journalRoot: fixture.journalRoot, declaration: fixture.declaration,
    projectMapObservation: fixture.observation, placementPlan: fixture.placementPlan, manifest: fixture.manifest,
    environmentObservation, recipeSelection: selection, authorization: authorized
  };
}

module.exports = {create, recipeSelection, authorization, input, snapshot, put, sha256};
