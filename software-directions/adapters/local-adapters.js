'use strict';

const registry = require('./adapter-registry.js');
const referenceBuilds = require('../frontier-reference-builds.js');

const AUTHORITY = Object.freeze({currentNodeVersionRead: true, boundedInMemoryExecution: true, workspaceRead: false, workspaceMutation: false, childProcessExecution: false, network: false, install: false, deployment: false, physicalControl: false, promotion: false, canon: false});

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

function allChecksPass(build) {
  const values = Object.values(build.checks || {});
  return values.length > 0 && values.every(value => value === true);
}

function numericValues(value, out = []) {
  if (typeof value === 'number') out.push(value);
  else if (Array.isArray(value)) for (const item of value) numericValues(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) numericValues(item, out);
  return out;
}

function runtimeReceipt(packet) {
  const adapter = registry.get('node-reference-runtime-v1');
  const major = Number(process.versions.node.split('.')[0]);
  const build = referenceBuilds.run(packet);
  const repeatBuild = referenceBuilds.run(packet);
  const body = {
    schema: 'axm.code.direction-runtime-adapter-receipt.v1',
    version: '1.0.0',
    status: 'TEST',
    result: major >= 18 && build.result === 'REFERENCE_BUILD_EXECUTED' && build.buildSha256 === repeatBuild.buildSha256 ? 'RUNTIME_ADAPTER_PASS' : 'RUNTIME_ADAPTER_FAIL',
    adapterId: adapter.id,
    adapterSha256: adapter.adapterSha256,
    packetSha256: packet.packetSha256,
    observedNodeVersion: process.version,
    runtimeRequirement: 'node>=18',
    firstBuildSha256: build.buildSha256,
    repeatBuildSha256: repeatBuild.buildSha256,
    separatelyExecutedBuilds: 2,
    deterministic: build.buildSha256 === repeatBuild.buildSha256,
    truth: {boundedInMemoryOnly: true, workspaceUsed: false, childProcessUsed: false, externalRuntimeClaimed: false, productionExecutionClaimed: false},
    authority: AUTHORITY
  };
  const receipt = freeze({...body, receiptSha256: registry.hash(body)});
  return freeze({receipt, build, repeatBuild});
}

function nodeCheckSurface({packet, build}) {
  const actual = Object.keys(build.checks).sort(); const expected = [...packet.challenge.expectedChecks].sort();
  return {passed: registry.canon(actual) === registry.canon(expected) && allChecksPass(build), observations: {expectedChecks: expected, actualChecks: actual, allBooleanTrue: allChecksPass(build)}};
}

function nodeLayerIntegration({packet, build}) {
  const capabilityLink = packet.challenge.requiredCapabilities.every(id => build.evidence.capabilities.includes(id));
  const outputBound = build.output && typeof build.output === 'object';
  return {passed: build.packetSha256 === packet.packetSha256 && build.schema === 'axm.code.frontier-direction-reference-build.v1' && capabilityLink && outputBound, observations: {packetBound: build.packetSha256 === packet.packetSha256, capabilityLink, outputBound}};
}

function nodeDeterministicReplay({build, repeatBuild}) {
  return {passed: build.buildSha256 === repeatBuild.buildSha256 && registry.canon(build) === registry.canon(repeatBuild), observations: {firstBuildSha256: build.buildSha256, repeatBuildSha256: repeatBuild.buildSha256}};
}

function nodeStructuralParse({build}) {
  let parsed = false; let documentCount = 0;
  if (build.artifactType === 'html-publication-model') {
    const html = build.output.html;
    documentCount = Array.isArray(html) ? html.length : 0;
    parsed = documentCount > 0 && html.every(item => /^<!doctype html><html\b/i.test(item) && item.includes('<head>') && item.includes('</head>') && item.includes('<body>') && item.includes('</body>') && item.includes('</html>'));
  } else {
    const serialized = JSON.stringify(build.output); const restored = JSON.parse(serialized);
    documentCount = 1; parsed = registry.canon(restored) === registry.canon(build.output);
  }
  return {passed: parsed, observations: {artifactType: build.artifactType, documentCount, boundedParser: build.artifactType === 'html-publication-model' ? 'reference-html-structure' : 'json-round-trip'}};
}

function nodeRecoverySemantics({build}) {
  const names = Object.keys(build.checks); const recoveryChecks = names.filter(name => /(undo|restore|rollback|resume|checkpoint|recover|migrat)/i.test(name));
  return {passed: recoveryChecks.length > 0 && recoveryChecks.every(name => build.checks[name] === true), observations: {recoveryChecks}};
}

function nodeReferenceSimulation({build}) {
  const explicitlySimulation = /simulation/i.test(build.artifactType);
  return {passed: explicitlySimulation && allChecksPass(build) && build.authority.physicalControl === false, observations: {artifactType: build.artifactType, explicitlySimulation, physicalControlAuthority: build.authority.physicalControl}};
}

function nodeNumericalFinite({build}) {
  const numbers = numericValues(build.output); const finite = numbers.length > 0 && numbers.every(Number.isFinite);
  return {passed: finite && allChecksPass(build), observations: {numericValueCount: numbers.length, finite}};
}

function nodeDataQuality({build}) {
  const names = Object.keys(build.checks); const dataChecks = names.filter(name => /(schema|quarantine|lineage|measure|filter|transform|quality)/i.test(name));
  return {passed: dataChecks.length > 0 && dataChecks.every(name => build.checks[name] === true), observations: {dataChecks}};
}

function nodeModelEvaluation({build}) {
  const modelArtifact = /model/i.test(build.artifactType); const evaluationChecks = Object.keys(build.checks).filter(name => /(evaluation|drift)/i.test(name));
  return {passed: modelArtifact && evaluationChecks.length > 0 && evaluationChecks.every(name => build.checks[name] === true), observations: {artifactType: build.artifactType, evaluationChecks}};
}

const IMPLEMENTATIONS = Object.freeze({nodeCheckSurface, nodeLayerIntegration, nodeDeterministicReplay, nodeStructuralParse, nodeRecoverySemantics, nodeReferenceSimulation, nodeNumericalFinite, nodeDataQuality, nodeModelEvaluation});

function verifierReceipt(adapter, context) {
  const implementation = IMPLEMENTATIONS[adapter.implementation];
  if (!implementation) throw Error(`DIRECTION_ADAPTER_IMPLEMENTATION_MISSING:${adapter.implementation}`);
  const evaluation = implementation(context);
  const body = {
    schema: 'axm.code.direction-verifier-adapter-receipt.v1',
    version: '1.0.0',
    status: 'TEST',
    result: evaluation.passed ? 'VERIFIER_ADAPTER_PASS' : 'VERIFIER_ADAPTER_FAIL',
    adapterId: adapter.id,
    adapterSha256: adapter.adapterSha256,
    verifierId: adapter.providesVerifierId,
    packetSha256: context.packet.packetSha256,
    buildSha256: context.build.buildSha256,
    observations: evaluation.observations,
    truth: {boundedReceiptOnly: true, externalToolUsed: false, universalProofClaimed: false, productionEvidenceClaimed: false},
    authority: AUTHORITY
  };
  return freeze({...body, receiptSha256: registry.hash(body)});
}

module.exports = {AUTHORITY, IMPLEMENTATIONS, runtimeReceipt, verifierReceipt};
