'use strict';

const assert = require('assert');
const {
  createPolyglotGrammarComposer,
  digest,
} = require('./polyglot-grammar-composition.js');
const { createEvidenceReceipt } = require('./polyglot-handoff-evidence.js');
const {
  createMultiLanguageVerificationWorkpack,
} = require('./multi-language-verification-workpack.js');
const {
  assessTelemetry,
  createTelemetryReceipt,
} = require('./multi-language-verification-telemetry.js');

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function syntheticDigest(label) {
  return digest({ multiLanguageTelemetryFixture: label });
}

function createPassReceipt(composition, handoffIndex, label) {
  return createEvidenceReceipt({
    composition,
    handoffIndex,
    verifierId: `fixture-verifier-${label}`,
    verifierDigest: syntheticDigest(`verifier-${label}`),
    evidenceKind: 'bounded-contract-check',
    claimedResult: 'PASS',
    executionReceiptSchema: 'axm.fixture-execution-receipt/v1',
    executionReceiptDigest: syntheticDigest(`execution-${label}`),
    subjectDigests: [syntheticDigest(`subject-${label}`)],
    outputDigests: [syntheticDigest(`output-${label}`)],
  });
}

function telemetryFor(workpack, workItemIndex, label, metrics) {
  return createTelemetryReceipt({
    workpack,
    workItemId: workpack.workItems[workItemIndex].workItemId,
    collectorId: `fixture-collector-${label}`,
    collectorDigest: syntheticDigest(`collector-${label}`),
    measurementSourceSchema: 'axm.fixture-measurement-source/v1',
    measurementSourceDigest: syntheticDigest(`measurement-source-${label}`),
    metrics,
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
        validation: ['reject unbound placeholders'],
      },
      {
        from: 'sql',
        to: 'rust',
        kind: 'result-set',
        artifact: 'typed rows',
        validation: ['validate row schema before decoding'],
      },
    ],
  });
  const workpackBuilder = createMultiLanguageVerificationWorkpack();
  const workpack = workpackBuilder.create(composition, []);
  const originalWorkpackJson = JSON.stringify(workpack);
  assert.strictEqual(workpack.workItems.length, 2);
  assert.deepStrictEqual(
    workpack.workItems.map((item) => item.taskType),
    ['RUN_VERIFIER_AND_ISSUE_RECEIPT', 'RUN_VERIFIER_AND_ISSUE_RECEIPT'],
  );

  const telemetry0 = telemetryFor(workpack, 0, 'zero', {
    wallClockMs: 120,
    cpuTimeMs: 90,
    peakRssBytes: 12_000_000,
    readBytes: 1_000,
    writtenBytes: 400,
    inputArtifactBytes: 700,
    outputArtifactBytes: 300,
  });
  const telemetry1 = telemetryFor(workpack, 1, 'one', {
    wallClockMs: 80,
    cpuTimeMs: 60,
    peakRssBytes: 18_000_000,
    readBytes: 2_000,
    writtenBytes: 600,
    inputArtifactBytes: 900,
    outputArtifactBytes: 500,
  });
  assert.strictEqual(telemetry0.telemetryReceiptId.length, 64);
  assert.strictEqual(telemetry0.truthBoundary.estimatesProduced, false);
  assert.strictEqual(telemetry0.truthBoundary.measurementOriginAuthenticated, false);

  const complete = assessTelemetry(workpack, [telemetry0, telemetry1], {
    measuredBudget: {
      maxTotalWallClockMs: 250,
      maxTotalCpuTimeMs: 200,
      maxPeakRssBytes: 20_000_000,
      maxTotalReadBytes: 4_000,
      maxTotalWrittenBytes: 2_000,
    },
  });
  assert.strictEqual(complete.status, 'COMPLETE_MEASURED_TELEMETRY');
  assert.strictEqual(complete.acceptedReceiptCount, 2);
  assert.strictEqual(complete.rejectedReceiptCount, 0);
  assert.deepStrictEqual(complete.aggregate.totals, {
    wallClockMs: 200,
    cpuTimeMs: 150,
    peakRssBytesMax: 18_000_000,
    readBytes: 3_000,
    writtenBytes: 1_000,
    inputArtifactBytes: 1_600,
    outputArtifactBytes: 800,
  });
  assert.deepStrictEqual(complete.aggregate.metricCoverageCounts, {
    wallClockMs: 2,
    cpuTimeMs: 2,
    peakRssBytes: 2,
    readBytes: 2,
    writtenBytes: 2,
    inputArtifactBytes: 2,
    outputArtifactBytes: 2,
  });
  assert.deepStrictEqual(complete.aggregate.unmeasuredWorkItemIds, []);
  assert.strictEqual(complete.measuredBudgetAssessment.status, 'MEASURED_WITHIN_BUDGET');
  assert.strictEqual(complete.truthBoundary.estimatesProduced, false);
  assert.strictEqual(complete.truthBoundary.currencyCostComputed, false);
  assert.strictEqual(complete.telemetryReportId.length, 64);
  assert.strictEqual(
    assessTelemetry(workpack, [telemetry1, telemetry0], {
      measuredBudget: complete.measuredBudget,
    }).telemetryReportId,
    complete.telemetryReportId,
  );

  const partial = assessTelemetry(workpack, [telemetry0], {
    measuredBudget: { maxTotalWallClockMs: 250 },
  });
  assert.strictEqual(partial.status, 'PARTIAL_MEASURED_TELEMETRY');
  assert.strictEqual(partial.aggregate.measuredWorkItemIds.length, 1);
  assert.strictEqual(partial.aggregate.unmeasuredWorkItemIds.length, 1);
  assert.strictEqual(
    partial.measuredBudgetAssessment.status,
    'INSUFFICIENT_MEASURED_COVERAGE',
  );
  assert.strictEqual(
    partial.measuredBudgetAssessment.checks[0].status,
    'INSUFFICIENT_MEASUREMENT_COVERAGE',
  );

  const exceeded = assessTelemetry(workpack, [telemetry0, telemetry1], {
    measuredBudget: {
      maxTotalWallClockMs: 199,
      maxPeakRssBytes: 17_999_999,
    },
  });
  assert.strictEqual(exceeded.measuredBudgetAssessment.status, 'MEASURED_BUDGET_EXCEEDED');
  assert.deepStrictEqual(
    exceeded.measuredBudgetAssessment.checks
      .filter((check) => check.status === 'MEASURED_EXCEEDS_LIMIT')
      .map((check) => check.budgetField),
    ['maxTotalWallClockMs', 'maxPeakRssBytes'],
  );

  const tampered = cloneJson(telemetry0);
  tampered.metrics.wallClockMs = 1;
  const tamperedReport = assessTelemetry(workpack, [tampered]);
  assert.strictEqual(tamperedReport.status, 'TELEMETRY_REVIEW_REQUIRED');
  assert.strictEqual(tamperedReport.acceptedReceiptCount, 0);
  assert.strictEqual(
    tamperedReport.rejectedReceipts[0].reason,
    'MULTI_LANGUAGE_TELEMETRY_RECEIPT_DIGEST_MISMATCH',
  );

  const hiddenKey = cloneJson(telemetry0);
  hiddenKey.hiddenAuthority = 'TRUST_ME';
  delete hiddenKey.telemetryReceiptId;
  hiddenKey.telemetryReceiptId = digest(hiddenKey);
  const hiddenReport = assessTelemetry(workpack, [hiddenKey]);
  assert.strictEqual(hiddenReport.status, 'TELEMETRY_REVIEW_REQUIRED');
  assert.strictEqual(
    hiddenReport.rejectedReceipts[0].reason,
    'MULTI_LANGUAGE_TELEMETRY_RECEIPT_SHAPE_INVALID_KEYS',
  );

  const secondMeasurementSameWorkItem = telemetryFor(workpack, 0, 'zero-second', {
    wallClockMs: 121,
  });
  const duplicateWorkItem = assessTelemetry(workpack, [telemetry0, secondMeasurementSameWorkItem]);
  assert.strictEqual(duplicateWorkItem.status, 'TELEMETRY_REVIEW_REQUIRED');
  assert.strictEqual(duplicateWorkItem.acceptedReceiptCount, 1);
  assert.strictEqual(
    duplicateWorkItem.rejectedReceipts[0].reason,
    'MULTI_LANGUAGE_TELEMETRY_DUPLICATE_WORK_ITEM_MEASUREMENT',
  );

  const differentWorkpack = workpackBuilder.create(composition, [], {
    countBudget: { maxVerifierRuns: 2 },
  });
  assert.notStrictEqual(differentWorkpack.workpackId, workpack.workpackId);
  const wrongWorkpack = assessTelemetry(differentWorkpack, [telemetry0]);
  assert.strictEqual(wrongWorkpack.status, 'TELEMETRY_REVIEW_REQUIRED');
  assert.strictEqual(
    wrongWorkpack.rejectedReceipts[0].reason,
    'MULTI_LANGUAGE_TELEMETRY_WORKPACK_BINDING_MISMATCH',
  );

  assert.throws(
    () => telemetryFor(workpack, 0, 'negative', { wallClockMs: -1 }),
    /MULTI_LANGUAGE_TELEMETRY_METRIC_INVALID:wallClockMs/,
  );
  assert.throws(
    () => telemetryFor(workpack, 0, 'float', { cpuTimeMs: 1.5 }),
    /MULTI_LANGUAGE_TELEMETRY_METRIC_INVALID:cpuTimeMs/,
  );
  assert.throws(
    () => telemetryFor(workpack, 0, 'empty', {}),
    /MULTI_LANGUAGE_TELEMETRY_AT_LEAST_ONE_METRIC_REQUIRED/,
  );
  assert.throws(
    () =>
      assessTelemetry(workpack, [], {
        measuredBudget: { imaginaryBudget: 1 },
      }),
    /MULTI_LANGUAGE_TELEMETRY_UNKNOWN_BUDGET_FIELD:imaginaryBudget/,
  );

  const pass0 = createPassReceipt(composition, 0, 'pass-0');
  const pass1 = createPassReceipt(composition, 1, 'pass-1');
  const noWorkpack = workpackBuilder.create(composition, [pass0, pass1]);
  const noWork = assessTelemetry(noWorkpack, []);
  assert.strictEqual(noWork.status, 'NO_WORK_ITEMS');
  assert.strictEqual(noWork.workItemCount, 0);
  assert.deepStrictEqual(noWork.aggregate.unmeasuredWorkItemIds, []);

  assert.strictEqual(JSON.stringify(workpack), originalWorkpackJson);
  console.log('multi-language verification telemetry real-body selftest: ok');
}

run();
