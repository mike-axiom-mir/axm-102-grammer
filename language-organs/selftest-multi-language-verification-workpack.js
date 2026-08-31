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
  createMultiLanguageVerificationWorkpack,
  validateVerificationWorkpack,
} = require('./multi-language-verification-workpack.js');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function syntheticDigest(label) {
  return digest({ multiLanguageVerificationWorkpackFixture: label });
}

function createReceipt(composition, handoffIndex, claimedResult, label) {
  return createEvidenceReceipt({
    composition,
    handoffIndex,
    verifierId: `fixture-verifier-${label}`,
    verifierDigest: syntheticDigest(`verifier-${label}`),
    evidenceKind: 'bounded-contract-check',
    claimedResult,
    executionReceiptSchema: 'axm.fixture-execution-receipt/v1',
    executionReceiptDigest: syntheticDigest(`execution-${label}`),
    subjectDigests: [syntheticDigest(`subject-${label}`)],
    outputDigests: [syntheticDigest(`output-${label}`)],
    findingCodes: claimedResult === 'FAIL' ? ['FIXTURE_FAILURE'] : [],
    notes: [`fixture ${claimedResult.toLowerCase()} ${label}`],
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
      return {
        ...baseSnapshot,
        organCount: items.length,
        snapshotSha256: digest({
          snapshotTag: snapshotTag || 'organ-overrides',
          entries: items.map((organ) => ({
            languageId: organ.languageId,
            organId: organ.organId,
            sha256: organ.sha256,
          })),
        }),
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
      return {
        ...baseSnapshot,
        profileCount: items.length,
        snapshotSha256: digest({
          snapshotTag: snapshotTag || 'grammar-overrides',
          entries: items.map((profile) => ({
            languageId: profile.languageId,
            organId: profile.organId,
            organDigest: profile.organDigest,
            profileSha256: profile.profileSha256,
          })),
        }),
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
  const pass0 = createReceipt(composition, 0, 'PASS', 'pass-0');
  const pass1 = createReceipt(composition, 1, 'PASS', 'pass-1');
  const fail0 = createReceipt(composition, 0, 'FAIL', 'fail-0');

  const builder = createMultiLanguageVerificationWorkpack();
  const complete = builder.create(composition, [pass0, pass1]);
  assert.strictEqual(complete.state, 'NO_WORK_REQUIRED');
  assert.strictEqual(complete.callerDispatchEligible, false);
  assert.strictEqual(complete.targetCompositionId, composition.compositionId);
  assert.strictEqual(complete.targetIsRefreshCandidate, false);
  assert.strictEqual(complete.workItems.length, 0);
  assert.deepStrictEqual(complete.counts, {
    totalWorkItems: 0,
    verifierRuns: 0,
    receiptReissueReviews: 0,
    contractCompletions: 0,
    evidenceReviews: 0,
  });
  assert.strictEqual(complete.truthBoundary.computeCostEstimated, false);
  assert.strictEqual(complete.truthBoundary.memoryCostEstimated, false);
  assert.strictEqual(complete.truthBoundary.automaticDispatchAllowed, false);
  assert.strictEqual(complete.workpackId.length, 64);
  assert.strictEqual(
    builder.create(composition, [pass1, pass0]).workpackId,
    complete.workpackId,
  );
  assert.strictEqual(validateVerificationWorkpack(complete), true);

  const missingOne = builder.create(composition, [pass0]);
  assert.strictEqual(missingOne.state, 'WORK_ITEMS_READY_CALLER_DISPATCH_REQUIRED');
  assert.strictEqual(missingOne.callerDispatchEligible, true);
  assert.strictEqual(missingOne.workItems.length, 1);
  assert.strictEqual(missingOne.workItems[0].taskType, 'RUN_VERIFIER_AND_ISSUE_RECEIPT');
  assert.strictEqual(missingOne.workItems[0].handoffIndex, 1);
  assert.strictEqual(missingOne.workItems[0].targetBinding.contractId.length, 64);
  assert.strictEqual(missingOne.counts.verifierRuns, 1);
  assert.strictEqual(missingOne.workItems[0].executionConstraints.commandInferred, false);
  assert.strictEqual(missingOne.workItems[0].authority.dispatch, false);

  const conflict = builder.create(composition, [pass0, fail0, pass1]);
  assert.strictEqual(conflict.state, 'WORK_ITEMS_READY_CALLER_DISPATCH_REQUIRED');
  assert.deepStrictEqual(
    conflict.workItems.map((item) => item.taskType),
    ['RESOLVE_EVIDENCE_REVIEW'],
  );
  assert.strictEqual(conflict.workItems[0].handoffIndex, 0);
  assert.strictEqual(conflict.counts.evidenceReviews, 1);

  const tampered = cloneJson(pass0);
  tampered.evidence.claimedResult = 'FAIL';
  const rejected = builder.create(composition, [tampered, pass1]);
  assert.deepStrictEqual(
    rejected.workItems.map((item) => item.taskType),
    ['REVIEW_REJECTED_RECEIPTS', 'RUN_VERIFIER_AND_ISSUE_RECEIPT'],
  );
  assert.strictEqual(rejected.counts.evidenceReviews, 1);
  assert.strictEqual(rejected.counts.verifierRuns, 1);

  const repositoryOnlyBuilder = createMultiLanguageVerificationWorkpack({
    registry: createRegistryView({ snapshotTag: 'repository-only-drift' }),
    grammarProfiles: defaultGrammarProfiles,
  });
  const repositoryOnly = repositoryOnlyBuilder.create(composition, [pass0, pass1]);
  assert.strictEqual(repositoryOnly.targetIsRefreshCandidate, true);
  assert.notStrictEqual(repositoryOnly.targetCompositionId, composition.compositionId);
  assert.strictEqual(repositoryOnly.state, 'WORK_ITEMS_READY_CALLER_DISPATCH_REQUIRED');
  assert.deepStrictEqual(
    repositoryOnly.workItems.map((item) => item.taskType),
    ['REISSUE_OR_REPLAY_POLICY_REVIEW', 'REISSUE_OR_REPLAY_POLICY_REVIEW'],
  );
  assert.strictEqual(repositoryOnly.counts.verifierRuns, 0);
  assert.strictEqual(repositoryOnly.counts.receiptReissueReviews, 2);
  assert.strictEqual(
    repositoryOnly.workItems[0].requestedOutcome.externalPolicyDecisionRequired,
    true,
  );
  assert.strictEqual(
    repositoryOnly.workItems[0].sourceEvidence.acceptedPassReceiptIds.length,
    1,
  );

  const changedSqlProfile = cloneJson(defaultGrammarProfiles.getByLanguageId('sql'));
  changedSqlProfile.analysis.semanticHazards = [
    ...changedSqlProfile.analysis.semanticHazards,
    'synthetic-workpack-sql-hazard',
  ];
  changedSqlProfile.profileSha256 = syntheticDigest('sql-profile-v2');
  const sqlBuilder = createMultiLanguageVerificationWorkpack({
    registry: defaultRegistry,
    grammarProfiles: createGrammarView({
      overrides: { sql: changedSqlProfile },
      snapshotTag: 'sql-profile-v2',
    }),
  });
  const sqlChanged = sqlBuilder.create(composition, [pass0, pass1]);
  assert.deepStrictEqual(
    sqlChanged.workItems.map((item) => item.taskType),
    ['RUN_VERIFIER_AND_ISSUE_RECEIPT', 'RUN_VERIFIER_AND_ISSUE_RECEIPT'],
  );
  assert.deepStrictEqual(
    sqlChanged.workItems.map((item) => item.handoffIndex),
    [0, 1],
  );
  assert.strictEqual(sqlChanged.counts.verifierRuns, 2);
  assert.strictEqual(sqlChanged.counts.receiptReissueReviews, 0);

  const sqlChangedWithConflict = sqlBuilder.create(composition, [pass0, fail0, pass1]);
  assert.deepStrictEqual(
    sqlChangedWithConflict.workItems.map((item) => [item.handoffIndex, item.taskType]),
    [
      [0, 'RESOLVE_EVIDENCE_REVIEW'],
      [0, 'RUN_VERIFIER_AND_ISSUE_RECEIPT'],
      [1, 'RUN_VERIFIER_AND_ISSUE_RECEIPT'],
    ],
  );
  assert.strictEqual(sqlChangedWithConflict.counts.evidenceReviews, 1);
  assert.strictEqual(sqlChangedWithConflict.counts.verifierRuns, 2);

  const budgetHeld = sqlBuilder.create(composition, [pass0, pass1], {
    countBudget: { maxVerifierRuns: 0 },
  });
  assert.strictEqual(budgetHeld.state, 'DECLARED_COUNT_BUDGET_HOLD');
  assert.strictEqual(budgetHeld.callerDispatchEligible, false);
  assert.strictEqual(budgetHeld.budgetAssessment.withinDeclaredCountBudget, false);
  assert.deepStrictEqual(budgetHeld.budgetAssessment.exceeded, [
    { budgetField: 'maxVerifierRuns', limit: 0, actual: 2 },
  ]);

  const changedRustProfile = cloneJson(defaultGrammarProfiles.getByLanguageId('rust'));
  changedRustProfile.analysis.semanticHazards = [
    ...changedRustProfile.analysis.semanticHazards,
    'synthetic-workpack-rust-hazard',
  ];
  changedRustProfile.profileSha256 = syntheticDigest('rust-profile-v2');
  const rustBuilder = createMultiLanguageVerificationWorkpack({
    registry: defaultRegistry,
    grammarProfiles: createGrammarView({
      overrides: { rust: changedRustProfile },
      snapshotTag: 'rust-profile-v2',
    }),
  });
  const rustChanged = rustBuilder.create(composition, [pass0, pass1]);
  assert.deepStrictEqual(
    rustChanged.workItems.map((item) => [item.handoffIndex, item.taskType]),
    [
      [1, 'RUN_VERIFIER_AND_ISSUE_RECEIPT'],
      [0, 'REISSUE_OR_REPLAY_POLICY_REVIEW'],
    ],
  );
  assert.strictEqual(rustChanged.counts.verifierRuns, 1);
  assert.strictEqual(rustChanged.counts.receiptReissueReviews, 1);

  const reboundOrgan = cloneJson(defaultRegistry.getByLanguageId('python'));
  reboundOrgan.organId = 'code.organ.python.v2.synthetic-workpack-rebound';
  reboundOrgan.sha256 = syntheticDigest('python-organ-rebound');
  const reboundProfile = cloneJson(defaultGrammarProfiles.getByLanguageId('python'));
  reboundProfile.organId = reboundOrgan.organId;
  reboundProfile.organDigest = reboundOrgan.sha256;
  reboundProfile.profileSha256 = syntheticDigest('python-profile-rebound');
  const reboundBuilder = createMultiLanguageVerificationWorkpack({
    registry: createRegistryView({
      overrides: { python: reboundOrgan },
      snapshotTag: 'python-rebound',
    }),
    grammarProfiles: createGrammarView({
      overrides: { python: reboundProfile },
      snapshotTag: 'python-rebound-profile',
    }),
  });
  const rebound = reboundBuilder.create(composition, [pass0, pass1]);
  assert.strictEqual(rebound.state, 'SOURCE_HOLD_CALLER_DECISION_REQUIRED');
  assert.strictEqual(rebound.targetCompositionId, null);
  assert.strictEqual(rebound.targetComposition, null);
  assert.strictEqual(rebound.workItems.length, 0);
  assert.strictEqual(rebound.callerDispatchEligible, false);

  const partialComposition = composer.compose(['python', 'sql'], {
    handoffs: [
      {
        from: 'python',
        to: 'sql',
        artifact: 'query request missing interface kind',
      },
    ],
  });
  const partial = builder.create(partialComposition, []);
  assert.deepStrictEqual(
    partial.workItems.map((item) => item.taskType),
    ['COMPLETE_HANDOFF_CONTRACT'],
  );
  assert.strictEqual(partial.counts.contractCompletions, 1);
  assert.strictEqual(partial.workItems[0].targetBinding.contractId, null);

  const missingComposition = composer.compose(['python', 'sql']);
  const missing = builder.create(missingComposition, []);
  assert.deepStrictEqual(
    missing.workItems.map((item) => item.taskType),
    ['DECLARE_HANDOFF_CONTRACT'],
  );
  assert.strictEqual(missing.workItems[0].boundaryIndex, 0);
  assert.strictEqual(missing.counts.contractCompletions, 1);

  assert.throws(
    () => builder.create(composition, [], { countBudget: { maxVerifierRuns: -1 } }),
    /MULTI_LANGUAGE_WORKPACK_COUNT_BUDGET_INVALID:maxVerifierRuns/,
  );
  assert.throws(
    () => builder.create(composition, [], { countBudget: { imaginaryLimit: 1 } }),
    /MULTI_LANGUAGE_WORKPACK_COUNT_BUDGET_UNKNOWN_FIELD:imaginaryLimit/,
  );

  const hiddenKey = cloneJson(missingOne);
  hiddenKey.workItems[0].hiddenAuthority = 'EXECUTE';
  delete hiddenKey.workItems[0].workItemId;
  hiddenKey.workItems[0].workItemId = digest(hiddenKey.workItems[0]);
  hiddenKey.phases = hiddenKey.phases.map((phase) => ({
    ...phase,
    workItemIds: phase.workItemIds.map((id) =>
      id === missingOne.workItems[0].workItemId
        ? hiddenKey.workItems[0].workItemId
        : id,
    ),
  }));
  delete hiddenKey.workpackId;
  hiddenKey.workpackId = digest(hiddenKey);
  assert.throws(
    () => validateVerificationWorkpack(hiddenKey),
    /MULTI_LANGUAGE_WORK_ITEM_SHAPE_INVALID_KEYS/,
  );

  const authorityEscalation = cloneJson(missingOne);
  authorityEscalation.workItems[0].authority.dispatch = true;
  delete authorityEscalation.workItems[0].workItemId;
  authorityEscalation.workItems[0].workItemId = digest(authorityEscalation.workItems[0]);
  authorityEscalation.phases = authorityEscalation.phases.map((phase) => ({
    ...phase,
    workItemIds: phase.workItemIds.map((id) =>
      id === missingOne.workItems[0].workItemId
        ? authorityEscalation.workItems[0].workItemId
        : id,
    ),
  }));
  delete authorityEscalation.workpackId;
  authorityEscalation.workpackId = digest(authorityEscalation);
  assert.throws(
    () => validateVerificationWorkpack(authorityEscalation),
    /MULTI_LANGUAGE_WORK_ITEM_AUTHORITY_MISMATCH/,
  );

  assert.strictEqual(JSON.stringify(composition), originalCompositionJson);
  console.log('multi-language verification workpack real-body selftest: ok');
}

run();
