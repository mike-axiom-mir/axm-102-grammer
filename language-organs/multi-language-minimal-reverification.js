'use strict';

const defaultRegistry = require('./registry.js');
const defaultGrammarProfiles = require('./grammar-profile-registry.js');
const { digest } = require('./polyglot-grammar-composition.js');
const {
  createPolyglotCurrentnessInspector,
} = require('./polyglot-composition-currentness.js');
const {
  assessEvidence,
  createHandoffContract,
  validateCompositionForEvidence,
} = require('./polyglot-handoff-evidence.js');

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stageLocalIdentity(layer) {
  return {
    stageIndex: layer.index,
    languageId: layer.language.languageId,
    organId: layer.language.organId,
    organSha256: layer.digests.organSha256,
    grammarProfileSha256: layer.digests.grammarProfileSha256,
  };
}

function createLocalHandoffFingerprint(composition, handoffIndex) {
  validateCompositionForEvidence(composition);
  const contract = createHandoffContract(composition, handoffIndex);
  const producerLayer = composition.layers[contract.boundaryIndex];
  const consumerLayer = composition.layers[contract.boundaryIndex + 1];
  const body = {
    schema: 'axm.multi-language-local-handoff-fingerprint/v1',
    boundaryIndex: contract.boundaryIndex,
    handoffIndex,
    handoff: cloneJson(contract.handoff),
    producer: stageLocalIdentity(producerLayer),
    consumer: stageLocalIdentity(consumerLayer),
    repositorySnapshotExcluded: true,
    compositionIdExcluded: true,
    semanticCompatibilityClaimed: false,
    authority: 'NONE',
  };
  return {
    ...body,
    localHandoffFingerprintId: digest(body),
  };
}

function compareLocalHandoff(previousComposition, candidateComposition, handoffIndex) {
  const previous = createLocalHandoffFingerprint(previousComposition, handoffIndex);
  const candidate = createLocalHandoffFingerprint(candidateComposition, handoffIndex);
  const declarationChanged = digest(previous.handoff) !== digest(candidate.handoff);
  const producerOrganChanged =
    previous.producer.organId !== candidate.producer.organId ||
    previous.producer.organSha256 !== candidate.producer.organSha256;
  const producerGrammarChanged =
    previous.producer.grammarProfileSha256 !== candidate.producer.grammarProfileSha256;
  const consumerOrganChanged =
    previous.consumer.organId !== candidate.consumer.organId ||
    previous.consumer.organSha256 !== candidate.consumer.organSha256;
  const consumerGrammarChanged =
    previous.consumer.grammarProfileSha256 !== candidate.consumer.grammarProfileSha256;
  const stagePlacementChanged =
    previous.boundaryIndex !== candidate.boundaryIndex ||
    previous.handoffIndex !== candidate.handoffIndex ||
    previous.producer.stageIndex !== candidate.producer.stageIndex ||
    previous.consumer.stageIndex !== candidate.consumer.stageIndex;
  const languageEndpointsChanged =
    previous.producer.languageId !== candidate.producer.languageId ||
    previous.consumer.languageId !== candidate.consumer.languageId;
  const localEquivalent =
    previous.localHandoffFingerprintId === candidate.localHandoffFingerprintId;

  return {
    handoffIndex,
    boundaryIndex: candidate.boundaryIndex,
    from: candidate.producer.languageId,
    to: candidate.consumer.languageId,
    localEquivalent,
    previousLocalHandoffFingerprintId: previous.localHandoffFingerprintId,
    candidateLocalHandoffFingerprintId: candidate.localHandoffFingerprintId,
    changes: {
      declarationChanged,
      producerOrganChanged,
      producerGrammarChanged,
      consumerOrganChanged,
      consumerGrammarChanged,
      stagePlacementChanged,
      languageEndpointsChanged,
    },
  };
}

