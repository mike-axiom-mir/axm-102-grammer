'use strict';

const {
  digest,
} = require('./polyglot-grammar-composition.js');
const {
  validateCompositionStructure,
} = require('./polyglot-composition-currentness.js');

const HEX_64 = /^[a-f0-9]{64}$/i;
const CLAIMED_RESULTS = Object.freeze(['PASS', 'FAIL', 'INCONCLUSIVE']);
const CLAIMED_RESULT_SET = new Set(CLAIMED_RESULTS);

function cleanText(value) {
  return String(value == null ? '' : value).trim();
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cleanTextList(values) {
  const items = Array.isArray(values) ? values : values == null ? [] : [values];
  return Array.from(new Set(items.map((value) => cleanText(value)).filter(Boolean)));
}

function cleanDigestList(values, fieldName, { required = false } = {}) {
  const items = Array.isArray(values) ? values : values == null ? [] : [values];
  if (required && items.length === 0) {
    throw new Error(`POLYGLOT_EVIDENCE_${fieldName.toUpperCase()}_REQUIRED`);
  }
  const normalized = [];
  for (let index = 0; index < items.length; index += 1) {
    const value = cleanText(items[index]).toLowerCase();
    if (!HEX_64.test(value)) {
      throw new Error(
        `POLYGLOT_EVIDENCE_${fieldName.toUpperCase()}_DIGEST_INVALID:${index}`,
      );
    }
    if (!normalized.includes(value)) normalized.push(value);
  }
  return normalized;
}

function assertDigest(value, fieldName) {
  const normalized = cleanText(value).toLowerCase();
  if (!HEX_64.test(normalized)) {
    throw new Error(`POLYGLOT_EVIDENCE_${fieldName.toUpperCase()}_INVALID`);
  }
  return normalized;
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

function validateCompositionForEvidence(composition) {
  validateCompositionStructure(composition);
  for (let handoffIndex = 0; handoffIndex < composition.handoffs.length; handoffIndex += 1) {
    const handoff = composition.handoffs[handoffIndex];
    if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) {
      throw new Error(`POLYGLOT_HANDOFF_INVALID:${handoffIndex}`);
    }
    if (!Number.isInteger(handoff.boundaryIndex)) {
      throw new Error(`POLYGLOT_HANDOFF_BOUNDARY_INDEX_INVALID:${handoffIndex}`);
    }
    if (handoff.boundaryIndex < 0 || handoff.boundaryIndex >= composition.boundaries.length) {
      throw new Error(`POLYGLOT_HANDOFF_BOUNDARY_INDEX_OUT_OF_RANGE:${handoffIndex}`);
    }
    const boundary = composition.boundaries[handoff.boundaryIndex];
    if (handoff.from !== boundary.from || handoff.to !== boundary.to) {
      throw new Error(`POLYGLOT_HANDOFF_BOUNDARY_BINDING_MISMATCH:${handoffIndex}`);
    }
    if (typeof handoff.from !== 'string' || !handoff.from || typeof handoff.to !== 'string' || !handoff.to) {
      throw new Error(`POLYGLOT_HANDOFF_ENDPOINT_INVALID:${handoffIndex}`);
    }
    for (const field of [
      'producerGuarantees',
      'consumerAssumptions',
      'validation',
      'notes',
    ]) {
      if (!Array.isArray(handoff[field]) || handoff[field].some((item) => typeof item !== 'string')) {
        throw new Error(`POLYGLOT_HANDOFF_LIST_INVALID:${handoffIndex}:${field}`);
      }
    }
    const expectedStatus = handoff.kind && handoff.artifact ? 'defined' : 'partial';
    if (handoff.status !== expectedStatus) {
      throw new Error(`POLYGLOT_HANDOFF_STATUS_MISMATCH:${handoffIndex}`);
    }
  }
  for (let boundaryIndex = 0; boundaryIndex < composition.boundaries.length; boundaryIndex += 1) {
    const boundary = composition.boundaries[boundaryIndex];
    if (!Array.isArray(boundary.handoffIndexes)) {
      throw new Error(`POLYGLOT_BOUNDARY_HANDOFF_INDEXES_INVALID:${boundaryIndex}`);
    }
    const matching = composition.handoffs
      .map((handoff, handoffIndex) => ({ handoff, handoffIndex }))
      .filter(({ handoff }) => handoff.boundaryIndex === boundaryIndex);
    const expected = matching.map(({ handoffIndex }) => handoffIndex);
    if (
      boundary.handoffIndexes.length !== expected.length ||
      boundary.handoffIndexes.some((value, index) => value !== expected[index])
    ) {
      throw new Error(`POLYGLOT_BOUNDARY_HANDOFF_INDEXES_MISMATCH:${boundaryIndex}`);
    }
    const expectedStatus =
      matching.length === 0
        ? 'missing'
        : matching.some(({ handoff }) => handoff.status === 'defined')
          ? 'defined'
          : 'partial';
    if (boundary.status !== expectedStatus) {
      throw new Error(`POLYGLOT_BOUNDARY_STATUS_MISMATCH:${boundaryIndex}`);
    }
  }
  return true;
}

function getDefinedHandoff(composition, handoffIndex) {
  validateCompositionForEvidence(composition);
  if (!Number.isInteger(handoffIndex)) {
    throw new TypeError('POLYGLOT_HANDOFF_INDEX_NOT_INTEGER');
  }
  if (handoffIndex < 0 || handoffIndex >= composition.handoffs.length) {
    throw new Error('POLYGLOT_HANDOFF_INDEX_OUT_OF_RANGE');
  }
  const handoff = composition.handoffs[handoffIndex];
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) {
    throw new Error(`POLYGLOT_HANDOFF_INVALID:${handoffIndex}`);
  }
  if (handoff.status !== 'defined') {
    throw new Error(`POLYGLOT_HANDOFF_CONTRACT_NOT_DEFINED:${handoffIndex}`);
  }
  if (!Number.isInteger(handoff.boundaryIndex)) {
    throw new Error(`POLYGLOT_HANDOFF_BOUNDARY_INDEX_INVALID:${handoffIndex}`);
  }
  const boundary = composition.boundaries[handoff.boundaryIndex];
  if (!boundary) {
    throw new Error(`POLYGLOT_HANDOFF_BOUNDARY_MISSING:${handoffIndex}`);
  }
  if (handoff.from !== boundary.from || handoff.to !== boundary.to) {
    throw new Error(`POLYGLOT_HANDOFF_BOUNDARY_BINDING_MISMATCH:${handoffIndex}`);
  }
  return { handoff, boundary };
}

