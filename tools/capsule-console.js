#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const router = require('../language-organs/standalone-capability-router.js');

const DEMO_REQUEST = Object.freeze({
  filePath: 'src/world.rs',
  operation: 'refactor',
  intent: 'refactor',
  signals: ['safe refactor', 'tests'],
  observation: {
    risks: ['unsafe boundaries'],
    factCodes: ['LIFETIME_CHANGED', 'VERIFIER_MISSING']
  },
  directions: {
    directionIds: ['game'],
    observed: {capabilities: ['FRAME_LOOP'], verifiers: ['unit-test']}
  }
});

const HELP = `AXM 102 Grammar capability console

Turn a caller-owned file/language observation into a readable orientation.
Nothing is scanned, executed, installed, selected, or changed.

Usage:
  node tools/capsule-console.js --demo
  node tools/capsule-console.js --file src/world.rs --operation refactor \\
    --risk "unsafe boundaries" --fact VERIFIER_MISSING --direction game \\
    --capability FRAME_LOOP --verifier unit-test
  node tools/capsule-console.js --input request.json
  printf '%s' '{"filePath":"src/app.py"}' | node tools/capsule-console.js --stdin

Input:
  --demo                  Run a deterministic Rust/game orientation
  --input PATH            Read the complete composition request from JSON
  --stdin                 Read the complete composition request from stdin
  --file PATH             File-path evidence for deterministic detection
  --language ID           Explicit language ID
  --operation NAME        Requested operation (default: understand)
  --intent NAME           Template/keyboard intent (default: build)
  --role NAME             Optional keyboard role
  --signal TEXT           Routing signal; repeatable
  --risk TEXT             Observed risk; repeatable
  --fact CODE             Observed fact code; repeatable
  --direction ID          Software direction; repeatable
  --capability ID         Caller-evidenced capability; repeatable
  --verifier ID           Caller-evidenced verifier; repeatable

Output:
  --json                  Emit the complete deterministic capsule as JSON
  --no-color              Disable ANSI color even on a TTY
  --width N               Wrap the readable view between 56 and 120 columns
  --help                  Show this guide
`;

function fail(message) {
  const error = new Error(message);
  error.code = 'CAPSULE_CONSOLE_USAGE_ERROR';
  throw error;
}

function push(map, key, value) {
  if (value == null || value === '') fail(`VALUE_REQUIRED:${key}`);
  (map[key] || (map[key] = [])).push(value);
}

