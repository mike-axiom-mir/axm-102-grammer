'use strict';

const defaultRegistry = require('./registry.js');
const defaultGrammarProfiles = require('./grammar-profile-registry.js');
const { digest } = require('./polyglot-grammar-composition.js');
const {
  createPolyglotCurrentnessInspector,
} = require('./polyglot-composition-currentness.js');
const { assessEvidence } = require('./polyglot-handoff-evidence.js');

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function buildHoldReasons(currentness, evidence) {
  const holds = [];

  if (!currentness.selectedStagesCurrent) {
    if (currentness.refreshBlockedStageIndexes.length > 0) {
      holds.push({
        code: 'SOURCE_IDENTITY_OR_BINDING_DRIFT',
        stageIndexes: [...currentness.refreshBlockedStageIndexes],
        boundaryIndexes: [...currentness.impactedBoundaryIndexes],
        meaning:
          'At least one selected language source is missing, rebound to a different organ identity, or invalidly bound to its current grammar profile.',
      });
    } else {
      holds.push({
        code: 'SELECTED_STAGE_SOURCE_DRIFT',
        stageIndexes: [...currentness.staleStageIndexes],
        boundaryIndexes: [...currentness.impactedBoundaryIndexes],
        meaning:
          'One or more selected organ or grammar-profile digests changed after this composition was created.',
      });
    }
  }

  if (evidence.overallStatus === 'EVIDENCE_REVIEW_REQUIRED') {
    holds.push({
      code: 'EVIDENCE_REVIEW_REQUIRED',
      rejectedReceiptCount: evidence.rejectedReceiptCount,
      meaning:
        'The submitted evidence set contains rejected, failing, conflicting, or otherwise review-required receipt claims.',
    });
  } else if (evidence.overallStatus !== 'CALLER_PASS_RECEIPTS_COMPLETE_NOT_REPLAYED') {
    holds.push({
      code: 'EVIDENCE_INCOMPLETE',
      meaning:
        'Not every defined language handoff has complete accepted caller PASS receipt coverage.',
    });
  }

  return holds;
}

function buildAdvisories(currentness, evidence, refresh) {
  const advisories = [];

  if (
    currentness.selectedStagesCurrent &&
    !currentness.repositorySnapshotCurrent
  ) {
    advisories.push({
      code: 'REPOSITORY_CHANGED_ELSEWHERE_SELECTED_STAGES_CURRENT',
      meaning:
        'The wider 102-language repository snapshot changed, but every language organ and grammar profile selected by this composition still matches its saved digest.',
    });
  }

  const candidateCompositionId = refresh.candidateComposition?.compositionId || null;
  const refreshChangesComposition =
    candidateCompositionId !== null && candidateCompositionId !== refresh.previousCompositionId;
  if (refreshChangesComposition && evidence.acceptedReceiptCount > 0) {
    advisories.push({
      code: 'REFRESH_WOULD_INVALIDATE_COMPOSITION_BOUND_RECEIPTS',
      acceptedReceiptCount: evidence.acceptedReceiptCount,
      meaning:
        'Accepted evidence receipts are bound to the current compositionId. Accepting this refresh candidate would require explicit receipt reissue or a separately justified carry-forward mechanism. Use the minimal re-verification planner to distinguish local replay work from receipt rebinding work.',
    });
  }

  return advisories;
}

function summarizeRefresh(refresh, evidence) {
  const candidateCompositionId = refresh.candidateComposition?.compositionId || null;
  const compositionIdChanged =
    candidateCompositionId !== null && candidateCompositionId !== refresh.previousCompositionId;

  return {
    refreshProposalId: refresh.refreshProposalId,
    status: refresh.status,
    candidateCompositionId,
    compositionIdChanged,
    staleStageIndexes: [...refresh.staleStageIndexes],
    impactedBoundaryIndexes: [...refresh.impactedBoundaryIndexes],
    refreshBlockedStageIndexes: [...refresh.refreshBlockedStageIndexes],
    callerAcceptanceRequired: refresh.callerAcceptanceRequired,
    callerDecisionRequired: refresh.callerDecisionRequired,
    previousCompositionPreserved: refresh.previousCompositionPreserved,
    acceptedReceiptBindingsWouldNeedReissue:
      compositionIdChanged ? evidence.acceptedReceiptCount : 0,
    minimalReverificationPlannerAvailable:
      refresh.status === 'REFRESH_CANDIDATE_READY_CALLER_ACCEPTANCE_REQUIRED',
    candidateExecuted: false,
    verificationExecuted: false,
    automaticReplacement: false,
  };
}

