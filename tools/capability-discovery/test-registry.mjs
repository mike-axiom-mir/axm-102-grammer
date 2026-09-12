#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  SPECS,
  deriveRegistry,
  writeOrCheck
} from './generate-registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

function makeFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-102-capability-discovery-'));
  for (const relativePath of ['LICENSE', ...SPECS.map((spec) => spec.source)]) {
    const target = path.join(fixture, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, ...relativePath.split('/')), target);
  }
  return fixture;
}

function replaceAll(relativePath, fixture, from, to) {
  const target = path.join(fixture, ...relativePath.split('/'));
  const before = fs.readFileSync(target, 'utf8');
  const after = before.split(from).join(to);
  assert.notEqual(after, before, `fixture mutation did not match ${from}`);
  fs.writeFileSync(target, after, 'utf8');
}

test('real repository exposes exactly two bounded TEST declarations', () => {
  const result = deriveRegistry(root);
  assert.deepEqual(
    result.rows.map((row) => row.id),
    [
      'axm.code.software-direction-stack.v1',
      'axm.code.standalone-capability-capsule.v1'
    ]
  );
  for (const row of result.rows) {
    assert.equal(row.schema, 'axm.public-capability/v1');
    assert.equal(row.status, 'TEST');
    assert.equal(row.reusable, true);
    assert.deepEqual(row.providers, ['axm-102-grammer']);
    assert.equal(row.truth.contract_authority, 'NONE');
    assert.equal(row.truth.declaration_is_runtime_proof, false);
    assert.equal(row.truth.grants_authority, false);
    assert.equal(row.provenance.license_evidence, 'LICENSE');
  }
  assert.equal(result.receipt.output.records, 2);
  assert.equal(result.receipt.truth.source_exports_remain_authoritative, true);
});

test('committed registry and receipt match exact generator output', () => {
  assert.doesNotThrow(() => writeOrCheck(root, true));
});

test('status/result contract drift fails closed', () => {
  const fixture = makeFixture();
  try {
    replaceAll(
      'language-organs/standalone-capability-router.js',
      fixture,
      "result: 'CAPABILITY_CAPSULE_READY_NO_EXECUTION_AUTHORITY'",
      "result: 'CAPABILITY_CAPSULE_READY'"
    );
    assert.throws(
      () => deriveRegistry(fixture),
      /expected TEST\/no-authority result contract/
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('authority drift fails closed', () => {
  const fixture = makeFixture();
  try {
    replaceAll(
      'software-directions/direction-stack.js',
      fixture,
      'network: false',
      'network: true'
    );
    assert.throws(
      () => deriveRegistry(fixture),
      /authority field must remain false: network/
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('export surface drift fails closed', () => {
  const fixture = makeFixture();
  try {
    replaceAll(
      'software-directions/direction-stack.js',
      fixture,
      'module.exports = {AUTHORITY, INPUT_AXES, compose, suggest, normalizeInput};',
      'module.exports = {AUTHORITY, INPUT_AXES, compose, normalizeInput};'
    );
    assert.throws(
      () => deriveRegistry(fixture),
      /CommonJS export surface drifted/
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('source symlink substitution fails closed', () => {
  const fixture = makeFixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-102-capability-outside-'));
  try {
    const relativePath = 'software-directions/direction-stack.js';
    const target = path.join(fixture, ...relativePath.split('/'));
    const outsideSource = path.join(outside, 'direction-stack.js');
    fs.copyFileSync(target, outsideSource);
    fs.unlinkSync(target);
    fs.symlinkSync(outsideSource, target);
    assert.throws(
      () => deriveRegistry(fixture),
      /may not traverse a symlink/
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
