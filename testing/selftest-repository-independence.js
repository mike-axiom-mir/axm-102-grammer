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

const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
assert(readme.includes('standalone-capability-router.js'));
assert(readme.includes('node testing/run-all.js'));

console.log(JSON.stringify({
  ok: true,
  languageDirectoryCount: organDirectories.length,
  perLanguagePayloadCount: payloadCount,
  parsedJsonFileCount: jsonFiles.length,
  symlinkCount: 0,
  submoduleFilePresent: false,
  capabilityContractAuthority: contract.authority
}, null, 2));
