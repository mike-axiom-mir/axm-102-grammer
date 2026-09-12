'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {createRequire} = require('module');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    input: options.input,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: {...process.env, npm_config_update_notifier: 'false', ...(options.env || {})}
  });
  assert.ifError(result.error);
  assert.strictEqual(result.status, options.status == null ? 0 : options.status, result.stderr || result.stdout);
  return result;
}

function shim(consumer, name) {
  const executable = path.join(
    consumer,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${name}.cmd` : name
  );
  return process.platform === 'win32'
    ? {command: process.env.ComSpec || 'cmd.exe', prefix: ['/d', '/s', '/c', executable]}
    : {command: executable, prefix: []};
}

function git(args) {
  return run('git', args).stdout.trim();
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-grammar-glass-bridge-'));
try {
  const packRows = JSON.parse(run('npm', [
    'pack', ROOT, '--json', '--ignore-scripts', '--pack-destination', temporary
  ]).stdout);
  assert.strictEqual(packRows.length, 1);
  assert(packRows[0].files.some(item => item.path === 'bin/axm-grammar-glass-snapshot.js'));
  assert(packRows[0].files.some(item => item.path === 'language-organs/export-grammar-glass-capability-snapshot.js'));

  const consumer = path.join(temporary, 'consumer');
  fs.mkdirSync(consumer);
  const archive = path.join(temporary, packRows[0].filename);
  run('npm', ['install', archive, '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: consumer});

  const consumerRequire = createRequire(path.join(consumer, 'probe.js'));
  const Exporter = consumerRequire('axm-102-grammar-body/grammar-glass-snapshot');
  assert.strictEqual(Exporter.SCHEMA, 'axm.grammar-102.capability-snapshot.v1');

  const cli = shim(consumer, 'axm-grammar-glass-snapshot');
  const missingProvenance = run(cli.command, [...cli.prefix, 'create'], {cwd: consumer, status: 2});
  const missingReceipt = JSON.parse(missingProvenance.stderr);
  assert.strictEqual(missingReceipt.result, 'SNAPSHOT_OPERATION_REFUSED');
  assert.strictEqual(missingReceipt.outputWritten, false);

  const commitSha = git(['rev-parse', 'HEAD']);
  const treeSha = git(['rev-parse', 'HEAD^{tree}']);
  const sourceArgs = [
    'create',
    '--commit', commitSha,
    '--tree', treeSha,
    '--branch', process.env.AXM_SOURCE_BRANCH || 'automation/installed-grammar-glass-export-v1',
    '--repo', 'mike-axiom-mir/axm-102-grammer'
  ];
  const first = run(cli.command, [...cli.prefix, ...sourceArgs], {cwd: consumer});
  const second = run(cli.command, [...cli.prefix, ...sourceArgs], {cwd: consumer});
  assert.strictEqual(first.stdout, second.stdout, 'installed export must be deterministic');
  const snapshot = JSON.parse(first.stdout);
  assert.strictEqual(snapshot.source.commitSha, commitSha);
  assert.strictEqual(snapshot.source.treeSha, treeSha);
  assert.strictEqual(snapshot.grammarIdentity.profileCount, 102);
  assert.strictEqual(snapshot.layers.semanticKeyboards.totalStableKeyCount, 4896);
  assert.strictEqual(snapshot.layers.cheatcodeInfluence.nodeCount, 5100);

  const verification = JSON.parse(run(
    cli.command,
    [...cli.prefix, 'verify'],
    {cwd: consumer, input: first.stdout}
  ).stdout);
  assert.strictEqual(verification.result, 'VERIFIED_EXACT_PACKAGE_REPLAY');
  assert.strictEqual(verification.capabilitySnapshotSha256, snapshot.capabilitySnapshotSha256);
  assert.strictEqual(verification.truth.exactPackageReplayMatched, true);
  assert.strictEqual(verification.truth.sourceMetadataAuthenticated, false);

  const resealedFalse = JSON.parse(JSON.stringify(snapshot));
  resealedFalse.grammarIdentity.profileCount = 101;
  const {capabilitySnapshotSha256: ignored, ...falseCore} = resealedFalse;
  resealedFalse.capabilitySnapshotSha256 = Exporter.sha256(falseCore);
  const refused = run(cli.command, [...cli.prefix, 'verify'], {
    cwd: consumer,
    input: `${JSON.stringify(resealedFalse)}\n`,
    status: 2
  });
  assert.match(JSON.parse(refused.stderr).errorCode, /PACKAGE_REPLAY_MISMATCH/);

  let grammarGlassConsumer = false;
  let sharedLanguageCount = null;
  const glassRoot = process.env.AXM_GRAMMAR_GLASS_ROOT;
  if (glassRoot) {
    const Bridge = require(path.join(glassRoot, 'tools/grammar-glass/grammar-102-intake-core.js'));
    const glassOutput = run(process.execPath, [
      path.join(glassRoot, 'shared/code-capability-fabric/language-organs/generate-code-grammar-glass-snapshot.js'),
      '--seed', '6f2d8b4abef8ebf661925d5ce9d1aeea05b584055e8bdc96b9f857fd66d65e0f',
      '--day', 'installed-package-bridge',
      '--ticks', '2',
      '--stars', '1',
      '--construction-rolls', '1'
    ], {cwd: glassRoot}).stdout;
    const glassSnapshot = JSON.parse(glassOutput);
    assert.strictEqual(Bridge.validateSnapshot(snapshot), true);
    const receipt = Bridge.createImportReceipt(snapshot);
    assert.strictEqual(Bridge.verifyImportReceipt(receipt), true);
    const binding = Bridge.bindToGlass(glassSnapshot, receipt, {
      lensIds: ['BASE_GRAMMAR', 'SPECIALIST_EYES', 'SEMANTIC_DIRECTIONS', 'CHEATCODE_INFLUENCE']
    });
    assert.strictEqual(binding.result, 'GRAMMAR_102_OVERLAY_BINDING_READY_NO_CYCLE_MUTATION');
    assert.strictEqual(binding.truth.overlaySelectionActivatesImportedCapability, false);
    assert.strictEqual(binding.truth.overlaySelectionMutatesGlass, false);
    assert.strictEqual(binding.intakeBinding.sourceCommitSha, commitSha);
    sharedLanguageCount = binding.languageAlignment.shared.length;
    assert.strictEqual(sharedLanguageCount, 102);
    grammarGlassConsumer = true;
  }

  console.log(JSON.stringify({
    ok: true,
    package: packRows[0].name,
    packedFiles: packRows[0].entryCount,
    packedBytes: packRows[0].size,
    offlineInstall: true,
    exportedSubpath: true,
    installedCreateCli: true,
    deterministicExport: true,
    exactPackageReplay: true,
    resealedFalseSnapshotRefused: true,
    missingProvenanceRefused: true,
    grammarGlassConsumer,
    sharedLanguageCount,
    authority: verification.truth.authority
  }, null, 2));
} finally {
  fs.rmSync(temporary, {recursive: true, force: true});
}
