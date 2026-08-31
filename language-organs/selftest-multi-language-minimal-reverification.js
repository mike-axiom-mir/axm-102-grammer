'use strict';

const assert = require('assert');
const defaultRegistry = require('./registry.js');
const defaultGrammarProfiles = require('./grammar-profile-registry.js');
const {
  createPolyglotGrammarComposer,
  digest,
} = require('./polyglot-grammar-composition.js');
const { createEvidenceReceipt } = require('./polyglot-handoff-evidence.js');
const {
  compareLocalHandoff,
  createLocalHandoffFingerprint,
  createMinimalReverificationPlanner,
} = require('./multi-language-minimal-reverification.js');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function syntheticDigest(label) {
  return digest({ minimalReverificationFixture: label });
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
        producerGuarantees: ['values stay separate from SQL text'],
        consumerAssumptions: ['driver supports bound values'],
        validation: ['reject unbound placeholders'],
      },
      {
        from: 'sql',
        to: 'rust',
        kind: 'result-set',
        artifact: 'typed rows',
        producerGuarantees: ['column order is declared'],
        consumerAssumptions: ['decoder uses the declared row schema'],
        validation: ['validate row schema before decoding'],
      },
    ],
  });
  const originalCompositionJson = JSON.stringify(composition);
  const pass0 = createPassReceipt(composition, 0, 'pass-0');
  const pass1 = createPassReceipt(composition, 1, 'pass-1');

  const exactPlanner = createMinimalReverificationPlanner();
  const exact = exactPlanner.plan(composition, [pass0, pass1]);
  assert.strictEqual(exact.planState, 'NO_REFRESH_REQUIRED');
  assert.strictEqual(exact.candidateCompositionId, null);
  assert.strictEqual(exact.compositionIdChanged, false);
  assert.deepStrictEqual(exact.replayRecommendedHandoffIndexes, []);
  assert.deepStrictEqual(exact.rebindOnlyCandidateHandoffIndexes, []);
  assert.strictEqual(exact.acceptedOldReceiptBindingsInvalidOnCandidate, 0);
  assert.strictEqual(exact.truthBoundary.localEquivalenceChecked, false);
  assert.strictEqual(exact.truthBoundary.verifierReplayExecuted, false);
  assert.strictEqual(exact.reverificationPlanId.length, 64);
  assert.strictEqual(
    exactPlanner.plan(composition, [pass1, pass0]).reverificationPlanId,
    exact.reverificationPlanId,
  );

  const repositoryOnlyPlanner = createMinimalReverificationPlanner({
    registry: createRegistryView({ snapshotTag: 'unrelated-repository-drift' }),
    grammarProfiles: defaultGrammarProfiles,
  });
  const repositoryOnly = repositoryOnlyPlanner.plan(composition, [pass0, pass1]);
  assert.strictEqual(
    repositoryOnly.planState,
    'LOCAL_HANDOFFS_UNCHANGED_RECEIPT_REBIND_REVIEW_ONLY',
  );
  assert.strictEqual(repositoryOnly.compositionIdChanged, true);
  assert.deepStrictEqual(repositoryOnly.replayRecommendedHandoffIndexes, []);
  assert.deepStrictEqual(repositoryOnly.rebindOnlyCandidateHandoffIndexes, [0, 1]);
  assert.deepStrictEqual(repositoryOnly.potentialReplaySavingsHandoffIndexes, [0, 1]);
  assert.deepStrictEqual(repositoryOnly.noPriorPassCoverageHandoffIndexes, []);
  assert.strictEqual(repositoryOnly.acceptedOldReceiptBindingsInvalidOnCandidate, 2);
  assert.strictEqual(repositoryOnly.costSignal.localReplayRecommendedCount, 0);
  assert.strictEqual(repositoryOnly.costSignal.localReplayNotIndicatedCount, 2);
  assert.strictEqual(repositoryOnly.costSignal.potentialReplaySavingsCount, 2);
  assert.strictEqual(repositoryOnly.costSignal.receiptBindingsNeedingNewCandidateBinding, 2);
  assert.strictEqual(repositoryOnly.costSignal.computeCostEstimated, false);
  assert.strictEqual(repositoryOnly.costSignal.memoryCostEstimated, false);
  assert.strictEqual(repositoryOnly.truthBoundary.automaticReceiptCarryForwardAllowed, false);
  assert.strictEqual(repositoryOnly.truthBoundary.externalVerifierPolicyChecked, false);
  assert.strictEqual(
    repositoryOnly.truthBoundary.localEquivalenceMeaning,
    'SAME_HANDOFF_DECLARATION_AND_SAME_PRODUCER_CONSUMER_ORGAN_AND_GRAMMAR_DIGESTS_AT_THE_SAME_STAGE_BOUNDARY',
  );
  assert.ok(
    repositoryOnly.handoffPlans.every(
      (plan) =>
        plan.status === 'LOCAL_HANDOFF_UNCHANGED_NEW_RECEIPT_BINDING_REQUIRED' &&
        plan.grammarDeltaReplayRecommendation === 'NO_REPLAY_SIGNAL_FROM_LOCAL_GRAMMAR_DELTA',
    ),
  );

  const repositoryOnlyIncomplete = repositoryOnlyPlanner.plan(composition, [pass0]);
  assert.deepStrictEqual(
    repositoryOnlyIncomplete.potentialReplaySavingsHandoffIndexes,
    [0],
  );
  assert.deepStrictEqual(repositoryOnlyIncomplete.noPriorPassCoverageHandoffIndexes, [1]);
  assert.strictEqual(repositoryOnlyIncomplete.acceptedPassReceiptCount, 1);
  assert.strictEqual(repositoryOnlyIncomplete.evidenceStatus, 'EVIDENCE_INCOMPLETE');

  const changedSqlProfile = cloneJson(defaultGrammarProfiles.getByLanguageId('sql'));
  changedSqlProfile.analysis.semanticHazards = [
    ...changedSqlProfile.analysis.semanticHazards,
    'synthetic-minimal-reverify-sql-hazard',
  ];
  changedSqlProfile.profileSha256 = syntheticDigest('sql-profile-v2');
  const sqlPlanner = createMinimalReverificationPlanner({
    registry: defaultRegistry,
    grammarProfiles: createGrammarView({
      overrides: { sql: changedSqlProfile },
      snapshotTag: 'selected-sql-grammar-change',
    }),
  });
  const sqlChanged = sqlPlanner.plan(composition, [pass0, pass1]);
  assert.strictEqual(
    sqlChanged.planState,
    'ALL_DEFINED_HANDOFFS_LOCALLY_CHANGED_REVERIFICATION_RECOMMENDED',
  );
  assert.deepStrictEqual(sqlChanged.staleStageIndexes, [1]);
  assert.deepStrictEqual(sqlChanged.impactedBoundaryIndexes, [0, 1]);
  assert.deepStrictEqual(sqlChanged.replayRecommendedHandoffIndexes, [0, 1]);
  assert.deepStrictEqual(sqlChanged.rebindOnlyCandidateHandoffIndexes, []);
  assert.deepStrictEqual(sqlChanged.potentialReplaySavingsHandoffIndexes, []);
  assert.strictEqual(sqlChanged.costSignal.localReplayRecommendedCount, 2);
  assert.strictEqual(sqlChanged.handoffPlans[0].comparison.changes.consumerGrammarChanged, true);
  assert.strictEqual(sqlChanged.handoffPlans[0].comparison.changes.producerGrammarChanged, false);
  assert.strictEqual(sqlChanged.handoffPlans[1].comparison.changes.producerGrammarChanged, true);
  assert.strictEqual(sqlChanged.handoffPlans[1].comparison.changes.consumerGrammarChanged, false);

  const changedRustProfile = cloneJson(defaultGrammarProfiles.getByLanguageId('rust'));
  changedRustProfile.verification.focus = [
    ...changedRustProfile.verification.focus,
    'synthetic-minimal-reverify-rust-check',
  ];
  changedRustProfile.profileSha256 = syntheticDigest('rust-profile-v2');
  const rustPlanner = createMinimalReverificationPlanner({
    registry: defaultRegistry,
    grammarProfiles: createGrammarView({
      overrides: { rust: changedRustProfile },
      snapshotTag: 'selected-rust-grammar-change',
    }),
  });
  const rustChanged = rustPlanner.plan(composition, [pass0, pass1]);
  assert.strictEqual(rustChanged.planState, 'PARTIAL_LOCAL_REVERIFICATION_RECOMMENDED');
  assert.deepStrictEqual(rustChanged.staleStageIndexes, [2]);
  assert.deepStrictEqual(rustChanged.impactedBoundaryIndexes, [1]);
  assert.deepStrictEqual(rustChanged.replayRecommendedHandoffIndexes, [1]);
  assert.deepStrictEqual(rustChanged.rebindOnlyCandidateHandoffIndexes, [0]);
  assert.deepStrictEqual(rustChanged.potentialReplaySavingsHandoffIndexes, [0]);
  assert.strictEqual(rustChanged.costSignal.localReplayRecommendedCount, 1);
  assert.strictEqual(rustChanged.costSignal.localReplayNotIndicatedCount, 1);
  assert.strictEqual(rustChanged.handoffPlans[0].localEquivalent, true);
  assert.strictEqual(rustChanged.handoffPlans[1].comparison.changes.consumerGrammarChanged, true);

  const reboundPythonOrgan = cloneJson(defaultRegistry.getByLanguageId('python'));
  reboundPythonOrgan.organId = 'code.organ.python.v2.synthetic-rebound';
  reboundPythonOrgan.sha256 = syntheticDigest('python-rebound-organ');
  const reboundPythonProfile = cloneJson(defaultGrammarProfiles.getByLanguageId('python'));
  reboundPythonProfile.organId = reboundPythonOrgan.organId;
  reboundPythonProfile.organDigest = reboundPythonOrgan.sha256;
  reboundPythonProfile.profileSha256 = syntheticDigest('python-rebound-profile');
  const reboundPlanner = createMinimalReverificationPlanner({
    registry: createRegistryView({
      overrides: { python: reboundPythonOrgan },
      snapshotTag: 'python-rebound',
    }),
    grammarProfiles: createGrammarView({
      overrides: { python: reboundPythonProfile },
      snapshotTag: 'python-rebound-grammar',
    }),
  });
  const rebound = reboundPlanner.plan(composition, [pass0, pass1]);
  assert.strictEqual(rebound.planState, 'REFRESH_HELD_NO_CANDIDATE');
  assert.deepStrictEqual(rebound.refreshBlockedStageIndexes, [0]);
  assert.strictEqual(rebound.candidateCompositionId, null);
  assert.deepStrictEqual(rebound.replayRecommendedHandoffIndexes, []);
  assert.strictEqual(rebound.truthBoundary.localEquivalenceChecked, false);

  const local0 = createLocalHandoffFingerprint(composition, 0);
  assert.strictEqual(local0.localHandoffFingerprintId.length, 64);
  assert.strictEqual(local0.repositorySnapshotExcluded, true);
  assert.strictEqual(local0.compositionIdExcluded, true);

  const declarationChangedComposition = composer.compose(['python', 'sql', 'rust'], {
    handoffs: [
      {
        from: 'python',
        to: 'sql',
        kind: 'database-query',
        artifact: 'different query envelope',
        producerGuarantees: ['values stay separate from SQL text'],
        consumerAssumptions: ['driver supports bound values'],
        validation: ['reject unbound placeholders'],
      },
      cloneJson(composition.handoffs[1]),
    ],
  });
  const declarationComparison = compareLocalHandoff(
    composition,
    declarationChangedComposition,
    0,
  );
  assert.strictEqual(declarationComparison.localEquivalent, false);
  assert.strictEqual(declarationComparison.changes.declarationChanged, true);
  assert.strictEqual(declarationComparison.changes.producerOrganChanged, false);
  assert.strictEqual(declarationComparison.changes.consumerOrganChanged, false);
  assert.strictEqual(declarationComparison.changes.producerGrammarChanged, false);
  assert.strictEqual(declarationComparison.changes.consumerGrammarChanged, false);

  const repeated = composer.compose(['python', 'sql', 'python', 'sql'], {
    handoffs: [
      {
        from: 'python',
        to: 'sql',
        boundaryIndex: 0,
        kind: 'database-query',
        artifact: 'first query contract',
      },
      {
        from: 'sql',
        to: 'python',
        kind: 'result-set',
        artifact: 'rows',
      },
      {
        from: 'python',
        to: 'sql',
        boundaryIndex: 2,
        kind: 'database-query',
        artifact: 'second query contract',
      },
    ],
  });
  assert.notStrictEqual(
    createLocalHandoffFingerprint(repeated, 0).localHandoffFingerprintId,
    createLocalHandoffFingerprint(repeated, 2).localHandoffFingerprintId,
  );

  assert.strictEqual(JSON.stringify(composition), originalCompositionJson);
  console.log('multi-language minimal re-verification real-body selftest: ok');
}

run();