function createHandoffContract(composition, handoffIndex) {
  const { handoff, boundary } = getDefinedHandoff(composition, handoffIndex);
  const producerLayer = composition.layers[boundary.boundaryIndex];
  const consumerLayer = composition.layers[boundary.boundaryIndex + 1];
  const body = {
    schema: 'axm.polyglot-handoff-contract-ref/v1',
    compositionId: composition.compositionId,
    boundaryIndex: boundary.boundaryIndex,
    handoffIndex,
    handoff: cloneJson(handoff),
    producer: {
      stageIndex: producerLayer.index,
      languageId: producerLayer.language.languageId,
      organId: producerLayer.language.organId,
      organSha256: producerLayer.digests.organSha256,
      grammarProfileSha256: producerLayer.digests.grammarProfileSha256,
    },
    consumer: {
      stageIndex: consumerLayer.index,
      languageId: consumerLayer.language.languageId,
      organId: consumerLayer.language.organId,
      organSha256: consumerLayer.digests.organSha256,
      grammarProfileSha256: consumerLayer.digests.grammarProfileSha256,
    },
    semanticCompatibilityClaimed: false,
    verificationExecuted: false,
    authority: 'NONE',
  };
  return {
    ...body,
    contractId: digest(body),
  };
}

function normalizeReceiptInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('POLYGLOT_EVIDENCE_INPUT_NOT_OBJECT');
  }
  const composition = input.composition;
  const handoffIndex = input.handoffIndex;
  const contract = createHandoffContract(composition, handoffIndex);
  const verifierId = cleanText(input.verifierId);
  if (!verifierId) throw new Error('POLYGLOT_EVIDENCE_VERIFIER_ID_REQUIRED');
  const verifierDigest = assertDigest(input.verifierDigest, 'verifier_digest');
  const evidenceKind = cleanText(input.evidenceKind);
  if (!evidenceKind) throw new Error('POLYGLOT_EVIDENCE_KIND_REQUIRED');
  const claimedResult = cleanText(input.claimedResult).toUpperCase();
  if (!CLAIMED_RESULT_SET.has(claimedResult)) {
    throw new Error('POLYGLOT_EVIDENCE_CLAIMED_RESULT_INVALID');
  }
  const executionReceiptSchema = cleanText(input.executionReceiptSchema);
  if (!executionReceiptSchema) {
    throw new Error('POLYGLOT_EVIDENCE_EXECUTION_RECEIPT_SCHEMA_REQUIRED');
  }
  const executionReceiptDigest = assertDigest(
    input.executionReceiptDigest,
    'execution_receipt_digest',
  );
  const subjectDigests = cleanDigestList(input.subjectDigests, 'subject', {
    required: true,
  });
  const outputDigests = cleanDigestList(input.outputDigests, 'output');
  const findingCodes = cleanTextList(input.findingCodes);
  const notes = cleanTextList(input.notes);

  return {
    composition,
    contract,
    verifierId,
    verifierDigest,
    evidenceKind,
    claimedResult,
    executionReceiptSchema,
    executionReceiptDigest,
    subjectDigests,
    outputDigests,
    findingCodes,
    notes,
  };
}

