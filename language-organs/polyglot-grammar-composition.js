'use strict';

const crypto = require('crypto');
const defaultRegistry = require('./registry.js');
const defaultGrammarProfiles = require('./grammar-profile-registry.js');

const POLICY = Object.freeze({
  languageIdentity: 'distinct-organs',
  familyMerge: false,
  implicitInterfaceInference: false,
  sequenceMeaning: 'caller-defined',
  repeatedStagesPreserved: true,
  unresolvedBoundariesStayVisible: true,
  semanticCompatibilityClaimed: false,
  verificationExecution: false,
  capabilityIsNotAuthority: true,
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
  const items = Array.isArray(languageIds) ? languageIds : [languageIds];
  const sequence = items.map((value) => cleanText(value));
  if (sequence.some((languageId) => !languageId)) {
    throw new Error('Polyglot grammar composition does not accept blank language ids.');
  }
  if (sequence.length < 2 || new Set(sequence).size < 2) {
    throw new Error('Polyglot grammar composition requires at least two distinct language ids.');
  }
  return sequence;
}

function findBoundaryIndexes(sequence, from, to) {
  const indexes = [];
  for (let index = 0; index < sequence.length - 1; index += 1) {
    if (sequence[index] === from && sequence[index + 1] === to) indexes.push(index);
  }
  return indexes;
}

function normalizeHandoff(source, members, sequence) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('Each handoff must be an object.');
  }

  const from = cleanText(source.from);
  const to = cleanText(source.to);
  if (!from || !to) {
    throw new Error('Each handoff must declare both from and to language ids.');
  }
  if (!members.has(from) || !members.has(to)) {
    throw new Error(`Handoff ${from} -> ${to} references a language outside this composition.`);
  }

  const matchingBoundaryIndexes = findBoundaryIndexes(sequence, from, to);
  if (!matchingBoundaryIndexes.length) {
    throw new Error(`Handoff ${from} -> ${to} does not match an adjacent sequence boundary.`);
  }

  let boundaryIndex = null;
  if (source.boundaryIndex != null) {
    if (!Number.isInteger(source.boundaryIndex)) {
      throw new TypeError('handoff.boundaryIndex must be an integer when supplied.');
    }
    boundaryIndex = source.boundaryIndex;
    if (!matchingBoundaryIndexes.includes(boundaryIndex)) {
      throw new Error(`Handoff ${from} -> ${to} does not match sequence boundary ${boundaryIndex}.`);
    }
  } else if (matchingBoundaryIndexes.length === 1) {
    [boundaryIndex] = matchingBoundaryIndexes;
  } else {
    throw new Error(
      `Handoff ${from} -> ${to} occurs at multiple sequence boundaries; boundaryIndex is required.`,
    );
  }

  const kind = cleanText(source.kind) || null;
  const artifact = cleanText(source.artifact) || null;

  return {
    from,
    to,
    boundaryIndex,
    kind,
    artifact,
    producerGuarantees: cleanTextList(source.producerGuarantees),
    consumerAssumptions: cleanTextList(source.consumerAssumptions),
    validation: cleanTextList(source.validation),
    notes: cleanTextList(source.notes),
    status: kind && artifact ? 'defined' : 'partial',
  };
}

function assertRegistrySurface(registry, grammarProfiles) {
  for (const name of ['all', 'getByLanguageId', 'snapshot']) {
    if (!registry || typeof registry[name] !== 'function') {
      throw new Error(`POLYGLOT_ORGAN_REGISTRY_SURFACE_MISSING:${name}`);
    }
  }
  for (const name of ['all', 'getByLanguageId', 'snapshot']) {
    if (!grammarProfiles || typeof grammarProfiles[name] !== 'function') {
      throw new Error(`POLYGLOT_GRAMMAR_REGISTRY_SURFACE_MISSING:${name}`);
    }
  }
}

function resolveLanguageLayer({ registry, grammarProfiles, languageId, index }) {
  const organ = registry.getByLanguageId(languageId);
  if (!organ) throw new Error(`UNKNOWN_LANGUAGE_ORGAN:${languageId}`);

  const profile = grammarProfiles.getByLanguageId(languageId);
  if (!profile) throw new Error(`GRAMMAR_PROFILE_MISSING:${languageId}`);
  if (profile.organId !== organ.organId || profile.organDigest !== organ.sha256) {
    throw new Error(`POLYGLOT_GRAMMAR_ORGAN_BINDING_MISMATCH:${languageId}`);
  }

  return {
    index,
    language: {
      languageId: organ.languageId,
      displayName: organ.displayName,
      organId: organ.organId,
      priority: organ.priority,
      family: organ.family,
      kind: organ.kind,
      execution: organ.execution,
    },
    digests: {
      organSha256: organ.sha256,
      grammarProfileSha256: profile.profileSha256,
    },
    toolchainCandidates: [...organ.toolchainCandidates],
    grammar: cloneJson(profile.grammar),
    analysis: cloneJson(profile.analysis),
    rewritePolicy: cloneJson(profile.rewritePolicy),
    verification: cloneJson(profile.verification),
    authority: {
      workspaceRead: false,
      workspaceMutation: false,
      toolExecution: false,
      network: false,
      install: false,
      promotion: false,
      canon: false,
    },
  };
}

