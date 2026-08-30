'use strict';

const fs = require('fs');
const registry = require('./placement-registry.js');
const graphHand = require('./workspace-edit-graph-hand.js');

const payloadPath = process.argv[2];
if (!payloadPath) throw Error('GRAPH_WORKER_PAYLOAD_REQUIRED');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
const metadata = payload.adapter;
const adapter = {...metadata, adapterSha256: registry.hash(metadata), verify() { return {passed: true, observations: {fixtureResult: 'GRAPH_CRASH_WORKER_PASS'}}; }};
const result = graphHand.apply({workspaceRoot: payload.workspaceRoot, journalRoot: payload.journalRoot, declaration: payload.declaration, projectMapObservation: payload.observation, editGraph: payload.editGraph, candidateEntries: payload.candidateEntries, authorization: payload.authorization, verifierAdapters: [adapter]});
process.stdout.write(`${JSON.stringify(result)}\n`);
