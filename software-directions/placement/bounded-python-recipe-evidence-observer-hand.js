'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {TextDecoder} = require('util');

const placementRegistry = require('./placement-registry.js');

const HEX64 = /^[a-f0-9]{64}$/;
const TTL_MS = 5 * 60 * 1000;
const LIMITS = Object.freeze({requiredFileCount: 6, maxFileBytes: 1024 * 1024, maxTotalBytes: 6 * 1024 * 1024, maxPathBytes: 240, maxPathDepth: 12});
const EVIDENCE_KINDS = Object.freeze(['adversarial-test-receipt', 'author-contract', 'author-source', 'parameter-contract', 'verifier-contract', 'verifier-source']);
const FORMAT_BY_KIND = Object.freeze({
  'adversarial-test-receipt': 'json',
  'author-contract': 'json',
  'author-source': 'javascript-commonjs',
  'parameter-contract': 'json',
  'verifier-contract': 'json',
  'verifier-source': 'javascript-commonjs'
});
const PROPOSAL_DIGEST_BINDINGS = Object.freeze({
  'author-source': 'builderSha256',
  'parameter-contract': 'recipeSha256',
  'verifier-source': 'verifierRunnerSha256'
});
const AUTHORITY = Object.freeze({
  workspaceRead: true,
  proposedSourceBytesRead: true,
  syntaxParse: true,
  workspaceMutation: false,
  moduleImport: false,
  dynamicModuleLoading: false,
  candidateGeneration: false,
  candidateExecution: false,
  childProcessExecution: false,
  registryMutation: false,
  recipeSelection: false,
  activationAuthorization: false,
  promotion: false,
  canon: false,
  network: false,
  install: false,
  deployment: false
});

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || placementRegistry.canon(Object.keys(value).sort()) !== placementRegistry.canon([...keys].sort())) throw Error(`${code}_KEYS_INVALID`);
  return value;
}

function digestReceipt(value, field, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !HEX64.test(value[field] || '')) throw Error(`${code}_INVALID`);
  const body = {...value};
  delete body[field];
  if (placementRegistry.hash(body) !== value[field]) throw Error(`${code}_DIGEST_MISMATCH`);
  return value;
}

function held(errorCode) {
  const body = {
    schema: 'axm.code.bounded-python-recipe-evidence-observation.v1',
    version: '1.0.0',
    status: 'TEST',
    result: 'RECIPE_EVIDENCE_OBSERVATION_HELD',
    errorCode,
    truth: {
      exactDeclaredFilesObserved: false,
      currentByteDigestsMatchedEvidence: false,
      filesParsedWithoutImport: false,
      callerTestClaimsReproduced: false,
      semanticSafetyIndependentlyVerified: false,
      humanReviewCompleted: false,
      workspaceMutated: false,
      proposedModuleLoaded: false,
      candidateGenerated: false,
      candidateExecuted: false,
      childProcessSpawned: false,
      registryMutated: false,
      promotionOccurred: false
    },
    authority: AUTHORITY
  };
  return freeze({...body, observationSha256: placementRegistry.hash(body)});
}

function safeRelative(value) {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value, 'utf8') > LIMITS.maxPathBytes || value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) throw Error('RECIPE_EVIDENCE_PATH_INVALID');
  const parts = value.split('/');
  if (parts.length > LIMITS.maxPathDepth || parts.some(part => !part || part === '.' || part === '..') || path.posix.normalize(value) !== value) throw Error('RECIPE_EVIDENCE_PATH_TRAVERSAL_OR_DEPTH_INVALID');
  return value;
}

function inside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function validateProposalBinding(proposal) {
  digestReceipt(proposal, 'proposalSha256', 'RECIPE_EVIDENCE_PROPOSAL');
  if (proposal.schema !== 'axm.code.bounded-python-recipe-admission-proposal.v1' || proposal.version !== '1.0.0' || proposal.status !== 'DRAFT') throw Error('RECIPE_EVIDENCE_PROPOSAL_HEADER_INVALID');
  for (const field of Object.values(PROPOSAL_DIGEST_BINDINGS)) if (!HEX64.test(proposal[field] || '')) throw Error('RECIPE_EVIDENCE_PROPOSAL_BINDING_DIGEST_INVALID');
  return proposal;
}

