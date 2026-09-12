#!/usr/bin/env node
'use strict';

const {TextDecoder} = require('util');
const router = require('../language-organs/standalone-capability-router.js');
const packageMetadata = require('../package.json');

const MAX_INPUT_BYTES = 1024 * 1024;
const ERROR_SCHEMA = 'axm.code.standalone-capability-cli-error.v1';

function help() {
  return [
    'Usage: axm-grammar-capabilities [--pretty]',
    '',
    'Read one capability-composition JSON object from stdin and write one',
    'axm.code.standalone-capability-capsule.v1 JSON document to stdout.',
    '',
    'Options:',
    '  --pretty   indent output JSON',
    '  --version  print package version',
    '  --help     show this help',
    '',
    'The command reads no workspace files, performs no network access, executes',
    'no tools, mutates nothing, and grants no language-selection authority.'
  ].join('\n');
}

function fail(errorCode, detail) {
  const receipt = {
    schema: ERROR_SCHEMA,
    result: 'INVALID_CLI_REQUEST',
    errorCode,
    detail,
    inputConsumed: false,
    workspaceRead: false,
    workspaceMutated: false,
    networkUsed: false,
    toolExecuted: false,
    authority: 'NONE'
  };
  process.stderr.write(`${JSON.stringify(receipt)}\n`);
  return 2;
}

function parseArgs(argv) {
  const allowed = new Set(['--pretty', '--version', '--help']);
  const unknown = argv.filter(item => !allowed.has(item));
  if (unknown.length) throw Error(`UNKNOWN_ARGUMENT:${unknown[0]}`);
  return {
    pretty: argv.includes('--pretty'),
    version: argv.includes('--version'),
    help: argv.includes('--help')
  };
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
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    return fail('CLI_ARGUMENT_INVALID', error.message);
  }
  if (args.help) {
    process.stdout.write(`${help()}\n`);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${packageMetadata.version}\n`);
    return 0;
  }

  let source;
  try {
    source = await readStdin();
  } catch (error) {
    return fail(error.message, 'Provide one UTF-8 JSON object on stdin, at most 1 MiB.');
  }
  let input;
  try {
    input = JSON.parse(source);
  } catch {
    return fail('STDIN_JSON_INVALID', 'Input must be one valid JSON document.');
  }

  const capsule = router.compose(input);
  process.stdout.write(`${JSON.stringify(capsule, null, args.pretty ? 2 : 0)}\n`);
  return 0;
}

if (require.main === module) {
  main().then(code => {
    process.exitCode = code;
  }, error => {
    process.exitCode = fail('CLI_UNEXPECTED_FAILURE', error.message);
  });
}

module.exports = {MAX_INPUT_BYTES, ERROR_SCHEMA, help, fail, parseArgs, readStdin, main};