function createEvidenceReceipt(input = {}) {
  const normalized = normalizeReceiptInput(input);
  const body = {
    schema: 'axm.polyglot-handoff-evidence-receipt/v1',
    compositionId: normalized.composition.compositionId,
    contractId: normalized.contract.contractId,
    boundaryIndex: normalized.contract.boundaryIndex,
    handoffIndex: normalized.contract.handoffIndex,
    verifier: {
      verifierId: normalized.verifierId,
      verifierDigest: normalized.verifierDigest,
    },
    evidence: {
      evidenceKind: normalized.evidenceKind,
      claimedResult: normalized.claimedResult,
      subjectDigests: normalized.subjectDigests,
      outputDigests: normalized.outputDigests,
      findingCodes: normalized.findingCodes,
      notes: normalized.notes,
    },
    executionReceipt: {
      schema: normalized.executionReceiptSchema,
      digest: normalized.executionReceiptDigest,
      contentInspectedByThisModule: false,
    },
    truthBoundary: {
      claimSource: 'CALLER_SUPPLIED_EXECUTION_RECEIPT_REFERENCE',
      verificationExecutedByThisModule: false,
      underlyingExecutionReplayed: false,
      receiptOriginAuthenticated: false,
      callerClaimPromotedToFact: false,
      semanticCompatibilityClaimed: false,
      automaticPromotion: false,
      authority: 'NONE',
    },
  };
  return {
    ...body,
    receiptId: digest(body),
  };
}

