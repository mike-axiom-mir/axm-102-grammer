'use strict';

const { digest } = require('./polyglot-grammar-composition.js');
const {
  validateVerificationWorkpack,
} = require('./multi-language-verification-workpack.js');

const METRIC_FIELDS = Object.freeze([
  'wallClockMs',
  'cpuTimeMs',
  'peakRssBytes',
  'readBytes',
  'writtenBytes',
  'inputArtifactBytes',
  'outputArtifactBytes',
]);

const MEASURED_BUDGET_FIELDS = Object.freeze([
  'maxTotalWallClockMs',
  'maxTotalCpuTimeMs',
  'maxPeakRssBytes',
  'maxTotalReadBytes',
  'maxTotalWrittenBytes',
]);

const TELEMETRY_RECEIPT_KEYS = Object.freeze([
  'schema',
  'workpackId',
  'workItemId',
  'taskType',
  'targetCompositionId',
  'collector',
  'measurementSource',
  'metrics',
  'truthBoundary',
  'telemetryReceiptId',
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

function assertDigest(value, fieldName) {
  const normalized = cleanText(value).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(`MULTI_LANGUAGE_TELEMETRY_${fieldName.toUpperCase()}_INVALID`);
  }
  return normalized;
}

function normalizeMetric(value, fieldName) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`MULTI_LANGUAGE_TELEMETRY_METRIC_INVALID:${fieldName}`);
  }
  return value;
}

function normalizeMetrics(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('MULTI_LANGUAGE_TELEMETRY_METRICS_NOT_OBJECT');
  }
  const unknown = Object.keys(source).filter((key) => !METRIC_FIELDS.includes(key));
  if (unknown.length) {
    throw new Error(`MULTI_LANGUAGE_TELEMETRY_UNKNOWN_METRIC:${unknown.sort()[0]}`);
  }
  const metrics = Object.fromEntries(
    METRIC_FIELDS.map((field) => [field, normalizeMetric(source[field], field)]),
  );
  if (!METRIC_FIELDS.some((field) => metrics[field] !== null)) {
    throw new Error('MULTI_LANGUAGE_TELEMETRY_AT_LEAST_ONE_METRIC_REQUIRED');
  }
  return metrics;
}

function normalizeMeasuredBudget(source = {}) {
  if (source == null) source = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('MULTI_LANGUAGE_TELEMETRY_MEASURED_BUDGET_NOT_OBJECT');
  }
  const unknown = Object.keys(source).filter((key) => !MEASURED_BUDGET_FIELDS.includes(key));
  if (unknown.length) {
    throw new Error(`MULTI_LANGUAGE_TELEMETRY_UNKNOWN_BUDGET_FIELD:${unknown.sort()[0]}`);
  }
  return Object.fromEntries(
    MEASURED_BUDGET_FIELDS.map((field) => [field, normalizeMetric(source[field], field)]),
  );
}

function findWorkItem(workpack, workItemId) {
  validateVerificationWorkpack(workpack);
  const normalized = assertDigest(workItemId, 'work_item_id');
  const workItem = workpack.workItems.find((item) => item.workItemId === normalized);
  if (!workItem) throw new Error('MULTI_LANGUAGE_TELEMETRY_WORK_ITEM_NOT_IN_WORKPACK');
  return workItem;
}

function createTelemetryReceipt(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('MULTI_LANGUAGE_TELEMETRY_INPUT_NOT_OBJECT');
  }
  const workpack = input.workpack;
  const workItem = findWorkItem(workpack, input.workItemId);
  const collectorId = cleanText(input.collectorId);
  if (!collectorId) throw new Error('MULTI_LANGUAGE_TELEMETRY_COLLECTOR_ID_REQUIRED');
  const collectorDigest = assertDigest(input.collectorDigest, 'collector_digest');
  const measurementSourceSchema = cleanText(input.measurementSourceSchema);
  if (!measurementSourceSchema) {
    throw new Error('MULTI_LANGUAGE_TELEMETRY_MEASUREMENT_SOURCE_SCHEMA_REQUIRED');
  }
  const measurementSourceDigest = assertDigest(
    input.measurementSourceDigest,
    'measurement_source_digest',
  );
  const metrics = normalizeMetrics(input.metrics || {});
  const body = {
    schema: 'axm.multi-language-work-item-telemetry-receipt/v1',
    workpackId: workpack.workpackId,
    workItemId: workItem.workItemId,
    taskType: workItem.taskType,
    targetCompositionId: workItem.targetCompositionId,
    collector: {
      collectorId,
      collectorDigest,
    },
    measurementSource: {
      schema: measurementSourceSchema,
      digest: measurementSourceDigest,
      contentInspectedByThisModule: false,
    },
    metrics,
    truthBoundary: {
      valuesAreCallerSuppliedMeasurements: true,
      measurementExecutedByThisModule: false,
      measurementSourceContentInspected: false,
      collectorIdentityAuthenticated: false,
      measurementOriginAuthenticated: false,
      estimatesProduced: false,
      currencyCostComputed: false,
      energyCostComputed: false,
      automaticBudgetAuthority: false,
      authority: 'NONE',
    },
  };
  return { ...body, telemetryReceiptId: digest(body) };
}

