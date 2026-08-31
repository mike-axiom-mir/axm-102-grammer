'use strict';

const assert = require('assert');
const { createPolyglotGrammarComposer } = require('./polyglot-grammar-composition.js');

function run() {
  const composer = createPolyglotGrammarComposer();
  const languages = composer.listLanguages();

  assert.strictEqual(languages.length, 102);
  assert.strictEqual(new Set(languages.map((item) => item.languageId)).size, 102);
  assert.ok(languages.some((item) => item.languageId === 'python'));
  assert.ok(languages.some((item) => item.languageId === 'sql'));
  assert.ok(languages.some((item) => item.languageId === 'rust'));

  const unresolved = composer.compose(['python', 'sql']);
  assert.deepStrictEqual(unresolved.sequence, ['python', 'sql']);
  assert.strictEqual(unresolved.layers.length, 2);
  assert.strictEqual(unresolved.layers[0].language.languageId, 'python');
  assert.strictEqual(unresolved.layers[1].language.languageId, 'sql');
  assert.strictEqual(unresolved.layers[0].language.organId, 'code.organ.python.v1');
  assert.strictEqual(unresolved.layers[0].digests.organSha256.length, 64);
  assert.strictEqual(unresolved.layers[0].digests.grammarProfileSha256.length, 64);
  assert.ok(unresolved.layers[0].grammar.constructs.includes('function'));
  assert.ok(unresolved.layers[0].analysis.semanticHazards.length > 0);
  assert.ok(unresolved.layers[0].verification.focus.length > 0);
  assert.strictEqual(unresolved.boundaries[0].status, 'missing');
  assert.strictEqual(unresolved.boundaries[0].evidenceState, 'HANDOFF_CONTRACT_MISSING');
  assert.strictEqual(unresolved.boundaries[0].review.verificationExecuted, false);
  assert.strictEqual(unresolved.unresolvedHandoffs.length, 1);
  assert.deepStrictEqual(unresolved.verificationPendingBoundaryIndexes, [0]);
  assert.strictEqual(unresolved.sourceSnapshots.organRegistry.organCount, 102);
  assert.strictEqual(unresolved.sourceSnapshots.grammarProfiles.profileCount, 102);
  assert.strictEqual(unresolved.sourceSnapshots.organRegistry.snapshotSha256.length, 64);
  assert.strictEqual(unresolved.sourceSnapshots.grammarProfiles.snapshotSha256.length, 64);

  const explicit = composer.compose(['python', 'sql'], {
    handoffs: [
      {
        from: 'python',
        to: 'sql',
        kind: 'database-query',
        artifact: 'parameterized SQL statement + bound values',
        producerGuarantees: ['values stay separate from SQL text'],
        consumerAssumptions: ['database driver supports bound values'],
        validation: ['reject unbound placeholders'],
      },
    ],
  });
  assert.strictEqual(explicit.boundaries[0].status, 'defined');
  assert.strictEqual(
    explicit.boundaries[0].evidenceState,
    'DECLARED_VALIDATION_PRESENT_NOT_EXECUTED',
  );
  assert.strictEqual(explicit.unresolvedHandoffs.length, 0);
  assert.deepStrictEqual(explicit.verificationPendingBoundaryIndexes, [0]);
  assert.ok(explicit.boundaries[0].review.producerSemanticHazards.length > 0);
  assert.ok(explicit.boundaries[0].review.consumerSemanticHazards.length > 0);
  assert.ok(explicit.boundaries[0].review.producerVerificationFocus.length > 0);
  assert.ok(explicit.boundaries[0].review.consumerVerificationFocus.length > 0);
  assert.ok(explicit.boundaries[0].review.questionsBeforeChange.length > 0);
  assert.strictEqual(explicit.boundaries[0].review.semanticCompatibilityClaimed, false);
  assert.strictEqual(explicit.boundaries[0].review.interfaceSemanticsInferred, false);

  const declaredButUnverified = composer.compose(['python', 'sql'], {
    handoffs: [
      {
        from: 'python',
        to: 'sql',
        kind: 'database-query',
        artifact: 'query contract',
      },
    ],
  });
  assert.strictEqual(
    declaredButUnverified.boundaries[0].evidenceState,
    'DECLARED_CONTRACT_UNVERIFIED',
  );

  const partial = composer.compose(['python', 'sql'], {
    handoffs: [{ from: 'python', to: 'sql', artifact: 'query request' }],
  });
  assert.strictEqual(partial.boundaries[0].status, 'partial');
  assert.strictEqual(partial.boundaries[0].evidenceState, 'HANDOFF_CONTRACT_PARTIAL');
  assert.strictEqual(partial.unresolvedHandoffs.length, 1);

  const repeated = composer.compose(['python', 'sql', 'python', 'rust']);
  assert.deepStrictEqual(repeated.sequence, ['python', 'sql', 'python', 'rust']);
  assert.strictEqual(repeated.layers.length, 4);
  assert.strictEqual(repeated.layers[2].language.languageId, 'python');
  assert.deepStrictEqual(repeated.verificationPendingBoundaryIndexes, [0, 1, 2]);

  const first = composer.compose(['python', 'sql'], {
    handoffs: [{ from: 'python', to: 'sql', kind: 'file', artifact: 'rows.json' }],
  });
  const second = composer.compose(['python', 'sql'], {
    handoffs: [{ artifact: 'rows.json', kind: 'file', to: 'sql', from: 'python' }],
  });
  assert.strictEqual(first.compositionId, second.compositionId);

  assert.throws(() => composer.compose(['python']), /at least two distinct language ids/);
  assert.throws(() => composer.compose(['python', 'python']), /at least two distinct language ids/);
  assert.throws(() => composer.compose(['python', '', 'sql']), /does not accept blank language ids/);
  assert.throws(() => composer.compose(['python', 'not-a-real-language']), /UNKNOWN_LANGUAGE_ORGAN/);
  assert.throws(
    () =>
      composer.compose(['python', 'sql'], {
        handoffs: [{ from: 'python', to: 'rust', kind: 'file', artifact: 'rows.json' }],
      }),
    /outside this composition/,
  );
  assert.throws(
    () =>
      composer.compose(['python', 'sql', 'python', 'sql'], {
        handoffs: [{ from: 'python', to: 'sql', kind: 'file', artifact: 'rows.json' }],
      }),
    /boundaryIndex is required/,
  );

  const stageSpecific = composer.compose(['python', 'sql', 'python', 'sql'], {
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
  assert.deepStrictEqual(
    stageSpecific.boundaries.map((boundary) => boundary.status),
    ['defined', 'defined', 'defined'],
  );
  assert.deepStrictEqual(
    stageSpecific.handoffs.map((handoff) => handoff.boundaryIndex),
    [0, 1, 2],
  );

  console.log('polyglot grammar composition real-body selftest: ok');
}

run();
