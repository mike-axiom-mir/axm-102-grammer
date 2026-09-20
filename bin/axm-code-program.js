#!/usr/bin/env node
'use strict';

const {TextDecoder} = require('node:util');
const programs = require('../code-programs/index.js');
const MAX_BYTES = 1048576;
function refused(errorCode) { process.stderr.write(JSON.stringify({result: 'CODE_PROGRAM_HELD', errorCode, authority: 'NONE'}) + '\n'); process.exitCode = 2; }
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('axm-code-program [--pretty]\nRead one UTF-8 JSON request from stdin and write JSON to stdout.\nActions: catalog, validate, compile, recipe, capture, restore.\nReturns source/archive data; does not execute code or write files.\n');
} else if (args.some(arg => arg !== '--pretty') || args.length > 1) {
  refused('ARGUMENT_INVALID');
} else {
  let bytes = 0, chunks = [], stopped = false;
  process.stdin.on('data', chunk => {
    if (stopped) return;
    bytes += chunk.length;
    if (bytes > MAX_BYTES) { stopped = true; chunks = []; refused('STDIN_BYTES_LIMIT'); process.stdin.resume(); return; }
    chunks.push(chunk);
  });
  process.stdin.on('error', () => { if (!stopped) { stopped = true; refused('STDIN_READ_FAILED'); } });
  process.stdin.on('end', () => {
    if (stopped) return;
    let request;
    try { request = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks))); }
    catch { refused('STDIN_JSON_OR_UTF8_INVALID'); return; }
    try {
      const output = programs.handle(request);
      if (output.result === 'CODE_PROGRAM_HELD') { refused(output.errorCode); return; }
      process.stdout.write(JSON.stringify(output, null, args.includes('--pretty') ? 2 : 0) + '\n');
    } catch (error) { refused(String(error.message)); }
  });
}
