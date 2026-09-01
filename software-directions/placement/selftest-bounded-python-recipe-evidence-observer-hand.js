'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');

const placementRegistry = require('./placement-registry.js');
const observer = require('./bounded-python-recipe-evidence-observer-hand.js');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function redigest(value, field) { delete value[field]; value[field] = placementRegistry.hash(value); return value; }

const roots = [];
function put(root, relative, content) {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, content);
}

function baselineBytes(root) {
  const marker = path.join(root, 'proposal-source-executed.txt');
  return {
    'adversarial-test-receipt': Buffer.from('{"schema":"axm.code.proposed-recipe-adversarial-test-receipt.v1","status":"CALLER_REPORTED","passed":true}\n'),
    'author-contract': Buffer.from('{"schema":"axm.code.proposed-enum-map-author-contract.v1","status":"DRAFT"}\n'),
    'author-source': Buffer.from(`require('fs').writeFileSync(${JSON.stringify(marker)}, 'executed');\nmodule.exports = {author() { throw Error('must-not-run'); }};\n`),
    'parameter-contract': Buffer.from('{"schema":"axm.code.proposed-enum-map-parameter-contract.v1","status":"DRAFT"}\n'),
    'verifier-contract': Buffer.from('{"schema":"axm.code.proposed-enum-map-verifier-contract.v1","status":"DRAFT"}\n'),
    'verifier-source': Buffer.from(`require('fs').writeFileSync(${JSON.stringify(marker)}, 'executed');\nmodule.exports = {verify() { throw Error('must-not-run'); }};\n`)
  };
}

const PATHS = Object.freeze({
  'adversarial-test-receipt': 'proposal/testing/adversarial-receipt.json',
  'author-contract': 'proposal/contracts/author.contract.json',
  'author-source': 'proposal/source/author.js',
  'parameter-contract': 'proposal/contracts/parameters.contract.json',
  'verifier-contract': 'proposal/contracts/verifier.contract.json',
  'verifier-source': 'proposal/source/verifier.js'
});

function fixture({byteOverrides = {}, pathOverrides = {}, proposalOverrides = {}} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'axm-recipe-evidence-observer-'));
  roots.push(root);
  const bytes = {...baselineBytes(root), ...byteOverrides};
  const paths = {...PATHS, ...pathOverrides};
  for (const kind of observer.EVIDENCE_KINDS) put(root, paths[kind], bytes[kind]);
  const body = {
    schema: 'axm.code.bounded-python-recipe-admission-proposal.v1', version: '1.0.0', status: 'DRAFT', proposalId: 'enum-map-proposal-v1', languageId: 'python', scope: 'pair',
    recipeId: 'bounded-python-enum-map', recipeSha256: sha256(bytes['parameter-contract']), builderId: 'bounded-python-enum-map-v1', builderSha256: sha256(bytes['author-source']),
    authorReceiptSchema: 'axm.code.bounded-python-enum-map-author-receipt.v1', authorReadyResult: 'PYTHON_ENUM_MAP_AUTHOR_CANDIDATES_READY_NO_APPLICATION_AUTHORITY',
    verifierId: 'bounded-python-enum-map-unit-test', verifierRunnerSha256: sha256(bytes['verifier-source']), provenanceClass: 'PROPOSED_UNREVIEWED_CALLER_EVIDENCE',
    generalPythonAuthoring: false, arbitraryCandidateExecution: false, dynamicModuleLoading: false,
    ...proposalOverrides
  };
  const proposal = {...body, proposalSha256: placementRegistry.hash(body)};
  const evidenceBody = {
    schema: 'axm.code.bounded-python-recipe-admission-evidence.v1', version: '1.0.0', status: 'CALLER_SUPPLIED', proposalSha256: proposal.proposalSha256,
    evidenceItems: observer.EVIDENCE_KINDS.map(kind => ({kind, sha256: sha256(bytes[kind]), status: kind === 'adversarial-test-receipt' ? 'TEST_RECEIPT_DIGEST_ONLY' : 'CURRENT_BYTES_DIGEST_ONLY'})),
    testClaims: {authorCandidateGenerationPassed: true, authorNoWorkspaceAuthorityObserved: true, verifierExactCandidatePassed: true, candidateSubstitutionHeld: true, crossRecipeReceiptHeld: true, workspaceMutationObserved: false, arbitraryCandidateExecutionObserved: false},
    truth: {humanReviewCompleted: false, proposedSourceBytesInspectedByAdmissionPlane: false, digestsAreConsentOrIdentityProof: false}
  };
  const evidence = {...evidenceBody, evidenceSha256: placementRegistry.hash(evidenceBody)};
  const declarationBody = {schema: 'axm.code.bounded-python-recipe-evidence-declaration.v1', version: '1.0.0', status: 'TEST', proposalSha256: proposal.proposalSha256, evidenceSha256: evidence.evidenceSha256, files: observer.EVIDENCE_KINDS.map(kind => ({kind, path: paths[kind]}))};
  const declaration = {...declarationBody, declarationSha256: placementRegistry.hash(declarationBody)};
  return {root, bytes, paths, proposal, evidence, declaration, marker: path.join(root, 'proposal-source-executed.txt')};
}