function validateTelemetryReceipt(workpack, receipt) {
  validateVerificationWorkpack(workpack);
  assertExactKeys(
    receipt,
    TELEMETRY_RECEIPT_KEYS,
    'MULTI_LANGUAGE_TELEMETRY_RECEIPT_SHAPE_INVALID',
  );
  if (receipt.schema !== 'axm.multi-language-work-item-telemetry-receipt/v1') {
    throw new Error('MULTI_LANGUAGE_TELEMETRY_RECEIPT_SCHEMA_INVALID');
  }
  const receiptId = assertDigest(receipt.telemetryReceiptId, 'telemetry_receipt_id');
  const body = cloneJson(receipt);
  delete body.telemetryReceiptId;
  if (digest(body) !== receiptId) {
    throw new Error('MULTI_LANGUAGE_TELEMETRY_RECEIPT_DIGEST_MISMATCH');
  }
  if (receipt.workpackId !== workpack.workpackId) {
    throw new Error('MULTI_LANGUAGE_TELEMETRY_WORKPACK_BINDING_MISMATCH');
  }
  const workItem = findWorkItem(workpack, receipt.workItemId);
  if (receipt.taskType !== workItem.taskType) {
    throw new Error('MULTI_LANGUAGE_TELEMETRY_TASK_TYPE_MISMATCH');
  }
  if (receipt.targetCompositionId !== workItem.targetCompositionId) {
    throw new Error('MULTI_LANGUAGE_TELEMETRY_TARGET_COMPOSITION_MISMATCH');
  }
  assertExactKeys(
    receipt.collector,
    ['collectorId', 'collectorDigest'],
    'MULTI_LANGUAGE_TELEMETRY_COLLECTOR_INVALID',
  );
  if (!cleanText(receipt.collector.collectorId)) {
    throw new Error('MULTI_LANGUAGE_TELEMETRY_COLLECTOR_ID_REQUIRED');
  }
  assertDigest(receipt.collector.collectorDigest, 'collector_digest');
  assertExactKeys(
    receipt.measurementSource,
    ['schema', 'digest', 'contentInspectedByThisModule'],
    'MULTI_LANGUAGE_TELEMETRY_MEASUREMENT_SOURCE_INVALID',
  );
  if (!cleanText(receipt.measurementSource.schema)) {
    throw new Error('MULTI_LANGUAGE_TELEMETRY_MEASUREMENT_SOURCE_SCHEMA_REQUIRED');
  }
  assertDigest(receipt.measurementSource.digest, 'measurement_source_digest');
  if (receipt.measurementSource.contentInspectedByThisModule !== false) {
    throw new Error('MULTI_LANGUAGE_TELEMETRY_MEASUREMENT_SOURCE_CLAIM_INVALID');
  }
  assertExactKeys(receipt.metrics, METRIC_FIELDS, 'MULTI_LANGUAGE_TELEMETRY_METRICS_INVALID');
  normalizeMetrics(receipt.metrics);
  const expectedTruth = {
    valuesAreCallerSuppliedMeasurements: true,
    measurementExecutedByThisModule: false,
    measurementSourceContentInspected: false,
    collectorIdentityAuthenticated: false,
    measurementOriginAuthenticated: false,
    estimatesProduced: false,
    currencyCostComputed: false,
    energyCostComputed: false,
    automaticBudgetAuthority: false,
    authority: 'NONE',
  };
  assertExactKeys(
    receipt.truthBoundary,
    Object.keys(expectedTruth),
    'MULTI_LANGUAGE_TELEMETRY_TRUTH_BOUNDARY_INVALID',
  );
  for (const [key, expected] of Object.entries(expectedTruth)) {
    if (receipt.truthBoundary[key] !== expected) {
      throw new Error(`MULTI_LANGUAGE_TELEMETRY_TRUTH_BOUNDARY_MISMATCH:${key}`);
    }
  }
  return { receipt: cloneJson(receipt), workItem };
}

