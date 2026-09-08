'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const registry = require('./placement-registry.js');
const plane = require('./placement-plane.js');
const hand = require('./project-map-hand.js');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function put(root, relative, content) {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, content);
}

function snapshot(root) {
  const entries = [];
  function walk(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const target = path.join(directory, name);
      const relative = path.relative(root, target).split(path.sep).join('/');
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) entries.push({path: relative, type: 'symlink', target: fs.readlinkSync(target)});
      else if (stat.isDirectory()) {
        entries.push({path: relative, type: 'directory'});
        walk(target);
      } else entries.push({path: relative, type: 'file', sha256: sha256(fs.readFileSync(target))});
    }
  }
  walk(root);
  return entries;
}

function module({id, modulePath, role, kind, owner, directionId = 'game', verifies = [], exports = []}) {
  return {id, path: modulePath, role, status: 'active', mutable: true, accepts: [kind], owns: [owner], directionIds: [directionId], exports, verifies};
}

function declaration({projectId, languageId, conventions, source, verification}) {
  return {schema: 'axm.code.project-map-declaration.v1', version: '1.0.0', projectId, languageId, conventions, modules: [source, verification], protectedPaths: []};
}

function change({changeId, owner, kind = 'rule', directionId = 'game'}) {
  return {schema: 'axm.code.change-intent.v1', changeId, directionId, kind, name: changeId, ownerSignals: [owner], expectedExports: ['run'], dependencyModuleIds: [], requestedVerifiers: ['unit-test']};
}

const roots = [];
function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-project-map-hand-'));
  roots.push(root);
  return root;
}