function parseArgs(argv) {
  const parsed = {lists: {}, json: false, color: true, width: null, source: null, values: {}};
  const valueFlags = new Map([
    ['--input', 'input'], ['--file', 'filePath'], ['--language', 'languageId'],
    ['--operation', 'operation'], ['--intent', 'intent'], ['--role', 'role'], ['--width', 'width']
  ]);
  const listFlags = new Map([
    ['--signal', 'signals'], ['--risk', 'risks'], ['--fact', 'factCodes'],
    ['--direction', 'directionIds'], ['--capability', 'capabilities'], ['--verifier', 'verifiers']
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--no-color') parsed.color = false;
    else if (arg === '--demo' || arg === '--stdin') {
      if (parsed.source) fail(`INPUT_SOURCE_CONFLICT:${parsed.source}:${arg.slice(2)}`);
      parsed.source = arg.slice(2);
    } else if (valueFlags.has(arg)) {
      const key = valueFlags.get(arg);
      const value = argv[++index];
      if (value == null || value.startsWith('--')) fail(`VALUE_REQUIRED:${arg}`);
      if (key === 'input') {
        if (parsed.source) fail(`INPUT_SOURCE_CONFLICT:${parsed.source}:input`);
        parsed.source = 'input';
        parsed.inputPath = value;
      } else if (key === 'width') parsed.width = Number(value);
      else parsed.values[key] = value;
    } else if (listFlags.has(arg)) {
      const value = argv[++index];
      if (value == null || value.startsWith('--')) fail(`VALUE_REQUIRED:${arg}`);
      push(parsed.lists, listFlags.get(arg), value);
    } else fail(`UNKNOWN_ARGUMENT:${arg}`);
  }
  if (parsed.width != null && (!Number.isInteger(parsed.width) || parsed.width < 56 || parsed.width > 120)) {
    fail('WIDTH_MUST_BE_INTEGER_56_TO_120');
  }
  const hasInline = Object.keys(parsed.values).length > 0 || Object.keys(parsed.lists).length > 0;
  if (parsed.source && parsed.source !== 'demo' && hasInline) fail(`INPUT_SOURCE_CONFLICT:${parsed.source}:inline`);
  if (parsed.source === 'demo' && hasInline) fail('INPUT_SOURCE_CONFLICT:demo:inline');
  parsed.hasInline = hasInline;
  return parsed;
}

function parseJson(text, source) {
  let value;
  try { value = JSON.parse(text); }
  catch (error) { fail(`INVALID_JSON:${source}:${error.message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`JSON_OBJECT_REQUIRED:${source}`);
  return value;
}

function requestFrom(parsed, stdinText = '') {
  if (parsed.source === 'demo') return JSON.parse(JSON.stringify(DEMO_REQUEST));
  if (parsed.source === 'input') {
    const resolved = path.resolve(parsed.inputPath);
    let contents;
    try { contents = fs.readFileSync(resolved, 'utf8'); }
    catch (error) { fail(`INPUT_READ_FAILED:${parsed.inputPath}:${error.code || error.message}`); }
    return parseJson(contents, parsed.inputPath);
  }
  if (parsed.source === 'stdin') return parseJson(stdinText, 'stdin');
  if (!parsed.hasInline) return null;
  const request = {...parsed.values};
  if (parsed.lists.signals) request.signals = [...parsed.lists.signals];
  const observation = {};
  for (const key of ['risks', 'factCodes', 'capabilities']) {
    if (parsed.lists[key]) observation[key] = [...parsed.lists[key]];
  }
  if (Object.keys(observation).length) request.observation = observation;
  if (parsed.lists.directionIds) {
    request.directions = {
      directionIds: [...parsed.lists.directionIds],
      observed: {
        capabilities: [...(parsed.lists.capabilities || [])],
        verifiers: [...(parsed.lists.verifiers || [])]
      }
    };
  } else if (parsed.lists.verifiers) {
    request.observation = request.observation || {};
    request.observation.verifierSignals = [...parsed.lists.verifiers];
  }
  return request;
}

function visibleLength(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, '').length;
}

function wrap(text, width, indent = '', continuationIndent = indent) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [indent];
  const lines = [];
  let line = indent;
  for (const word of words) {
    const candidate = line === indent ? `${indent}${word}` : `${line} ${word}`;
    if (visibleLength(candidate) <= width || line === indent) line = candidate;
    else { lines.push(line); line = `${continuationIndent}${word}`; }
  }
  lines.push(line);
  return lines;
}

function take(array, count) {
  return Array.isArray(array) ? array.slice(0, count) : [];
}

function humanize(value) {
  return String(value || 'unknown')
    .replace(/^code\.(?:template|cheat)\.[^.]+\./, '')
    .replace(/^code\.organ\./, '')
    .replace(/\.v\d+$/, '')
    .replace(/[._-]+/g, ' ')
    .trim();
}

function renderCapsule(capsule, options = {}) {
  const width = Math.max(56, Math.min(120, Number(options.width) || 88));
  const useColor = Boolean(options.color);
  const paint = (code, value) => useColor ? `\x1b[${code}m${value}\x1b[0m` : value;
  const lines = [];
  const rule = '─'.repeat(width);
  const section = title => { lines.push('', paint('1;36', title.toUpperCase()), ''); };
  const bullet = (label, detail = '') => {
    const value = detail ? `${label} — ${detail}` : label;
    lines.push(...wrap(value, width, '  • ', '    '));
  };
  const held = capsule.result !== 'CAPABILITY_CAPSULE_READY_NO_EXECUTION_AUTHORITY';

  lines.push(rule);
  lines.push(paint('1', 'AXM 102 GRAMMAR // CAPABILITY ORIENTATION'));
  lines.push(rule);
  lines.push(`${paint(held ? '1;33' : '1;32', held ? 'HELD' : 'READY')}  ${capsule.result}`);

  if (held) {
    section('Why it stopped');
    bullet('Resolution', capsule.resolution?.result || capsule.errorCode || 'Unknown hold');
    if (capsule.errorCode) bullet('Input issue', humanize(capsule.errorCode));
    const candidates = capsule.resolution?.candidates || [];
    if (candidates.length) bullet('Compatible candidates', candidates.map(humanize).join(', '));
    const result = capsule.resolution?.result;
    const next = result === 'SELECTION_REQUIRED'
      ? 'Repeat with --language ID; the console will not choose between compatible languages.'
      : result === 'UNKNOWN_LANGUAGE' || result === 'LANGUAGE_REQUIRED'
        ? 'Provide --file PATH or --language ID so the grammar can be resolved.'
        : 'Correct the reported input conflict, then rerun the same request.';
    bullet('Next action', next);
  } else {
    const organ = capsule.resolution?.organ || {};
    section('Resolved body');
    bullet(`${organ.displayName || capsule.languageId} · ${organ.kind || 'language body'}`, `${capsule.resolution?.source || 'resolved'} / ${capsule.resolution?.reason || 'declared'}`);
    bullet('Operation', capsule.plans?.grammar?.operation || 'understand');
    bullet('Execution state', capsule.plans?.organ?.execution || 'held');

    const hazards = capsule.review?.matched?.hazards || [];
    const gapCandidates = capsule.review?.gapCandidates || [];
    const hard = capsule.cheatcodes?.matches || [];
    section('Attention now');
    if (!hazards.length && !gapCandidates.length && !hard.length) bullet('No active attention signals', 'absence of signals is not proof of safety');
    for (const item of take(hazards, 3)) bullet('Observed hazard', item);
    for (const item of take(gapCandidates, 3)) bullet('Gap candidate', humanize(item));
    for (const item of take(hard, 4)) bullet(humanize(item.opcode), `${humanize(item.phase)} → ${humanize(item.next)}`);

    section('Cheapest next check');
    bullet('Native review', capsule.review?.discovery?.suggestedNextCheck || 'Inspect the resolved grammar body before changing it.');
    const grammarChecks = capsule.plans?.grammar?.verification?.focus || [];
    if (grammarChecks.length) bullet('Verifier candidates', take(grammarChecks, 4).join(', '));

    const directionGaps = capsule.directions?.gaps;
    if (directionGaps) {
      section('Direction evidence');
      const coverage = directionGaps.coverage || {};
      bullet('Capability coverage', `${coverage.evidencedCapabilityCount || 0}/${coverage.expectedCapabilityCount || 0} evidenced (${coverage.capabilityPercent || 0}%)`);
      bullet('Verifier coverage', `${coverage.evidencedVerifierCount || 0}/${coverage.expectedVerifierCount || 0} evidenced (${coverage.verifierPercent || 0}%)`);
      for (const item of take(directionGaps.missingCapabilities, 3)) bullet('Missing evidence', humanize(item.id));
      for (const item of take(directionGaps.stackTensions, 2)) bullet('Tension, not rejection', humanize(item.id));
    } else if (capsule.directions?.suggestions?.candidateCount) {
      section('Direction candidates');
      for (const item of take(capsule.directions.suggestions.candidates, 4)) bullet(humanize(item.directionId || item.id), `candidate only · score ${item.score}`);
    }

    section('Available handles');
    for (const item of take(capsule.templates?.selected, 3)) bullet(`Template: ${humanize(item.templateId)}`, `score ${item.score} · rendering ${humanize(item.sourceRendering)}`);
    for (const item of take(capsule.keyboard?.hotKeys, 6)) bullet(`${item.hotKeyId} ${humanize(item.actionId)}`, `${humanize(item.category)} · ${item.requiresRenderer ? 'renderer required' : 'request only'}`);
  }

  section('Truth boundary');
  bullet('Workspace mutation', capsule.truth?.workspaceMutated === false ? 'none' : 'not established');
  bullet('Tool execution', capsule.truth?.toolExecuted === false ? 'none' : 'not established');
  bullet('Automatic action', capsule.truth?.automaticAction === false ? 'none' : 'not established');
  bullet('Authority', Object.values(capsule.authority || {}).some(Boolean) ? 'see full JSON' : 'none');
  const digest = capsule.capsuleSha256
    ? `sha256:${capsule.capsuleSha256.slice(0, 16)}…${capsule.capsuleSha256.slice(-12)} (full: --json)`
    : 'unavailable';
  bullet('Capsule receipt', digest);
  lines.push('', rule);
  return `${lines.join('\n')}\n`;
}

function main(argv = process.argv.slice(2), io = process) {
  let parsed;
  try { parsed = parseArgs(argv); }
  catch (error) {
    io.stderr.write(`CAPSULE_CONSOLE_INPUT_ERROR\n${error.message}\nRun with --help for accepted inputs.\n`);
    return 1;
  }
  if (parsed.help) { io.stdout.write(HELP); return 0; }
  let request;
  try { request = requestFrom(parsed, io.stdinText || ''); }
  catch (error) {
    io.stderr.write(`CAPSULE_CONSOLE_INPUT_ERROR\n${error.message}\nNo capability capsule was created.\n`);
    return 1;
  }
  if (!request) { io.stdout.write(HELP); return 0; }
  const capsule = router.compose(request);
  if (parsed.json) io.stdout.write(`${JSON.stringify(capsule, null, 2)}\n`);
  else {
    const color = parsed.color && !process.env.NO_COLOR && Boolean(io.stdout.isTTY);
    const width = parsed.width || io.stdout.columns || 88;
    io.stdout.write(renderCapsule(capsule, {color, width}));
  }
  return 0;
}

if (require.main === module) {
  if (process.argv.includes('--stdin')) {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { input += chunk; });
    process.stdin.on('end', () => { process.stdinText = input; process.exitCode = main(); });
  } else process.exitCode = main();
}

module.exports = {DEMO_REQUEST, HELP, parseArgs, requestFrom, renderCapsule, main};
