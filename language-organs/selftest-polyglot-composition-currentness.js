'use strict';

const assert = require('assert');
const defaultRegistry = require('./registry.js');
const defaultGrammarProfiles = require('./grammar-profile-registry.js');
const {
  createPolyglotGrammarComposer,
  digest,
} = require('./polyglot-grammar-composition.js');
const {
  createPolyglotCurrentnessInspector,
} = require('./polyglot-composition-currentness.js');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createOrganRegistryView(overrides = {}, tag = 'organ-view') {
  const items = defaultRegistry
    .all()
    .map((organ) =>
      Object.prototype.hasOwnProperty.call(overrides, organ.languageId)
        ? overrides[organ.languageId]
        : organ,
    )
    .filter(Boolean);
  const byLanguage = new Map(items.map((organ) => [organ.languageId, organ]));
  const baseSnapshot = defaultRegistry.snapshot();
  const snapshotBody = {
    tag,
    entries: items.map((organ) => ({
      languageId: organ.languageId,
      organId: organ.organId,
      sha256: organ.sha256,
    })),
  };
  return {
    all() {
      return items;
    },
    getByLanguageId(languageId) {
      return byLanguage.get(languageId) || null;
    },
    snapshot() {
      return {
        ...baseSnapshot,
        organCount: items.length,
        snapshotSha256: digest(snapshotBody),
      };
    },
  };
}

