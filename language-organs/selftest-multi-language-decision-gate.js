'use strict';

const assert = require('assert');
const defaultRegistry = require('./registry.js');
const defaultGrammarProfiles = require('./grammar-profile-registry.js');
const {
  createPolyglotGrammarComposer,
  digest,
} = require('./polyglot-grammar-composition.js');
const {
  createEvidenceReceipt,
} = require('./polyglot-handoff-evidence.js');
const {
  createMultiLanguageDecisionGate,
} = require('./multi-language-decision-gate.js');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function syntheticDigest(label) {
  return digest({ multiLanguageDecisionGateFixture: label });
}

function createPassReceipt(composition, handoffIndex, label) {
  return createEvidenceReceipt({
    composition,
    handoffIndex,
    verifierId: `fixture-verifier-${label}`,
    verifierDigest: syntheticDigest(`verifier-${label}`),
    evidenceKind: 'bounded-contract-check',
    claimedResult: 'PASS',
    executionReceiptSchema: 'axm.fixture-execution-receipt/v1',
    executionReceiptDigest: syntheticDigest(`execution-${label}`),
    subjectDigests: [syntheticDigest(`subject-${label}`)],
    outputDigests: [syntheticDigest(`output-${label}`)],
    notes: [`fixture pass ${label}`],
  });
}

function createFailReceipt(composition, handoffIndex, label) {
  return createEvidenceReceipt({
    composition,
    handoffIndex,
    verifierId: `fixture-verifier-${label}`,
    verifierDigest: syntheticDigest(`verifier-${label}`),
    evidenceKind: 'bounded-contract-check',
    claimedResult: 'FAIL',
    executionReceiptSchema: 'axm.fixture-execution-receipt/v1',
    executionReceiptDigest: syntheticDigest(`execution-${label}`),
    subjectDigests: [syntheticDigest(`subject-${label}`)],
    findingCodes: ['FIXTURE_FAILURE'],
    notes: [`fixture fail ${label}`],
  });
}

function createRegistryView({ overrides = {}, snapshotTag = null } = {}) {
  const baseItems = defaultRegistry.all();
  const items = baseItems
    .map((organ) =>
      Object.prototype.hasOwnProperty.call(overrides, organ.languageId)
        ? overrides[organ.languageId]
        : organ,
    )
    .filter(Boolean);
  const byLanguage = new Map(items.map((organ) => [organ.languageId, organ]));
  const baseSnapshot = defaultRegistry.snapshot();

  return {
    all() {
      return items;
    },
    getByLanguageId(languageId) {
      return byLanguage.get(languageId) || null;
    },
    snapshot() {
      if (!snapshotTag && Object.keys(overrides).length === 0) return baseSnapshot;
      const body = {
        snapshotTag: snapshotTag || 'organ-overrides',
        entries: items.map((organ) => ({
          languageId: organ.languageId,
          organId: organ.organId,
          sha256: organ.sha256,
        })),
      };
      return {
        ...baseSnapshot,
        organCount: items.length,
        snapshotSha256: digest(body),
      };
    },
  };
}

function createGrammarView({ overrides = {}, snapshotTag = null } = {}) {
  const baseItems = defaultGrammarProfiles.all();
  const items = baseItems
    .map((profile) =>
      Object.prototype.hasOwnProperty.call(overrides, profile.languageId)
        ? overrides[profile.languageId]
        : profile,
    )
    .filter(Boolean);
  const byLanguage = new Map(items.map((profile) => [profile.languageId, profile]));
  const baseSnapshot = defaultGrammarProfiles.snapshot();

  return {
    all() {
      return items;
    },
    getByLanguageId(languageId) {
      return byLanguage.get(languageId) || null;
    },
    snapshot() {
      if (!snapshotTag && Object.keys(overrides).length === 0) return baseSnapshot;
      const body = {
        snapshotTag: snapshotTag || 'grammar-overrides',
        entries: items.map((profile) => ({
          languageId: profile.languageId,
          organId: profile.organId,
          organDigest: profile.organDigest,
          profileSha256: profile.profileSha256,
        })),
      };
      return {
        ...baseSnapshot,
        profileCount: items.length,
        snapshotSha256: digest(body),
      };
    },
  };
}

