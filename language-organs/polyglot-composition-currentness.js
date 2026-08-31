'use strict';

const defaultRegistry = require('./registry.js');
const defaultGrammarProfiles = require('./grammar-profile-registry.js');
const {
  assertRegistrySurface,
  createPolyglotGrammarComposer,
  digest,
  verifyCompositionDigest,
} = require('./polyglot-grammar-composition.js');

const BLOCKING_STAGE_STATUSES = Object.freeze([
  'LANGUAGE_AND_GRAMMAR_MISSING',
  'LANGUAGE_ORGAN_MISSING',
  'GRAMMAR_PROFILE_MISSING',
  'LANGUAGE_ID_REBOUND_TO_DIFFERENT_ORGAN',
  'CURRENT_REGISTRY_BINDING_INVALID',
]);
const BLOCKING_STAGE_STATUS_SET = new Set(BLOCKING_STAGE_STATUSES);

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function validateCompositionStructure(composition) {
  verifyCompositionDigest(composition);

  if (!Array.isArray(composition.sequence)) {
    throw new Error('POLYGLOT_COMPOSITION_SEQUENCE_INVALID');
  }
  if (!Array.isArray(composition.layers)) {
    throw new Error('POLYGLOT_COMPOSITION_LAYERS_INVALID');
  }
  if (!Array.isArray(composition.boundaries)) {
    throw new Error('POLYGLOT_COMPOSITION_BOUNDARIES_INVALID');
  }
  if (!Array.isArray(composition.handoffs)) {
    throw new Error('POLYGLOT_COMPOSITION_HANDOFFS_INVALID');
  }
  if (composition.sequence.length < 2 || new Set(composition.sequence).size < 2) {
    throw new Error('POLYGLOT_COMPOSITION_SEQUENCE_CARDINALITY_INVALID');
  }
  if (composition.layers.length !== composition.sequence.length) {
    throw new Error('POLYGLOT_COMPOSITION_LAYER_COUNT_MISMATCH');
  }
  if (composition.boundaries.length !== Math.max(0, composition.sequence.length - 1)) {
    throw new Error('POLYGLOT_COMPOSITION_BOUNDARY_COUNT_MISMATCH');
  }

  for (let index = 0; index < composition.sequence.length; index += 1) {
    const languageId = composition.sequence[index];
    const layer = composition.layers[index];
    if (typeof languageId !== 'string' || !languageId) {
      throw new Error(`POLYGLOT_COMPOSITION_SEQUENCE_STAGE_INVALID:${index}`);
    }
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
      throw new Error(`POLYGLOT_COMPOSITION_LAYER_INVALID:${index}`);
    }
    if (layer.index !== index) {
      throw new Error(`POLYGLOT_COMPOSITION_LAYER_INDEX_MISMATCH:${index}`);
    }
    if (layer.language?.languageId !== languageId) {
      throw new Error(`POLYGLOT_COMPOSITION_LAYER_LANGUAGE_MISMATCH:${index}`);
    }
    if (typeof layer.language?.organId !== 'string' || !layer.language.organId) {
      throw new Error(`POLYGLOT_COMPOSITION_LAYER_ORGAN_ID_INVALID:${index}`);
    }
    if (typeof layer.digests?.organSha256 !== 'string' || layer.digests.organSha256.length !== 64) {
      throw new Error(`POLYGLOT_COMPOSITION_LAYER_ORGAN_DIGEST_INVALID:${index}`);
    }
    if (
      typeof layer.digests?.grammarProfileSha256 !== 'string' ||
      layer.digests.grammarProfileSha256.length !== 64
    ) {
      throw new Error(`POLYGLOT_COMPOSITION_LAYER_GRAMMAR_DIGEST_INVALID:${index}`);
    }
  }

  for (let index = 0; index < composition.boundaries.length; index += 1) {
    const boundary = composition.boundaries[index];
    if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary)) {
      throw new Error(`POLYGLOT_COMPOSITION_BOUNDARY_INVALID:${index}`);
    }
    if (boundary.boundaryIndex !== index) {
      throw new Error(`POLYGLOT_COMPOSITION_BOUNDARY_INDEX_MISMATCH:${index}`);
    }
    if (boundary.from !== composition.sequence[index]) {
      throw new Error(`POLYGLOT_COMPOSITION_BOUNDARY_FROM_MISMATCH:${index}`);
    }
    if (boundary.to !== composition.sequence[index + 1]) {
      throw new Error(`POLYGLOT_COMPOSITION_BOUNDARY_TO_MISMATCH:${index}`);
    }
  }

  const organSnapshot = composition.sourceSnapshots?.organRegistry;
  const grammarSnapshot = composition.sourceSnapshots?.grammarProfiles;
  if (
    !organSnapshot ||
    !Number.isInteger(organSnapshot.organCount) ||
    typeof organSnapshot.snapshotSha256 !== 'string' ||
    organSnapshot.snapshotSha256.length !== 64
  ) {
    throw new Error('POLYGLOT_COMPOSITION_ORGAN_SNAPSHOT_INVALID');
  }
  if (
    !grammarSnapshot ||
    !Number.isInteger(grammarSnapshot.profileCount) ||
    typeof grammarSnapshot.snapshotSha256 !== 'string' ||
    grammarSnapshot.snapshotSha256.length !== 64
  ) {
    throw new Error('POLYGLOT_COMPOSITION_GRAMMAR_SNAPSHOT_INVALID');
  }

  return true;
}

