#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REGISTRY_SCHEMA = 'axm.public-capability/v1';
const RECEIPT_SCHEMA = 'axm.102-grammar.capability-registry-receipt/v1';
const GENERATOR_PATH = 'tools/capability-discovery/generate-registry.mjs';
const OUTPUT_PATH = 'registry/public-capabilities.jsonl';
const RECEIPT_PATH = 'registry/public-capabilities.receipt.json';
const LICENSE_PATH = 'LICENSE';
const PATTERN_PROVENANCE = 'axm-grammer-glass#automation/capability-weaver-grammar-glass-discovery-v0.1';

const SPECS = Object.freeze([
  Object.freeze({
    id: 'axm.code.standalone-capability-capsule.v1',
    source: 'language-organs/standalone-capability-router.js',
    result: 'CAPABILITY_CAPSULE_READY_NO_EXECUTION_AUTHORITY',
    purpose: 'Compose the recovered 102-language grammar body into a deterministic read-only capability capsule from caller-supplied language/file signals and observation evidence.',
    interfaces: Object.freeze(['axm.code.standalone-capability-capsule.v1']),
    authorityFields: Object.freeze([
      'workspaceRead',
      'workspaceMutation',
      'toolExecution',
      'network',
      'install',
      'languageSwitch',
      'promotion',
      'canon'
    ]),
    exportLine: 'module.exports = {AUTHORITY, compose, resolveLanguage, snapshotBindings};',
    secondaryTokens: Object.freeze([])
  }),
  Object.freeze({
    id: 'axm.code.software-direction-stack.v1',
    source: 'software-directions/direction-stack.js',
    result: 'DIRECTION_STACK_READY_NO_AUTHORITY',
    purpose: 'Compose explicit software direction profiles and axes into a deterministic no-authority expectation stack, with separate suggestion evidence that never selects automatically.',
    interfaces: Object.freeze([
      'axm.code.software-direction-stack.v1',
      'axm.code.software-direction-suggestion-report.v1'
    ]),
    authorityFields: Object.freeze([
      'workspaceRead',
      'workspaceMutation',
      'toolExecution',
      'network',
      'install',
      'selection',
      'promotion',
      'canon'
    ]),
    exportLine: 'module.exports = {AUTHORITY, INPUT_AXES, compose, suggest, normalizeInput};',
    secondaryTokens: Object.freeze(["schema: 'axm.code.software-direction-suggestion-report.v1'"])
  })
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function gitBlobSha1(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function validateRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('source path must be a non-empty string');
  }
  if (relativePath.includes('\\') || path.posix.isAbsolute(relativePath)) {
    throw new Error(`source path must be repository-relative POSIX: ${relativePath}`);
  }
  const parts = relativePath.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`source path contains an unsafe segment: ${relativePath}`);
  }
  return parts;
}

