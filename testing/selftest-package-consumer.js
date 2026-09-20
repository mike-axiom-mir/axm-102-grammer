'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    input: options.input,
    encoding: 'utf8',
    env: {...process.env, npm_config_update_notifier: 'false'}
  });
  assert.ifError(result.error);
  assert.strictEqual(result.status, options.status == null ? 0 : options.status, result.stderr || result.stdout);
  return result;
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-grammar-consumer-'));
try {
  const pack = run('npm', ['pack', ROOT, '--json', '--ignore-scripts', '--pack-destination', temporary]);
  const packRows = JSON.parse(pack.stdout);
  assert.strictEqual(packRows.length, 1);
  assert(/^[a-f0-9]{40}$/.test(packRows[0].shasum));
  assert(/^sha512-[A-Za-z0-9+/]+=*$/.test(packRows[0].integrity));
  assert(packRows[0].files.some(item => item.path === 'bin/axm-grammar-capabilities.js'));
  assert(!packRows[0].files.some(item => item.path.startsWith('testing/')));
  assert(packRows[0].files.some(item => item.path === 'code-programs/index.js'));
  assert(!packRows[0].files.some(item => item.path === 'code-programs/selftest.js'));
  assert(!packRows[0].files.some(item => item.path.startsWith('software-directions/placement/')));

  const archive = path.join(temporary, packRows[0].filename);
  const consumer = path.join(temporary, 'consumer');
  fs.mkdirSync(consumer);
  run('npm', ['install', archive, '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: consumer});

  const installedRoot = path.join(consumer, 'node_modules', 'axm-102-grammar-body');
  const library = require(installedRoot);
  const direct = library.compose({filePath: 'src/world.rs', operation: 'refactor'});
  assert.strictEqual(direct.result, 'CAPABILITY_CAPSULE_READY_NO_EXECUTION_AUTHORITY');
  assert.strictEqual(direct.languageId, 'rust');
  assert.strictEqual(direct.authority.network, false);
  assert.strictEqual(direct.authority.workspaceRead, false);

  const cli = path.join(
    consumer,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'axm-grammar-capabilities.cmd' : 'axm-grammar-capabilities'
  );
  const cliCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : cli;
  const cliPrefix = process.platform === 'win32' ? ['/d', '/s', '/c', cli] : [];
  const input = JSON.stringify({filePath: 'src/world.rs', operation: 'refactor'});
  const first = run(cliCommand, [...cliPrefix], {cwd: consumer, input});
  const second = run(cliCommand, [...cliPrefix], {cwd: consumer, input});
  assert.strictEqual(first.stdout, second.stdout);
  const capsule = JSON.parse(first.stdout);
  assert.strictEqual(capsule.capsuleSha256, direct.capsuleSha256);
  assert.strictEqual(capsule.truth.workspaceMutated, false);
  assert.strictEqual(capsule.truth.toolExecuted, false);

  // Exercise the new author from a separately installed, offline package.
  const programs = require(path.join(installedRoot, 'code-programs', 'index.js'));
  run(process.execPath, ['-e', "const p=require('axm-102-grammar-body/code-programs');if(p.catalog().operations.length!==48)process.exit(1)"], {cwd: consumer});
  const authored = programs.compileRecipe({id: 'invoice-totals', languageId: 'javascript'});
  assert.equal(authored.result, 'CODE_PROGRAM_CANDIDATE_READY');
  assert.equal(authored.verification.executed, false);
  const generated = path.join(consumer, 'generated');
  fs.mkdirSync(generated);
  for (const artifact of authored.artifacts) fs.writeFileSync(path.join(generated, artifact.path), artifact.content);
  run(process.execPath, ['selftest.js'], {cwd: generated});
  const codeCli = path.join(installedRoot, 'bin', 'axm-code-program.js');
  const codeResult = JSON.parse(run(process.execPath, [codeCli], {cwd: consumer, input: JSON.stringify({action: 'recipe', id: 'invoice-totals', languageId: 'javascript'})}).stdout);
  assert.equal(codeResult.compilationSha256, authored.compilationSha256);
  const captured = programs.remember({program: programs.getRecipe('invoice-totals').program});
  const invoice = captured.captured.find(row => row.function === 'invoice');
  const recovered = programs.restore({archive: JSON.parse(JSON.stringify(captured.archive)), structuralSha256: invoice.structuralSha256});
  assert.equal(programs.compile({program: recovered, languageId: 'python'}).result, 'CODE_PROGRAM_CANDIDATE_READY');

  const invalid = run(cliCommand, [...cliPrefix], {cwd: consumer, input: '{', status: 2});
  const refusal = JSON.parse(invalid.stderr);
  assert.strictEqual(refusal.errorCode, 'STDIN_JSON_INVALID');
  assert.strictEqual(refusal.authority, 'NONE');
  assert.strictEqual(refusal.workspaceRead, false);

  console.log(JSON.stringify({
    ok: true,
    package: packRows[0].name,
    version: packRows[0].version,
    packedFiles: packRows[0].entryCount,
    packedBytes: packRows[0].size,
    unpackedBytes: packRows[0].unpackedSize,
    offlineInstall: true,
    externalImport: true,
    externalCli: true,
    installedCodeCompiler: true,
    installedGeneratedProgramExecuted: true,
    installedRecipeCaptureAndRestore: true,
    deterministicCli: true,
    invalidJsonRefused: true,
    authority: capsule.authority
  }, null, 2));
} finally {
  fs.rmSync(temporary, {recursive: true, force: true});
}
