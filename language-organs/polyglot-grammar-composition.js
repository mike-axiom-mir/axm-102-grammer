'use strict';

const crypto = require('crypto');
const path = require('path');

const DATASET_PATH = path.resolve(__dirname, '..', 'languages.json');
const { GrammarProfileRegistry } = require('./grammar-profile-registry');
const { LanguageOrganRegistry } = require('./registry');

const POLICY = Object.freeze({
  languageIdentity: 'distinct-organs',
  familyMerge: false,
  implicitInterfaceInference: false,
  sequenceMeaning: 'caller-defined',
  unresolvedBoundariesStayVisible: true,
});

function cleanText(value) {
  return String(value == null ? '' : value).trim();
}

function cleanTextList(values) {
  const items = Array.isArray(values) ? values : [values];
  return Array.from(new Set(items.map((value) => cleanText(value)).filter(Boolean)));
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function normalizeLanguageIds(languageIds) {
  const ids = cleanTextList(languageIds);
  if (ids.length < 2) {
    throw new Error('Polyglot grammar composition requires at least two distinct language ids.');
  }
  return ids;
}

function normalizeHandoff(source, members) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('Each handoff must be an object.');
  }

  const from = cleanText(source.from);
  const to = cleanText(source.to);
  if (!from || !to) {
    throw new Error('Each handoff must declare both from and to language ids.');
  }
  if (from === to) {
    throw new Error(`Handoff ${from} -> ${to} cannot target the same language organ.`);
  }
  if (!members.has(from) || !members.has(to)) {
    throw new Error(`Handoff ${from} -> ${to} references a language outside this composition.`);
  }

  const kind = cleanText(source.kind) || null;
  const artifact = cleanText(source.artifact) || null;

  return {
    from,
    to,
    kind,
    artifact,
    producerGuarantees: cleanTextList(source.producerGuarantees),
    consumerAssumptions: cleanTextList(source.consumerAssumptions),
    validation: cleanTextList(source.validation),
    notes: cleanTextList(source.notes),
    status: kind && artifact ? 'defined' : 'partial',
  };
}

function resolveLanguageLayer({ registry, grammarProfiles, slug, index }) {
  const organ = registry.bySlug(slug);
  const profile = grammarProfiles.byLanguage(slug);
  const native = profile.native && typeof profile.native === 'object' ? profile.native : {};

  return {
    index,
    language: {
      slug: organ.slug,
      label: organ.label,
      family: profile.family || organ.family,
      paradigms: Array.isArray(organ.paradigms) ? organ.paradigms.slice() : [],
    },
    grammar: cloneJson(profile.grammar),
    native: {
      discoveryStance: cleanText(native.discoveryStance) || null,
      questionsBeforeTools: cleanTextList(native.questionsBeforeTools),
      defaultOutputProfile: cleanText(native.defaultOutputProfile) || null,
      stopRule: cleanText(native.stopRule) || null,
    },
    keyboardKind: cleanText(profile.keyboardKind) || null,
    keysetIds: cleanTextList(profile.keysetIds),
    quickRefTemplateIds: cleanTextList(profile.quickRefTemplateIds),
    creationTemplateIds: cleanTextList(profile.creationTemplateIds),
    specialistEyes: cleanTextList(profile.specialistEyes),
    specialistEyeRefs: cloneJson(profile.specialistEyeRefs || []),
    deepEyeIds: cleanTextList(profile.deepEyeIds),
    scanOrder: cleanTextList(profile.scanOrder),
  };
}

function describeBoundary(from, to, handoffs) {
  const matching = handoffs.filter((handoff) => handoff.from === from && handoff.to === to);
  if (!matching.length) {
    return {
      from,
      to,
      status: 'missing',
      reason: 'No explicit handoff contract was supplied for this sequence boundary.',
      handoffIndexes: [],
    };
  }

  const handoffIndexes = matching.map((handoff) => handoffs.indexOf(handoff));
  if (matching.some((handoff) => handoff.status === 'defined')) {
    return {
      from,
      to,
      status: 'defined',
      reason: null,
      handoffIndexes,
    };
  }

  return {
    from,
    to,
    status: 'partial',
    reason: 'A handoff exists, but kind and artifact are not both explicit.',
    handoffIndexes,
  };
}

function createPolyglotGrammarComposer(options = {}) {
  const datasetPath = options.datasetPath || DATASET_PATH;
  const registry = options.registry || new LanguageOrganRegistry({ datasetPath });
  const grammarProfiles =
    options.grammarProfiles ||
    new GrammarProfileRegistry({
      registry,
      specialistEyes: registry.specialistEyes,
    });

  function compose(languageIds, composeOptions = {}) {
    const sequence = normalizeLanguageIds(languageIds);
    const members = new Set(sequence);
    const layers = sequence.map((slug, index) =>
      resolveLanguageLayer({ registry, grammarProfiles, slug, index }),
    );
    const suppliedHandoffs = Array.isArray(composeOptions.handoffs) ? composeOptions.handoffs : [];
    const handoffs = suppliedHandoffs.map((handoff) => normalizeHandoff(handoff, members));

    const boundaries = [];
    for (let index = 0; index < sequence.length - 1; index += 1) {
      boundaries.push(describeBoundary(sequence[index], sequence[index + 1], handoffs));
    }

    const unresolvedHandoffs = boundaries.filter((boundary) => boundary.status !== 'defined');
    const core = {
      schema: 'axm.polyglot-grammar-composition/v1',
      sequence,
      layers,
      handoffs,
      boundaries,
      unresolvedHandoffs,
      policy: cloneJson(POLICY),
    };

    return {
      ...core,
      compositionId: digest(core),
    };
  }

  function listLanguages() {
    return registry.listLanguageSummaries().map((summary) => ({
      slug: summary.slug,
      label: summary.label,
      family: summary.family,
      paradigms: Array.isArray(summary.paradigms) ? summary.paradigms.slice() : [],
    }));
  }

  return {
    datasetPath,
    registry,
    grammarProfiles,
    policy: cloneJson(POLICY),
    compose,
    listLanguages,
  };
}

module.exports = {
  DATASET_PATH,
  POLICY,
  cleanTextList,
  createPolyglotGrammarComposer,
  digest,
  normalizeHandoff,
  normalizeLanguageIds,
  stableJson,
};