function assertRefreshStructurePreserved(previousComposition, candidateComposition) {
  validateCompositionForEvidence(previousComposition);
  validateCompositionForEvidence(candidateComposition);

  if (previousComposition.sequence.length !== candidateComposition.sequence.length) {
    throw new Error('MULTI_LANGUAGE_REVERIFY_SEQUENCE_LENGTH_CHANGED');
  }
  for (let index = 0; index < previousComposition.sequence.length; index += 1) {
    if (previousComposition.sequence[index] !== candidateComposition.sequence[index]) {
      throw new Error(`MULTI_LANGUAGE_REVERIFY_SEQUENCE_CHANGED:${index}`);
    }
  }
  if (previousComposition.handoffs.length !== candidateComposition.handoffs.length) {
    throw new Error('MULTI_LANGUAGE_REVERIFY_HANDOFF_COUNT_CHANGED');
  }
  for (let index = 0; index < previousComposition.handoffs.length; index += 1) {
    const previous = previousComposition.handoffs[index];
    const candidate = candidateComposition.handoffs[index];
    if (
      previous.boundaryIndex !== candidate.boundaryIndex ||
      previous.from !== candidate.from ||
      previous.to !== candidate.to
    ) {
      throw new Error(`MULTI_LANGUAGE_REVERIFY_HANDOFF_PLACEMENT_CHANGED:${index}`);
    }
    if (previous.status !== candidate.status) {
      throw new Error(`MULTI_LANGUAGE_REVERIFY_HANDOFF_STATUS_CHANGED:${index}`);
    }
  }
  return true;
}

function acceptedPassReceiptIdsByHandoff(evidence) {
  const byHandoff = new Map();
  for (const receipt of evidence.acceptedReceipts) {
    if (receipt.evidence.claimedResult !== 'PASS') continue;
    const ids = byHandoff.get(receipt.handoffIndex) || [];
    ids.push(receipt.receiptId);
    byHandoff.set(receipt.handoffIndex, ids);
  }
  for (const ids of byHandoff.values()) ids.sort();
  return byHandoff;
}

function planCandidateReverification(previousComposition, candidateComposition, evidence) {
  assertRefreshStructurePreserved(previousComposition, candidateComposition);
  const passReceiptIdsByHandoff = acceptedPassReceiptIdsByHandoff(evidence);
  const handoffPlans = [];

  for (let handoffIndex = 0; handoffIndex < candidateComposition.handoffs.length; handoffIndex += 1) {
    const candidateHandoff = candidateComposition.handoffs[handoffIndex];
    const acceptedPassReceiptIds = passReceiptIdsByHandoff.get(handoffIndex) || [];

    if (candidateHandoff.status !== 'defined') {
      handoffPlans.push({
        handoffIndex,
        boundaryIndex: candidateHandoff.boundaryIndex,
        from: candidateHandoff.from,
        to: candidateHandoff.to,
        status: 'CONTRACT_COMPLETION_REQUIRED',
        localEquivalent: null,
        acceptedPassReceiptIds,
        grammarDeltaReplayRecommendation: 'NOT_APPLICABLE_CONTRACT_INCOMPLETE',
        candidateReceiptBindingRequired: false,
        automaticReceiptCarryForwardAllowed: false,
        externalVerifierPolicyChecked: false,
        comparison: null,
      });
      continue;
    }

    const comparison = compareLocalHandoff(
      previousComposition,
      candidateComposition,
      handoffIndex,
    );
    const status = comparison.localEquivalent
      ? 'LOCAL_HANDOFF_UNCHANGED_NEW_RECEIPT_BINDING_REQUIRED'
      : 'LOCAL_HANDOFF_CHANGED_REVERIFICATION_RECOMMENDED';
    handoffPlans.push({
      handoffIndex,
      boundaryIndex: candidateHandoff.boundaryIndex,
      from: candidateHandoff.from,
      to: candidateHandoff.to,
      status,
      localEquivalent: comparison.localEquivalent,
      acceptedPassReceiptIds,
      grammarDeltaReplayRecommendation: comparison.localEquivalent
        ? 'NO_REPLAY_SIGNAL_FROM_LOCAL_GRAMMAR_DELTA'
        : 'REPLAY_RECOMMENDED_DUE_LOCAL_GRAMMAR_OR_CONTRACT_DELTA',
      candidateReceiptBindingRequired: true,
      automaticReceiptCarryForwardAllowed: false,
      externalVerifierPolicyChecked: false,
      comparison,
    });
  }

  const replayRecommendedHandoffIndexes = handoffPlans
    .filter((plan) => plan.status === 'LOCAL_HANDOFF_CHANGED_REVERIFICATION_RECOMMENDED')
    .map((plan) => plan.handoffIndex);
  const rebindOnlyCandidateHandoffIndexes = handoffPlans
    .filter((plan) => plan.status === 'LOCAL_HANDOFF_UNCHANGED_NEW_RECEIPT_BINDING_REQUIRED')
    .map((plan) => plan.handoffIndex);
  const contractCompletionHandoffIndexes = handoffPlans
    .filter((plan) => plan.status === 'CONTRACT_COMPLETION_REQUIRED')
    .map((plan) => plan.handoffIndex);
  const potentialReplaySavingsHandoffIndexes = handoffPlans
    .filter(
      (plan) =>
        plan.status === 'LOCAL_HANDOFF_UNCHANGED_NEW_RECEIPT_BINDING_REQUIRED' &&
        plan.acceptedPassReceiptIds.length > 0,
    )
    .map((plan) => plan.handoffIndex);
  const noPriorPassCoverageHandoffIndexes = handoffPlans
    .filter(
      (plan) =>
        plan.status !== 'CONTRACT_COMPLETION_REQUIRED' &&
        plan.acceptedPassReceiptIds.length === 0,
    )
    .map((plan) => plan.handoffIndex);

  let planState = 'PARTIAL_LOCAL_REVERIFICATION_RECOMMENDED';
  if (contractCompletionHandoffIndexes.length > 0) {
    planState = 'CONTRACT_COMPLETION_REQUIRED_BEFORE_COMPLETE_EVIDENCE';
  } else if (replayRecommendedHandoffIndexes.length === 0) {
    planState = 'LOCAL_HANDOFFS_UNCHANGED_RECEIPT_REBIND_REVIEW_ONLY';
  } else if (rebindOnlyCandidateHandoffIndexes.length === 0) {
    planState = 'ALL_DEFINED_HANDOFFS_LOCALLY_CHANGED_REVERIFICATION_RECOMMENDED';
  }

  return {
    planState,
    handoffPlans,
    replayRecommendedHandoffIndexes,
    rebindOnlyCandidateHandoffIndexes,
    contractCompletionHandoffIndexes,
    potentialReplaySavingsHandoffIndexes,
    noPriorPassCoverageHandoffIndexes,
  };
}