function validateEvidenceReceipt(composition, receipt) {
  validateCompositionForEvidence(composition);
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new TypeError('POLYGLOT_EVIDENCE_RECEIPT_NOT_OBJECT');
  }
  assertExactKeys(
    receipt,
    [
      'schema',
      'compositionId',
      'contractId',
      'boundaryIndex',
      'handoffIndex',
      'verifier',
      'evidence',
      'executionReceipt',
      'truthBoundary',
      'receiptId',
    ],
    'POLYGLOT_EVIDENCE_RECEIPT_SHAPE_INVALID',
  );
  if (receipt.schema !== 'axm.polyglot-handoff-evidence-receipt/v1') {
    throw new Error('POLYGLOT_EVIDENCE_RECEIPT_SCHEMA_INVALID');
  }
  const receiptId = assertDigest(receipt.receiptId, 'receipt_id');
  const { receiptId: ignoredReceiptId, ...body } = receipt;
  if (digest(body) !== receiptId) {
    throw new Error('POLYGLOT_EVIDENCE_RECEIPT_DIGEST_MISMATCH');
  }
  if (receipt.compositionId !== composition.compositionId) {
    throw new Error('POLYGLOT_EVIDENCE_COMPOSITION_BINDING_MISMATCH');
  }
  if (!Number.isInteger(receipt.handoffIndex)) {
    throw new Error('POLYGLOT_EVIDENCE_HANDOFF_INDEX_INVALID');
  }
  const contract = createHandoffContract(composition, receipt.handoffIndex);
  if (receipt.contractId !== contract.contractId) {
    throw new Error('POLYGLOT_EVIDENCE_CONTRACT_BINDING_MISMATCH');
  }
  if (receipt.boundaryIndex !== contract.boundaryIndex) {
    throw new Error('POLYGLOT_EVIDENCE_BOUNDARY_BINDING_MISMATCH');
  }
  assertExactKeys(
    receipt.verifier,
    ['verifierId', 'verifierDigest'],
    'POLYGLOT_EVIDENCE_VERIFIER_INVALID',
  );
  if (!cleanText(receipt.verifier.verifierId)) {
    throw new Error('POLYGLOT_EVIDENCE_VERIFIER_ID_REQUIRED');
  }
  assertDigest(receipt.verifier.verifierDigest, 'verifier_digest');
  assertExactKeys(
    receipt.evidence,
    [
      'evidenceKind',
      'claimedResult',
      'subjectDigests',
      'outputDigests',
      'findingCodes',
      'notes',
    ],
    'POLYGLOT_EVIDENCE_BODY_INVALID',
  );
  if (!cleanText(receipt.evidence.evidenceKind)) {
    throw new Error('POLYGLOT_EVIDENCE_KIND_REQUIRED');
  }
  if (!CLAIMED_RESULT_SET.has(receipt.evidence.claimedResult)) {
    throw new Error('POLYGLOT_EVIDENCE_CLAIMED_RESULT_INVALID');
  }
  cleanDigestList(receipt.evidence.subjectDigests, 'subject', { required: true });
  cleanDigestList(receipt.evidence.outputDigests, 'output');
  cleanTextList(receipt.evidence.findingCodes);
  cleanTextList(receipt.evidence.notes);
  assertExactKeys(
    receipt.executionReceipt,
    ['schema', 'digest', 'contentInspectedByThisModule'],
    'POLYGLOT_EVIDENCE_EXECUTION_RECEIPT_INVALID',
  );
  if (!cleanText(receipt.executionReceipt.schema)) {
    throw new Error('POLYGLOT_EVIDENCE_EXECUTION_RECEIPT_SCHEMA_REQUIRED');
  }
  assertDigest(receipt.executionReceipt.digest, 'execution_receipt_digest');
  if (receipt.executionReceipt.contentInspectedByThisModule !== false) {
    throw new Error('POLYGLOT_EVIDENCE_EXECUTION_CONTENT_CLAIM_INVALID');
  }
  const truth = receipt.truthBoundary;
  const expectedTruth = {
    claimSource: 'CALLER_SUPPLIED_EXECUTION_RECEIPT_REFERENCE',
    verificationExecutedByThisModule: false,
    underlyingExecutionReplayed: false,
    receiptOriginAuthenticated: false,
    callerClaimPromotedToFact: false,
    semanticCompatibilityClaimed: false,
    automaticPromotion: false,
    authority: 'NONE',
  };
  assertExactKeys(
    truth,
    Object.keys(expectedTruth),
    'POLYGLOT_EVIDENCE_TRUTH_BOUNDARY_INVALID',
  );
  for (const [key, value] of Object.entries(expectedTruth)) {
    if (truth[key] !== value) {
      throw new Error(`POLYGLOT_EVIDENCE_TRUTH_BOUNDARY_MISMATCH:${key}`);
    }
  }
  return {
    receipt: cloneJson(receipt),
    contract,
  };
}

