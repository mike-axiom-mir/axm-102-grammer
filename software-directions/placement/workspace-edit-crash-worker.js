'use strict';

const fs = require('fs');
const registry = require('./placement-registry.js');
const editHand = require('./workspace-edit-hand.js');

const payloadPath = process.argv[2];
if (!payloadPath) throw Error('WORKER_PAYLOAD_REQUIRED');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
const adapterMetadata = payload.adapter;
const adapter = {
  ...adapterMetadata,
  adapterSha256: registry.hash(adapterMetadata),
  verify() {
    return {passed: true, observations: {fixtureResult: 'DURABLE_CRASH_WORKER_VERIFIER_PASS'}};
  }
};

const result = editHand.apply({
  workspaceRoot: payload.workspaceRoot,
  journalRoot: payload.journalRoot,
  declaration: payload.declaration,
  projectMapObservation: payload.observation,
  placementPlan: payload.plan,
  authorization: payload.authorization,
  candidates: payload.candidates,
  verifierAdapters: [adapter]
});

process.stdout.write(`${JSON.stringify(result)}\n`);
