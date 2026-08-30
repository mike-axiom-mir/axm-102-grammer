'use strict';

const {spawnSync} = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function available(command, args = ['--version']) {
  const result = spawnSync(command, args, {cwd: ROOT, encoding: 'utf8'});
  return !result.error && result.status === 0;
}

function resolvePython() {
  const candidates = [process.env.AXM_PYTHON, 'python3', 'python'].filter(Boolean);
  for (const candidate of candidates) if (available(candidate)) return candidate;
  return null;
}

const python = resolvePython();
if (!python) {
  console.error('PYTHON_RUNTIME_NOT_FOUND: set AXM_PYTHON or install python3/python');
  process.exit(1);
}

const checks = [
  [python, ['language-organs/build-grammar-profiles.py', '--check']],
  [process.execPath, ['language-organs/selftest-grammar-profiles.js']],
  [python, ['language-organs/build-specialist-eyes.py', '--check']],
  [process.execPath, ['language-organs/selftest-specialist-eyes.js']],
  [process.execPath, ['language-organs/build-machine-templates.js', '--check']],
  [process.execPath, ['language-organs/selftest-machine-templates.js']],
  [process.execPath, ['language-organs/build-machine-cheatcodes.js', '--check']],
  [process.execPath, ['language-organs/selftest-machine-cheatcodes.js']],
  [process.execPath, ['language-organs/selftest-machine-cheatcode-influence.js']],
  [process.execPath, ['language-organs/build-machine-keyboards.js', '--check']],
  [process.execPath, ['language-organs/selftest-machine-keyboards.js']],
  [process.execPath, ['language-organs/selftest.js']],
  [process.execPath, ['language-organs/selftest-adversarial.js']],
  [process.execPath, ['software-directions/selftest-direction-registry.js']],
  [process.execPath, ['software-directions/selftest-direction-stack.js']],
  [process.execPath, ['software-directions/placement/selftest-placement-plane.js']],
  [process.execPath, ['software-directions/placement/selftest-project-map-hand.js']],
  [process.execPath, ['software-directions/placement/selftest-edit-graph-plane.js']],
  [process.execPath, ['software-directions/placement/selftest-workspace-edit-hand.js']],
  [process.execPath, ['software-directions/placement/selftest-workspace-edit-recovery.js']],
  [process.execPath, ['software-directions/placement/selftest-workspace-edit-graph-hand.js']],
  [process.execPath, ['software-directions/placement/selftest-workspace-edit-graph-recovery.js']],
  [process.execPath, ['software-directions/adapters/selftest-adapter-plane.js']],
  [process.execPath, ['software-directions/selftest-frontier-direction-workbench.js']],
  [process.execPath, ['language-organs/selftest-standalone-capability-router.js']],
  [process.execPath, ['testing/selftest-repository-independence.js']]
];

let passed = 0;
let failed = 0;
for (let index = 0; index < checks.length; index += 1) {
  const [command, args] = checks[index];
  const displayCommand = command === process.execPath ? 'node' : command;
  console.log(`\nTEST ${String(index + 1).padStart(2, '0')}/${checks.length}: ${displayCommand} ${args.join(' ')}`);
  const result = spawnSync(command, args, {cwd: ROOT, encoding: 'utf8'});
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    failed += 1;
    console.error(`TEST_RESULT: FAIL exit=${result.status == null ? 'SPAWN_ERROR' : result.status}`);
  } else {
    passed += 1;
    console.log('TEST_RESULT: PASS');
  }
}

console.log(`\nSUITE_RESULT: passed=${passed} failed=${failed} total=${checks.length}`);
process.exitCode = failed === 0 ? 0 : 1;