function validateEvidenceBinding(evidence, proposal) {
  digestReceipt(evidence, 'evidenceSha256', 'RECIPE_EVIDENCE_ENVELOPE');
  exactKeys(evidence, ['schema', 'version', 'status', 'proposalSha256', 'evidenceItems', 'testClaims', 'truth', 'evidenceSha256'], 'RECIPE_EVIDENCE_ENVELOPE');
  if (evidence.schema !== 'axm.code.bounded-python-recipe-admission-evidence.v1' || evidence.version !== '1.0.0' || evidence.status !== 'CALLER_SUPPLIED' || evidence.proposalSha256 !== proposal.proposalSha256) throw Error('RECIPE_EVIDENCE_ENVELOPE_HEADER_OR_PROPOSAL_BINDING_INVALID');
  if (!Array.isArray(evidence.evidenceItems) || evidence.evidenceItems.length !== LIMITS.requiredFileCount) throw Error('RECIPE_EVIDENCE_ITEM_COUNT_INVALID');
  const items = new Map();
  const digests = new Set();
  for (const item of evidence.evidenceItems) {
    exactKeys(item, ['kind', 'sha256', 'status'], 'RECIPE_EVIDENCE_ITEM');
    const expectedStatus = item.kind === 'adversarial-test-receipt' ? 'TEST_RECEIPT_DIGEST_ONLY' : 'CURRENT_BYTES_DIGEST_ONLY';
    if (!EVIDENCE_KINDS.includes(item.kind) || items.has(item.kind) || !HEX64.test(item.sha256 || '') || digests.has(item.sha256) || item.status !== expectedStatus) throw Error('RECIPE_EVIDENCE_ITEM_INVALID_OR_DUPLICATE');
    items.set(item.kind, item);
    digests.add(item.sha256);
  }
  if (placementRegistry.canon([...items.keys()].sort()) !== placementRegistry.canon([...EVIDENCE_KINDS])) throw Error('RECIPE_EVIDENCE_KINDS_INCOMPLETE');
  return items;
}

function validateDeclaration(declaration, proposal, evidence) {
  digestReceipt(declaration, 'declarationSha256', 'RECIPE_EVIDENCE_DECLARATION');
  exactKeys(declaration, ['schema', 'version', 'status', 'proposalSha256', 'evidenceSha256', 'files', 'declarationSha256'], 'RECIPE_EVIDENCE_DECLARATION');
  if (declaration.schema !== 'axm.code.bounded-python-recipe-evidence-declaration.v1' || declaration.version !== '1.0.0' || declaration.status !== 'TEST' || declaration.proposalSha256 !== proposal.proposalSha256 || declaration.evidenceSha256 !== evidence.evidenceSha256) throw Error('RECIPE_EVIDENCE_DECLARATION_HEADER_OR_BINDING_INVALID');
  if (!Array.isArray(declaration.files) || declaration.files.length !== LIMITS.requiredFileCount) throw Error('RECIPE_EVIDENCE_DECLARATION_FILE_COUNT_INVALID');
  const files = new Map();
  const paths = new Set();
  for (const item of declaration.files) {
    exactKeys(item, ['kind', 'path'], 'RECIPE_EVIDENCE_DECLARATION_FILE');
    const relative = safeRelative(item.path);
    if (!EVIDENCE_KINDS.includes(item.kind) || files.has(item.kind) || paths.has(relative)) throw Error('RECIPE_EVIDENCE_DECLARATION_FILE_INVALID_OR_DUPLICATE');
    files.set(item.kind, relative);
    paths.add(relative);
  }
  if (placementRegistry.canon([...files.keys()].sort()) !== placementRegistry.canon([...EVIDENCE_KINDS])) throw Error('RECIPE_EVIDENCE_DECLARATION_KINDS_INCOMPLETE');
  return files;
}