function safeAdd(left, right, fieldName) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new Error(`MULTI_LANGUAGE_TELEMETRY_AGGREGATE_OVERFLOW:${fieldName}`);
  }
  return result;
}

function aggregateAcceptedTelemetry(workpack, acceptedReceipts) {
  const totals = {
    wallClockMs: 0,
    cpuTimeMs: 0,
    peakRssBytesMax: 0,
    readBytes: 0,
    writtenBytes: 0,
    inputArtifactBytes: 0,
    outputArtifactBytes: 0,
  };
  const metricCoverageCounts = Object.fromEntries(METRIC_FIELDS.map((field) => [field, 0]));
  for (const receipt of acceptedReceipts) {
    for (const field of METRIC_FIELDS) {
      const value = receipt.metrics[field];
      if (value === null) continue;
      metricCoverageCounts[field] += 1;
      if (field === 'peakRssBytes') {
        totals.peakRssBytesMax = Math.max(totals.peakRssBytesMax, value);
      } else {
        totals[field] = safeAdd(totals[field], value, field);
      }
    }
  }
  const measuredWorkItemIds = acceptedReceipts.map((receipt) => receipt.workItemId).sort();
  const unmeasuredWorkItemIds = workpack.workItems
    .map((item) => item.workItemId)
    .filter((id) => !measuredWorkItemIds.includes(id))
    .sort();
  return {
    totals,
    metricCoverageCounts,
    measuredWorkItemIds,
    unmeasuredWorkItemIds,
  };
}

function budgetCheck({ budgetField, metricField, actual, coverageCount, workItemCount, limit }) {
  if (limit === null) {
    return { budgetField, metricField, limit, actual, coverageCount, status: 'NOT_DECLARED' };
  }
  if (coverageCount !== workItemCount) {
    return {
      budgetField,
      metricField,
      limit,
      actual,
      coverageCount,
      status: 'INSUFFICIENT_MEASUREMENT_COVERAGE',
    };
  }
  return {
    budgetField,
    metricField,
    limit,
    actual,
    coverageCount,
    status: actual <= limit ? 'MEASURED_WITHIN_LIMIT' : 'MEASURED_EXCEEDS_LIMIT',
  };
}

function assessMeasuredBudget(workpack, aggregate, measuredBudget) {
  const workItemCount = workpack.workItems.length;
  const checks = [
    budgetCheck({
      budgetField: 'maxTotalWallClockMs',
      metricField: 'wallClockMs',
      actual: aggregate.totals.wallClockMs,
      coverageCount: aggregate.metricCoverageCounts.wallClockMs,
      workItemCount,
      limit: measuredBudget.maxTotalWallClockMs,
    }),
    budgetCheck({
      budgetField: 'maxTotalCpuTimeMs',
      metricField: 'cpuTimeMs',
      actual: aggregate.totals.cpuTimeMs,
      coverageCount: aggregate.metricCoverageCounts.cpuTimeMs,
      workItemCount,
      limit: measuredBudget.maxTotalCpuTimeMs,
    }),
    budgetCheck({
      budgetField: 'maxPeakRssBytes',
      metricField: 'peakRssBytes',
      actual: aggregate.totals.peakRssBytesMax,
      coverageCount: aggregate.metricCoverageCounts.peakRssBytes,
      workItemCount,
      limit: measuredBudget.maxPeakRssBytes,
    }),
    budgetCheck({
      budgetField: 'maxTotalReadBytes',
      metricField: 'readBytes',
      actual: aggregate.totals.readBytes,
      coverageCount: aggregate.metricCoverageCounts.readBytes,
      workItemCount,
      limit: measuredBudget.maxTotalReadBytes,
    }),
    budgetCheck({
      budgetField: 'maxTotalWrittenBytes',
      metricField: 'writtenBytes',
      actual: aggregate.totals.writtenBytes,
      coverageCount: aggregate.metricCoverageCounts.writtenBytes,
      workItemCount,
      limit: measuredBudget.maxTotalWrittenBytes,
    }),
  ];
  const declared = checks.filter((check) => check.status !== 'NOT_DECLARED');
  let status = 'NOT_DECLARED';
  if (declared.some((check) => check.status === 'MEASURED_EXCEEDS_LIMIT')) {
    status = 'MEASURED_BUDGET_EXCEEDED';
  } else if (declared.some((check) => check.status === 'INSUFFICIENT_MEASUREMENT_COVERAGE')) {
    status = 'INSUFFICIENT_MEASURED_COVERAGE';
  } else if (declared.length > 0) {
    status = 'MEASURED_WITHIN_BUDGET';
  }
  return { status, checks };
}

