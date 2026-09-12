#!/usr/bin/env node
'use strict';

const {TextDecoder} = require('util');
const Exporter = require('../language-organs/export-grammar-glass-capability-snapshot.js');

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const ERROR_SCHEMA = 'axm.grammar-102.capability-snapshot-cli-error.v1';

function help() {
  return [
    'Usage:',
    '  axm-grammar-glass-snapshot create --commit <sha> [export options]',
    '  axm-grammar-glass-snapshot verify [--pretty] < snapshot.json',
    '',
    'Create emits the existing axm.grammar-102.capability-snapshot.v1 contract.',
    'Installed packages have no Git metadata, so --commit is required there;',
    '--tree, --branch, --repo, --pretty, and --out are forwarded to the exporter.',
    '',
    'Verify replays the snapshot against this exact installed grammar body. It',
    'proves byte/contract agreement, not authorship, source-metadata authenticity,',
    'quality, activation, promotion, or CANON.'
  ].join('\n');
}

function fail(errorCode, detail) {
  process.stderr.write(`${JSON.stringify({
    schema: ERROR_SCHEMA,
    result: 'SNAPSHOT_OPERATION_REFUSED',
    errorCode,
    detail,
    outputWritten: false,
    grammarGlassImported: false,
    activationPerformed: false,
    authority: 'NONE'
  })}\n`);
  return 2;
}

async function readStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_INPUT_BYTES) throw Error('STDIN_TOO_LARGE');
    chunks.push(buffer);
  }
  if (bytes === 0) throw Error('STDIN_REQUIRED');
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks));
  } catch {
    throw Error('STDIN_NOT_UTF8');
  }
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv.includes('--help')) {
    process.stdout.write(`${help()}\n`);
    return 0;
  }
  const operation = argv[0];
  if (operation === 'create') {
    try {
      Exporter.main(argv.slice(1));
      return 0;
    } catch (error) {
      return fail(error.message || 'CREATE_FAILED', 'No snapshot was emitted. Supply explicit source provenance when running from an installed package.');
    }
  }
  if (operation === 'verify') {
    const options = argv.slice(1);
    if (options.some(item => item !== '--pretty')) {
      return fail(`UNKNOWN_ARGUMENT:${options.find(item => item !== '--pretty')}`, 'Verify accepts JSON on stdin and optional --pretty only.');
    }
    try {
      const source = await readStdin();
      const snapshot = JSON.parse(source);
      const receipt = Exporter.verifySnapshot(snapshot);
      process.stdout.write(`${JSON.stringify(receipt, null, options.includes('--pretty') ? 2 : 0)}\n`);
      return 0;
    } catch (error) {
      const code = error instanceof SyntaxError ? 'STDIN_JSON_INVALID' : (error.message || 'VERIFY_FAILED');
      return fail(code, 'Snapshot must match the exact deterministic body in this installed package.');
    }
  }
  return fail(`UNKNOWN_OPERATION:${operation}`, 'Use create, verify, or --help.');
}

if (require.main === module) {
  main().then(code => {
    process.exitCode = code;
  }, error => {
    process.exitCode = fail('CLI_UNEXPECTED_FAILURE', error.message);
  });
}

module.exports = {MAX_INPUT_BYTES, ERROR_SCHEMA, help, fail, readStdin, main};