function validateRoot(workspaceRoot) {
  if (typeof workspaceRoot !== 'string' || !path.isAbsolute(workspaceRoot)) throw Error('RECIPE_EVIDENCE_WORKSPACE_ROOT_MUST_BE_ABSOLUTE');
  const root = path.resolve(workspaceRoot);
  if (root === path.parse(root).root) throw Error('RECIPE_EVIDENCE_WORKSPACE_ROOT_TOO_BROAD');
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('RECIPE_EVIDENCE_WORKSPACE_ROOT_INVALID');
  if (fs.realpathSync(root) !== root) throw Error('RECIPE_EVIDENCE_WORKSPACE_ROOT_SYMLINK_OR_ALIAS');
  return root;
}

function resolveFile(root, relative) {
  let current = root;
  const parts = relative.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    if (!inside(current, root)) throw Error('RECIPE_EVIDENCE_PATH_ESCAPES_WORKSPACE');
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw Error('RECIPE_EVIDENCE_SYMLINK_FORBIDDEN');
    if (index < parts.length - 1 && !stat.isDirectory()) throw Error('RECIPE_EVIDENCE_PARENT_NOT_DIRECTORY');
    if (index === parts.length - 1 && !stat.isFile()) throw Error('RECIPE_EVIDENCE_TARGET_NOT_REGULAR_FILE');
  }
  if (!inside(fs.realpathSync(current), root)) throw Error('RECIPE_EVIDENCE_REALPATH_ESCAPE');
  return current;
}

function decodeUtf8(bytes) {
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch (_) {
    throw Error('RECIPE_EVIDENCE_FILE_UTF8_INVALID');
  }
}

function parseWithoutImport(kind, source, relative) {
  const format = FORMAT_BY_KIND[kind];
  if (format === 'json') {
    let parsed;
    try { parsed = JSON.parse(source); } catch (_) { throw Error(`RECIPE_EVIDENCE_JSON_PARSE_FAILED:${kind}`); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error(`RECIPE_EVIDENCE_JSON_ROOT_INVALID:${kind}`);
  } else {
    try { new vm.Script(source, {filename: relative, displayErrors: false}); } catch (_) { throw Error(`RECIPE_EVIDENCE_JAVASCRIPT_PARSE_FAILED:${kind}`); }
  }
  return format;
}

function readStable(root, relative, kind) {
  const target = resolveFile(root, relative);
  const before = fs.lstatSync(target);
  if (before.size > LIMITS.maxFileBytes) throw Error(`RECIPE_EVIDENCE_FILE_TOO_LARGE:${kind}`);
  const bytes = fs.readFileSync(target);
  const after = fs.lstatSync(target);
  if (!after.isFile() || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) throw Error(`RECIPE_EVIDENCE_FILE_DRIFT_DURING_READ:${kind}`);
  const source = decodeUtf8(bytes);
  const format = parseWithoutImport(kind, source, relative);
  return {kind, path: relative, format, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), byteCount: bytes.length, parseResult: 'PARSED_WITHOUT_IMPORT_OR_EXECUTION'};
}

