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
const {
  createMultiLanguageDecisionGate,
} = require('./multi-language-decision-gate.js');
const {
  createMinimalReverificationPlanner,
} = require('./multi-language-minimal-reverification.js');

const COUNT_BUDGET_FIELDS = Object.freeze([
  'maxTotalWorkItems',
  'maxVerifierRuns',
  'maxReceiptReissueReviews',
  'maxContractCompletions',
  'maxEvidenceReviews',
]);

const TASK_PHASE_RANK = Object.freeze({
  CONTRACT: 0,
  EVIDENCE_REVIEW: 1,
  VERIFY: 2,
  RECEIPT_REISSUE_REVIEW: 3,
});

const TASK_PHASE_FOR_TYPE = Object.freeze({
  DECLARE_HANDOFF_CONTRACT: 'CONTRACT',
  COMPLETE_HANDOFF_CONTRACT: 'CONTRACT',
  RESOLVE_EVIDENCE_REVIEW: 'EVIDENCE_REVIEW',
  REVIEW_REJECTED_RECEIPTS: 'EVIDENCE_REVIEW',
  RUN_VERIFIER_AND_ISSUE_RECEIPT: 'VERIFY',
  REISSUE_OR_REPLAY_POLICY_REVIEW: 'RECEIPT_REISSUE_REVIEW',
});

const WORK_ITEM_KEYS = Object.freeze([
  'schema',
  'taskType',
  'phase',
  'previousCompositionId',
  'targetCompositionId',
  'targetIsRefreshCandidate',
  'boundaryIndex',
  'handoffIndex',
  'from',
  'to',
  'targetBinding',
  'sourceEvidence',
  'requestedOutcome',
  'budgetUnits',
  'dependsOnWorkItemIds',
  'executionConstraints',
  'authority',
  'workItemId',
]);

const WORKPACK_KEYS = Object.freeze([
  'schema',
  'previousCompositionId',
  'targetCompositionId',
  'targetIsRefreshCandidate',
  'targetComposition',
  'decisionGate',
  'reverification',
  'evidence',
  'state',
  'callerDispatchEligible',
  'workItems',
  'phases',
  'counts',
  'countBudget',
  'budgetAssessment',
  'truthBoundary',
  'workpackId',
]);

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cleanText(value) {
  return String(value == null ? '' : value).trim();
}