function classifyHandoffEvidence(handoff, acceptedReceipts) {
  if (handoff.status !== 'defined') {
    return 'HANDOFF_CONTRACT_PARTIAL_EVIDENCE_HELD';
  }
  if (acceptedReceipts.length === 0) return 'NO_ACCEPTED_EVIDENCE';
  const results = new Set(
    acceptedReceipts.map((receipt) => receipt.evidence.claimedResult),
  );
  if (results.has('PASS') && results.has('FAIL')) {
    return 'CONFLICTING_CALLER_RESULTS';
  }
  if (results.has('FAIL')) {
    return results.has('INCONCLUSIVE')
      ? 'CALLER_FAIL_AND_INCONCLUSIVE_RECEIPTS_PRESENT_NOT_REPLAYED'
      : 'CALLER_FAIL_RECEIPT_PRESENT_NOT_REPLAYED';
  }
  if (results.has('PASS')) {
    return results.has('INCONCLUSIVE')
      ? 'CALLER_PASS_AND_INCONCLUSIVE_RECEIPTS_PRESENT_NOT_REPLAYED'
      : 'CALLER_PASS_RECEIPT_PRESENT_NOT_REPLAYED';
  }
  return 'CALLER_INCONCLUSIVE_RECEIPT_PRESENT_NOT_REPLAYED';
}

function classifyBoundaryEvidence(boundary, handoffAssessments) {
  if (boundary.status === 'missing') return 'NO_HANDOFF_CONTRACT';
  if (boundary.status === 'partial') return 'HANDOFF_CONTRACT_PARTIAL';
  if (handoffAssessments.some((item) => item.status === 'CONFLICTING_CALLER_RESULTS')) {
    return 'CONFLICTING_CALLER_EVIDENCE';
  }
  if (
    handoffAssessments.some((item) =>
      item.status.startsWith('CALLER_FAIL'),
    )
  ) {
    return 'CALLER_FAIL_EVIDENCE_PRESENT_NOT_REPLAYED';
  }
  if (
    handoffAssessments.some(
      (item) =>
        item.status === 'HANDOFF_CONTRACT_PARTIAL_EVIDENCE_HELD' ||
        item.status === 'NO_ACCEPTED_EVIDENCE',
    )
  ) {
    return 'EVIDENCE_INCOMPLETE';
  }
  if (
    handoffAssessments.some(
      (item) =>
        item.status === 'CALLER_INCONCLUSIVE_RECEIPT_PRESENT_NOT_REPLAYED' ||
        item.status ===
          'CALLER_PASS_AND_INCONCLUSIVE_RECEIPTS_PRESENT_NOT_REPLAYED',
    )
  ) {
    return 'CALLER_EVIDENCE_INCONCLUSIVE_NOT_REPLAYED';
  }
  if (
    handoffAssessments.length > 0 &&
    handoffAssessments.every(
      (item) => item.status === 'CALLER_PASS_RECEIPT_PRESENT_NOT_REPLAYED',
    )
  ) {
    return 'CALLER_PASS_EVIDENCE_COMPLETE_NOT_REPLAYED';
  }
  return 'EVIDENCE_INCOMPLETE';
}

