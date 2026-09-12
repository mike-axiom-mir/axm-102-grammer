'use strict';

const {TextDecoder} = require('util');
const registry = require('./adapter-registry.js');
const plane = require('./adapter-plane.js');

const MAX_INPUT_BYTES = 1024 * 1024;
const PROCESS_AUTHORITY = Object.freeze({
  stdinRead: true,
  boundedInputRead: true,
  reportVerification: true,
  adapterExecution: false,
  workspaceRead: false,
  workspaceMutation: false,
  childProcessExecution: false,
  network: false,
  install: false,
  deployment: false,
  physicalControl: false,
  promotion: false,
  canon: false
});

class AdmissionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function strictJsonParse(text) {
  let index = 0;

  function fail() {
    throw new AdmissionError('PROCESS_INPUT_JSON_INVALID');
  }

  function whitespace() {
    while (index < text.length && /[\t\n\r ]/.test(text[index])) index += 1;
  }

  function stringValue() {
    if (text[index] !== '"') fail();
    const start = index;
    index += 1;
    let closed = false;
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (code < 0x20) fail();
      if (text[index] === '\\') {
        index += 1;
        if (index >= text.length) fail();
        index += 1;
        continue;
      }
      if (text[index] === '"') {
        index += 1;
        closed = true;
        break;
      }
      index += 1;
    }
    if (!closed) fail();
    try {
      return JSON.parse(text.slice(start, index));
    } catch (error) {
      fail();
    }
  }

  function numberValue() {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
    if (!match) fail();
    index += match[0].length;
  }

  function literal(literalText) {
    if (!text.startsWith(literalText, index)) fail();
    index += literalText.length;
  }

  function arrayValue() {
    index += 1;
    whitespace();
    if (text[index] === ']') {
      index += 1;
      return;
    }
    while (index < text.length) {
      value();
      whitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      if (text[index] !== ',') fail();
      index += 1;
      whitespace();
    }
    fail();
  }

  function objectValue() {
    index += 1;
    whitespace();
    const keys = new Set();
    if (text[index] === '}') {
      index += 1;
      return;
    }
    while (index < text.length) {
      const key = stringValue();
      if (keys.has(key)) throw new AdmissionError('PROCESS_INPUT_DUPLICATE_KEY');
      keys.add(key);
      whitespace();
      if (text[index] !== ':') fail();
      index += 1;
      whitespace();
      value();
      whitespace();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      if (text[index] !== ',') fail();
      index += 1;
      whitespace();
    }
    fail();
  }

  function value() {
    whitespace();
    if (index >= text.length) fail();
    const token = text[index];
    if (token === '{') objectValue();
    else if (token === '[') arrayValue();
    else if (token === '"') stringValue();
    else if (token === 't') literal('true');
    else if (token === 'f') literal('false');
    else if (token === 'n') literal('null');
    else numberValue();
  }

  value();
  whitespace();
  if (index !== text.length) fail();
  try {
    return JSON.parse(text);
  } catch (error) {
    fail();
  }
}

function parseArguments(argv) {
  const values = new Map();
  const known = new Set(['--expected-packet-sha256', '--expected-report-sha256']);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!known.has(key) || typeof value !== 'string' || values.has(key)) {
      throw new AdmissionError('PROCESS_ARGUMENTS_INVALID');
    }
    values.set(key, value);
  }
  return {
    expectedPacketSha256: values.get('--expected-packet-sha256'),
    expectedReportSha256: values.get('--expected-report-sha256')
  };
}

async function readBounded(stream, maxBytes = MAX_INPUT_BYTES) {
  const chunks = [];
  let byteCount = 0;
  let storedBytes = 0;
  for await (const chunkValue of stream) {
    const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue);
    byteCount += chunk.length;
    const remaining = (maxBytes + 1) - storedBytes;
    if (remaining > 0) {
      const kept = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      chunks.push(kept);
      storedBytes += kept.length;
    }
    if (byteCount > maxBytes) {
      if (typeof stream.pause === 'function') stream.pause();
      return {bytes: null, byteCount, exceeded: true};
    }
  }
  return {bytes: Buffer.concat(chunks, storedBytes), byteCount, exceeded: false};
}

function receipt({byteCount = 0, processErrors = [], verification = null}) {
  const verificationErrors = verification && Array.isArray(verification.errorCodes) ? verification.errorCodes : [];
  const errorCodes = [...new Set([...processErrors, ...verificationErrors])];
  const verified = processErrors.length === 0 && verification && verification.result === 'ADAPTER_EXECUTION_REPORT_VERIFIED';
  const body = {
    schema: 'axm.code.direction-adapter-execution-process-verification.v1',
    version: '1.0.0',
    status: 'TEST',
    result: verified ? 'ADAPTER_EXECUTION_REPORT_PROCESS_VERIFIED' : 'ADAPTER_EXECUTION_REPORT_PROCESS_HELD',
    errorCodes,
    input: {
      byteCount,
      maxBytes: MAX_INPUT_BYTES,
      utf8Fatal: true,
      duplicateDecodedObjectKeysRejected: true
    },
    verification,
    truth: {
      rawInputBoundedBeforeJsonMaterialization: true,
      malformedUtf8RejectedBeforeJsonParsing: true,
      duplicateDecodedObjectKeysRejectedBeforeVerification: true,
      semanticVerificationDelegatedToExistingReportVerifier: true,
      adaptersReexecuted: false,
      rawSerializationAuthenticated: false,
      contentIdentityIsAuthentication: false,
      verificationIsPromotion: false
    },
    authority: PROCESS_AUTHORITY
  };
  return Object.freeze({...body, processVerificationSha256: registry.hash(body)});
}

async function verifyProcessInput(stream, argv) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    return receipt({processErrors: [error.code || 'PROCESS_ARGUMENTS_INVALID']});
  }

  let input;
  try {
    input = await readBounded(stream);
  } catch (error) {
    return receipt({processErrors: ['PROCESS_INPUT_READ_FAILED']});
  }
  if (input.exceeded) {
    return receipt({byteCount: input.byteCount, processErrors: ['PROCESS_INPUT_SIZE_LIMIT_EXCEEDED']});
  }

  let text;
  try {
    text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(input.bytes);
  } catch (error) {
    return receipt({byteCount: input.byteCount, processErrors: ['PROCESS_INPUT_UTF8_INVALID']});
  }

  let report;
  try {
    report = strictJsonParse(text);
  } catch (error) {
    return receipt({byteCount: input.byteCount, processErrors: [error.code === 'PROCESS_INPUT_DUPLICATE_KEY' ? error.code : 'PROCESS_INPUT_JSON_INVALID']});
  }

  const verification = plane.verifyExecutionReport(report, options);
  return receipt({byteCount: input.byteCount, verification});
}

async function main() {
  const result = await verifyProcessInput(process.stdin, process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.result === 'ADAPTER_EXECUTION_REPORT_PROCESS_VERIFIED' ? 0 : 2;
}

if (require.main === module) {
  main().catch(() => {
    const held = receipt({processErrors: ['PROCESS_INTERNAL_ERROR']});
    process.stdout.write(`${JSON.stringify(held)}\n`);
    process.exitCode = 70;
  });
}

module.exports = {
  MAX_INPUT_BYTES,
  PROCESS_AUTHORITY,
  strictJsonParse,
  readBounded,
  verifyProcessInput
};