function assertExactKeys(value, expectedKeys, errorCode) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(errorCode);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${errorCode}_KEYS`);
  }
}

function isSortedUniqueStrings(values) {
  return (
    Array.isArray(values) &&
    values.every((value) => typeof value === 'string') &&
    values.every((value, index) => index === 0 || values[index - 1] < value)
  );
}

function isSortedUniqueIntegers(values) {
  return (
    Array.isArray(values) &&
    values.every((value) => Number.isSafeInteger(value) && value >= 0) &&
    values.every((value, index) => index === 0 || values[index - 1] < value)
  );
}

function isEvidenceReviewStatus(status) {
  return (
    status === 'CONFLICTING_CALLER_RESULTS' ||
    status === 'HANDOFF_CONTRACT_BINDING_INVALID' ||
    status.startsWith('CALLER_FAIL') ||
    status === 'CALLER_PASS_AND_INCONCLUSIVE_RECEIPTS_PRESENT_NOT_REPLAYED'
  );
}

function expectedExecutionConstraints() {
  return {
    commandInferred: false,
    toolInferred: false,
    verifierSelected: false,
    concurrencyInferred: false,
    executionOrderInferred: false,
    workspaceInspected: false,
    networkUsed: false,
  };
}

function expectedWorkItemAuthority() {
  return {
    dispatch: false,
    toolExecution: false,
    workspaceMutation: false,
    receiptPromotion: false,
    refreshAcceptance: false,
    canon: false,
  };
}

function expectedWorkpackTruthBoundary(workItemCount) {
  return {
    workItemsAreDeterministicInstructionsNotExecution: true,
    commandsInferred: false,
    toolsSelected: false,
    concurrencyInferred: false,
    executionOrderInferred: false,
    verifierReplayExecuted: false,
    receiptReissued: false,
    externalVerifierPolicyChecked: false,
    computeCostEstimated: false,
    memoryCostEstimated: false,
    callerDispatchRequired: workItemCount > 0,
    automaticDispatchAllowed: false,
    automaticRefreshAcceptanceAllowed: false,
    automaticReceiptCarryForwardAllowed: false,
    semanticCompatibilityProven: false,
    executionReadinessClaimed: false,
    authority: 'NONE',
  };
}

function normalizeOptionalCount(value, fieldName) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`MULTI_LANGUAGE_WORKPACK_COUNT_BUDGET_INVALID:${fieldName}`);
  }
  return value;
}

function normalizeCountBudget(source = {}) {
  if (source == null) source = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('MULTI_LANGUAGE_WORKPACK_COUNT_BUDGET_NOT_OBJECT');
  }
  const unknown = Object.keys(source).filter((key) => !COUNT_BUDGET_FIELDS.includes(key));
  if (unknown.length) {
    throw new Error(`MULTI_LANGUAGE_WORKPACK_COUNT_BUDGET_UNKNOWN_FIELD:${unknown.sort()[0]}`);
  }
  return Object.fromEntries(
    COUNT_BUDGET_FIELDS.map((field) => [field, normalizeOptionalCount(source[field], field)]),
  );
}

function budgetUnitsForTask(taskType) {
  const units = {
    verifierRuns: 0,
    receiptReissueReviews: 0,
    contractCompletions: 0,
    evidenceReviews: 0,
  };
  if (taskType === 'RUN_VERIFIER_AND_ISSUE_RECEIPT') units.verifierRuns = 1;
  else if (taskType === 'REISSUE_OR_REPLAY_POLICY_REVIEW') units.receiptReissueReviews = 1;
  else if (
    taskType === 'DECLARE_HANDOFF_CONTRACT' ||
    taskType === 'COMPLETE_HANDOFF_CONTRACT'
  ) {
    units.contractCompletions = 1;
  } else if (
    taskType === 'RESOLVE_EVIDENCE_REVIEW' ||
    taskType === 'REVIEW_REJECTED_RECEIPTS'
  ) {
    units.evidenceReviews = 1;
  }
  return units;
}

function expectedOutcomeForTask(taskType, contractId) {
  if (taskType === 'RUN_VERIFIER_AND_ISSUE_RECEIPT') {
    return {
      outcomeKind: 'CANDIDATE_BOUND_HANDOFF_EVIDENCE_RECEIPT',
      requiredSchema: 'axm.polyglot-handoff-evidence-receipt/v1',
      targetContractId: contractId,
      acceptedClaimedResults: ['PASS', 'FAIL', 'INCONCLUSIVE'],
      verifierReplayMayBeRequired: true,
      externalPolicyDecisionRequired: false,
    };
  }
  if (taskType === 'REISSUE_OR_REPLAY_POLICY_REVIEW') {
    return {
      outcomeKind: 'EXTERNAL_REISSUE_OR_REPLAY_DECISION',
      requiredSchema: null,
      targetContractId: contractId,
      acceptedClaimedResults: ['PASS', 'FAIL', 'INCONCLUSIVE'],
      verifierReplayMayBeRequired: null,
      externalPolicyDecisionRequired: true,
    };
  }
  if (
    taskType === 'DECLARE_HANDOFF_CONTRACT' ||
    taskType === 'COMPLETE_HANDOFF_CONTRACT'
  ) {
    return {
      outcomeKind: 'UPDATED_EXPLICIT_HANDOFF_DECLARATION',
      requiredSchema: 'axm.polyglot-grammar-composition/v1',
      targetContractId: null,
      acceptedClaimedResults: [],
      verifierReplayMayBeRequired: false,
      externalPolicyDecisionRequired: false,
    };
  }
  return {
    outcomeKind: 'CORRECTED_OR_EXPLICITLY_HELD_EVIDENCE_SET',
    requiredSchema: 'axm.polyglot-handoff-evidence-receipt/v1',
    targetContractId: contractId,
    acceptedClaimedResults: ['PASS', 'FAIL', 'INCONCLUSIVE'],
    verifierReplayMayBeRequired: null,
    externalPolicyDecisionRequired: true,
  };
}

function targetBindingFor(composition, boundaryIndex, handoffIndex) {
  const boundary = Number.isInteger(boundaryIndex)
    ? composition.boundaries[boundaryIndex] || null
    : null;
  const handoff = Number.isInteger(handoffIndex)
    ? composition.handoffs[handoffIndex] || null
    : null;
  let contractId = null;
  if (handoff && handoff.status === 'defined') {
    contractId = createHandoffContract(composition, handoffIndex).contractId;
  }
  return {
    compositionId: composition.compositionId,
    boundaryIndex: Number.isInteger(boundaryIndex) ? boundaryIndex : null,
    handoffIndex: Number.isInteger(handoffIndex) ? handoffIndex : null,
    contractId,
    boundaryDigest: boundary ? digest(boundary) : null,
    handoffDigest: handoff ? digest(handoff) : null,
  };
}

function createWorkItem({
  taskType,
  phase,
  previousCompositionId,
  targetComposition,
  targetIsRefreshCandidate,
  boundaryIndex = null,
  handoffIndex = null,
  from = null,
  to = null,
  acceptedReceiptIds = [],
  acceptedPassReceiptIds = [],
  rejectedReceiptIndexes = [],
  notes = [],
}) {
  const targetBinding = targetBindingFor(targetComposition, boundaryIndex, handoffIndex);
  const body = {
    schema: 'axm.multi-language-verification-work-item/v1',
    taskType,
    phase,
    previousCompositionId,
    targetCompositionId: targetComposition.compositionId,
    targetIsRefreshCandidate,
    boundaryIndex: Number.isInteger(boundaryIndex) ? boundaryIndex : null,
    handoffIndex: Number.isInteger(handoffIndex) ? handoffIndex : null,
    from: cleanText(from) || null,
    to: cleanText(to) || null,
    targetBinding,
    sourceEvidence: {
      acceptedReceiptIds: [...new Set(acceptedReceiptIds)].sort(),
      acceptedPassReceiptIds: [...new Set(acceptedPassReceiptIds)].sort(),
      rejectedReceiptIndexes: [...new Set(rejectedReceiptIndexes)].sort((a, b) => a - b),
      notes: [...new Set(notes.map((item) => cleanText(item)).filter(Boolean))].sort(),
    },
    requestedOutcome: expectedOutcomeForTask(taskType, targetBinding.contractId),
    budgetUnits: budgetUnitsForTask(taskType),
    dependsOnWorkItemIds: [],
    executionConstraints: expectedExecutionConstraints(),
    authority: expectedWorkItemAuthority(),
  };
  return { ...body, workItemId: digest(body) };
}

function sortWorkItems(items) {
  return [...items].sort((left, right) => {
    const phase = TASK_PHASE_RANK[left.phase] - TASK_PHASE_RANK[right.phase];
    if (phase) return phase;
    const leftBoundary = Number.isInteger(left.boundaryIndex) ? left.boundaryIndex : Number.MAX_SAFE_INTEGER;
    const rightBoundary = Number.isInteger(right.boundaryIndex) ? right.boundaryIndex : Number.MAX_SAFE_INTEGER;
    if (leftBoundary !== rightBoundary) return leftBoundary - rightBoundary;
    const leftHandoff = Number.isInteger(left.handoffIndex) ? left.handoffIndex : Number.MAX_SAFE_INTEGER;
    const rightHandoff = Number.isInteger(right.handoffIndex) ? right.handoffIndex : Number.MAX_SAFE_INTEGER;
    if (leftHandoff !== rightHandoff) return leftHandoff - rightHandoff;
    return left.workItemId.localeCompare(right.workItemId);
  });
}

function summarizeEvidence(evidence) {
  return {
    evidenceReportId: evidence.evidenceReportId,
    overallStatus: evidence.overallStatus,
    suppliedReceiptCount: evidence.suppliedReceiptCount,
    acceptedReceiptCount: evidence.acceptedReceiptCount,
    rejectedReceiptCount: evidence.rejectedReceiptCount,
    acceptedResultCounts: cloneJson(evidence.acceptedResultCounts),
  };
}

function summarizeDecisionGate(gate) {
  return {
    decisionGateId: gate.decisionGateId,
    decisionState: gate.decisionState,
    callerDecisionEligible: gate.callerDecisionEligible,
    holdReasons: cloneJson(gate.holdReasons),
    advisories: cloneJson(gate.advisories),
  };
}

function summarizeReverification(plan) {
  return {
    reverificationPlanId: plan.reverificationPlanId,
    planState: plan.planState,
    previousCompositionId: plan.previousCompositionId,
    candidateCompositionId: plan.candidateCompositionId,
    replayRecommendedHandoffIndexes: [...plan.replayRecommendedHandoffIndexes],
    rebindOnlyCandidateHandoffIndexes: [...plan.rebindOnlyCandidateHandoffIndexes],
    contractCompletionHandoffIndexes: [...plan.contractCompletionHandoffIndexes],
    potentialReplaySavingsHandoffIndexes: [...plan.potentialReplaySavingsHandoffIndexes],
    noPriorPassCoverageHandoffIndexes: [...plan.noPriorPassCoverageHandoffIndexes],
  };
}

function acceptedReceiptIdsForHandoff(evidence, handoffIndex) {
  return evidence.acceptedReceipts
    .filter((receipt) => receipt.handoffIndex === handoffIndex)
    .map((receipt) => receipt.receiptId)
    .sort();
}

function acceptedPassReceiptIdsForHandoff(evidence, handoffIndex) {
  return evidence.acceptedReceipts
    .filter(
      (receipt) =>
        receipt.handoffIndex === handoffIndex &&
        receipt.evidence.claimedResult === 'PASS',
    )
    .map((receipt) => receipt.receiptId)
    .sort();
}

function buildCurrentCompositionWorkItems(composition, evidence) {
  const items = [];

  for (const boundary of composition.boundaries) {
    if (boundary.status !== 'missing') continue;
    items.push(
      createWorkItem({
        taskType: 'DECLARE_HANDOFF_CONTRACT',
        phase: 'CONTRACT',
        previousCompositionId: composition.compositionId,
        targetComposition: composition,
        targetIsRefreshCandidate: false,
        boundaryIndex: boundary.boundaryIndex,
        from: boundary.from,
        to: boundary.to,
        notes: ['No explicit handoff exists for this adjacent language boundary.'],
      }),
    );
  }

  for (let handoffIndex = 0; handoffIndex < composition.handoffs.length; handoffIndex += 1) {
    const handoff = composition.handoffs[handoffIndex];
    const assessment = evidence.handoffAssessments[handoffIndex];
    const acceptedReceiptIds = acceptedReceiptIdsForHandoff(evidence, handoffIndex);
    const acceptedPassReceiptIds = acceptedPassReceiptIdsForHandoff(evidence, handoffIndex);
    let taskType = null;
    let phase = null;

    if (handoff.status !== 'defined') {
      taskType = 'COMPLETE_HANDOFF_CONTRACT';
      phase = 'CONTRACT';
    } else if (assessment.status === 'CALLER_PASS_RECEIPT_PRESENT_NOT_REPLAYED') {
      continue;
    } else if (isEvidenceReviewStatus(assessment.status)) {
      taskType = 'RESOLVE_EVIDENCE_REVIEW';
      phase = 'EVIDENCE_REVIEW';
    } else {
      taskType = 'RUN_VERIFIER_AND_ISSUE_RECEIPT';
      phase = 'VERIFY';
    }

    items.push(
      createWorkItem({
        taskType,
        phase,
        previousCompositionId: composition.compositionId,
        targetComposition: composition,
        targetIsRefreshCandidate: false,
        boundaryIndex: handoff.boundaryIndex,
        handoffIndex,
        from: handoff.from,
        to: handoff.to,
        acceptedReceiptIds,
        acceptedPassReceiptIds,
        notes: [assessment.status],
      }),
    );
  }

  if (evidence.rejectedReceipts.length > 0) {
    items.push(
      createWorkItem({
        taskType: 'REVIEW_REJECTED_RECEIPTS',
        phase: 'EVIDENCE_REVIEW',
        previousCompositionId: composition.compositionId,
        targetComposition: composition,
        targetIsRefreshCandidate: false,
        rejectedReceiptIndexes: evidence.rejectedReceipts.map((item) => item.receiptIndex),
        notes: evidence.rejectedReceipts.map((item) => item.reason),
      }),
    );
  }

  return sortWorkItems(items);
}

function buildRefreshCandidateWorkItems(previousComposition, candidateComposition, plan, evidence) {
  const items = [];

  for (const boundary of candidateComposition.boundaries) {
    if (boundary.status !== 'missing') continue;
    items.push(
      createWorkItem({
        taskType: 'DECLARE_HANDOFF_CONTRACT',
        phase: 'CONTRACT',
        previousCompositionId: previousComposition.compositionId,
        targetComposition: candidateComposition,
        targetIsRefreshCandidate: true,
        boundaryIndex: boundary.boundaryIndex,
        from: boundary.from,
        to: boundary.to,
        notes: ['No explicit handoff exists for this refreshed adjacent boundary.'],
      }),
    );
  }

  for (const handoffPlan of plan.handoffPlans) {
    const acceptedReceiptIds = acceptedReceiptIdsForHandoff(evidence, handoffPlan.handoffIndex);
    const acceptedPassReceiptIds = acceptedPassReceiptIdsForHandoff(
      evidence,
      handoffPlan.handoffIndex,
    );
    const assessment = evidence.handoffAssessments[handoffPlan.handoffIndex];

    if (
      handoffPlan.status !== 'CONTRACT_COMPLETION_REQUIRED' &&
      isEvidenceReviewStatus(assessment.status)
    ) {
      items.push(
        createWorkItem({
          taskType: 'RESOLVE_EVIDENCE_REVIEW',
          phase: 'EVIDENCE_REVIEW',
          previousCompositionId: previousComposition.compositionId,
          targetComposition: candidateComposition,
          targetIsRefreshCandidate: true,
          boundaryIndex: handoffPlan.boundaryIndex,
          handoffIndex: handoffPlan.handoffIndex,
          from: handoffPlan.from,
          to: handoffPlan.to,
          acceptedReceiptIds,
          acceptedPassReceiptIds,
          notes: [assessment.status, 'Historical evidence review remains visible during refresh.'],
        }),
      );
    }

    let taskType;
    let phase;
    if (handoffPlan.status === 'CONTRACT_COMPLETION_REQUIRED') {
      taskType = 'COMPLETE_HANDOFF_CONTRACT';
      phase = 'CONTRACT';
    } else if (handoffPlan.status === 'LOCAL_HANDOFF_CHANGED_REVERIFICATION_RECOMMENDED') {
      taskType = 'RUN_VERIFIER_AND_ISSUE_RECEIPT';
      phase = 'VERIFY';
    } else if (acceptedPassReceiptIds.length > 0) {
      taskType = 'REISSUE_OR_REPLAY_POLICY_REVIEW';
      phase = 'RECEIPT_REISSUE_REVIEW';
    } else {
      taskType = 'RUN_VERIFIER_AND_ISSUE_RECEIPT';
      phase = 'VERIFY';
    }

    items.push(
      createWorkItem({
        taskType,
        phase,
        previousCompositionId: previousComposition.compositionId,
        targetComposition: candidateComposition,
        targetIsRefreshCandidate: true,
        boundaryIndex: handoffPlan.boundaryIndex,
        handoffIndex: handoffPlan.handoffIndex,
        from: handoffPlan.from,
        to: handoffPlan.to,
        acceptedReceiptIds,
        acceptedPassReceiptIds,
        notes: [handoffPlan.status, handoffPlan.grammarDeltaReplayRecommendation],
      }),
    );
  }

  if (evidence.rejectedReceipts.length > 0) {
    items.push(
      createWorkItem({
        taskType: 'REVIEW_REJECTED_RECEIPTS',
        phase: 'EVIDENCE_REVIEW',
        previousCompositionId: previousComposition.compositionId,
        targetComposition: candidateComposition,
        targetIsRefreshCandidate: true,
        rejectedReceiptIndexes: evidence.rejectedReceipts.map((item) => item.receiptIndex),
        notes: evidence.rejectedReceipts.map((item) => item.reason),
      }),
    );
  }

  return sortWorkItems(items);
}

function countWorkItems(workItems) {
  const counts = {
    totalWorkItems: workItems.length,
    verifierRuns: 0,
    receiptReissueReviews: 0,
    contractCompletions: 0,
    evidenceReviews: 0,
  };
  for (const item of workItems) {
    counts.verifierRuns += item.budgetUnits.verifierRuns;
    counts.receiptReissueReviews += item.budgetUnits.receiptReissueReviews;
    counts.contractCompletions += item.budgetUnits.contractCompletions;
    counts.evidenceReviews += item.budgetUnits.evidenceReviews;
  }
  return counts;
}

function assessCountBudget(counts, countBudget) {
  const checks = [
    ['maxTotalWorkItems', 'totalWorkItems'],
    ['maxVerifierRuns', 'verifierRuns'],
    ['maxReceiptReissueReviews', 'receiptReissueReviews'],
    ['maxContractCompletions', 'contractCompletions'],
    ['maxEvidenceReviews', 'evidenceReviews'],
  ].map(([budgetField, countField]) => {
    const limit = countBudget[budgetField];
    const actual = counts[countField];
    return {
      budgetField,
      countField,
      limit,
      actual,
      status: limit == null ? 'NOT_DECLARED' : actual <= limit ? 'WITHIN_LIMIT' : 'EXCEEDS_LIMIT',
    };
  });
  const exceeded = checks.filter((check) => check.status === 'EXCEEDS_LIMIT');
  return {
    withinDeclaredCountBudget: exceeded.length === 0,
    exceeded: exceeded.map((check) => ({
      budgetField: check.budgetField,
      limit: check.limit,
      actual: check.actual,
    })),
    checks,
  };
}

function buildPhases(workItems) {
  return Object.keys(TASK_PHASE_RANK)
    .sort((left, right) => TASK_PHASE_RANK[left] - TASK_PHASE_RANK[right])
    .map((phase) => ({
      phase,
      workItemIds: workItems
        .filter((item) => item.phase === phase)
        .map((item) => item.workItemId),
      executionOrderInferred: false,
      concurrencyInferred: false,
    }));
}

function verifyDigestObject(value, idField, errorCode) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(errorCode);
  const id = value[idField];
  if (typeof id !== 'string' || id.length !== 64) throw new Error(`${errorCode}_ID`);
  const body = cloneJson(value);
  delete body[idField];
  if (digest(body) !== id) throw new Error(`${errorCode}_DIGEST_MISMATCH`);
}

function validateVerificationWorkpack(workpack) {
  assertExactKeys(workpack, WORKPACK_KEYS, 'MULTI_LANGUAGE_WORKPACK_SHAPE_INVALID');
  if (workpack.schema !== 'axm.multi-language-verification-workpack/v1') {
    throw new Error('MULTI_LANGUAGE_WORKPACK_SCHEMA_INVALID');
  }
  verifyDigestObject(workpack, 'workpackId', 'MULTI_LANGUAGE_WORKPACK_INVALID');
  if (!Array.isArray(workpack.workItems) || !Array.isArray(workpack.phases)) {
    throw new Error('MULTI_LANGUAGE_WORKPACK_COLLECTION_INVALID');
  }
  if (typeof workpack.previousCompositionId !== 'string' || workpack.previousCompositionId.length !== 64) {
    throw new Error('MULTI_LANGUAGE_WORKPACK_PREVIOUS_COMPOSITION_ID_INVALID');
  }
  if (typeof workpack.targetIsRefreshCandidate !== 'boolean') {
    throw new Error('MULTI_LANGUAGE_WORKPACK_REFRESH_FLAG_INVALID');
  }

  const seen = new Set();
  for (const item of workpack.workItems) {
    assertExactKeys(item, WORK_ITEM_KEYS, 'MULTI_LANGUAGE_WORK_ITEM_SHAPE_INVALID');
    if (item.schema !== 'axm.multi-language-verification-work-item/v1') {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_SCHEMA_INVALID');
    }
    verifyDigestObject(item, 'workItemId', 'MULTI_LANGUAGE_WORK_ITEM_INVALID');
    if (seen.has(item.workItemId)) throw new Error('MULTI_LANGUAGE_WORK_ITEM_DUPLICATE_ID');
    seen.add(item.workItemId);
    if (!Object.prototype.hasOwnProperty.call(TASK_PHASE_FOR_TYPE, item.taskType)) {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_TASK_TYPE_INVALID');
    }
    if (item.phase !== TASK_PHASE_FOR_TYPE[item.taskType]) {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_PHASE_MISMATCH');
    }
    if (item.previousCompositionId !== workpack.previousCompositionId) {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_PREVIOUS_COMPOSITION_MISMATCH');
    }
    if (item.targetCompositionId !== workpack.targetCompositionId) {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_TARGET_MISMATCH');
    }
    if (item.targetIsRefreshCandidate !== workpack.targetIsRefreshCandidate) {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_REFRESH_FLAG_MISMATCH');
    }
    assertExactKeys(
      item.targetBinding,
      ['compositionId', 'boundaryIndex', 'handoffIndex', 'contractId', 'boundaryDigest', 'handoffDigest'],
      'MULTI_LANGUAGE_WORK_ITEM_TARGET_BINDING_INVALID',
    );
    assertExactKeys(
      item.sourceEvidence,
      ['acceptedReceiptIds', 'acceptedPassReceiptIds', 'rejectedReceiptIndexes', 'notes'],
      'MULTI_LANGUAGE_WORK_ITEM_SOURCE_EVIDENCE_INVALID',
    );
    if (
      !isSortedUniqueStrings(item.sourceEvidence.acceptedReceiptIds) ||
      !isSortedUniqueStrings(item.sourceEvidence.acceptedPassReceiptIds) ||
      !isSortedUniqueIntegers(item.sourceEvidence.rejectedReceiptIndexes) ||
      !isSortedUniqueStrings(item.sourceEvidence.notes)
    ) {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_SOURCE_EVIDENCE_NORMALIZATION_INVALID');
    }
    if (
      item.sourceEvidence.acceptedPassReceiptIds.some(
        (id) => !item.sourceEvidence.acceptedReceiptIds.includes(id),
      )
    ) {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_PASS_RECEIPT_NOT_ACCEPTED');
    }
    assertExactKeys(
      item.requestedOutcome,
      [
        'outcomeKind',
        'requiredSchema',
        'targetContractId',
        'acceptedClaimedResults',
        'verifierReplayMayBeRequired',
        'externalPolicyDecisionRequired',
      ],
      'MULTI_LANGUAGE_WORK_ITEM_REQUESTED_OUTCOME_INVALID',
    );
    const expectedOutcome = expectedOutcomeForTask(item.taskType, item.targetBinding.contractId);
    if (digest(item.requestedOutcome) !== digest(expectedOutcome)) {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_REQUESTED_OUTCOME_MISMATCH');
    }
    assertExactKeys(
      item.budgetUnits,
      ['verifierRuns', 'receiptReissueReviews', 'contractCompletions', 'evidenceReviews'],
      'MULTI_LANGUAGE_WORK_ITEM_BUDGET_UNITS_INVALID',
    );
    if (digest(item.budgetUnits) !== digest(budgetUnitsForTask(item.taskType))) {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_BUDGET_UNITS_MISMATCH');
    }
    if (!Array.isArray(item.dependsOnWorkItemIds) || item.dependsOnWorkItemIds.length !== 0) {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_DEPENDENCY_INFERENCE_FORBIDDEN');
    }
    assertExactKeys(
      item.executionConstraints,
      Object.keys(expectedExecutionConstraints()),
      'MULTI_LANGUAGE_WORK_ITEM_EXECUTION_CONSTRAINTS_INVALID',
    );
    if (digest(item.executionConstraints) !== digest(expectedExecutionConstraints())) {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_EXECUTION_CONSTRAINTS_MISMATCH');
    }
    assertExactKeys(
      item.authority,
      Object.keys(expectedWorkItemAuthority()),
      'MULTI_LANGUAGE_WORK_ITEM_AUTHORITY_INVALID',
    );
    if (digest(item.authority) !== digest(expectedWorkItemAuthority())) {
      throw new Error('MULTI_LANGUAGE_WORK_ITEM_AUTHORITY_MISMATCH');
    }
  }

  if (workpack.targetComposition) {
    validateCompositionForEvidence(workpack.targetComposition);
    if (workpack.targetComposition.compositionId !== workpack.targetCompositionId) {
      throw new Error('MULTI_LANGUAGE_WORKPACK_TARGET_COMPOSITION_MISMATCH');
    }
    if (
      workpack.targetIsRefreshCandidate &&
      workpack.targetCompositionId === workpack.previousCompositionId
    ) {
      throw new Error('MULTI_LANGUAGE_WORKPACK_REFRESH_CANDIDATE_ID_NOT_CHANGED');
    }
    if (
      !workpack.targetIsRefreshCandidate &&
      workpack.targetCompositionId !== workpack.previousCompositionId
    ) {
      throw new Error('MULTI_LANGUAGE_WORKPACK_CURRENT_TARGET_ID_MISMATCH');
    }
    for (const item of workpack.workItems) {
      const expectedBinding = targetBindingFor(
        workpack.targetComposition,
        item.boundaryIndex,
        item.handoffIndex,
      );
      if (digest(item.targetBinding) !== digest(expectedBinding)) {
        throw new Error('MULTI_LANGUAGE_WORK_ITEM_TARGET_BINDING_MISMATCH');
      }
      const boundary = Number.isInteger(item.boundaryIndex)
        ? workpack.targetComposition.boundaries[item.boundaryIndex]
        : null;
      const handoff = Number.isInteger(item.handoffIndex)
        ? workpack.targetComposition.handoffs[item.handoffIndex]
        : null;
      if (boundary && (item.from !== boundary.from || item.to !== boundary.to)) {
        throw new Error('MULTI_LANGUAGE_WORK_ITEM_BOUNDARY_ENDPOINT_MISMATCH');
      }
      if (
        handoff &&
        (item.boundaryIndex !== handoff.boundaryIndex ||
          item.from !== handoff.from ||
          item.to !== handoff.to)
      ) {
        throw new Error('MULTI_LANGUAGE_WORK_ITEM_HANDOFF_ENDPOINT_MISMATCH');
      }
      if (!boundary && !handoff && (item.from !== null || item.to !== null)) {
        throw new Error('MULTI_LANGUAGE_WORK_ITEM_GLOBAL_ENDPOINT_MISMATCH');
      }
    }
  } else {
    if (workpack.targetCompositionId !== null) {
      throw new Error('MULTI_LANGUAGE_WORKPACK_TARGET_COMPOSITION_MISSING');
    }
    if (workpack.targetIsRefreshCandidate) {
      throw new Error('MULTI_LANGUAGE_WORKPACK_HELD_REFRESH_FLAG_INVALID');
    }
    if (workpack.workItems.length !== 0) {
      throw new Error('MULTI_LANGUAGE_WORKPACK_HELD_WORK_ITEMS_FORBIDDEN');
    }
  }

  const recalculatedCounts = countWorkItems(workpack.workItems);
  if (digest(recalculatedCounts) !== digest(workpack.counts)) {
    throw new Error('MULTI_LANGUAGE_WORKPACK_COUNTS_MISMATCH');
  }
  const normalizedBudget = normalizeCountBudget(workpack.countBudget);
  if (digest(normalizedBudget) !== digest(workpack.countBudget)) {
    throw new Error('MULTI_LANGUAGE_WORKPACK_COUNT_BUDGET_NORMALIZATION_MISMATCH');
  }
  const budgetAssessment = assessCountBudget(recalculatedCounts, normalizedBudget);
  if (digest(budgetAssessment) !== digest(workpack.budgetAssessment)) {
    throw new Error('MULTI_LANGUAGE_WORKPACK_BUDGET_ASSESSMENT_MISMATCH');
  }
  const expectedPhases = buildPhases(workpack.workItems);
  if (digest(expectedPhases) !== digest(workpack.phases)) {
    throw new Error('MULTI_LANGUAGE_WORKPACK_PHASES_MISMATCH');
  }
  const expectedState = !workpack.targetComposition
    ? 'SOURCE_HOLD_CALLER_DECISION_REQUIRED'
    : workpack.workItems.length === 0
      ? 'NO_WORK_REQUIRED'
      : !budgetAssessment.withinDeclaredCountBudget
        ? 'DECLARED_COUNT_BUDGET_HOLD'
        : 'WORK_ITEMS_READY_CALLER_DISPATCH_REQUIRED';
  if (workpack.state !== expectedState) {
    throw new Error('MULTI_LANGUAGE_WORKPACK_STATE_MISMATCH');
  }
  const expectedEligible = expectedState === 'WORK_ITEMS_READY_CALLER_DISPATCH_REQUIRED';
  if (workpack.callerDispatchEligible !== expectedEligible) {
    throw new Error('MULTI_LANGUAGE_WORKPACK_DISPATCH_ELIGIBILITY_MISMATCH');
  }
  const expectedTruth = expectedWorkpackTruthBoundary(workpack.workItems.length);
  assertExactKeys(
    workpack.truthBoundary,
    Object.keys(expectedTruth),
    'MULTI_LANGUAGE_WORKPACK_TRUTH_BOUNDARY_INVALID',
  );
  if (digest(workpack.truthBoundary) !== digest(expectedTruth)) {
    throw new Error('MULTI_LANGUAGE_WORKPACK_TRUTH_BOUNDARY_MISMATCH');
  }
  return true;
}

function createMultiLanguageVerificationWorkpack(options = {}) {
  const registry = options.registry || defaultRegistry;
  const grammarProfiles = options.grammarProfiles || defaultGrammarProfiles;
  const currentnessInspector =
    options.currentnessInspector ||
    createPolyglotCurrentnessInspector({ registry, grammarProfiles });
  const decisionGate =
    options.decisionGate ||
    createMultiLanguageDecisionGate({
      registry,
      grammarProfiles,
      currentnessInspector,
    });
  const reverificationPlanner =
    options.reverificationPlanner ||
    createMinimalReverificationPlanner({
      registry,
      grammarProfiles,
      currentnessInspector,
    });

  function create(composition, suppliedReceipts = [], createOptions = {}) {
    validateCompositionForEvidence(composition);
    const countBudget = normalizeCountBudget(createOptions.countBudget || {});
    const evidence = assessEvidence(composition, suppliedReceipts);
    const gate = decisionGate.evaluate(composition, suppliedReceipts);
    const reverification = reverificationPlanner.plan(composition, suppliedReceipts);
    const refresh = currentnessInspector.proposeRefresh(composition);

    let targetComposition = null;
    let targetIsRefreshCandidate = false;
    let workItems = [];

    if (refresh.status === 'NO_REFRESH_REQUIRED') {
      targetComposition = composition;
      workItems = buildCurrentCompositionWorkItems(composition, evidence);
    } else if (refresh.candidateComposition) {
      targetComposition = refresh.candidateComposition;
      targetIsRefreshCandidate = true;
      workItems = buildRefreshCandidateWorkItems(
        composition,
        targetComposition,
        reverification,
        evidence,
      );
    }

    const counts = countWorkItems(workItems);
    const budgetAssessment = assessCountBudget(counts, countBudget);
    const state = !targetComposition
      ? 'SOURCE_HOLD_CALLER_DECISION_REQUIRED'
      : workItems.length === 0
        ? 'NO_WORK_REQUIRED'
        : !budgetAssessment.withinDeclaredCountBudget
          ? 'DECLARED_COUNT_BUDGET_HOLD'
          : 'WORK_ITEMS_READY_CALLER_DISPATCH_REQUIRED';
    const body = {
      schema: 'axm.multi-language-verification-workpack/v1',
      previousCompositionId: composition.compositionId,
      targetCompositionId: targetComposition?.compositionId || null,
      targetIsRefreshCandidate,
      targetComposition: cloneJson(targetComposition),
      decisionGate: summarizeDecisionGate(gate),
      reverification: summarizeReverification(reverification),
      evidence: summarizeEvidence(evidence),
      state,
      callerDispatchEligible: state === 'WORK_ITEMS_READY_CALLER_DISPATCH_REQUIRED',
      workItems,
      phases: buildPhases(workItems),
      counts,
      countBudget,
      budgetAssessment,
      truthBoundary: expectedWorkpackTruthBoundary(workItems.length),
    };
    const workpack = { ...body, workpackId: digest(body) };
    validateVerificationWorkpack(workpack);
    return workpack;
  }

  return {
    registry,
    grammarProfiles,
    currentnessInspector,
    decisionGate,
    reverificationPlanner,
    create,
  };
}

module.exports = {
  COUNT_BUDGET_FIELDS,
  TASK_PHASE_FOR_TYPE,
  TASK_PHASE_RANK,
  assessCountBudget,
  buildCurrentCompositionWorkItems,
  buildPhases,
  buildRefreshCandidateWorkItems,
  countWorkItems,
  createMultiLanguageVerificationWorkpack,
  createWorkItem,
  expectedWorkItemAuthority,
  expectedWorkpackTruthBoundary,
  isEvidenceReviewStatus,
  normalizeCountBudget,
  sortWorkItems,
  validateVerificationWorkpack,
};