function boundaryReview(producerLayer, consumerLayer) {
  return {
    schema: 'axm.polyglot-grammar-boundary-review/v1',
    producerLanguageId: producerLayer.language.languageId,
    consumerLanguageId: consumerLayer.language.languageId,
    producerSemanticHazards: cleanTextList(producerLayer.analysis.semanticHazards),
    consumerSemanticHazards: cleanTextList(consumerLayer.analysis.semanticHazards),
    producerVerificationFocus: cleanTextList(producerLayer.verification.focus),
    consumerVerificationFocus: cleanTextList(consumerLayer.verification.focus),
    questionsBeforeChange: cleanTextList([
      ...(producerLayer.analysis.requiredQuestionsBeforeRewrite || []),
      ...(consumerLayer.analysis.requiredQuestionsBeforeRewrite || []),
    ]),
    semanticCompatibilityClaimed: false,
    interfaceSemanticsInferred: false,
    verificationExecuted: false,
    authority: 'NONE',
  };
}

function describeBoundary(boundaryIndex, producerLayer, consumerLayer, handoffs) {
  const from = producerLayer.language.languageId;
  const to = consumerLayer.language.languageId;
  const matching = handoffs.filter((handoff) => handoff.boundaryIndex === boundaryIndex);
  const review = boundaryReview(producerLayer, consumerLayer);

  if (!matching.length) {
    return {
      boundaryIndex,
      from,
      to,
      status: 'missing',
      reason: 'No explicit handoff contract was supplied for this sequence boundary.',
      handoffIndexes: [],
      evidenceState: 'HANDOFF_CONTRACT_MISSING',
      review,
    };
  }

  const handoffIndexes = matching.map((handoff) => handoffs.indexOf(handoff));
  if (matching.some((handoff) => handoff.status === 'defined')) {
    const hasDeclaredValidation = matching.some((handoff) => handoff.validation.length > 0);
    return {
      boundaryIndex,
      from,
      to,
      status: 'defined',
      reason: null,
      handoffIndexes,
      evidenceState: hasDeclaredValidation
        ? 'DECLARED_VALIDATION_PRESENT_NOT_EXECUTED'
        : 'DECLARED_CONTRACT_UNVERIFIED',
      review,
    };
  }

  return {
    boundaryIndex,
    from,
    to,
    status: 'partial',
    reason: 'A handoff exists, but kind and artifact are not both explicit.',
    handoffIndexes,
    evidenceState: 'HANDOFF_CONTRACT_PARTIAL',
    review,
  };
}

function createPolyglotGrammarComposer(options = {}) {
  const registry = options.registry || defaultRegistry;
  const grammarProfiles = options.grammarProfiles || defaultGrammarProfiles;
  assertRegistrySurface(registry, grammarProfiles);

  function compose(languageIds, composeOptions = {}) {
    const sequence = normalizeLanguageIds(languageIds);
    const members = new Set(sequence);
    const layers = sequence.map((languageId, index) =>
      resolveLanguageLayer({ registry, grammarProfiles, languageId, index }),
    );
    const suppliedHandoffs = Array.isArray(composeOptions.handoffs) ? composeOptions.handoffs : [];
    const handoffs = suppliedHandoffs.map((handoff) =>
      normalizeHandoff(handoff, members, sequence),
    );

    const boundaries = [];
    for (let index = 0; index < sequence.length - 1; index += 1) {
      boundaries.push(describeBoundary(index, layers[index], layers[index + 1], handoffs));
    }

    const organSnapshot = registry.snapshot();
    const grammarSnapshot = grammarProfiles.snapshot();
    const unresolvedHandoffs = boundaries.filter((boundary) => boundary.status !== 'defined');
    const core = {
      schema: 'axm.polyglot-grammar-composition/v1',
      sequence,
      layers,
      handoffs,
      boundaries,
      unresolvedHandoffs,
      verificationPendingBoundaryIndexes: boundaries.map((boundary) => boundary.boundaryIndex),
      sourceSnapshots: {
        organRegistry: {
          organCount: organSnapshot.organCount,
          snapshotSha256: organSnapshot.snapshotSha256,
        },
        grammarProfiles: {
          profileCount: grammarSnapshot.profileCount,
          snapshotSha256: grammarSnapshot.snapshotSha256,
        },
      },
      policy: cloneJson(POLICY),
    };

    return {
      ...core,
      compositionId: digest(core),
    };
  }

  function listLanguages() {
    return registry.all().map((organ) => ({
      languageId: organ.languageId,
      displayName: organ.displayName,
      organId: organ.organId,
      priority: organ.priority,
      family: organ.family,
      kind: organ.kind,
      execution: organ.execution,
      organSha256: organ.sha256,
    }));
  }

  return {
    registry,
    grammarProfiles,
    policy: cloneJson(POLICY),
    compose,
    listLanguages,
  };
}

module.exports = {
  POLICY,
  assertRegistrySurface,
  boundaryReview,
  cleanTextList,
  createPolyglotGrammarComposer,
  digest,
  findBoundaryIndexes,
  normalizeHandoff,
  normalizeLanguageIds,
  stableJson,
};