function createMultiLanguageDecisionGate(options = {}) {
  const registry = options.registry || defaultRegistry;
  const grammarProfiles = options.grammarProfiles || defaultGrammarProfiles;
  const currentnessInspector =
    options.currentnessInspector ||
    createPolyglotCurrentnessInspector({ registry, grammarProfiles });

  function evaluate(composition, suppliedReceipts = []) {
    const currentness = currentnessInspector.inspect(composition);
    const evidence = assessEvidence(composition, suppliedReceipts);
    const refresh = currentnessInspector.proposeRefresh(composition);
    const holdReasons = buildHoldReasons(currentness, evidence);
    const advisories = buildAdvisories(currentness, evidence, refresh);
    const callerDecisionEligible = holdReasons.length === 0;

    let decisionState = 'HELD';
    if (callerDecisionEligible) {
      decisionState = currentness.repositorySnapshotCurrent
        ? 'CALLER_DECISION_READY_CURRENT_RECEIPTS_NOT_REPLAYED'
        : 'CALLER_DECISION_READY_SELECTED_STAGES_CURRENT_REPOSITORY_DRIFT';
    }

    const body = {
      schema: 'axm.multi-language-decision-gate/v1',
      compositionId: composition.compositionId,
      decisionState,
      callerDecisionEligible,
      holdReasons,
      advisories,
      currentness: {
        currentnessId: currentness.currentnessId,
        status: currentness.status,
        selectedStagesCurrent: currentness.selectedStagesCurrent,
        repositorySnapshotCurrent: currentness.repositorySnapshotCurrent,
        staleStageIndexes: [...currentness.staleStageIndexes],
        refreshBlockedStageIndexes: [...currentness.refreshBlockedStageIndexes],
        impactedBoundaryIndexes: [...currentness.impactedBoundaryIndexes],
      },
      evidence: {
        evidenceReportId: evidence.evidenceReportId,
        overallStatus: evidence.overallStatus,
        suppliedReceiptCount: evidence.suppliedReceiptCount,
        acceptedReceiptCount: evidence.acceptedReceiptCount,
        rejectedReceiptCount: evidence.rejectedReceiptCount,
        acceptedResultCounts: cloneJson(evidence.acceptedResultCounts),
        boundaryAssessments: evidence.boundaryAssessments.map((boundary) => ({
          boundaryIndex: boundary.boundaryIndex,
          status: boundary.status,
          acceptedReceiptIds: [...boundary.acceptedReceiptIds],
        })),
      },
      refresh: summarizeRefresh(refresh, evidence),
      truthBoundary: {
        selectedSourceCurrentnessChecked: true,
        evidenceBindingsChecked: true,
        evidenceExecutionReplayed: false,
        externalExecutionReceiptContentInspected: false,
        receiptOriginAuthenticated: false,
        callerClaimsPromotedToFact: false,
        semanticCompatibilityProven: false,
        executionReadinessClaimed: false,
        automaticPromotionAllowed: false,
        automaticRefreshAllowed: false,
        workspaceInspected: false,
        toolExecution: false,
        network: false,
        authority: 'NONE',
      },
    };

    return {
      ...body,
      decisionGateId: digest(body),
    };
  }

  return {
    registry,
    grammarProfiles,
    currentnessInspector,
    evaluate,
  };
}

module.exports = {
  buildAdvisories,
  buildHoldReasons,
  createMultiLanguageDecisionGate,
  summarizeRefresh,
};