function createGrammarRegistryView(overrides = {}, tag = 'grammar-view') {
  const items = defaultGrammarProfiles
    .all()
    .map((profile) =>
      Object.prototype.hasOwnProperty.call(overrides, profile.languageId)
        ? overrides[profile.languageId]
        : profile,
    )
    .filter(Boolean);
  const byLanguage = new Map(items.map((profile) => [profile.languageId, profile]));
  const baseSnapshot = defaultGrammarProfiles.snapshot();
  const snapshotBody = {
    tag,
    entries: items.map((profile) => ({
      languageId: profile.languageId,
      organId: profile.organId,
      organDigest: profile.organDigest,
      profileSha256: profile.profileSha256,
    })),
  };
  return {
    all() {
      return items;
    },
    getByLanguageId(languageId) {
      return byLanguage.get(languageId) || null;
    },
    snapshot() {
      return {
        ...baseSnapshot,
        profileCount: items.length,
        snapshotSha256: digest(snapshotBody),
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

  const exactInspector = createPolyglotCurrentnessInspector();
  const exact = exactInspector.inspect(composition);
  assert.strictEqual(exact.status, 'CURRENT_EXACT');
  assert.strictEqual(exact.selectedStagesCurrent, true);
  assert.strictEqual(exact.repositorySnapshotCurrent, true);
  assert.deepStrictEqual(exact.staleStageIndexes, []);
  assert.deepStrictEqual(exact.refreshBlockedStageIndexes, []);
  assert.deepStrictEqual(exact.impactedBoundaryIndexes, []);
  assert.strictEqual(exact.refreshCandidatePossible, true);
  assert.strictEqual(exact.currentnessId.length, 64);
  assert.strictEqual(
    exactInspector.inspect(composition).currentnessId,
    exact.currentnessId,
  );
  assert.strictEqual(exact.verificationExecuted, false);
  assert.strictEqual(exact.automaticReplacement, false);
  assert.strictEqual(
    exact.integrityMeaning,
    'SELF_CONSISTENCY_AND_CURRENT_SOURCE_COMPARISON_NOT_AUTHENTICITY',
  );

  const noRefresh = exactInspector.proposeRefresh(composition);
  assert.strictEqual(noRefresh.status, 'NO_REFRESH_REQUIRED');
  assert.strictEqual(noRefresh.callerAcceptanceRequired, false);
  assert.strictEqual(noRefresh.callerDecisionRequired, false);
  assert.strictEqual(noRefresh.candidateComposition, null);
  assert.strictEqual(noRefresh.previousCompositionPreserved, true);
  assert.strictEqual(noRefresh.refreshProposalId.length, 64);

  const repositoryOnlyRegistry = createOrganRegistryView({}, 'unselected-organ-changed');
  const repositoryOnlyInspector = createPolyglotCurrentnessInspector({
    registry: repositoryOnlyRegistry,
    grammarProfiles: defaultGrammarProfiles,
  });
  const repositoryOnly = repositoryOnlyInspector.inspect(composition);
  assert.strictEqual(
    repositoryOnly.status,
    'SELECTED_STAGES_CURRENT_REPOSITORY_CHANGED_ELSEWHERE',
  );
  assert.strictEqual(repositoryOnly.selectedStagesCurrent, true);
  assert.strictEqual(repositoryOnly.repositorySnapshotCurrent, false);
  assert.deepStrictEqual(repositoryOnly.staleStageIndexes, []);
  assert.strictEqual(
    repositoryOnly.sourceSnapshots.changes.organRegistryChanged,
    true,
  );
  const repositoryOnlyRefresh = repositoryOnlyInspector.proposeRefresh(composition);
  assert.strictEqual(
    repositoryOnlyRefresh.status,
    'REFRESH_CANDIDATE_READY_CALLER_ACCEPTANCE_REQUIRED',
  );
  assert.strictEqual(repositoryOnlyRefresh.candidateDiff.repositorySnapshotOnly, true);
  assert.deepStrictEqual(repositoryOnlyRefresh.candidateDiff.stageDigestChangedIndexes, []);
  assert.notStrictEqual(
    repositoryOnlyRefresh.candidateComposition.compositionId,
    composition.compositionId,
  );
  assert.deepStrictEqual(
    repositoryOnlyRefresh.candidateComposition.sequence,
    composition.sequence,
  );
  assert.deepStrictEqual(
    repositoryOnlyRefresh.candidateComposition.handoffs,
    composition.handoffs,
  );

  const sqlProfile = cloneJson(defaultGrammarProfiles.getByLanguageId('sql'));
  sqlProfile.analysis.semanticHazards = [
    ...sqlProfile.analysis.semanticHazards,
    'synthetic-currentness-test-hazard',
  ];
  sqlProfile.profileSha256 = digest({
    previous: sqlProfile.profileSha256,
    revision: 'synthetic-sql-grammar-v2',
  });
  const sqlGrammarRegistry = createGrammarRegistryView(
    { sql: sqlProfile },
    'sql-grammar-changed',
  );
  const sqlGrammarInspector = createPolyglotCurrentnessInspector({
    registry: defaultRegistry,
    grammarProfiles: sqlGrammarRegistry,
  });
  const sqlGrammarChanged = sqlGrammarInspector.inspect(composition);
  assert.strictEqual(sqlGrammarChanged.status, 'STALE_SELECTED_STAGE_BINDINGS');
  assert.deepStrictEqual(sqlGrammarChanged.staleStageIndexes, [1]);
  assert.deepStrictEqual(sqlGrammarChanged.impactedBoundaryIndexes, [0, 1]);
  assert.deepStrictEqual(sqlGrammarChanged.refreshBlockedStageIndexes, []);
  assert.strictEqual(sqlGrammarChanged.refreshCandidatePossible, true);
  assert.strictEqual(sqlGrammarChanged.stageChecks[1].status, 'GRAMMAR_PROFILE_CHANGED');
  assert.deepStrictEqual(
    sqlGrammarChanged.stageChecks[1].changedFields,
    ['grammarProfileSha256'],
  );

  const sqlRefresh = sqlGrammarInspector.proposeRefresh(composition);
  assert.strictEqual(
    sqlRefresh.status,
    'REFRESH_CANDIDATE_READY_CALLER_ACCEPTANCE_REQUIRED',
  );
  assert.strictEqual(sqlRefresh.callerAcceptanceRequired, true);
  assert.strictEqual(sqlRefresh.automaticReplacement, false);
  assert.deepStrictEqual(sqlRefresh.candidateDiff.stageDigestChangedIndexes, [1]);
  assert.deepStrictEqual(sqlRefresh.candidateDiff.boundaryReviewChangedIndexes, [0, 1]);
  assert.strictEqual(
    sqlRefresh.candidateComposition.layers[1].digests.grammarProfileSha256,
    sqlProfile.profileSha256,
  );
  assert.ok(
    sqlRefresh.candidateComposition.boundaries[0].review.consumerSemanticHazards.includes(
      'synthetic-currentness-test-hazard',
    ),
  );
  assert.ok(
    sqlRefresh.candidateComposition.boundaries[1].review.producerSemanticHazards.includes(
      'synthetic-currentness-test-hazard',
    ),
  );
  assert.strictEqual(
    sqlGrammarInspector.proposeRefresh(composition).refreshProposalId,
    sqlRefresh.refreshProposalId,
  );

  const rustOrgan = cloneJson(defaultRegistry.getByLanguageId('rust'));
  rustOrgan.sha256 = digest({
    previous: rustOrgan.sha256,
    revision: 'synthetic-rust-organ-v2',
  });
  const rustProfile = cloneJson(defaultGrammarProfiles.getByLanguageId('rust'));
  rustProfile.organDigest = rustOrgan.sha256;
  rustProfile.verification.focus = [
    ...rustProfile.verification.focus,
    'synthetic-currentness-test-verifier',
  ];
  rustProfile.profileSha256 = digest({
    previous: rustProfile.profileSha256,
    organDigest: rustProfile.organDigest,
    revision: 'synthetic-rust-grammar-v2',
  });
  const rustInspector = createPolyglotCurrentnessInspector({
    registry: createOrganRegistryView({ rust: rustOrgan }, 'rust-organ-changed'),
    grammarProfiles: createGrammarRegistryView(
      { rust: rustProfile },
      'rust-grammar-changed',
    ),
  });
  const rustChanged = rustInspector.inspect(composition);
  assert.strictEqual(rustChanged.stageChecks[2].status, 'ORGAN_AND_GRAMMAR_CHANGED');
  assert.deepStrictEqual(rustChanged.staleStageIndexes, [2]);
  assert.deepStrictEqual(rustChanged.impactedBoundaryIndexes, [1]);
  assert.strictEqual(rustChanged.refreshCandidatePossible, true);
  const rustRefresh = rustInspector.proposeRefresh(composition);
  assert.deepStrictEqual(rustRefresh.candidateDiff.stageDigestChangedIndexes, [2]);
  assert.deepStrictEqual(rustRefresh.candidateDiff.boundaryReviewChangedIndexes, [1]);

  const pythonOrgan = cloneJson(defaultRegistry.getByLanguageId('python'));
  pythonOrgan.organId = 'code.organ.python.v2.synthetic-test';
  pythonOrgan.sha256 = digest({
    previous: pythonOrgan.sha256,
    organId: pythonOrgan.organId,
  });
  const pythonProfile = cloneJson(defaultGrammarProfiles.getByLanguageId('python'));
  pythonProfile.organId = pythonOrgan.organId;
  pythonProfile.organDigest = pythonOrgan.sha256;
  pythonProfile.profileSha256 = digest({
    previous: pythonProfile.profileSha256,
    organId: pythonProfile.organId,
  });
  const reboundInspector = createPolyglotCurrentnessInspector({
    registry: createOrganRegistryView(
      { python: pythonOrgan },
      'python-language-id-rebound',
    ),
    grammarProfiles: createGrammarRegistryView(
      { python: pythonProfile },
      'python-language-id-rebound-grammar',
    ),
  });
  const rebound = reboundInspector.inspect(composition);
  assert.strictEqual(
    rebound.stageChecks[0].status,
    'LANGUAGE_ID_REBOUND_TO_DIFFERENT_ORGAN',
  );
  assert.deepStrictEqual(rebound.refreshBlockedStageIndexes, [0]);
  assert.strictEqual(rebound.refreshCandidatePossible, false);
  const reboundRefresh = reboundInspector.proposeRefresh(composition);
  assert.strictEqual(
    reboundRefresh.status,
    'REFRESH_HELD_CALLER_DECISION_REQUIRED',
  );
  assert.strictEqual(reboundRefresh.callerDecisionRequired, true);
  assert.strictEqual(reboundRefresh.candidateComposition, null);
  assert.deepStrictEqual(reboundRefresh.holds, [
    {
      stageIndex: 0,
      languageId: 'python',
      status: 'LANGUAGE_ID_REBOUND_TO_DIFFERENT_ORGAN',
    },
  ]);

  const invalidSqlProfile = cloneJson(defaultGrammarProfiles.getByLanguageId('sql'));
  invalidSqlProfile.organDigest = '0'.repeat(64);
  invalidSqlProfile.profileSha256 = digest({
    previous: invalidSqlProfile.profileSha256,
    invalidBinding: true,
  });
  const invalidBindingInspector = createPolyglotCurrentnessInspector({
    registry: defaultRegistry,
    grammarProfiles: createGrammarRegistryView(
      { sql: invalidSqlProfile },
      'invalid-sql-binding',
    ),
  });
  const invalidBinding = invalidBindingInspector.inspect(composition);
  assert.strictEqual(
    invalidBinding.stageChecks[1].status,
    'CURRENT_REGISTRY_BINDING_INVALID',
  );
  assert.deepStrictEqual(invalidBinding.refreshBlockedStageIndexes, [1]);
  assert.strictEqual(
    invalidBindingInspector.proposeRefresh(composition).status,
    'REFRESH_HELD_CALLER_DECISION_REQUIRED',
  );

  const missingRustInspector = createPolyglotCurrentnessInspector({
    registry: createOrganRegistryView({ rust: null }, 'rust-organ-missing'),
    grammarProfiles: createGrammarRegistryView({ rust: null }, 'rust-grammar-missing'),
  });
  const missingRust = missingRustInspector.inspect(composition);
  assert.strictEqual(
    missingRust.stageChecks[2].status,
    'LANGUAGE_AND_GRAMMAR_MISSING',
  );
  assert.deepStrictEqual(missingRust.refreshBlockedStageIndexes, [2]);

  const tampered = cloneJson(composition);
  tampered.layers[1].digests.grammarProfileSha256 = '9'.repeat(64);
  assert.throws(
    () => exactInspector.inspect(tampered),
    /POLYGLOT_COMPOSITION_DIGEST_MISMATCH/,
  );

  const selfDigestedMalformed = cloneJson(composition);
  selfDigestedMalformed.layers.pop();
  delete selfDigestedMalformed.compositionId;
  selfDigestedMalformed.compositionId = digest(selfDigestedMalformed);
  assert.throws(
    () => exactInspector.inspect(selfDigestedMalformed),
    /POLYGLOT_COMPOSITION_LAYER_COUNT_MISMATCH/,
  );

  assert.strictEqual(JSON.stringify(composition), originalCompositionJson);
  console.log('polyglot composition currentness real-body selftest: ok');
}

run();
