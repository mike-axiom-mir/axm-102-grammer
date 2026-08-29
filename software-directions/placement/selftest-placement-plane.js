'use strict';

const assert = require('assert');
const languageOrgans = require('../../language-organs/registry.js');
const directions = require('../direction-registry.js');
const workbench = require('../frontier-direction-workbench.js');
const registry = require('./placement-registry.js');
const plane = require('./placement-plane.js');
const fixtures = require('./reference-placement-fixture.js');

const roles = registry.all();
const snapshot = registry.snapshot();
assert.strictEqual(roles.length, 10);
assert.strictEqual(new Set(roles.flatMap(role => role.changeKinds)).size, 40);
assert.strictEqual(snapshot.directionHintCount, 29);
assert.strictEqual(new Set(directions.all().map(profile => registry.hint(profile.id).directionId)).size, 29);
assert(/^[a-f0-9]{64}$/.test(snapshot.snapshotSha256));

let extensionBindableLanguageCount = 0; let nonExtensionLanguageHoldCount = 0;
for (const organ of languageOrgans.all()) {
  const fileExtension = organ.detect.ext[0] || '.yml';
  const projectMap = {
    schema: 'axm.code.project-map.v1',
    projectId: `language-probe-${organ.languageId}`,
    languageId: organ.languageId,
    conventions: {sourceRoot: 'src', testRoot: 'testing', fileExtension, testFilePattern: '{name}.test{ext}', naming: 'kebab-case'},
    modules: [],
    protectedPaths: []
  };
  const change = {schema: 'axm.code.change-intent.v1', changeId: `${organ.languageId}-placement-probe`, directionId: 'game', kind: 'rule', name: `${organ.languageId}-rule`, ownerSignals: [], expectedExports: [], dependencyModuleIds: [], requestedVerifiers: ['unit-test']};
  const result = plane.plan({projectMap, change});
  if (organ.detect.ext.length) {
    assert.strictEqual(result.result, 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY', `${organ.languageId}:${result.errorCode}`);
    assert.strictEqual(result.languageBinding.languageId, organ.languageId);
    extensionBindableLanguageCount += 1;
  } else {
    assert.strictEqual(result.result, 'PLACEMENT_LANGUAGE_HELD', organ.languageId);
    assert.strictEqual(result.errorCode, 'PROJECT_EXTENSION_NOT_OWNED_BY_LANGUAGE');
    nonExtensionLanguageHoldCount += 1;
  }
}
assert.strictEqual(extensionBindableLanguageCount + nonExtensionLanguageHoldCount, 102);

let planCount = 0; let extendCount = 0;
for (const profile of directions.all()) {
  for (const level of workbench.LEVELS) {
    const packet = workbench.prepare({directionId: profile.id, level});
    const input = fixtures.forPacket(packet);
    const placement = plane.plan(input);
    const repeat = plane.plan(input);
    assert.deepStrictEqual(repeat, placement, `${profile.id}:${level}:deterministic`);
    assert.strictEqual(placement.result, 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY', `${profile.id}:${level}:${placement.errorCode}`);
    assert.strictEqual(placement.sourcePlacement.action, 'extend-existing');
    assert.strictEqual(placement.verificationPlacement.action, 'extend-existing-test');
    assert.strictEqual(placement.languageBinding.languageId, 'javascript');
    assert.strictEqual(placement.languageBinding.toolchainVerified, false);
    assert.strictEqual(placement.preconditions.stopOnDrift, true);
    assert.strictEqual(placement.truth.planIsSourceCode, false);
    assert.strictEqual(placement.truth.planIsMutation, false);
    assert.strictEqual(placement.truth.extensionOwnedLanguageSignalRequiredInV1, true);
    assert.strictEqual(placement.truth.pathOrBasenameOnlyLanguageBindingSupportedInV1, false);
    assert.strictEqual(placement.authority.workspaceRead, false);
    assert.strictEqual(placement.authority.workspaceMutation, false);
    assert.strictEqual(placement.authority.toolExecution, false);
    assert(/^[a-f0-9]{64}$/.test(placement.projectMapSha256));
    assert(/^[a-f0-9]{64}$/.test(placement.planSha256));
    planCount += 1;
    extendCount += Number(placement.sourcePlacement.action === 'extend-existing');
  }
}

const gamePacket = workbench.prepare({directionId: 'game', level: 'seed'});
const base = fixtures.forPacket(gamePacket);
const emptyProject = {...base.projectMap, projectId: 'empty-game', modules: []};
const created = plane.plan({projectMap: emptyProject, change: {...base.change, ownerSignals: []}});
assert.strictEqual(created.result, 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY');
assert.strictEqual(created.sourcePlacement.action, 'create-module');
assert.strictEqual(created.sourcePlacement.targetPath, 'src/domain/game-seed.js');
assert.strictEqual(created.verificationPlacement.action, 'create-test-module');
assert.strictEqual(created.verificationPlacement.targetPath, 'testing/domain/game-seed.test.js');

const duplicateOwner = {...base.projectMap.modules[0], id: 'game-second-owner', path: 'src/domain/game-second.js', contentSha256: registry.hash('second-owner')};
const ambiguous = plane.plan({projectMap: {...base.projectMap, modules: [...base.projectMap.modules, duplicateOwner]}, change: base.change});
assert.strictEqual(ambiguous.result, 'PLACEMENT_DECISION_HELD');
assert.strictEqual(ambiguous.errorCode, 'AMBIGUOUS_DECLARED_OWNER');

const lockedModules = base.projectMap.modules.map((module, index) => index === 0 ? {...module, status: 'locked', mutable: false} : module);
const locked = plane.plan({projectMap: {...base.projectMap, modules: lockedModules}, change: base.change});
assert.strictEqual(locked.errorCode, 'DECLARED_OWNER_NOT_MUTABLE');

const traversal = plane.plan({projectMap: {...base.projectMap, conventions: {...base.projectMap.conventions, sourceRoot: '../src'}}, change: base.change});
assert.strictEqual(traversal.result, 'PLACEMENT_INPUT_HELD');
assert(traversal.errorCode.startsWith('PROJECT_SOURCE_ROOT_'));

const extension = plane.plan({projectMap: {...base.projectMap, conventions: {...base.projectMap.conventions, fileExtension: '.py'}}, change: base.change});
assert.strictEqual(extension.result, 'PLACEMENT_INPUT_HELD', 'module extensions must match project convention before language binding');

const languageMismatch = plane.plan({projectMap: {...emptyProject, conventions: {...emptyProject.conventions, fileExtension: '.py'}}, change: {...base.change, ownerSignals: []}});
assert.strictEqual(languageMismatch.result, 'PLACEMENT_LANGUAGE_HELD');
assert.strictEqual(languageMismatch.errorCode, 'PROJECT_EXTENSION_NOT_OWNED_BY_LANGUAGE');

const unknownKind = plane.plan({projectMap: base.projectMap, change: {...base.change, kind: 'magic-code'}});
assert.strictEqual(unknownKind.result, 'PLACEMENT_INPUT_HELD');
assert.strictEqual(unknownKind.errorCode, 'CHANGE_KIND_UNKNOWN');

const missingDependency = plane.plan({projectMap: base.projectMap, change: {...base.change, dependencyModuleIds: ['missing-module']}});
assert.strictEqual(missingDependency.result, 'PLACEMENT_INPUT_HELD');
assert(missingDependency.errorCode.startsWith('CHANGE_DEPENDENCY_MODULE_UNKNOWN'));

assert.strictEqual(plane.plan().result, 'PLACEMENT_INPUT_HELD');

console.log(JSON.stringify({
  ok: true,
  roleCount: roles.length,
  changeKindCount: snapshot.changeKindCount,
  directionHintCount: snapshot.directionHintCount,
  placementPlanCount: planCount,
  extendExistingCount: extendCount,
  extensionBindableLanguageCount,
  nonExtensionLanguageHoldCount,
  createModuleProbePassed: created.sourcePlacement.action === 'create-module',
  adversarialHoldCount: 7,
  snapshotSha256: snapshot.snapshotSha256,
  authority: 'NONE'
}, null, 2));