try {
  const extensionRoot = workspace();
  put(extensionRoot, 'src/domain/game.js', 'module.exports = {run: () => "game"};\n');
  put(extensionRoot, 'testing/domain/game.test.js', 'require("../../src/domain/game.js").run();\n');
  const extensionDeclaration = declaration({
    projectId: 'observed-game',
    languageId: 'javascript',
    conventions: {sourceRoot: 'src', testRoot: 'testing', fileExtension: '.js', languageBinding: {kind: 'extension', signal: '.js'}, sourceFilePattern: '{name}{ext}', roleDirectory: true, testFilePattern: '{name}.test{ext}', naming: 'kebab-case'},
    source: module({id: 'game-core', modulePath: 'src/domain/game.js', role: 'domain', kind: 'rule', owner: 'GAME_CORE', exports: ['run']}),
    verification: module({id: 'game-verification', modulePath: 'testing/domain/game.test.js', role: 'verification', kind: 'test', owner: 'GAME_CORE_VERIFICATION', verifies: ['src/domain/game.js']})
  });
  const extensionChange = change({changeId: 'game-observed-change', owner: 'GAME_CORE'});
  const extensionBefore = snapshot(extensionRoot);
  const extensionObservation = hand.inspect({workspaceRoot: extensionRoot, declaration: extensionDeclaration});
  const extensionAfter = snapshot(extensionRoot);
  assert.deepStrictEqual(extensionAfter, extensionBefore, 'read-only Hand must not change workspace bytes or paths');
  assert.strictEqual(extensionObservation.result, 'PROJECT_MAP_OBSERVED_READ_ONLY');
  assert.strictEqual(extensionObservation.coverage.observedFileCount, 2);
  assert.strictEqual(extensionObservation.coverage.allMatchingFilesMapped, true);
  assert.strictEqual(extensionObservation.coverage.symlinksFollowed, false);
  assert.strictEqual(extensionObservation.truth.semanticRolesCallerDeclared, true);
  assert.strictEqual(extensionObservation.truth.semanticRolesInferredFromBytes, false);
  assert.strictEqual(extensionObservation.truth.workspaceMutated, false);
  assert.strictEqual(extensionObservation.authority.workspaceRead, true);
  assert.strictEqual(extensionObservation.authority.workspaceMutation, false);
  assert.strictEqual(extensionObservation.authority.toolExecution, false);
  assert.strictEqual(hand.freshness(extensionObservation).status, 'LIVE');
  assert.strictEqual(hand.freshness(extensionObservation, {now: Date.parse(extensionObservation.expiresAt) + 1}).status, 'STALE');
  assert.strictEqual(Object.isFrozen(extensionObservation), true);
  const sourceModule = extensionObservation.projectMap.modules.find(item => item.id === 'game-core');
  assert.strictEqual(sourceModule.contentSha256, sha256(fs.readFileSync(path.join(extensionRoot, 'src/domain/game.js'))));

  const extensionPlacement = plane.plan({projectMapObservation: extensionObservation, change: extensionChange});
  assert.strictEqual(extensionPlacement.result, 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY');
  assert.strictEqual(extensionPlacement.sourcePlacement.targetPath, 'src/domain/game.js');
  assert.strictEqual(extensionPlacement.verificationPlacement.targetPath, 'testing/domain/game.test.js');
  assert.strictEqual(extensionPlacement.projectMapEvidence.kind, 'read-only-project-map-hand');
  assert.strictEqual(extensionPlacement.projectMapEvidence.observationSha256, extensionObservation.observationSha256);
  assert.strictEqual(extensionPlacement.truth.projectMapObservedByReadOnlyHand, true);
  assert.strictEqual(extensionPlacement.truth.plannerReadWorkspace, false);
  assert.strictEqual(extensionPlacement.authority.workspaceRead, false);
  assert.deepStrictEqual(plane.plan({projectMapObservation: extensionObservation, change: extensionChange}), extensionPlacement);

  put(extensionRoot, 'src/domain/game.js', 'module.exports = {run: () => "changed"};\n');
  const changedObservation = hand.inspect({workspaceRoot: extensionRoot, declaration: extensionDeclaration});
  assert.strictEqual(changedObservation.result, 'PROJECT_MAP_OBSERVED_READ_ONLY');
  assert.notStrictEqual(changedObservation.projectMapSha256, extensionObservation.projectMapSha256);
  assert.notStrictEqual(changedObservation.observationSha256, extensionObservation.observationSha256);

  const staleBody = {...extensionObservation, observedAt: '2020-01-01T00:00:00.000Z', expiresAt: '2020-01-01T00:05:00.000Z'};
  delete staleBody.observationSha256;
  const staleObservation = {...staleBody, observationSha256: registry.hash(staleBody)};
  const stalePlacement = plane.plan({projectMapObservation: staleObservation, change: extensionChange});
  assert.strictEqual(stalePlacement.result, 'PLACEMENT_OBSERVATION_HELD');
  assert.strictEqual(stalePlacement.errorCode, 'PROJECT_MAP_OBSERVATION_STALE');

  const futureBody = {...extensionObservation, observedAt: '2999-01-01T00:00:00.000Z', expiresAt: '2999-01-01T00:05:00.000Z'};
  delete futureBody.observationSha256;
  const futureObservation = {...futureBody, observationSha256: registry.hash(futureBody)};
  const futurePlacement = plane.plan({projectMapObservation: futureObservation, change: extensionChange});
  assert.strictEqual(futurePlacement.result, 'PLACEMENT_OBSERVATION_HELD');
  assert.strictEqual(futurePlacement.errorCode, 'PROJECT_MAP_OBSERVATION_FUTURE');
  assert.strictEqual(hand.freshness(futureObservation).status, 'UNTIMED');

  const longTtlBody = {...extensionObservation, ttlMs: 600000, expiresAt: new Date(Date.parse(extensionObservation.observedAt) + 600000).toISOString()};
  delete longTtlBody.observationSha256;
  const longTtlObservation = {...longTtlBody, observationSha256: registry.hash(longTtlBody)};
  const longTtlPlacement = plane.plan({projectMapObservation: longTtlObservation, change: extensionChange});
  assert.strictEqual(longTtlPlacement.result, 'PLACEMENT_INPUT_HELD');
  assert.strictEqual(longTtlPlacement.errorCode, 'PROJECT_MAP_OBSERVATION_TIME_INVALID');

  const tamperedObservation = {...extensionObservation, projectMap: {...extensionObservation.projectMap, projectId: 'tampered'}};
  const tamperedPlacement = plane.plan({projectMapObservation: tamperedObservation, change: extensionChange});
  assert.strictEqual(tamperedPlacement.result, 'PLACEMENT_INPUT_HELD');
  assert.strictEqual(tamperedPlacement.errorCode, 'PROJECT_MAP_OBSERVATION_PROJECT_DIGEST_MISMATCH');
  const ambiguousInput = plane.plan({projectMap: extensionObservation.projectMap, projectMapObservation: extensionObservation, change: extensionChange});
  assert.strictEqual(ambiguousInput.errorCode, 'PROJECT_MAP_INPUT_AMBIGUOUS');

  const unmappedRoot = workspace();
  put(unmappedRoot, 'src/domain/game.js', 'game\n');
  put(unmappedRoot, 'src/domain/unmapped.js', 'unmapped\n');
  put(unmappedRoot, 'testing/domain/game.test.js', 'test\n');
  const unmapped = hand.inspect({workspaceRoot: unmappedRoot, declaration: extensionDeclaration});
  assert.strictEqual(unmapped.result, 'PROJECT_MAP_OBSERVATION_HELD');
  assert.strictEqual(unmapped.errorCode, 'PROJECT_MAP_UNMAPPED_LANGUAGE_FILES');
  assert.strictEqual(unmapped.unmappedPathCount, 1);

  const symlinkRoot = workspace();
  put(symlinkRoot, 'src/domain/game.js', 'game\n');
  put(symlinkRoot, 'testing/domain/game.test.js', 'test\n');
  fs.symlinkSync('game.js', path.join(symlinkRoot, 'src/domain/game-link.js'));
  const symlink = hand.inspect({workspaceRoot: symlinkRoot, declaration: extensionDeclaration});
  assert.strictEqual(symlink.result, 'PROJECT_MAP_OBSERVATION_HELD');
  assert(symlink.errorCode.startsWith('PROJECT_MAP_SYMLINK_FORBIDDEN:'));

  const missingRoot = workspace();
  put(missingRoot, 'testing/domain/game.test.js', 'test\n');
  const absentSourceRoot = hand.inspect({workspaceRoot: missingRoot, declaration: extensionDeclaration});
  assert.strictEqual(absentSourceRoot.result, 'PROJECT_MAP_OBSERVATION_HELD');
  assert.strictEqual(absentSourceRoot.errorCode, 'PROJECT_MAP_FILESYSTEM_ENOENT');
  fs.mkdirSync(path.join(missingRoot, 'src'), {recursive: true});
  const missing = hand.inspect({workspaceRoot: missingRoot, declaration: extensionDeclaration});
  assert.strictEqual(missing.result, 'PROJECT_MAP_OBSERVATION_HELD');
  assert.strictEqual(missing.errorCode, 'PROJECT_MAP_DECLARED_MODULE_NOT_OBSERVED');
  assert.deepStrictEqual(missing.missingPaths, ['src/domain/game.js']);

  const traversal = hand.inspect({workspaceRoot: extensionRoot, declaration: {...extensionDeclaration, conventions: {...extensionDeclaration.conventions, sourceRoot: '../src'}}});
  assert.strictEqual(traversal.result, 'PROJECT_MAP_OBSERVATION_HELD');
  assert(traversal.errorCode.startsWith('PROJECT_SOURCE_ROOT_'));
  assert.strictEqual(hand.inspect({workspaceRoot: path.parse(extensionRoot).root, declaration: extensionDeclaration}).errorCode, 'PROJECT_WORKSPACE_ROOT_TOO_BROAD');
  assert.strictEqual(hand.inspect({workspaceRoot: path.relative(process.cwd(), extensionRoot), declaration: extensionDeclaration}).errorCode, 'PROJECT_WORKSPACE_ROOT_MUST_BE_ABSOLUTE');
  assert.strictEqual(hand.inspect({workspaceRoot: extensionRoot, declaration: extensionDeclaration, limits: {maxFiles: hand.LIMITS.maxFiles + 1}}).errorCode, 'PROJECT_MAP_LIMIT_ESCALATION_FORBIDDEN:maxFiles');

  const basenameRoot = workspace();
  put(basenameRoot, 'src/openapi.json', '{"openapi":"3.1.0"}\n');
  put(basenameRoot, 'testing/openapi/openapi.test.json', '{"ok":true}\n');
  const basenameDeclaration = declaration({
    projectId: 'observed-openapi',
    languageId: 'openapi',
    conventions: {sourceRoot: 'src', testRoot: 'testing/openapi', fileExtension: '.json', languageBinding: {kind: 'basename', signal: 'openapi.json'}, sourceFilePattern: 'openapi.json', roleDirectory: false, testFilePattern: '{name}.test{ext}', naming: 'kebab-case'},
    source: module({id: 'openapi-core', modulePath: 'src/openapi.json', role: 'domain', kind: 'rule', owner: 'OPENAPI_CORE'}),
    verification: module({id: 'openapi-verification', modulePath: 'testing/openapi/openapi.test.json', role: 'verification', kind: 'test', owner: 'OPENAPI_VERIFICATION', verifies: ['src/openapi.json']})
  });
  const basenameObservation = hand.inspect({workspaceRoot: basenameRoot, declaration: basenameDeclaration});
  assert.strictEqual(basenameObservation.result, 'PROJECT_MAP_OBSERVED_READ_ONLY');
  const basenamePlacement = plane.plan({projectMapObservation: basenameObservation, change: change({changeId: 'openapi-observed-change', owner: 'OPENAPI_CORE'})});
  assert.strictEqual(basenamePlacement.result, 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY');
  assert.strictEqual(basenamePlacement.languageBinding.signalKind, 'basename');

  const pathRoot = workspace();
  put(pathRoot, '.github/workflows/ci.yml', 'name: ci\n');
  put(pathRoot, 'testing/github-actions/ci.test.yml', 'name: test\n');
  const pathDeclaration = declaration({
    projectId: 'observed-actions',
    languageId: 'github-actions',
    conventions: {sourceRoot: '.github/workflows', testRoot: 'testing/github-actions', fileExtension: '.yml', languageBinding: {kind: 'path-context', signal: '/.github/workflows/'}, sourceFilePattern: '{name}{ext}', roleDirectory: false, testFilePattern: '{name}.test{ext}', naming: 'kebab-case'},
    source: module({id: 'actions-core', modulePath: '.github/workflows/ci.yml', role: 'domain', kind: 'rule', owner: 'ACTIONS_CORE'}),
    verification: module({id: 'actions-verification', modulePath: 'testing/github-actions/ci.test.yml', role: 'verification', kind: 'test', owner: 'ACTIONS_VERIFICATION', verifies: ['.github/workflows/ci.yml']})
  });
  const pathObservation = hand.inspect({workspaceRoot: pathRoot, declaration: pathDeclaration});
  assert.strictEqual(pathObservation.result, 'PROJECT_MAP_OBSERVED_READ_ONLY');
  const pathPlacement = plane.plan({projectMapObservation: pathObservation, change: change({changeId: 'actions-observed-change', owner: 'ACTIONS_CORE'})});
  assert.strictEqual(pathPlacement.result, 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY');
  assert.strictEqual(pathPlacement.languageBinding.signalKind, 'path-context');

  const handSource = fs.readFileSync(path.join(__dirname, 'project-map-hand.js'), 'utf8');
  assert.strictEqual(/\b(?:writeFile|writeFileSync|appendFile|appendFileSync|rename|renameSync|unlink|unlinkSync|rm|rmSync|mkdir|mkdirSync)\s*\(/.test(handSource), false, 'read-only Hand source must not call mutation APIs');

  console.log(JSON.stringify({
    ok: true,
    observedBindingKinds: ['extension', 'basename', 'path-context'],
    observedWorkspaceCount: 3,
    observedModuleCount: 6,
    ttlMs: hand.TTL_MS,
    noMutationProbePassed: true,
    byteDriftChangesMapDigest: true,
    adversarialHoldCount: 13,
    authority: 'BOUNDED_WORKSPACE_READ_ONLY'
  }, null, 2));
} finally {
  for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
}