function currentSourceSnapshots(registry, grammarProfiles) {
  const organSnapshot = registry.snapshot();
  const grammarSnapshot = grammarProfiles.snapshot();
  return {
    organRegistry: {
      organCount: organSnapshot.organCount,
      snapshotSha256: organSnapshot.snapshotSha256,
    },
    grammarProfiles: {
      profileCount: grammarSnapshot.profileCount,
      snapshotSha256: grammarSnapshot.snapshotSha256,
    },
  };
}

function inspectStage(layer, registry, grammarProfiles) {
  const stageIndex = layer.index;
  const languageId = layer.language.languageId;
  const previous = {
    organId: layer.language.organId,
    organSha256: layer.digests.organSha256,
    grammarProfileSha256: layer.digests.grammarProfileSha256,
  };
  const organ = registry.getByLanguageId(languageId);
  const profile = grammarProfiles.getByLanguageId(languageId);
  const current = {
    organId: organ?.organId || null,
    organSha256: organ?.sha256 || null,
    grammarOrganId: profile?.organId || null,
    grammarOrganDigest: profile?.organDigest || null,
    grammarProfileSha256: profile?.profileSha256 || null,
  };

  let status = 'CURRENT';
  const changedFields = [];

  if (!organ && !profile) {
    status = 'LANGUAGE_AND_GRAMMAR_MISSING';
    changedFields.push('organ', 'grammarProfile');
  } else if (!organ) {
    status = 'LANGUAGE_ORGAN_MISSING';
    changedFields.push('organ');
  } else if (!profile) {
    status = 'GRAMMAR_PROFILE_MISSING';
    changedFields.push('grammarProfile');
  } else if (organ.organId !== previous.organId) {
    status = 'LANGUAGE_ID_REBOUND_TO_DIFFERENT_ORGAN';
    changedFields.push('organId');
    if (organ.sha256 !== previous.organSha256) changedFields.push('organSha256');
    if (profile.profileSha256 !== previous.grammarProfileSha256) {
      changedFields.push('grammarProfileSha256');
    }
  } else if (profile.organId !== organ.organId || profile.organDigest !== organ.sha256) {
    status = 'CURRENT_REGISTRY_BINDING_INVALID';
    changedFields.push('currentOrganGrammarBinding');
  } else {
    const organChanged = organ.sha256 !== previous.organSha256;
    const grammarChanged = profile.profileSha256 !== previous.grammarProfileSha256;
    if (organChanged) changedFields.push('organSha256');
    if (grammarChanged) changedFields.push('grammarProfileSha256');
    if (organChanged && grammarChanged) status = 'ORGAN_AND_GRAMMAR_CHANGED';
    else if (organChanged) status = 'ORGAN_CHANGED';
    else if (grammarChanged) status = 'GRAMMAR_PROFILE_CHANGED';
  }

  return {
    stageIndex,
    languageId,
    status,
    selectedStageCurrent: status === 'CURRENT',
    refreshable: !BLOCKING_STAGE_STATUS_SET.has(status),
    changedFields,
    previous,
    current,
  };
}

function adjacentBoundaryIndexes(stageIndexes, stageCount) {
  const boundaries = new Set();
  for (const stageIndex of stageIndexes) {
    if (stageIndex > 0) boundaries.add(stageIndex - 1);
    if (stageIndex < stageCount - 1) boundaries.add(stageIndex);
  }
  return [...boundaries].sort((a, b) => a - b);
}

function compareSourceSnapshots(previous, current) {
  const organRegistryChanged =
    previous.organRegistry.organCount !== current.organRegistry.organCount ||
    previous.organRegistry.snapshotSha256 !== current.organRegistry.snapshotSha256;
  const grammarProfilesChanged =
    previous.grammarProfiles.profileCount !== current.grammarProfiles.profileCount ||
    previous.grammarProfiles.snapshotSha256 !== current.grammarProfiles.snapshotSha256;
  return {
    organRegistryChanged,
    grammarProfilesChanged,
    repositorySnapshotChanged: organRegistryChanged || grammarProfilesChanged,
  };
}