function createMinimalReverificationPlanner(options = {}) {
  const registry = options.registry || defaultRegistry;
  const grammarProfiles = options.grammarProfiles || defaultGrammarProfiles;
  const currentnessInspector =
    options.currentnessInspector ||
    createPolyglotCurrentnessInspector({ registry, grammarProfiles });

  function plan(composition, suppliedReceipts = []) {
    validateCompositionForEvidence(composition);
    const currentness = currentnessInspector.inspect(composition);
    const evidence = assessEvidence(composition, suppliedReceipts);
    const refresh = currentnessInspector.proposeRefresh(composition);
    const acceptedPassReceiptCount = evidence.acceptedReceipts.filter(
      (receipt) => receipt.evidence.claimedResult === 'PASS',
    ).length;

    const common = {
      schema: 'axm.multi-language-minimal-reverification-plan/v1',
      previousCompositionId: composition.compositionId,
      currentnessId: currentness.currentnessId,
      evidenceReportId: evidence.evidenceReportId,
      refreshProposalId: refresh.refreshProposalId,
      currentnessStatus: currentness.status,
      evidenceStatus: evidence.overallStatus,
      acceptedPassReceiptCount,
      previousCompositionPreserved: true,
    };

    if (refresh.status === 'NO_REFRESH_REQUIRED') {
      const body = {
        ...common,
        planState: 'NO_REFRESH_REQUIRED',
        candidateCompositionId: null,
        compositionIdChanged: false,
        handoffPlans: [],
        replayRecommendedHandoffIndexes: [],
        rebindOnlyCandidateHandoffIndexes: [],
        contractCompletionHandoffIndexes: [],
        potentialReplaySavingsHandoffIndexes: [],
        noPriorPassCoverageHandoffIndexes: [],
        acceptedOldReceiptBindingsInvalidOnCandidate: 0,
        truthBoundary: {
          localEquivalenceChecked: false,
          externalVerifierPolicyChecked: false,
          verifierReplayExecuted: false,
          externalExecutionReceiptContentInspected: false,
          receiptReissued: false,
          automaticReceiptCarryForwardAllowed: false,
          semanticCompatibilityProven: false,
          executionReadinessClaimed: false,
          workspaceInspected: false,
          toolExecution: false,
          network: false,
          authority: 'NONE',
        },
      };
      return { ...body, reverificationPlanId: digest(body) };
    }

    if (!refresh.candidateComposition) {
      const body = {
        ...common,
        planState: 'REFRESH_HELD_NO_CANDIDATE',
        candidateCompositionId: null,
        compositionIdChanged: false,
        refreshBlockedStageIndexes: [...refresh.refreshBlockedStageIndexes],
        handoffPlans: [],
        replayRecommendedHandoffIndexes: [],
        rebindOnlyCandidateHandoffIndexes: [],
        contractCompletionHandoffIndexes: [],
        potentialReplaySavingsHandoffIndexes: [],
        noPriorPassCoverageHandoffIndexes: [],
        acceptedOldReceiptBindingsInvalidOnCandidate: 0,
        truthBoundary: {
          localEquivalenceChecked: false,
          externalVerifierPolicyChecked: false,
          verifierReplayExecuted: false,
          externalExecutionReceiptContentInspected: false,
          receiptReissued: false,
          automaticReceiptCarryForwardAllowed: false,
          semanticCompatibilityProven: false,
          executionReadinessClaimed: false,
          workspaceInspected: false,
          toolExecution: false,
          network: false,
          authority: 'NONE',
        },
      };
      return { ...body, reverificationPlanId: digest(body) };
    }

    const candidateComposition = refresh.candidateComposition;
    const comparisonPlan = planCandidateReverification(
      composition,
      candidateComposition,
      evidence,
    );
    const compositionIdChanged =
      candidateComposition.compositionId !== composition.compositionId;
    const body = {
      ...common,
      planState: comparisonPlan.planState,
      candidateCompositionId: candidateComposition.compositionId,
      compositionIdChanged,
      staleStageIndexes: [...refresh.staleStageIndexes],
      impactedBoundaryIndexes: [...refresh.impactedBoundaryIndexes],
      handoffPlans: comparisonPlan.handoffPlans,
      replayRecommendedHandoffIndexes:
        comparisonPlan.replayRecommendedHandoffIndexes,
      rebindOnlyCandidateHandoffIndexes:
        comparisonPlan.rebindOnlyCandidateHandoffIndexes,
      contractCompletionHandoffIndexes:
        comparisonPlan.contractCompletionHandoffIndexes,
      potentialReplaySavingsHandoffIndexes:
        comparisonPlan.potentialReplaySavingsHandoffIndexes,
      noPriorPassCoverageHandoffIndexes:
        comparisonPlan.noPriorPassCoverageHandoffIndexes,
      acceptedOldReceiptBindingsInvalidOnCandidate: compositionIdChanged
        ? evidence.acceptedReceiptCount
        : 0,
      costSignal: {
        handoffCount: candidateComposition.handoffs.length,
        localReplayRecommendedCount:
          comparisonPlan.replayRecommendedHandoffIndexes.length,
        localReplayNotIndicatedCount:
          comparisonPlan.rebindOnlyCandidateHandoffIndexes.length,
        potentialReplaySavingsCount:
          comparisonPlan.potentialReplaySavingsHandoffIndexes.length,
        receiptBindingsNeedingNewCandidateBinding: compositionIdChanged
          ? evidence.acceptedReceiptCount
          : 0,
        computeCostEstimated: false,
        memoryCostEstimated: false,
      },
      truthBoundary: {
        localEquivalenceChecked: true,
        localEquivalenceMeaning:
          'SAME_HANDOFF_DECLARATION_AND_SAME_PRODUCER_CONSUMER_ORGAN_AND_GRAMMAR_DIGESTS_AT_THE_SAME_STAGE_BOUNDARY',
        localEquivalenceIsSemanticProof: false,
        externalVerifierPolicyChecked: false,
        verifierReplayExecuted: false,
        externalExecutionReceiptContentInspected: false,
        receiptReissued: false,
        automaticReceiptCarryForwardAllowed: false,
        semanticCompatibilityProven: false,
        executionReadinessClaimed: false,
        workspaceInspected: false,
        toolExecution: false,
        network: false,
        authority: 'NONE',
      },
    };

    return {
      ...body,
      reverificationPlanId: digest(body),
    };
  }

  return {
    registry,
    grammarProfiles,
    currentnessInspector,
    plan,
  };
}

module.exports = {
  acceptedPassReceiptIdsByHandoff,
  assertRefreshStructurePreserved,
  compareLocalHandoff,
  createLocalHandoffFingerprint,
  createMinimalReverificationPlanner,
  planCandidateReverification,
  stageLocalIdentity,
};
