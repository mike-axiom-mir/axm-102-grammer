'use strict';

const assert = require('assert');
const { createPolyglotGrammarComposer } = require('./polyglot-grammar-composition');

function createFixture() {
  const organs = {
    python: {
      slug: 'python',
      label: 'Python',
      family: 'python',
      paradigms: ['imperative', 'object-oriented'],
    },
    sql: {
      slug: 'sql',
      label: 'SQL',
      family: 'query',
      paradigms: ['declarative'],
    },
    rust: {
      slug: 'rust',
      label: 'Rust',
      family: 'c-like',
      paradigms: ['imperative', 'functional'],
    },
  };

  const profiles = Object.fromEntries(
    Object.entries(organs).map(([slug, organ]) => [
      slug,
      {
        family: organ.family,
        grammar: { source: `${slug}-grammar` },
        native: {
          discoveryStance: 'ask-before-tools',
          questionsBeforeTools: [`What must ${slug} produce?`],
          defaultOutputProfile: `${slug}-default`,
          stopRule: `Stop when ${slug} output is sufficient.`,
        },
        keyboardKind: `${slug}-keyboard`,
        keysetIds: [`${slug}:core`],
        quickRefTemplateIds: [`${slug}:quick`],
        creationTemplateIds: [`${slug}:create`],
        specialistEyes: [`${slug}-eye`],
        specialistEyeRefs: [{ familySlug: organ.family, eyeId: `${slug}-eye` }],
        deepEyeIds: [`${slug}:deep`],
        scanOrder: ['grammar', 'runtime'],
      },
    ]),
  );

  const registry = {
    specialistEyes: {},
    bySlug(slug) {
      if (!organs[slug]) throw new Error(`Unknown language: ${slug}`);
      return organs[slug];
    },
    listLanguageSummaries() {
      return Object.values(organs);
    },
  };

  const grammarProfiles = {
    byLanguage(slug) {
      if (!profiles[slug]) throw new Error(`Missing profile: ${slug}`);
      return profiles[slug];
    },
  };

  return { registry, grammarProfiles };
}

function run() {
  const fixture = createFixture();
  const composer = createPolyglotGrammarComposer(fixture);

  const unresolved = composer.compose(['python', 'sql']);
  assert.deepStrictEqual(unresolved.sequence, ['python', 'sql']);
  assert.strictEqual(unresolved.layers.length, 2);
  assert.strictEqual(unresolved.layers[0].language.slug, 'python');
  assert.strictEqual(unresolved.layers[1].language.slug, 'sql');
  assert.strictEqual(unresolved.boundaries[0].status, 'missing');
  assert.strictEqual(unresolved.unresolvedHandoffs.length, 1);
  assert.strictEqual(unresolved.handoffs.length, 0);

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
  assert.strictEqual(explicit.unresolvedHandoffs.length, 0);
  assert.strictEqual(explicit.handoffs[0].kind, 'database-query');

  const partial = composer.compose(['python', 'sql'], {
    handoffs: [{ from: 'python', to: 'sql', artifact: 'query request' }],
  });
  assert.strictEqual(partial.boundaries[0].status, 'partial');
  assert.strictEqual(partial.unresolvedHandoffs.length, 1);
  assert.strictEqual(partial.handoffs[0].kind, null);

  const repeated = composer.compose(['python', 'sql', 'python', 'rust']);
  assert.deepStrictEqual(repeated.sequence, ['python', 'sql', 'python', 'rust']);
  assert.strictEqual(repeated.layers.length, 4);
  assert.strictEqual(repeated.boundaries.length, 3);
  assert.strictEqual(repeated.layers[2].language.slug, 'python');

  const first = composer.compose(['python', 'sql'], {
    handoffs: [{ from: 'python', to: 'sql', kind: 'file', artifact: 'rows.json' }],
  });
  const second = composer.compose(['python', 'sql'], {
    handoffs: [{ artifact: 'rows.json', kind: 'file', to: 'sql', from: 'python' }],
  });
  assert.strictEqual(first.compositionId, second.compositionId);

  assert.throws(
    () => composer.compose(['python']),
    /at least two distinct language ids/,
  );
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

  assert.throws(
    () => composer.compose(['python', 'python']),
    /at least two distinct language ids/,
  );

  assert.throws(
    () => composer.compose(['python', '', 'sql']),
    /does not accept blank language ids/,
  );

  assert.deepStrictEqual(
    composer.listLanguages().map((item) => item.slug),
    ['python', 'sql', 'rust'],
  );

  console.log('polyglot grammar composition selftest: ok');
}

run();