function createPolyglotCurrentnessInspector(options = {}) {
  const registry = options.registry || defaultRegistry;
  const grammarProfiles = options.grammarProfiles || defaultGrammarProfiles;
  assertRegistrySurface(registry, grammarProfiles);
  const composer =
    options.composer || createPolyglotGrammarComposer({ registry, grammarProfiles });

  function inspect(composition) {
    validateCompositionStructure(composition);
    const previousSnapshots = cloneJson(composition.sourceSnapshots);
    const currentSnapshots = currentSourceSnapshots(registry, grammarProfiles);
    const sourceSnapshotChanges = compareSourceSnapshots(previousSnapshots, currentSnapshots);
    const stageChecks = composition.layers.map((layer) =>
      inspectStage(layer, registry, grammarProfiles),
    );
    const staleStageIndexes = stageChecks
      .filter((stage) => !stage.selectedStageCurrent)
      .map((stage) => stage.stageIndex);
    const refreshBlockedStageIndexes = stageChecks
      .filter((stage) => !stage.refreshable)
      .map((stage) => stage.stageIndex);
    const impactedBoundaryIndexes = adjacentBoundaryIndexes(
      staleStageIndexes,
      composition.sequence.length,
    );
    const selectedStagesCurrent = staleStageIndexes.length === 0;
    const repositorySnapshotCurrent = !sourceSnapshotChanges.repositorySnapshotChanged;

    let status = 'CURRENT_EXACT';
    if (!selectedStagesCurrent) status = 'STALE_SELECTED_STAGE_BINDINGS';
    else if (!repositorySnapshotCurrent) {
      status = 'SELECTED_STAGES_CURRENT_REPOSITORY_CHANGED_ELSEWHERE';
    }

    const body = {
      schema: 'axm.polyglot-composition-currentness-report/v1',
      compositionId: composition.compositionId,
      status,
      selectedStagesCurrent,
      repositorySnapshotCurrent,
      staleStageIndexes,
      refreshBlockedStageIndexes,
      impactedBoundaryIndexes,
      refreshCandidatePossible: refreshBlockedStageIndexes.length === 0,
      stageChecks,
      sourceSnapshots: {
        previous: previousSnapshots,
        current: currentSnapshots,
        changes: sourceSnapshotChanges,
      },
      integrityMeaning: 'SELF_CONSISTENCY_AND_CURRENT_SOURCE_COMPARISON_NOT_AUTHENTICITY',
      semanticCompatibilityRevalidated: false,
      verificationExecuted: false,
      workspaceInspected: false,
      toolExecution: false,
      network: false,
      automaticReplacement: false,
      authority: 'NONE',
    };
    return {
      ...body,
      currentnessId: digest(body),
    };
  }

  function proposeRefresh(composition) {
    const currentness = inspect(composition);
    const common = {
      schema: 'axm.polyglot-composition-refresh-proposal/v1',
      previousCompositionId: composition.compositionId,
      currentnessId: currentness.currentnessId,
      staleStageIndexes: [...currentness.staleStageIndexes],
      impactedBoundaryIndexes: [...currentness.impactedBoundaryIndexes],
      refreshBlockedStageIndexes: [...currentness.refreshBlockedStageIndexes],
      previousCompositionPreserved: true,
      automaticReplacement: false,
      candidateExecuted: false,
      verificationExecuted: false,
      workspaceInspected: false,
      toolExecution: false,
      network: false,
      authority: 'NONE',
    };

    if (currentness.status === 'CURRENT_EXACT') {
      const body = {
        ...common,
        status: 'NO_REFRESH_REQUIRED',
        callerAcceptanceRequired: false,
        callerDecisionRequired: false,
        candidateComposition: null,
      };
      return { ...body, refreshProposalId: digest(body) };
    }

    if (!currentness.refreshCandidatePossible) {
      const holds = currentness.stageChecks
        .filter((stage) => !stage.refreshable)
        .map((stage) => ({
          stageIndex: stage.stageIndex,
          languageId: stage.languageId,
          status: stage.status,
        }));
      const body = {
        ...common,
        status: 'REFRESH_HELD_CALLER_DECISION_REQUIRED',
        callerAcceptanceRequired: false,
        callerDecisionRequired: true,
        holds,
        candidateComposition: null,
      };
      return { ...body, refreshProposalId: digest(body) };
    }

    const candidateComposition = composer.compose(composition.sequence, {
      handoffs: cloneJson(composition.handoffs),
    });
    const changedBoundaryReviewIndexes = currentness.impactedBoundaryIndexes.filter(
      (boundaryIndex) =>
        digest(composition.boundaries[boundaryIndex].review) !==
        digest(candidateComposition.boundaries[boundaryIndex].review),
    );
    const body = {
      ...common,
      status: 'REFRESH_CANDIDATE_READY_CALLER_ACCEPTANCE_REQUIRED',
      callerAcceptanceRequired: true,
      callerDecisionRequired: false,
      candidateDiff: {
        compositionIdChanged:
          candidateComposition.compositionId !== composition.compositionId,
        stageDigestChangedIndexes: [...currentness.staleStageIndexes],
        boundaryReviewChangedIndexes: changedBoundaryReviewIndexes,
        repositorySnapshotOnly:
          currentness.staleStageIndexes.length === 0 &&
          !currentness.repositorySnapshotCurrent,
      },
      candidateComposition: cloneJson(candidateComposition),
    };
    return { ...body, refreshProposalId: digest(body) };
  }

  return {
    registry,
    grammarProfiles,
    composer,
    inspect,
    proposeRefresh,
  };
}

module.exports = {
  BLOCKING_STAGE_STATUSES,
  adjacentBoundaryIndexes,
  compareSourceSnapshots,
  createPolyglotCurrentnessInspector,
  currentSourceSnapshots,
  inspectStage,
  validateCompositionStructure,
};