function readRegularFile(root, relativePath) {
  const resolvedRoot = fs.realpathSync(root);
  const parts = validateRelativePath(relativePath);
  let current = resolvedRoot;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`source path may not traverse a symlink: ${relativePath}`);
    }
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(`source parent must be a directory: ${relativePath}`);
    }
    if (index === parts.length - 1 && !stat.isFile()) {
      throw new Error(`source must be a regular file: ${relativePath}`);
    }
  }
  return {
    relativePath,
    bytes: fs.readFileSync(current)
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateAuthorityBlock(sourceText, spec) {
  const match = sourceText.match(/const AUTHORITY = Object\.freeze\(\{([\s\S]*?)\}\);/);
  if (!match) throw new Error(`${spec.source} no longer declares the expected AUTHORITY block`);
  for (const field of spec.authorityFields) {
    const pattern = new RegExp(`\\b${escapeRegex(field)}\\s*:\\s*false\\b`);
    if (!pattern.test(match[1])) {
      throw new Error(`${spec.source} authority field must remain false: ${field}`);
    }
  }
}

function validateCapabilitySource(sourceText, spec) {
  const readyPattern = new RegExp(
    `schema\\s*:\\s*['"]${escapeRegex(spec.id)}['"]\\s*,\\s*` +
    `version\\s*:\\s*['"]1\\.0\\.0['"]\\s*,\\s*` +
    `status\\s*:\\s*['"]TEST['"]\\s*,\\s*` +
    `result\\s*:\\s*['"]${escapeRegex(spec.result)}['"]`
  );
  if (!readyPattern.test(sourceText)) {
    throw new Error(`${spec.source} no longer exposes the expected TEST/no-authority result contract`);
  }
  for (const token of spec.secondaryTokens) {
    if (!sourceText.includes(token)) {
      throw new Error(`${spec.source} no longer declares required interface token: ${token}`);
    }
  }
  if (!sourceText.includes(spec.exportLine)) {
    throw new Error(`${spec.source} CommonJS export surface drifted`);
  }
  validateAuthorityBlock(sourceText, spec);
}

function validateLicense(sourceText) {
  if (!sourceText.includes('Apache License') || !sourceText.includes('Version 2.0, January 2004')) {
    throw new Error('LICENSE no longer carries the Apache License 2.0 text expected by this registry');
  }
}

function deriveRegistry(root) {
  const licenseSource = readRegularFile(root, LICENSE_PATH);
  validateLicense(licenseSource.bytes.toString('utf8'));

  const inputs = [{
    path: LICENSE_PATH,
    git_blob_sha1: gitBlobSha1(licenseSource.bytes)
  }];
  const rows = [];

  for (const spec of SPECS) {
    const source = readRegularFile(root, spec.source);
    const sourceText = source.bytes.toString('utf8');
    validateCapabilitySource(sourceText, spec);
    inputs.push({
      path: spec.source,
      git_blob_sha1: gitBlobSha1(source.bytes)
    });
    rows.push({
      schema: REGISTRY_SCHEMA,
      id: spec.id,
      type: 'provider',
      purpose: spec.purpose,
      interfaces: [...spec.interfaces].sort(compareText),
      providers: ['axm-102-grammer'],
      consumers: [],
      status: 'TEST',
      maturity: 'test',
      reusable: true,
      provenance: {
        generated_by: GENERATOR_PATH,
        pattern_provenance: PATTERN_PROVENANCE,
        source_evidence: [spec.source],
        license_evidence: LICENSE_PATH
      },
      truth: {
        contract_authority: 'NONE',
        declaration_is_runtime_proof: false,
        grants_authority: false
      }
    });
  }

  rows.sort((a, b) => compareText(a.id, b.id));
  inputs.sort((a, b) => compareText(a.path, b.path));
  const registryText = `${rows.map((row) => canonical(row)).join('\n')}\n`;
  const receipt = {
    schema: RECEIPT_SCHEMA,
    generator: GENERATOR_PATH,
    pattern_provenance: {
      repo: 'mike-axiom-mir/axm-grammer-glass',
      ref: 'automation/capability-weaver-grammar-glass-discovery-v0.1',
      path: 'tools/capability-discovery/generate-registry.mjs',
      relationship: 'adapted-source-backed-discovery-pattern-no-runtime-dependency',
      upstream_pattern: 'mike-axiom-mir/axm-local-game-hub#automation/capability-weaver-hub-registry-v0.1'
    },
    inputs,
    output: {
      path: OUTPUT_PATH,
      records: rows.length,
      sha256: sha256(Buffer.from(registryText, 'utf8'))
    },
    truth: {
      declarations_are_runtime_proof: false,
      grants_authority: false,
      public_discovery_is_explicit_opt_in: true,
      source_exports_remain_authoritative: true,
      license_claim_is_bound_to_repository_license: true
    }
  };
  return {
    rows,
    registryText,
    receipt,
    receiptText: `${JSON.stringify(receipt, null, 2)}\n`
  };
}

function writeOrCheck(root, check = false) {
  const result = deriveRegistry(root);
  const targets = [
    [OUTPUT_PATH, result.registryText],
    [RECEIPT_PATH, result.receiptText]
  ];
  const stale = [];
  for (const [relativePath, expected] of targets) {
    const absolute = path.join(root, relativePath);
    if (check) {
      const actual = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
      if (actual !== expected) stale.push(relativePath);
    } else {
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, expected, 'utf8');
    }
  }
  if (stale.length) {
    throw new Error(`stale generated capability discovery: ${stale.join(', ')}`);
  }
  return result;
}

function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const unknown = argv.filter((arg) => arg !== '--check');
  if (unknown.length) throw new Error(`unknown arguments: ${unknown.join(' ')}`);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '..', '..');
  const result = writeOrCheck(root, check);
  process.stdout.write(
    `102-grammar-capability-discovery: ${check ? 'verified' : 'wrote'} ${result.rows.length} records sha256:${result.receipt.output.sha256}\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`102-grammar-capability-discovery: ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}

export {
  SPECS,
  canonical,
  deriveRegistry,
  gitBlobSha1,
  readRegularFile,
  validateCapabilitySource,
  writeOrCheck
};
