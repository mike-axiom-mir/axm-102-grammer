'use strict';

const assert = require('assert');
const {spawnSync} = require('child_process');
const path = require('path');
const workbench = require('../frontier-direction-workbench.js');
const plane = require('./adapter-plane.js');

const processPath = path.join(__dirname, 'verify-execution-report-process.js');
const packet = workbench.prepare({directionId: 'game', level: 'stretch'});
const report = plane.execute(packet);
const expectedArgs = [
  processPath,
  '--expected-packet-sha256', packet.packetSha256,
  '--expected-report-sha256', report.reportSha256
];

function run(input, extraArgs = []) {
  const result = spawnSync(process.execPath, [...expectedArgs, ...extraArgs], {
    input,
    encoding: null,
    maxBuffer: 4 * 1024 * 1024
  });
  let receipt = null;
  if (result.stdout && result.stdout.length) {
    receipt = JSON.parse(result.stdout.toString('utf8'));
  }
  return {status: result.status, signal: result.signal, stderr: result.stderr.toString('utf8'), receipt};
}

const validBytes = Buffer.from(JSON.stringify(report), 'utf8');
const valid = run(validBytes);
assert.strictEqual(valid.status, 0, valid.stderr);
assert.strictEqual(valid.receipt.result, 'ADAPTER_EXECUTION_REPORT_PROCESS_VERIFIED');
assert.strictEqual(valid.receipt.verification.result, 'ADAPTER_EXECUTION_REPORT_VERIFIED');
assert.deepStrictEqual(valid.receipt.errorCodes, []);
assert.strictEqual(valid.receipt.input.byteCount, validBytes.length);
assert.strictEqual(valid.receipt.input.utf8Fatal, true);
assert.strictEqual(valid.receipt.input.duplicateDecodedObjectKeysRejected, true);
assert.strictEqual(valid.receipt.truth.rawInputBoundedBeforeJsonMaterialization, true);
assert.strictEqual(valid.receipt.authority.workspaceMutation, false);
assert.strictEqual(valid.receipt.authority.network, false);
assert.strictEqual(valid.receipt.authority.canon, false);

const malformed = Buffer.from(JSON.stringify(report), 'utf8');
const marker = Buffer.from('game', 'utf8');
const markerOffset = malformed.indexOf(marker);
assert(markerOffset >= 0, 'fixture must contain a replaceable UTF-8 string');
malformed[markerOffset] = 0xff;
const malformedResult = run(malformed);
assert.strictEqual(malformedResult.status, 2);
assert.strictEqual(malformedResult.receipt.result, 'ADAPTER_EXECUTION_REPORT_PROCESS_HELD');
assert(malformedResult.receipt.errorCodes.includes('PROCESS_INPUT_UTF8_INVALID'));
assert.strictEqual(malformedResult.receipt.verification, null);

const text = JSON.stringify(report);
const duplicate = text.replace('{', '{"\\u0072esult":"FORGED",');
assert.strictEqual(JSON.parse(duplicate).result, report.result, 'ordinary JSON.parse collapses the escaped duplicate onto the later result field');
const duplicateResult = run(Buffer.from(duplicate, 'utf8'));
assert.strictEqual(duplicateResult.status, 2);
assert.strictEqual(duplicateResult.receipt.result, 'ADAPTER_EXECUTION_REPORT_PROCESS_HELD');
assert(duplicateResult.receipt.errorCodes.includes('PROCESS_INPUT_DUPLICATE_KEY'));
assert.strictEqual(duplicateResult.receipt.verification, null);

const invalidJsonResult = run(Buffer.from('{"schema":', 'utf8'));
assert.strictEqual(invalidJsonResult.status, 2);
assert(invalidJsonResult.receipt.errorCodes.includes('PROCESS_INPUT_JSON_INVALID'));
assert.strictEqual(invalidJsonResult.receipt.verification, null);

const oversized = Buffer.alloc((1024 * 1024) + 1, 0x20);
const oversizedResult = run(oversized);
assert.strictEqual(oversizedResult.status, 2);
assert(oversizedResult.receipt.errorCodes.includes('PROCESS_INPUT_SIZE_LIMIT_EXCEEDED'));
assert.strictEqual(oversizedResult.receipt.verification, null);
assert(oversizedResult.receipt.input.byteCount > 1024 * 1024);

const wrongPin = spawnSync(process.execPath, [
  processPath,
  '--expected-packet-sha256', 'f'.repeat(64),
  '--expected-report-sha256', report.reportSha256
], {input: validBytes, encoding: null, maxBuffer: 4 * 1024 * 1024});
assert.strictEqual(wrongPin.status, 2);
const wrongPinReceipt = JSON.parse(wrongPin.stdout.toString('utf8'));
assert.strictEqual(wrongPinReceipt.verification.result, 'ADAPTER_EXECUTION_REPORT_HELD');
assert(wrongPinReceipt.errorCodes.includes('EXPECTED_PACKET_SHA256_MISMATCH'));

console.log(JSON.stringify({
  ok: true,
  validProcessAdmission: true,
  malformedUtf8RejectedBeforeVerification: true,
  escapedDuplicateKeyRejectedBeforeVerification: true,
  invalidJsonRejectedBeforeVerification: true,
  oversizedInputRejectedBeforeJsonMaterialization: true,
  callerPinMismatchPreserved: true,
  reportSha256: report.reportSha256,
  packetSha256: packet.packetSha256
}, null, 2));