function inspect({workspaceRoot = null, proposal = null, evidence = null, declaration = null} = {}) {
  try {
    const root = validateRoot(workspaceRoot);
    const boundProposal = validateProposalBinding(proposal);
    const evidenceItems = validateEvidenceBinding(evidence, boundProposal);
    const declaredFiles = validateDeclaration(declaration, boundProposal, evidence);
    const files = [];
    let byteCount = 0;
    for (const kind of EVIDENCE_KINDS) {
      const observed = readStable(root, declaredFiles.get(kind), kind);
      const expected = evidenceItems.get(kind);
      if (observed.sha256 !== expected.sha256) throw Error(`RECIPE_EVIDENCE_CURRENT_BYTES_DIGEST_MISMATCH:${kind}`);
      const proposalField = PROPOSAL_DIGEST_BINDINGS[kind];
      if (proposalField && boundProposal[proposalField] !== observed.sha256) throw Error(`RECIPE_EVIDENCE_PROPOSAL_DIGEST_BINDING_MISMATCH:${proposalField}`);
      byteCount += observed.byteCount;
      if (byteCount > LIMITS.maxTotalBytes) throw Error('RECIPE_EVIDENCE_TOTAL_BYTES_EXCEEDED');
      files.push(observed);
    }
    const observedAtMs = Date.now();
    const body = {
      schema: 'axm.code.bounded-python-recipe-evidence-observation.v1',
      version: '1.0.0',
      status: 'TEST',
      result: 'RECIPE_EVIDENCE_OBSERVED_READ_ONLY_NO_EXECUTION',
      errorCode: null,
      proposalSha256: boundProposal.proposalSha256,
      evidenceSha256: evidence.evidenceSha256,
      declarationSha256: declaration.declarationSha256,
      workspaceRootIdentitySha256: placementRegistry.hash(root),
      observedAt: new Date(observedAtMs).toISOString(),
      ttlMs: TTL_MS,
      expiresAt: new Date(observedAtMs + TTL_MS).toISOString(),
      volatilityClass: 'proposed-recipe-evidence-files',
      files,
      coverage: {requiredFileCount: LIMITS.requiredFileCount, observedFileCount: files.length, observedByteCount: byteCount, exactDeclaredPathsOnly: true, symlinksFollowed: false},
      truth: {
        exactDeclaredFilesObserved: true,
        currentByteDigestsMatchedEvidence: true,
        proposalCoreDigestsMatchedObservedFiles: true,
        filesParsedWithoutImport: true,
        callerTestClaimsReproduced: false,
        semanticSafetyIndependentlyVerified: false,
        humanReviewCompleted: false,
        digestIsSignerConsentOrIdentityProof: false,
        freshnessIsCorrectness: false,
        workspaceMutated: false,
        proposedModuleLoaded: false,
        candidateGenerated: false,
        candidateExecuted: false,
        childProcessSpawned: false,
        registryMutated: false,
        promotionOccurred: false
      },
      authority: AUTHORITY
    };
    return freeze({...body, observationSha256: placementRegistry.hash(body)});
  } catch (error) {
    const message = String(error?.message || '');
    if (message.startsWith('RECIPE_EVIDENCE_')) return held(message);
    if (typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)) return held(`RECIPE_EVIDENCE_FILESYSTEM_${error.code}`);
    return held('RECIPE_EVIDENCE_OBSERVATION_FAILED');
  }
}

function freshness(observation, {now = Date.now()} = {}) {
  const observedAt = Date.parse(observation?.observedAt);
  const expiresAt = Date.parse(observation?.expiresAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(expiresAt)) return freeze({status: 'UNTIMED', ageMs: null, ttlMs: null, nextRecheckDue: null});
  if (now < observedAt) return freeze({status: 'UNTIMED', ageMs: null, ttlMs: expiresAt - observedAt, nextRecheckDue: observation.observedAt});
  return freeze({status: now <= expiresAt ? 'LIVE' : 'STALE', ageMs: now - observedAt, ttlMs: expiresAt - observedAt, nextRecheckDue: observation.expiresAt});
}