let adversarialHolds = 0;
function hold(input, code) {
  const result = observer.inspect(input);
  assert.strictEqual(result.result, 'RECIPE_EVIDENCE_OBSERVATION_HELD');
  assert.match(result.errorCode, code);
  assert.strictEqual(result.truth.workspaceMutated, false);
  assert.strictEqual(result.truth.proposedModuleLoaded, false);
  assert.strictEqual(result.truth.candidateExecuted, false);
  assert.strictEqual(result.truth.registryMutated, false);
  assert.strictEqual(result.truth.promotionOccurred, false);
  adversarialHolds += 1;
  return result;
}

const originalSpawnSync = childProcess.spawnSync;
const originalLoad = Module._load;
let childProcessCalls = 0;
let proposedModuleLoads = 0;
childProcess.spawnSync = function observedSpawnSync(...args) { childProcessCalls += 1; return originalSpawnSync(...args); };
Module._load = function observedLoad(request, parent, isMain) {
  if (typeof request === 'string' && request.includes('proposal/source/')) proposedModuleLoads += 1;
  return originalLoad.call(this, request, parent, isMain);
};

try {
  const valid = fixture();
  const before = observer.EVIDENCE_KINDS.map(kind => sha256(fs.readFileSync(path.join(valid.root, ...valid.paths[kind].split('/')))));
  const observation = observer.inspect({workspaceRoot: valid.root, proposal: valid.proposal, evidence: valid.evidence, declaration: valid.declaration});
  observer.validateObservation(observation);
  const after = observer.EVIDENCE_KINDS.map(kind => sha256(fs.readFileSync(path.join(valid.root, ...valid.paths[kind].split('/')))));
  assert.deepStrictEqual(after, before);
  assert.strictEqual(observation.result, 'RECIPE_EVIDENCE_OBSERVED_READ_ONLY_NO_EXECUTION');
  assert.strictEqual(observation.files.length, 6);
  assert.strictEqual(observation.coverage.observedFileCount, 6);
  assert.strictEqual(observation.coverage.exactDeclaredPathsOnly, true);
  assert.strictEqual(observation.coverage.symlinksFollowed, false);
  assert.strictEqual(observation.truth.currentByteDigestsMatchedEvidence, true);
  assert.strictEqual(observation.truth.proposalCoreDigestsMatchedObservedFiles, true);
  assert.strictEqual(observation.truth.filesParsedWithoutImport, true);
  assert.strictEqual(observation.truth.callerTestClaimsReproduced, false);
  assert.strictEqual(observation.truth.semanticSafetyIndependentlyVerified, false);
  assert.strictEqual(observation.truth.workspaceMutated, false);
  assert.strictEqual(observation.truth.proposedModuleLoaded, false);
  assert.strictEqual(observation.authority.workspaceRead, true);
  assert.strictEqual(observation.authority.workspaceMutation, false);
  assert.strictEqual(observation.authority.moduleImport, false);
  assert.strictEqual(observation.authority.candidateExecution, false);
  assert.strictEqual(observer.freshness(observation).status, 'LIVE');
  assert.strictEqual(fs.existsSync(valid.marker), false);
  assert.strictEqual(proposedModuleLoads, 0);
  assert.strictEqual(childProcessCalls, 0);

  hold({workspaceRoot: path.relative(process.cwd(), valid.root), proposal: valid.proposal, evidence: valid.evidence, declaration: valid.declaration}, /WORKSPACE_ROOT_MUST_BE_ABSOLUTE/);
  hold({workspaceRoot: path.parse(valid.root).root, proposal: valid.proposal, evidence: valid.evidence, declaration: valid.declaration}, /WORKSPACE_ROOT_TOO_BROAD/);
  hold({workspaceRoot: valid.root, proposal: valid.proposal, evidence: valid.evidence, declaration: null}, /DECLARATION_INVALID/);

  const traversal = clone(valid.declaration); traversal.files[0].path = '../outside.json'; redigest(traversal, 'declarationSha256');
  hold({workspaceRoot: valid.root, proposal: valid.proposal, evidence: valid.evidence, declaration: traversal}, /PATH_TRAVERSAL_OR_DEPTH_INVALID/);
  const duplicate = clone(valid.declaration); duplicate.files[1].path = duplicate.files[0].path; redigest(duplicate, 'declarationSha256');
  hold({workspaceRoot: valid.root, proposal: valid.proposal, evidence: valid.evidence, declaration: duplicate}, /FILE_INVALID_OR_DUPLICATE/);
  const injected = clone(valid.declaration); injected.files[0].modulePath = './run-me.js'; redigest(injected, 'declarationSha256');
  hold({workspaceRoot: valid.root, proposal: valid.proposal, evidence: valid.evidence, declaration: injected}, /DECLARATION_FILE_KEYS_INVALID/);

  const missing = fixture(); fs.unlinkSync(path.join(missing.root, ...missing.paths['author-source'].split('/')));
  hold({workspaceRoot: missing.root, proposal: missing.proposal, evidence: missing.evidence, declaration: missing.declaration}, /FILESYSTEM_ENOENT/);
  const linked = fixture();
  const linkedTarget = path.join(linked.root, ...linked.paths['author-source'].split('/'));
  fs.unlinkSync(linkedTarget); fs.symlinkSync('../contracts/author.contract.json', linkedTarget);
  hold({workspaceRoot: linked.root, proposal: linked.proposal, evidence: linked.evidence, declaration: linked.declaration}, /SYMLINK_FORBIDDEN/);
  const directory = fixture();
  const directoryTarget = path.join(directory.root, ...directory.paths['author-source'].split('/'));
  fs.unlinkSync(directoryTarget); fs.mkdirSync(directoryTarget);
  hold({workspaceRoot: directory.root, proposal: directory.proposal, evidence: directory.evidence, declaration: directory.declaration}, /TARGET_NOT_REGULAR_FILE/);

  const drift = fixture(); put(drift.root, drift.paths['author-contract'], '{"changed":true}\n');
  hold({workspaceRoot: drift.root, proposal: drift.proposal, evidence: drift.evidence, declaration: drift.declaration}, /CURRENT_BYTES_DIGEST_MISMATCH:author-contract/);
  const invalidJs = fixture({byteOverrides: {'author-source': Buffer.from('module.exports = ;\n')}});
  hold({workspaceRoot: invalidJs.root, proposal: invalidJs.proposal, evidence: invalidJs.evidence, declaration: invalidJs.declaration}, /JAVASCRIPT_PARSE_FAILED:author-source/);
  const invalidJson = fixture({byteOverrides: {'verifier-contract': Buffer.from('{invalid json\n')}});
  hold({workspaceRoot: invalidJson.root, proposal: invalidJson.proposal, evidence: invalidJson.evidence, declaration: invalidJson.declaration}, /JSON_PARSE_FAILED:verifier-contract/);
  const invalidUtf8 = fixture({byteOverrides: {'parameter-contract': Buffer.from([0xc3, 0x28])}});
  hold({workspaceRoot: invalidUtf8.root, proposal: invalidUtf8.proposal, evidence: invalidUtf8.evidence, declaration: invalidUtf8.declaration}, /FILE_UTF8_INVALID/);
  const oversized = fixture({byteOverrides: {'author-contract': Buffer.alloc(observer.LIMITS.maxFileBytes + 1, 0x20)}});
  hold({workspaceRoot: oversized.root, proposal: oversized.proposal, evidence: oversized.evidence, declaration: oversized.declaration}, /FILE_TOO_LARGE:author-contract/);

  const coreMismatch = fixture({proposalOverrides: {builderSha256: 'f'.repeat(64)}});
  hold({workspaceRoot: coreMismatch.root, proposal: coreMismatch.proposal, evidence: coreMismatch.evidence, declaration: coreMismatch.declaration}, /PROPOSAL_DIGEST_BINDING_MISMATCH:builderSha256/);
  const proposalTamper = clone(valid.proposal); proposalTamper.builderId = 'tampered-builder';
  hold({workspaceRoot: valid.root, proposal: proposalTamper, evidence: valid.evidence, declaration: valid.declaration}, /PROPOSAL_DIGEST_MISMATCH/);
  const evidenceTamper = clone(valid.evidence); evidenceTamper.testClaims.authorCandidateGenerationPassed = false;
  hold({workspaceRoot: valid.root, proposal: valid.proposal, evidence: evidenceTamper, declaration: valid.declaration}, /ENVELOPE_DIGEST_MISMATCH/);
  const duplicateEvidenceDigest = clone(valid.evidence); duplicateEvidenceDigest.evidenceItems[1].sha256 = duplicateEvidenceDigest.evidenceItems[0].sha256; redigest(duplicateEvidenceDigest, 'evidenceSha256');
  const duplicateDigestDeclaration = clone(valid.declaration); duplicateDigestDeclaration.evidenceSha256 = duplicateEvidenceDigest.evidenceSha256; redigest(duplicateDigestDeclaration, 'declarationSha256');
  hold({workspaceRoot: valid.root, proposal: valid.proposal, evidence: duplicateEvidenceDigest, declaration: duplicateDigestDeclaration}, /ITEM_INVALID_OR_DUPLICATE/);
  const wrongProposalEvidence = clone(valid.evidence); wrongProposalEvidence.proposalSha256 = '0'.repeat(64); redigest(wrongProposalEvidence, 'evidenceSha256');
  hold({workspaceRoot: valid.root, proposal: valid.proposal, evidence: wrongProposalEvidence, declaration: valid.declaration}, /ENVELOPE_HEADER_OR_PROPOSAL_BINDING_INVALID/);

  const tamperedObservation = clone(observation); tamperedObservation.files[0].sha256 = '0'.repeat(64);
  assert.throws(() => observer.validateObservation(tamperedObservation), /OBSERVATION_DIGEST_MISMATCH/);
  const forgedTruth = clone(observation); forgedTruth.truth.callerTestClaimsReproduced = true; redigest(forgedTruth, 'observationSha256');
  assert.throws(() => observer.validateObservation(forgedTruth), /TRUTH_OR_AUTHORITY_INVALID/);
  const duplicateObservedPath = clone(observation); duplicateObservedPath.files[1].path = duplicateObservedPath.files[0].path; redigest(duplicateObservedPath, 'observationSha256');
  assert.throws(() => observer.validateObservation(duplicateObservedPath), /OBSERVATION_FILE_INVALID/);
  const stale = clone(observation); stale.observedAt = '2020-01-01T00:00:00.000Z'; stale.expiresAt = '2020-01-01T00:05:00.000Z'; redigest(stale, 'observationSha256');
  assert.throws(() => observer.validateObservation(stale), /OBSERVATION_STALE/);
  const future = clone(observation); future.observedAt = '2999-01-01T00:00:00.000Z'; future.expiresAt = '2999-01-01T00:05:00.000Z'; redigest(future, 'observationSha256');
  assert.throws(() => observer.validateObservation(future), /FUTURE_OR_UNTIMED/);

  const source = fs.readFileSync(path.join(__dirname, 'bounded-python-recipe-evidence-observer-hand.js'), 'utf8');
  assert.strictEqual(/\b(?:writeFile|writeFileSync|appendFile|appendFileSync|rename|renameSync|unlink|unlinkSync|rm|rmSync|mkdir|mkdirSync)\s*\(/.test(source), false, 'observer Hand source must not call filesystem mutation APIs');
  assert.strictEqual(/\b(?:exec|execFile|execSync|execFileSync|spawn|spawnSync|fork)\s*\(/.test(source), false, 'observer Hand source must not call child-process APIs');

  console.log(JSON.stringify({
    ok: true,
    exactDeclaredFilesObserved: observation.files.length,
    javascriptFilesParsedWithoutExecution: observation.files.filter(item => item.format === 'javascript-commonjs').length,
    jsonFilesParsed: observation.files.filter(item => item.format === 'json').length,
    currentByteDigestMatches: observation.files.length,
    proposalCoreDigestBindings: 3,
    ttlMs: observer.TTL_MS,
    callerTestClaimsReproduced: false,
    semanticSafetyIndependentlyVerified: false,
    proposedModulesLoaded: proposedModuleLoads,
    candidatesExecuted: 0,
    childProcessesSpawned: childProcessCalls,
    workspaceMutations: 0,
    registryMutations: 0,
    promotions: 0,
    adversarialHolds
  }, null, 2));
} finally {
  Module._load = originalLoad;
  childProcess.spawnSync = originalSpawnSync;
  for (const root of roots) fs.rmSync(root, {recursive: true, force: true});
}
