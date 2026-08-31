# Multi-language Verification Telemetry

`multi-language-verification-telemetry.js` records measured resource data for exact verification work items.

It exists to replace invented estimates with digest-bound observations after work actually runs.

## Measurement flow

1. Create a verification workpack.
2. Dispatch selected work items through an external, caller-controlled executor.
3. Let the executor or measurement collector produce a source receipt.
4. Create one telemetry receipt bound to the exact `workpackId` and `workItemId`.
5. Assess coverage, totals, rejected measurements, and optional measured budgets.

The telemetry layer does not run the work or inspect the external measurement source.

## Create a telemetry receipt

```js
const {
  createTelemetryReceipt,
} = require('./multi-language-verification-telemetry.js');

const receipt = createTelemetryReceipt({
  workpack,
  workItemId: workpack.workItems[0].workItemId,
  collectorId: 'local-process-meter-v1',
  collectorDigest: '<64-character SHA-256>',
  measurementSourceSchema: 'example.process-measurement/v1',
  measurementSourceDigest: '<64-character SHA-256>',
  metrics: {
    wallClockMs: 120,
    cpuTimeMs: 90,
    peakRssBytes: 18000000,
    readBytes: 2000,
    writtenBytes: 600,
    inputArtifactBytes: 900,
    outputArtifactBytes: 500,
  },
});
```

Every supplied metric must be a non-negative safe integer. At least one metric is required. Missing metrics remain `null`; they are never estimated or silently filled.

## Supported measured fields

- `wallClockMs`
- `cpuTimeMs`
- `peakRssBytes`
- `readBytes`
- `writtenBytes`
- `inputArtifactBytes`
- `outputArtifactBytes`

`peakRssBytesMax` in the aggregate report is the largest measured per-work-item RSS value. It is not a claim about combined concurrent campaign memory, because the module does not infer scheduling or overlap.

## Exact binding

A telemetry receipt binds:

- workpack ID;
- work-item ID;
- task type;
- target composition ID;
- collector ID and digest;
- external measurement-source schema and digest;
- measured fields;
- deterministic telemetry receipt ID.

A receipt from another workpack or another task is rejected.

Only one accepted measurement receipt is allowed per work item in version 1. Multiple attempts require an explicit future attempt model rather than silent double counting.

## Assessment states

`assessTelemetry(workpack, receipts)` returns:

- `NO_WORK_ITEMS`
- `NO_MEASURED_TELEMETRY`
- `PARTIAL_MEASURED_TELEMETRY`
- `COMPLETE_MEASURED_TELEMETRY`
- `TELEMETRY_REVIEW_REQUIRED`

Review is required for tampered, malformed, stale, duplicate, wrong-workpack, or wrong-work-item receipts.

## Aggregation

For accepted receipts, the report provides:

- sums for wall time, CPU time, bytes read, bytes written, input artifact bytes, and output artifact bytes;
- maximum observed per-work-item peak RSS;
- coverage count for every metric;
- measured work-item IDs;
- unmeasured work-item IDs.

All sums are checked against JavaScript's safe-integer boundary. Overflow is rejected rather than rounded.

## Optional measured budgets

```js
const report = assessTelemetry(workpack, receipts, {
  measuredBudget: {
    maxTotalWallClockMs: 500,
    maxTotalCpuTimeMs: 400,
    maxPeakRssBytes: 32000000,
    maxTotalReadBytes: 100000,
    maxTotalWrittenBytes: 100000,
  },
});
```

Possible budget states:

- `NOT_DECLARED`
- `MEASURED_WITHIN_BUDGET`
- `MEASURED_BUDGET_EXCEEDED`
- `INSUFFICIENT_MEASURED_COVERAGE`

A declared metric budget is judged only when every work item has that metric. Partial coverage cannot become a false within-budget result.

## Truth boundary

Every receipt and report says:

```text
valuesAreCallerSuppliedMeasurements: true
measurementExecutedByThisModule: false
measurementSourceContentInspected: false
collectorIdentityAuthenticated: false
measurementOriginAuthenticated: false
estimatesProduced: false
unmeasuredValuesImputed: false
currencyCostComputed: false
energyCostComputed: false
automaticBudgetAuthority: false
authority: NONE
```

A digest proves self-consistency of the submitted measurement object. It does not prove that the collector was honest or calibrated.

## Verification

```bash
node language-organs/selftest-multi-language-verification-telemetry.js
```

The real-body test covers:

- complete measured coverage;
- deterministic order-independent valid reports;
- exact aggregation and maximum RSS;
- partial metric coverage;
- measured budget pass and exceed states;
- insufficient-coverage budget holds;
- tampered and hidden-key rejection;
- duplicate work-item measurement rejection;
- wrong-workpack rejection;
- invalid negative, fractional, and empty measurements;
- no-work behavior;
- preservation of the original workpack.
