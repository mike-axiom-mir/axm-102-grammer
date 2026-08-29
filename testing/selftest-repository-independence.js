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
assert.strictEqual(frontierContract.authority, 'NONE');
assert.deepStrictEqual(frontierContract.permissions, []);
assert.strictEqual(frontierContract.truth.beginnerReferenceReadyIsProductionReady, false);
assert.strictEqual(frontierTrials.trials.length, 29);
assert.strictEqual(frontierTrials.method.trialCount, 58);
assert.strictEqual(frontierTrials.method.humanInterventionDuringTrialRun, false);
assert.strictEqual(frontierTrials.method.productionReadinessClaimed, false);

const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
assert(readme.includes('standalone-capability-router.js'));
assert(readme.includes('software-directions/direction-stack.js'));
assert(readme.includes('frontier-direction-workbench.js'));
assert(readme.includes('node testing/run-all.js'));

console.log(JSON.stringify({
  ok: true,
  languageDirectoryCount: organDirectories.length,
  perLanguagePayloadCount: payloadCount,
  parsedJsonFileCount: jsonFiles.length,
  softwareDirectionProfileCount: directionCatalog.profiles.length,
  softwareDirectionAxisCount: Object.keys(directionAxes.axes).length,
  frontierDirectionTrialCount: frontierTrials.method.trialCount,
  symlinkCount: 0,
  submoduleFilePresent: false,
  capabilityContractAuthority: contract.authority
}, null, 2));