function assessEvidence(composition, suppliedReceipts = []) {
  validateCompositionForEvidence(composition);
  if (!Array.isArray(suppliedReceipts)) {
    throw new TypeError('POLYGLOT_EVIDENCE_RECEIPTS_NOT_ARRAY');
  }

  const acceptedReceipts = [];
  const rejectedReceipts = [];
  const seenReceiptIds = new Set();
  for (let receiptIndex = 0; receiptIndex < suppliedReceipts.length; receiptIndex += 1) {
    const supplied = suppliedReceipts[receiptIndex];
    try {
      const validated = validateEvidenceReceipt(composition, supplied);
      const receiptId = validated.receipt.receiptId;
      if (seenReceiptIds.has(receiptId)) {
        throw new Error('POLYGLOT_EVIDENCE_DUPLICATE_RECEIPT_ID');
      }
      seenReceiptIds.add(receiptId);
      acceptedReceipts.push(validated.receipt);
    } catch (error) {
      rejectedReceipts.push({
        receiptIndex,
        suppliedReceiptId:
          supplied && typeof supplied === 'object' && typeof supplied.receiptId === 'string'
            ? supplied.receiptId
            : null,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const handoffAssessments = composition.handoffs.map((handoff, handoffIndex) => {
    let contract = null;
    let contractError = null;
    if (handoff.status === 'defined') {
      try {
        contract = createHandoffContract(composition, handoffIndex);
      } catch (error) {
        contractError = error instanceof Error ? error.message : String(error);
      }
    }
    const receipts = acceptedReceipts.filter(
      (receipt) => receipt.handoffIndex === handoffIndex,
    );
    const status = contractError
      ? 'HANDOFF_CONTRACT_BINDING_INVALID'
      : classifyHandoffEvidence(handoff, receipts);
    return {
      handoffIndex,
      boundaryIndex: handoff.boundaryIndex,
      from: handoff.from,
      to: handoff.to,
      contractStatus: handoff.status,
      contractId: contract?.contractId || null,
      contractError,
      status,
      acceptedReceiptIds: receipts.map((receipt) => receipt.receiptId).sort(),
      claimedResults: [...new Set(receipts.map((receipt) => receipt.evidence.claimedResult))].sort(),
      verificationReplayed: false,
      callerClaimPromotedToFact: false,
    };
  });

  const boundaryAssessments = composition.boundaries.map((boundary) => {
    const matchingHandoffs = handoffAssessments.filter(
      (assessment) => assessment.boundaryIndex === boundary.boundaryIndex,
    );
    return {
      boundaryIndex: boundary.boundaryIndex,
      from: boundary.from,
      to: boundary.to,
      contractStatus: boundary.status,
      status: classifyBoundaryEvidence(boundary, matchingHandoffs),
      handoffIndexes: matchingHandoffs.map((item) => item.handoffIndex),
      acceptedReceiptIds: matchingHandoffs
        .flatMap((item) => item.acceptedReceiptIds)
        .sort(),
      verificationReplayed: false,
      semanticCompatibilityClaimed: false,
    };
  });

  const reviewRequired =
    rejectedReceipts.length > 0 ||
    handoffAssessments.some(
      (assessment) =>
        assessment.status === 'CONFLICTING_CALLER_RESULTS' ||
        assessment.status.startsWith('CALLER_FAIL') ||
        assessment.status === 'HANDOFF_CONTRACT_BINDING_INVALID',
    );
  const completePass =
    boundaryAssessments.length > 0 &&
    boundaryAssessments.every(
      (boundary) =>
        boundary.status === 'CALLER_PASS_EVIDENCE_COMPLETE_NOT_REPLAYED',
    );
  const overallStatus = reviewRequired
    ? 'EVIDENCE_REVIEW_REQUIRED'
    : completePass
      ? 'CALLER_PASS_RECEIPTS_COMPLETE_NOT_REPLAYED'
      : 'EVIDENCE_INCOMPLETE';

  const resultCounts = Object.fromEntries(CLAIMED_RESULTS.map((result) => [result, 0]));
  for (const receipt of acceptedReceipts) {
    resultCounts[receipt.evidence.claimedResult] += 1;
  }

  const body = {
    schema: 'axm.polyglot-handoff-evidence-report/v1',
    compositionId: composition.compositionId,
    overallStatus,
    suppliedReceiptCount: suppliedReceipts.length,
    acceptedReceiptCount: acceptedReceipts.length,
    rejectedReceiptCount: rejectedReceipts.length,
    acceptedResultCounts: resultCounts,
    acceptedReceipts: cloneJson(acceptedReceipts).sort((a, b) =>
      a.receiptId.localeCompare(b.receiptId),
    ),
    rejectedReceipts,
    handoffAssessments,
    boundaryAssessments,
    truthBoundary: {
      executionReceiptContentInspected: false,
      verificationExecutedByThisModule: false,
      underlyingExecutionReplayed: false,
      receiptOriginAuthenticated: false,
      callerClaimsPromotedToFact: false,
      semanticCompatibilityClaimed: false,
      automaticPromotion: false,
      workspaceInspected: false,
      toolExecution: false,
      network: false,
      authority: 'NONE',
    },
  };
  return {
    ...body,
    evidenceReportId: digest(body),
  };
}

module.exports = {
  CLAIMED_RESULTS,
  assessEvidence,
  classifyBoundaryEvidence,
  classifyHandoffEvidence,
  cleanDigestList,
  createEvidenceReceipt,
  createHandoffContract,
  getDefinedHandoff,
  validateCompositionForEvidence,
  validateEvidenceReceipt,
};
