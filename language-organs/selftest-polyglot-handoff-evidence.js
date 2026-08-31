'use strict';

const assert = require('assert');
const {
  createPolyglotGrammarComposer,
  digest,
} = require('./polyglot-grammar-composition.js');
const {
  assessEvidence,
  createEvidenceReceipt,
  createHandoffContract,
} = require('./polyglot-handoff-evidence.js');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function syntheticDigest(label) {
  return digest({ syntheticEvidenceFixture: label });
}

function receiptFor(composition, handoffIndex, claimedResult, suffix) {
  return createEvidenceReceipt({
    composition,
    handoffIndex,
    verifierId: `fixture-verifier-${suffix}`,
    verifierDigest: syntheticDigest(`verifier-${suffix}`),
    evidenceKind: 'bounded-contract-check',
    claimedResult,
    executionReceiptSchema: 'axm.fixture-execution-receipt/v1',
    executionReceiptDigest: syntheticDigest(`execution-${suffix}`),
    subjectDigests: [syntheticDigest(`subject-${suffix}`)],
    outputDigests: [syntheticDigest(`output-${suffix}`)],
    findingCodes: claimedResult === 'FAIL' ? ['FIXTURE_FAILURE'] : [],
    notes: [`fixture receipt ${suffix}`],
  });
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
        producerGuarantees: ['values remain separate from SQL text'],
        consumerAssumptions: ['driver supports bound values'],
        validation: ['reject unbound placeholders'],
      },
      {
        from: 'sql',
        to: 'rust',
        kind: 'result-set',
        artifact: 'typed rows',
        producerGuarantees: ['column order is declared'],
        consumerAssumptions: ['decoder uses the declared row schema'],
        validation: ['validate row schema before decoding'],
      },
    ],
  });
  const originalCompositionJson = JSON.stringify(composition);

  const contract0 = createHandoffContract(composition, 0);
  const contract1 = createHandoffContract(composition, 1);
  assert.strictEqual(contract0.contractId.length, 64);
  assert.strictEqual(contract1.contractId.length, 64);
  assert.notStrictEqual(contract0.contractId, contract1.contractId);
  assert.strictEqual(
    createHandoffContract(composition, 0).contractId,
    contract0.contractId,
  );
  assert.strictEqual(contract0.producer.languageId, 'python');
  assert.strictEqual(contract0.consumer.languageId, 'sql');
  assert.strictEqual(contract0.semanticCompatibilityClaimed, false);
  assert.strictEqual(contract0.verificationExecuted, false);

  const pass0 = receiptFor(composition, 0, 'PASS', 'pass-0');
  const pass1 = receiptFor(composition, 1, 'PASS', 'pass-1');
  assert.strictEqual(pass0.contractId, contract0.contractId);
  assert.strictEqual(pass1.contractId, contract1.contractId);
  assert.strictEqual(pass0.receiptId.length, 64);
  assert.strictEqual(pass0.truthBoundary.verificationExecutedByThisModule, false);
  assert.strictEqual(pass0.truthBoundary.receiptOriginAuthenticated, false);
  assert.strictEqual(pass0.truthBoundary.callerClaimPromotedToFact, false);

  const complete = assessEvidence(composition, [pass0, pass1]);
  assert.strictEqual(
    complete.overallStatus,
    'CALLER_PASS_RECEIPTS_COMPLETE_NOT_REPLAYED',
  );
  assert.strictEqual(complete.suppliedReceiptCount, 2);
  assert.strictEqual(complete.acceptedReceiptCount, 2);
  assert.strictEqual(complete.rejectedReceiptCount, 0);
  assert.deepStrictEqual(complete.acceptedResultCounts, {
    PASS: 2,
    FAIL: 0,
    INCONCLUSIVE: 0,
  });
  assert.deepStrictEqual(
    complete.boundaryAssessments.map((item) => item.status),
    [
      'CALLER_PASS_EVIDENCE_COMPLETE_NOT_REPLAYED',
      'CALLER_PASS_EVIDENCE_COMPLETE_NOT_REPLAYED',
    ],
  );
  assert.strictEqual(complete.truthBoundary.underlyingExecutionReplayed, false);
  assert.strictEqual(complete.truthBoundary.receiptOriginAuthenticated, false);
  assert.strictEqual(complete.truthBoundary.automaticPromotion, false);
  assert.strictEqual(complete.evidenceReportId.length, 64);

  const reordered = assessEvidence(composition, [pass1, pass0]);
  assert.strictEqual(reordered.evidenceReportId, complete.evidenceReportId);

  const inconclusive1 = receiptFor(
    composition,
    1,
    'INCONCLUSIVE',
    'inconclusive-1',
  );
  const mixedUnresolved = assessEvidence(composition, [pass0, pass1, inconclusive1]);
  assert.strictEqual(mixedUnresolved.overallStatus, 'EVIDENCE_INCOMPLETE');
  assert.strictEqual(
    mixedUnresolved.handoffAssessments[1].status,
    'CALLER_PASS_AND_INCONCLUSIVE_RECEIPTS_PRESENT_NOT_REPLAYED',
  );
  assert.strictEqual(
    mixedUnresolved.boundaryAssessments[1].status,
    'CALLER_EVIDENCE_INCONCLUSIVE_NOT_REPLAYED',
  );

  const fail0 = receiptFor(composition, 0, 'FAIL', 'fail-0');
  const conflict = assessEvidence(composition, [pass0, fail0, pass1]);
  assert.strictEqual(conflict.overallStatus, 'EVIDENCE_REVIEW_REQUIRED');
  assert.strictEqual(
    conflict.handoffAssessments[0].status,
    'CONFLICTING_CALLER_RESULTS',
  );
  assert.strictEqual(
    conflict.boundaryAssessments[0].status,
    'CONFLICTING_CALLER_EVIDENCE',
  );

  const duplicate = assessEvidence(composition, [pass0, pass0, pass1]);
  assert.strictEqual(duplicate.overallStatus, 'EVIDENCE_REVIEW_REQUIRED');
  assert.strictEqual(duplicate.acceptedReceiptCount, 2);
  assert.strictEqual(duplicate.rejectedReceiptCount, 1);
  assert.strictEqual(
    duplicate.rejectedReceipts[0].reason,
    'POLYGLOT_EVIDENCE_DUPLICATE_RECEIPT_ID',
  );

  const tamperedReceipt = cloneJson(pass0);
  tamperedReceipt.evidence.claimedResult = 'FAIL';
  const tamperedReport = assessEvidence(composition, [tamperedReceipt]);
  assert.strictEqual(tamperedReport.acceptedReceiptCount, 0);
  assert.strictEqual(tamperedReport.rejectedReceiptCount, 1);
  assert.strictEqual(
    tamperedReport.rejectedReceipts[0].reason,
    'POLYGLOT_EVIDENCE_RECEIPT_DIGEST_MISMATCH',
  );

  const extraAuthorityClaim = cloneJson(pass0);
  extraAuthorityClaim.hiddenAuthority = 'PROMOTE';
  delete extraAuthorityClaim.receiptId;
  extraAuthorityClaim.receiptId = digest(extraAuthorityClaim);
  const extraAuthorityReport = assessEvidence(composition, [extraAuthorityClaim]);
  assert.strictEqual(extraAuthorityReport.acceptedReceiptCount, 0);
  assert.strictEqual(
    extraAuthorityReport.rejectedReceipts[0].reason,
    'POLYGLOT_EVIDENCE_RECEIPT_SHAPE_INVALID_KEYS',
  );

  const otherComposition = composer.compose(['python', 'sql', 'rust'], {
    handoffs: [
      {
        from: 'python',
        to: 'sql',
        kind: 'database-query',
        artifact: 'parameterized SQL statement + bound values',
        notes: ['new contract revision'],
      },
      {
        from: 'sql',
        to: 'rust',
        kind: 'result-set',
        artifact: 'typed rows',
      },
    ],
  });
  assert.notStrictEqual(otherComposition.compositionId, composition.compositionId);
  const staleReceiptReport = assessEvidence(otherComposition, [pass0]);
  assert.strictEqual(staleReceiptReport.acceptedReceiptCount, 0);
  assert.strictEqual(
    staleReceiptReport.rejectedReceipts[0].reason,
    'POLYGLOT_EVIDENCE_COMPOSITION_BINDING_MISMATCH',
  );

  const partialComposition = composer.compose(['python', 'sql'], {
    handoffs: [
      {
        from: 'python',
        to: 'sql',
        artifact: 'query request without interface kind',
      },
    ],
  });
  assert.throws(
    () => receiptFor(partialComposition, 0, 'PASS', 'partial'),
    /POLYGLOT_HANDOFF_CONTRACT_NOT_DEFINED:0/,
  );
  const partialReport = assessEvidence(partialComposition, []);
  assert.strictEqual(partialReport.overallStatus, 'EVIDENCE_INCOMPLETE');
  assert.strictEqual(
    partialReport.handoffAssessments[0].status,
    'HANDOFF_CONTRACT_PARTIAL_EVIDENCE_HELD',
  );
  assert.strictEqual(
    partialReport.boundaryAssessments[0].status,
    'HANDOFF_CONTRACT_PARTIAL',
  );

  const missingComposition = composer.compose(['python', 'sql']);
  const missingReport = assessEvidence(missingComposition, []);
  assert.strictEqual(missingReport.overallStatus, 'EVIDENCE_INCOMPLETE');
  assert.strictEqual(missingReport.boundaryAssessments[0].status, 'NO_HANDOFF_CONTRACT');

  const repeatedComposition = composer.compose(
    ['python', 'sql', 'python', 'sql'],
    {
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
    },
  );
  const repeatedContract0 = createHandoffContract(repeatedComposition, 0);
  const repeatedContract2 = createHandoffContract(repeatedComposition, 2);
  assert.notStrictEqual(repeatedContract0.contractId, repeatedContract2.contractId);
  assert.strictEqual(repeatedContract0.boundaryIndex, 0);
  assert.strictEqual(repeatedContract2.boundaryIndex, 2);

  assert.throws(
    () =>
      createEvidenceReceipt({
        composition,
        handoffIndex: 0,
        verifierId: 'bad-digest-verifier',
        verifierDigest: 'not-a-digest',
        evidenceKind: 'fixture',
        claimedResult: 'PASS',
        executionReceiptSchema: 'fixture/v1',
        executionReceiptDigest: syntheticDigest('bad-digest-execution'),
        subjectDigests: [syntheticDigest('bad-digest-subject')],
      }),
    /POLYGLOT_EVIDENCE_VERIFIER_DIGEST_INVALID/,
  );
  assert.throws(
    () =>
      createEvidenceReceipt({
        composition,
        handoffIndex: 0,
        verifierId: 'missing-subject-verifier',
        verifierDigest: syntheticDigest('missing-subject-verifier'),
        evidenceKind: 'fixture',
        claimedResult: 'PASS',
        executionReceiptSchema: 'fixture/v1',
        executionReceiptDigest: syntheticDigest('missing-subject-execution'),
        subjectDigests: [],
      }),
    /POLYGLOT_EVIDENCE_SUBJECT_REQUIRED/,
  );

  const malformedHandoff = cloneJson(composition);
  malformedHandoff.handoffs[0].status = 'partial';
  delete malformedHandoff.compositionId;
  malformedHandoff.compositionId = digest(malformedHandoff);
  assert.throws(
    () => assessEvidence(malformedHandoff, []),
    /POLYGLOT_HANDOFF_STATUS_MISMATCH:0/,
  );

  const malformedBoundaryIndex = cloneJson(composition);
  malformedBoundaryIndex.boundaries[0].handoffIndexes = [];
  delete malformedBoundaryIndex.compositionId;
  malformedBoundaryIndex.compositionId = digest(malformedBoundaryIndex);
  assert.throws(
    () => assessEvidence(malformedBoundaryIndex, []),
    /POLYGLOT_BOUNDARY_HANDOFF_INDEXES_MISMATCH:0/,
  );

  assert.strictEqual(JSON.stringify(composition), originalCompositionJson);
  console.log('polyglot handoff evidence real-body selftest: ok');
}

run();
