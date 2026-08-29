'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ORGAN_ROOT = path.join(ROOT, 'language-organs', 'organs');
const REQUIRED_PAYLOADS = [
  'grammar.profile.json',
  'machine.cheatcodes.json',
  'machine.keyboard.json',
  'machine.templates.json',
  'organ.json',
  'specialist.eye.json'
];

function walk(root, files = []) {
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const target = path.join(root, entry.name);
    const stat = fs.lstatSync(target);
    assert.strictEqual(stat.isSymbolicLink(), false, `symlink forbidden in standalone body: ${path.relative(ROOT, target)}`);
    if (stat.isDirectory()) walk(target, files);
    else files.push(target);
  }
  return files;
}

assert.strictEqual(fs.existsSync(path.join(ROOT, '.gitmodules')), false, 'standalone body must not use git submodules');

const organDirectories = fs.readdirSync(ORGAN_ROOT, {withFileTypes: true})
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();
assert.strictEqual(organDirectories.length, 102, 'exactly 102 language directories');

let payloadCount = 0;
for (const directory of organDirectories) {
  const jsonFiles = fs.readdirSync(path.join(ORGAN_ROOT, directory))
    .filter(name => name.endsWith('.json'))
    .sort();
  assert.deepStrictEqual(jsonFiles, REQUIRED_PAYLOADS, `${directory} must contain the six standalone payloads`);
  payloadCount += jsonFiles.length;
}
assert.strictEqual(payloadCount, 612, '102 x six language payloads');

const files = walk(ROOT);
const jsonFiles = files.filter(file => file.endsWith('.json'));
for (const file of jsonFiles) {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')), `valid JSON: ${path.relative(ROOT, file)}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
assert.strictEqual(packageJson.private, true);
assert.strictEqual(packageJson.scripts.test, 'node testing/run-all.js');

const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'language-organs', 'standalone-capability-router.contract.json'), 'utf8'));
assert.strictEqual(contract.schema, 'axm.code.standalone-capability-router-contract.v1');
assert.strictEqual(contract.status, 'TEST');
assert.deepStrictEqual(contract.permissions, []);
assert.strictEqual(contract.authority, 'NONE');
assert.strictEqual(contract.truth.capabilityIsAuthority, false);
assert.strictEqual(contract.truth.runtimeCorrectnessAutomaticallyClaimed, false);

const directionContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'software-direction.contract.json'), 'utf8'));
const directionCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'direction-catalog.json'), 'utf8'));
const directionAxes = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'axis-catalog.json'), 'utf8'));
const frontierContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'frontier-direction-workbench.contract.json'), 'utf8'));
const frontierTrials = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'frontier-trial-catalog.json'), 'utf8'));
const adapterContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'adapters', 'adapter-plane.contract.json'), 'utf8'));
const adapterCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'adapters', 'adapter-catalog.json'), 'utf8'));
const placementContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'placement-plane.contract.json'), 'utf8'));
const placementCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'placement-catalog.json'), 'utf8'));
assert.strictEqual(directionContract.schema, 'axm.code.software-direction-contract.v1');
assert.strictEqual(directionContract.authority, 'NONE');
assert.deepStrictEqual(directionContract.permissions, []);
assert.strictEqual(directionContract.principles.duplicateGrammarBodiesPerDirection, false);
assert.strictEqual(directionContract.principles.suggestionIsSelection, false);
assert.strictEqual(directionContract.principles.missingEvidenceMeansImpossible, false);
assert.strictEqual(directionCatalog.profiles.length, 29);
assert.strictEqual(new Set(directionCatalog.profiles.map(profile => profile.id)).size, 29);
assert.deepStrictEqual(Object.keys(directionAxes.axes).sort(), ['distribution', 'execution', 'quality', 'risk', 'runtime', 'state', 'verification']);
assert.strictEqual(frontierContract.schema, 'axm.code.frontier-direction-workbench-contract.v1');
assert.strictEqual(frontierContract.authority, 'BOUNDED_LOCAL_ADAPTER_ONLY');
assert.deepStrictEqual(frontierContract.permissions, ['current-node-version-read', 'bounded-in-memory-reference-execution']);
assert.strictEqual(frontierContract.truth.beginnerReferenceReadyIsProductionReady, false);
assert.strictEqual(frontierTrials.trials.length, 29);
assert.strictEqual(frontierTrials.method.trialCount, 58);
assert.strictEqual(frontierTrials.method.humanInterventionDuringTrialRun, false);
assert.strictEqual(frontierTrials.method.productionReadinessClaimed, false);
assert.strictEqual(adapterContract.schema, 'axm.code.direction-adapter-plane-contract.v1');
assert.strictEqual(adapterContract.authority, 'BOUNDED_LOCAL_ADAPTER_ONLY');
assert.strictEqual(adapterContract.truth.requestedVerifierIsEvidence, false);
assert.strictEqual(adapterContract.executionBoundary.workspaceRead, false);
assert.strictEqual(adapterContract.executionBoundary.workspaceMutation, false);
assert.strictEqual(adapterContract.executionBoundary.childProcessExecution, false);
assert.strictEqual(adapterCatalog.adapters.length, 10);
assert.strictEqual(adapterCatalog.adapters.filter(adapter => adapter.kind === 'runtime').length, 1);
assert.strictEqual(adapterCatalog.adapters.filter(adapter => adapter.kind === 'verifier').length, 9);
assert.strictEqual(adapterCatalog.knownUnsupportedVerifierIds.length, 11);
assert.strictEqual(placementContract.schema, 'axm.code.placement-plane-contract.v1');
assert.strictEqual(placementContract.authority, 'NONE');
assert.deepStrictEqual(placementContract.permissions, []);
assert.strictEqual(placementContract.truth.placementPlanIsSourceCode, false);
assert.strictEqual(placementContract.truth.placementPlanIsWorkspaceMutation, false);
assert.strictEqual(placementContract.truth.ambiguousOwnerMayBeGuessed, false);
assert.strictEqual(placementContract.version, '1.1.0');
assert.strictEqual(placementContract.truth.explicitLanguageBindingSignalRequired, true);
assert.strictEqual(placementContract.truth.extensionLanguageBindingSupported, true);
assert.strictEqual(placementContract.truth.basenameLanguageBindingSupported, true);
assert.strictEqual(placementContract.truth.pathContextLanguageBindingSupported, true);
assert.strictEqual(placementContract.truth.targetPathMustMatchDeclaredLanguageSignal, true);
assert.strictEqual(placementCatalog.schema, 'axm.code.placement-role-catalog.v1');
assert.strictEqual(placementCatalog.roles.length, 10);
assert.strictEqual(new Set(placementCatalog.roles.flatMap(role => role.changeKinds)).size, 40);
assert.strictEqual(placementCatalog.directionRoleHints.length, 29);
assert.strictEqual(new Set(placementCatalog.directionRoleHints.map(item => item.directionId)).size, 29);

const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
assert(readme.includes('standalone-capability-router.js'));
assert(readme.includes('software-directions/direction-stack.js'));
assert(readme.includes('frontier-direction-workbench.js'));
assert(readme.includes('adapters/adapter-plane.js'));
assert(readme.includes('placement/placement-plane.js'));
assert(readme.includes('node testing/run-all.js'));

console.log(JSON.stringify({
  ok: true,
  languageDirectoryCount: organDirectories.length,
  perLanguagePayloadCount: payloadCount,
  parsedJsonFileCount: jsonFiles.length,
  softwareDirectionProfileCount: directionCatalog.profiles.length,
  softwareDirectionAxisCount: Object.keys(directionAxes.axes).length,
  frontierDirectionTrialCount: frontierTrials.method.trialCount,
  concreteAdapterCount: adapterCatalog.adapters.length,
  unsupportedVerifierAdapterCount: adapterCatalog.knownUnsupportedVerifierIds.length,
  placementRoleCount: placementCatalog.roles.length,
  placementChangeKindCount: placementCatalog.roles.flatMap(role => role.changeKinds).length,
  placementDirectionHintCount: placementCatalog.directionRoleHints.length,
  symlinkCount: 0,
  submoduleFilePresent: false,
  capabilityContractAuthority: contract.authority
}, null, 2));
