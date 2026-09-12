'use strict';

const assert = require('assert');
const {spawnSync} = require('child_process');
const path = require('path');
const router = require('../language-organs/standalone-capability-router.js');
const Console = require('./capsule-console.js');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(__dirname, 'capsule-console.js');
let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.deepStrictEqual(actual, expected, message); assertions += 1; };

const demoCapsule = router.compose(Console.DEMO_REQUEST);
eq(demoCapsule.result, 'CAPABILITY_CAPSULE_READY_NO_EXECUTION_AUTHORITY');
eq(demoCapsule.languageId, 'rust');
const view = Console.renderCapsule(demoCapsule, {color: false, width: 76});
for (const phrase of [
  'READY  CAPABILITY_CAPSULE_READY_NO_EXECUTION_AUTHORITY',
  'Rust · compiled-language',
  'Observed hazard — unsafe boundaries',
  'CHEAPEST NEXT CHECK',
  'DIRECTION EVIDENCE',
  'Workspace mutation — none',
  `sha256:${demoCapsule.capsuleSha256.slice(0, 16)}…${demoCapsule.capsuleSha256.slice(-12)}`
]) ok(view.includes(phrase), `missing visible phrase: ${phrase}`);
ok(!view.includes('\u001b['), 'plain output contains no ANSI escapes');
ok(view.split('\n').every(line => line.length <= 76), 'plain output respects requested width');

const ambiguous = router.compose({filePath: 'src/model.m'});
eq(ambiguous.result, 'LANGUAGE_SELECTION_REQUIRED');
const heldView = Console.renderCapsule(ambiguous, {color: false, width: 88});
ok(heldView.includes('HELD  LANGUAGE_SELECTION_REQUIRED'));
ok(heldView.includes('Repeat with --language ID'));
ok(heldView.includes('objective c'));
ok(heldView.includes('matlab'));
ok(heldView.includes('Automatic action — none'));

const parsed = Console.parseArgs([
  '--file', 'src/app.py', '--operation', 'review', '--risk', 'exception path',
  '--fact', 'VERIFIER_MISSING', '--direction', 'service', '--capability', 'API_SURFACE',
  '--verifier', 'unit-test', '--no-color', '--width', '80'
]);
const request = Console.requestFrom(parsed);
eq(request.filePath, 'src/app.py');
eq(request.observation.risks, ['exception path']);
eq(request.directions.observed.capabilities, ['API_SURFACE']);
eq(request.directions.observed.verifiers, ['unit-test']);
assert.throws(() => Console.parseArgs(['--demo', '--file', 'x.rs']), /INPUT_SOURCE_CONFLICT/); assertions += 1;
assert.throws(() => Console.parseArgs(['--width', '20']), /WIDTH_MUST_BE/); assertions += 1;
assert.throws(() => Console.requestFrom({...Console.parseArgs(['--stdin'])}, '{bad'), /INVALID_JSON/); assertions += 1;

const demoRun = spawnSync(process.execPath, [CLI, '--demo', '--no-color', '--width', '72'], {cwd: ROOT, encoding: 'utf8'});
eq(demoRun.status, 0);
ok(demoRun.stdout.includes('READY'));
ok(demoRun.stdout.includes('TRUTH BOUNDARY'));
ok(demoRun.stdout.split('\n').every(line => line.length <= 72));
eq(demoRun.stderr, '');

const stdinRequest = JSON.stringify({filePath: 'src/app.py', operation: 'review'});
const stdinRun = spawnSync(process.execPath, [CLI, '--stdin', '--no-color'], {cwd: ROOT, encoding: 'utf8', input: stdinRequest});
eq(stdinRun.status, 0);
ok(stdinRun.stdout.includes('Python'));
ok(stdinRun.stdout.includes('review'));

const jsonRun = spawnSync(process.execPath, [CLI, '--demo', '--json'], {cwd: ROOT, encoding: 'utf8'});
eq(jsonRun.status, 0);
const jsonCapsule = JSON.parse(jsonRun.stdout);
eq(jsonCapsule.capsuleSha256, demoCapsule.capsuleSha256);
eq(jsonCapsule.result, demoCapsule.result);

const invalidRun = spawnSync(process.execPath, [CLI, '--stdin'], {cwd: ROOT, encoding: 'utf8', input: '{bad'});
eq(invalidRun.status, 1);
ok(invalidRun.stderr.includes('CAPSULE_CONSOLE_INPUT_ERROR'));
ok(invalidRun.stderr.includes('No capability capsule was created'));

console.log(JSON.stringify({ok: true, assertions, demoCapsuleSha256: demoCapsule.capsuleSha256}, null, 2));
