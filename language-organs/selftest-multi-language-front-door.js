'use strict';

const assert = require('assert');
const { digest } = require('./polyglot-grammar-composition.js');
const multiLanguage = require('./multi-language.js');

function syntheticDigest(label) {
  return digest({ multiLanguageFrontDoorFixture: label });
}

function run() {
  const map = multiLanguage.describeMultiLanguageCapability();
  assert.strictEqual(map.schema, 'axm.multi-language-capability-map/v1');
  assert.strictEqual(map.capabilities.length, 7);
  assert.strictEqual(map.capabilityMapId.length, 64);
  assert.strictEqual(map.truthBoundary.authority, 'NONE');
  assert.strictEqual(map.truthBoundary.languageFamiliesMerged, false);

  const composer = multiLanguage.createMultiLanguageComposer();
  const composition = composer.compose(['python', 'sql'], {
    handoffs: [
      {
        from: 'python',
        to: 'sql',
        kind: 'database-query',
        artifact: 'parameterized SQL statement + bound values',
        validation: ['reject unbound placeholders'],
      },
    ],
  });
  const contract = multiLanguage.createMultiLanguageHandoffContract(composition, 0);
  assert.strictEqual(contract.contractId.length, 64);

  const workpackBuilder = multiLanguage.createMultiLanguageVerificationWorkpack();
  const workpack = workpackBuilder.create(composition, []);
  assert.strictEqual(workpack.workItems.length, 1);
  assert.strictEqual(
    workpack.workItems[0].taskType,
    'RUN_VERIFIER_AND_ISSUE_RECEIPT',
  );
  assert.strictEqual(
    multiLanguage.validateMultiLanguageVerificationWorkpack(workpack),
    true,
  );

  const telemetry = multiLanguage.createMultiLanguageTelemetryReceipt({
    workpack,
    workItemId: workpack.workItems[0].workItemId,
    collectorId: 'front-door-fixture-collector',
    collectorDigest: syntheticDigest('collector'),
    measurementSourceSchema: 'axm.fixture-measurement-source/v1',
    measurementSourceDigest: syntheticDigest('source'),
    metrics: {
      wallClockMs: 10,
      cpuTimeMs: 8,
      peakRssBytes: 1_000_000,
    },
  });
  const telemetryReport = multiLanguage.assessMultiLanguageTelemetry(workpack, [telemetry]);
  assert.strictEqual(telemetryReport.status, 'COMPLETE_MEASURED_TELEMETRY');
  assert.strictEqual(telemetryReport.aggregate.totals.wallClockMs, 10);

  console.log('multi-language front door real-body selftest: ok');
}

run();