function validateObservation(value, {now = Date.now()} = {}) {
  digestReceipt(value, 'observationSha256', 'RECIPE_EVIDENCE_OBSERVATION');
  if (value.schema !== 'axm.code.bounded-python-recipe-evidence-observation.v1' || value.version !== '1.0.0' || value.status !== 'TEST') throw Error('RECIPE_EVIDENCE_OBSERVATION_HEADER_INVALID');
  if (value.result !== 'RECIPE_EVIDENCE_OBSERVED_READ_ONLY_NO_EXECUTION') throw Error('RECIPE_EVIDENCE_OBSERVATION_NOT_READY');
  exactKeys(value, ['schema', 'version', 'status', 'result', 'errorCode', 'proposalSha256', 'evidenceSha256', 'declarationSha256', 'workspaceRootIdentitySha256', 'observedAt', 'ttlMs', 'expiresAt', 'volatilityClass', 'files', 'coverage', 'truth', 'authority', 'observationSha256'], 'RECIPE_EVIDENCE_OBSERVATION');
  if (value.errorCode !== null || !HEX64.test(value.proposalSha256 || '') || !HEX64.test(value.evidenceSha256 || '') || !HEX64.test(value.declarationSha256 || '') || !HEX64.test(value.workspaceRootIdentitySha256 || '') || value.ttlMs !== TTL_MS || Date.parse(value.expiresAt) - Date.parse(value.observedAt) !== TTL_MS || value.volatilityClass !== 'proposed-recipe-evidence-files') throw Error('RECIPE_EVIDENCE_OBSERVATION_BINDING_OR_TIME_INVALID');
  if (!Array.isArray(value.files) || value.files.length !== LIMITS.requiredFileCount || value.coverage?.requiredFileCount !== LIMITS.requiredFileCount || value.coverage?.observedFileCount !== LIMITS.requiredFileCount || value.coverage?.exactDeclaredPathsOnly !== true || value.coverage?.symlinksFollowed !== false) throw Error('RECIPE_EVIDENCE_OBSERVATION_COVERAGE_INVALID');
  const kinds = new Set();
  const paths = new Set();
  let bytes = 0;
  for (const item of value.files) {
    exactKeys(item, ['kind', 'path', 'format', 'sha256', 'byteCount', 'parseResult'], 'RECIPE_EVIDENCE_OBSERVATION_FILE');
    safeRelative(item.path);
    if (!EVIDENCE_KINDS.includes(item.kind) || kinds.has(item.kind) || paths.has(item.path) || item.format !== FORMAT_BY_KIND[item.kind] || !HEX64.test(item.sha256 || '') || !Number.isSafeInteger(item.byteCount) || item.byteCount < 0 || item.byteCount > LIMITS.maxFileBytes || item.parseResult !== 'PARSED_WITHOUT_IMPORT_OR_EXECUTION') throw Error('RECIPE_EVIDENCE_OBSERVATION_FILE_INVALID');
    kinds.add(item.kind);
    paths.add(item.path);
    bytes += item.byteCount;
  }
  if (placementRegistry.canon([...kinds].sort()) !== placementRegistry.canon([...EVIDENCE_KINDS]) || bytes !== value.coverage.observedByteCount || bytes > LIMITS.maxTotalBytes) throw Error('RECIPE_EVIDENCE_OBSERVATION_FILE_SET_OR_BYTES_INVALID');
  if (value.truth?.exactDeclaredFilesObserved !== true || value.truth?.currentByteDigestsMatchedEvidence !== true || value.truth?.proposalCoreDigestsMatchedObservedFiles !== true || value.truth?.filesParsedWithoutImport !== true || value.truth?.callerTestClaimsReproduced !== false || value.truth?.semanticSafetyIndependentlyVerified !== false || value.truth?.humanReviewCompleted !== false || value.truth?.workspaceMutated !== false || value.truth?.proposedModuleLoaded !== false || value.truth?.candidateExecuted !== false || value.truth?.registryMutated !== false || value.truth?.promotionOccurred !== false || value.authority?.workspaceRead !== true || value.authority?.workspaceMutation !== false || value.authority?.moduleImport !== false || value.authority?.candidateExecution !== false || value.authority?.registryMutation !== false || value.authority?.promotion !== false) throw Error('RECIPE_EVIDENCE_OBSERVATION_TRUTH_OR_AUTHORITY_INVALID');
  const time = freshness(value, {now});
  if (time.status === 'UNTIMED') throw Error('RECIPE_EVIDENCE_OBSERVATION_FUTURE_OR_UNTIMED');
  if (time.status !== 'LIVE') throw Error('RECIPE_EVIDENCE_OBSERVATION_STALE');
  return value;
}

module.exports = {AUTHORITY, EVIDENCE_KINDS, FORMAT_BY_KIND, LIMITS, TTL_MS, inspect, freshness, validateObservation};