function assessTelemetry(workpack, suppliedReceipts = [], options = {}) {
  validateVerificationWorkpack(workpack);
  if (!Array.isArray(suppliedReceipts)) {
    throw new TypeError('MULTI_LANGUAGE_TELEMETRY_RECEIPTS_NOT_ARRAY');
  }
  const measuredBudget = normalizeMeasuredBudget(options.measuredBudget || {});
  const acceptedReceipts = [];
  const rejectedReceipts = [];
  const seenReceiptIds = new Set();
  const seenWorkItemIds = new Set();

  for (let receiptIndex = 0; receiptIndex < suppliedReceipts.length; receiptIndex += 1) {
    const supplied = suppliedReceipts[receiptIndex];
    try {
      const validated = validateTelemetryReceipt(workpack, supplied);
      const receipt = validated.receipt;
      if (seenReceiptIds.has(receipt.telemetryReceiptId)) {
        throw new Error('MULTI_LANGUAGE_TELEMETRY_DUPLICATE_RECEIPT_ID');
      }
      if (seenWorkItemIds.has(receipt.workItemId)) {
        throw new Error('MULTI_LANGUAGE_TELEMETRY_DUPLICATE_WORK_ITEM_MEASUREMENT');
      }
      seenReceiptIds.add(receipt.telemetryReceiptId);
      seenWorkItemIds.add(receipt.workItemId);
      acceptedReceipts.push(receipt);
    } catch (error) {
      rejectedReceipts.push({
        receiptIndex,
        suppliedTelemetryReceiptId:
          supplied && typeof supplied === 'object' && typeof supplied.telemetryReceiptId === 'string'
            ? supplied.telemetryReceiptId
            : null,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  acceptedReceipts.sort((left, right) =>
    left.telemetryReceiptId.localeCompare(right.telemetryReceiptId),
  );
  const aggregate = aggregateAcceptedTelemetry(workpack, acceptedReceipts);
  const measuredBudgetAssessment = assessMeasuredBudget(workpack, aggregate, measuredBudget);

  let status = 'NO_MEASURED_TELEMETRY';
  if (rejectedReceipts.length > 0) status = 'TELEMETRY_REVIEW_REQUIRED';
  else if (workpack.workItems.length === 0) status = 'NO_WORK_ITEMS';
  else if (acceptedReceipts.length === workpack.workItems.length) {
    status = 'COMPLETE_MEASURED_TELEMETRY';
  } else if (acceptedReceipts.length > 0) {
    status = 'PARTIAL_MEASURED_TELEMETRY';
  }

  const body = {
    schema: 'axm.multi-language-verification-telemetry-report/v1',
    workpackId: workpack.workpackId,
    targetCompositionId: workpack.targetCompositionId,
    status,
    suppliedReceiptCount: suppliedReceipts.length,
    acceptedReceiptCount: acceptedReceipts.length,
    rejectedReceiptCount: rejectedReceipts.length,
    workItemCount: workpack.workItems.length,
    acceptedReceipts,
    rejectedReceipts,
    aggregate,
    measuredBudget,
    measuredBudgetAssessment,
    truthBoundary: {
      valuesAreCallerSuppliedMeasurements: true,
      measurementExecutedByThisModule: false,
      measurementSourcesInspected: false,
      collectorIdentitiesAuthenticated: false,
      measurementOriginsAuthenticated: false,
      estimatesProduced: false,
      unmeasuredValuesImputed: false,
      currencyCostComputed: false,
      energyCostComputed: false,
      automaticBudgetAuthority: false,
      executionReadinessClaimed: false,
      authority: 'NONE',
    },
  };
  return { ...body, telemetryReportId: digest(body) };
}

module.exports = {
  MEASURED_BUDGET_FIELDS,
  METRIC_FIELDS,
  aggregateAcceptedTelemetry,
  assessMeasuredBudget,
  assessTelemetry,
  createTelemetryReceipt,
  normalizeMeasuredBudget,
  normalizeMetrics,
  validateTelemetryReceipt,
};