function run() {
  const composer = createPolyglotGrammarComposer();
  const composition = composer.compose(['python', 'sql', 'rust'], {
    handoffs: [
      {
        from: 'python',
        to: 'sql',
        kind: 'database-query',
        artifact: 'parameterized SQL statement + bound values',
        validation: ['reject unbound placeholders'],
      },
      {
        from: 'sql',
        to: 'rust',
        kind: 'result-set',
        artifact: 'typed rows',
        validation: ['validate row schema before decoding'],
      },
    ],
  });
  const originalCompositionJson = JSON.stringify(composition);
  const pass0 = createPassReceipt(composition, 0, 'pass-0');
  const pass1 = createPassReceipt(composition, 1, 'pass-1');

  const gate = createMultiLanguageDecisionGate();
  const ready = gate.evaluate(composition, [pass0, pass1]);
  assert.strictEqual(
    ready.decisionState,
    'CALLER_DECISION_READY_CURRENT_RECEIPTS_NOT_REPLAYED',
  );
  assert.strictEqual(ready.callerDecisionEligible, true);
  assert.deepStrictEqual(ready.holdReasons, []);
  assert.deepStrictEqual(ready.advisories, []);
  assert.strictEqual(ready.currentness.status, 'CURRENT_EXACT');
  assert.strictEqual(
    ready.evidence.overallStatus,
    'CALLER_PASS_RECEIPTS_COMPLETE_NOT_REPLAYED',
  );
  assert.strictEqual(ready.refresh.status, 'NO_REFRESH_REQUIRED');
  assert.strictEqual(ready.refresh.acceptedReceiptBindingsWouldNeedReissue, 0);
  assert.strictEqual(ready.truthBoundary.executionReadinessClaimed, false);
  assert.strictEqual(ready.truthBoundary.automaticPromotionAllowed, false);
  assert.strictEqual(ready.truthBoundary.evidenceExecutionReplayed, false);
  assert.strictEqual(ready.decisionGateId.length, 64);
  assert.strictEqual(
    gate.evaluate(composition, [pass1, pass0]).decisionGateId,
    ready.decisionGateId,
  );

  const incomplete = gate.evaluate(composition, [pass0]);
  assert.strictEqual(incomplete.decisionState, 'HELD');
  assert.strictEqual(incomplete.callerDecisionEligible, false);
  assert.deepStrictEqual(
    incomplete.holdReasons.map((hold) => hold.code),
    ['EVIDENCE_INCOMPLETE'],
  );

  const fail0 = createFailReceipt(composition, 0, 'fail-0');
  const conflict = gate.evaluate(composition, [pass0, fail0, pass1]);
  assert.strictEqual(conflict.decisionState, 'HELD');
  assert.deepStrictEqual(
    conflict.holdReasons.map((hold) => hold.code),
    ['EVIDENCE_REVIEW_REQUIRED'],
  );
  assert.strictEqual(conflict.evidence.overallStatus, 'EVIDENCE_REVIEW_REQUIRED');

  const tampered = cloneJson(pass0);
  tampered.evidence.claimedResult = 'FAIL';
  const tamperedGate = gate.evaluate(composition, [tampered, pass1]);
  assert.strictEqual(tamperedGate.decisionState, 'HELD');
  assert.deepStrictEqual(
    tamperedGate.holdReasons.map((hold) => hold.code),
    ['EVIDENCE_REVIEW_REQUIRED'],
  );
  assert.strictEqual(tamperedGate.evidence.rejectedReceiptCount, 1);

  const repositoryDriftRegistry = createRegistryView({
    snapshotTag: 'unrelated-repository-change',
  });
  const repositoryDriftGate = createMultiLanguageDecisionGate({
    registry: repositoryDriftRegistry,
    grammarProfiles: defaultGrammarProfiles,
  });
  const repositoryDrift = repositoryDriftGate.evaluate(composition, [pass0, pass1]);
  assert.strictEqual(
    repositoryDrift.decisionState,
    'CALLER_DECISION_READY_SELECTED_STAGES_CURRENT_REPOSITORY_DRIFT',
  );
  assert.strictEqual(repositoryDrift.callerDecisionEligible, true);
  assert.strictEqual(repositoryDrift.currentness.selectedStagesCurrent, true);
  assert.strictEqual(repositoryDrift.currentness.repositorySnapshotCurrent, false);
  assert.deepStrictEqual(repositoryDrift.holdReasons, []);
  assert.deepStrictEqual(
    repositoryDrift.advisories.map((item) => item.code),
    [
      'REPOSITORY_CHANGED_ELSEWHERE_SELECTED_STAGES_CURRENT',
      'REFRESH_WOULD_INVALIDATE_COMPOSITION_BOUND_RECEIPTS',
    ],
  );
  assert.strictEqual(
    repositoryDrift.refresh.status,
    'REFRESH_CANDIDATE_READY_CALLER_ACCEPTANCE_REQUIRED',
  );
  assert.strictEqual(repositoryDrift.refresh.compositionIdChanged, true);
  assert.strictEqual(repositoryDrift.refresh.acceptedReceiptBindingsWouldNeedReissue, 2);

  const changedSqlProfile = cloneJson(defaultGrammarProfiles.getByLanguageId('sql'));
  changedSqlProfile.analysis.semanticHazards = [
    ...changedSqlProfile.analysis.semanticHazards,
    'synthetic-decision-gate-hazard',
  ];
  changedSqlProfile.profileSha256 = syntheticDigest('sql-grammar-v2');
  const changedSqlGate = createMultiLanguageDecisionGate({
    registry: defaultRegistry,
    grammarProfiles: createGrammarView({
      overrides: { sql: changedSqlProfile },
      snapshotTag: 'selected-sql-grammar-change',
    }),
  });
  const staleButOldGreen = changedSqlGate.evaluate(composition, [pass0, pass1]);
  assert.strictEqual(staleButOldGreen.decisionState, 'HELD');
  assert.strictEqual(staleButOldGreen.callerDecisionEligible, false);
  assert.strictEqual(
    staleButOldGreen.evidence.overallStatus,
    'CALLER_PASS_RECEIPTS_COMPLETE_NOT_REPLAYED',
  );
  assert.deepStrictEqual(staleButOldGreen.currentness.staleStageIndexes, [1]);
  assert.deepStrictEqual(staleButOldGreen.currentness.impactedBoundaryIndexes, [0, 1]);
  assert.deepStrictEqual(
    staleButOldGreen.holdReasons.map((hold) => hold.code),
    ['SELECTED_STAGE_SOURCE_DRIFT'],
  );
  assert.strictEqual(
    staleButOldGreen.refresh.status,
    'REFRESH_CANDIDATE_READY_CALLER_ACCEPTANCE_REQUIRED',
  );
  assert.strictEqual(staleButOldGreen.refresh.acceptedReceiptBindingsWouldNeedReissue, 2);
  assert.ok(
    staleButOldGreen.advisories.some(
      (item) => item.code === 'REFRESH_WOULD_INVALIDATE_COMPOSITION_BOUND_RECEIPTS',
    ),
  );

  const reboundPythonOrgan = cloneJson(defaultRegistry.getByLanguageId('python'));
  reboundPythonOrgan.organId = 'code.organ.python.v2.synthetic-rebound';
  reboundPythonOrgan.sha256 = syntheticDigest('python-organ-rebound');
  const reboundPythonProfile = cloneJson(defaultGrammarProfiles.getByLanguageId('python'));
  reboundPythonProfile.organId = reboundPythonOrgan.organId;
  reboundPythonProfile.organDigest = reboundPythonOrgan.sha256;
  reboundPythonProfile.profileSha256 = syntheticDigest('python-profile-rebound');
  const reboundGate = createMultiLanguageDecisionGate({
    registry: createRegistryView({
      overrides: { python: reboundPythonOrgan },
      snapshotTag: 'python-rebound',
    }),
    grammarProfiles: createGrammarView({
      overrides: { python: reboundPythonProfile },
      snapshotTag: 'python-rebound-grammar',
    }),
  });
  const rebound = reboundGate.evaluate(composition, [pass0, pass1]);
  assert.strictEqual(rebound.decisionState, 'HELD');
  assert.deepStrictEqual(
    rebound.holdReasons.map((hold) => hold.code),
    ['SOURCE_IDENTITY_OR_BINDING_DRIFT'],
  );
  assert.deepStrictEqual(rebound.currentness.refreshBlockedStageIndexes, [0]);
  assert.strictEqual(
    rebound.refresh.status,
    'REFRESH_HELD_CALLER_DECISION_REQUIRED',
  );
  assert.strictEqual(rebound.refresh.candidateCompositionId, null);
  assert.strictEqual(rebound.refresh.acceptedReceiptBindingsWouldNeedReissue, 0);

  const changedAndConflict = changedSqlGate.evaluate(composition, [pass0, fail0, pass1]);
  assert.strictEqual(changedAndConflict.decisionState, 'HELD');
  assert.deepStrictEqual(
    changedAndConflict.holdReasons.map((hold) => hold.code),
    ['SELECTED_STAGE_SOURCE_DRIFT', 'EVIDENCE_REVIEW_REQUIRED'],
  );

  assert.strictEqual(JSON.stringify(composition), originalCompositionJson);
  console.log('multi-language decision gate real-body selftest: ok');
}

run();
