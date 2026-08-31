'use strict';

const {
  createPolyglotGrammarComposer,
  digest,
} = require('./polyglot-grammar-composition.js');
const {
  createPolyglotCurrentnessInspector,
} = require('./polyglot-composition-currentness.js');
const {
  assessEvidence,
  createEvidenceReceipt,
  createHandoffContract,
} = require('./polyglot-handoff-evidence.js');
const {
  createMultiLanguageDecisionGate,
} = require('./multi-language-decision-gate.js');
const {
  createMinimalReverificationPlanner,
} = require('./multi-language-minimal-reverification.js');
const {
  createMultiLanguageVerificationWorkpack,
  validateVerificationWorkpack,
} = require('./multi-language-verification-workpack.js');
const {
  assessTelemetry,
  createTelemetryReceipt,
} = require('./multi-language-verification-telemetry.js');

const CAPABILITIES = Object.freeze([
  'compose-multiple-language-organs',
  'inspect-source-currentness',
  'bind-handoff-evidence',
  'gate-caller-decisions',
  'plan-minimal-reverification',
  'package-verification-work-items',
  'record-measured-verification-costs',
]);

function createMultiLanguageComposer(options = {}) {
  return createPolyglotGrammarComposer(options);
}

function createMultiLanguageCurrentnessInspector(options = {}) {
  return createPolyglotCurrentnessInspector(options);
}

function describeMultiLanguageCapability() {
  const body = {
    schema: 'axm.multi-language-capability-map/v1',
    capabilities: [...CAPABILITIES],
    internalCompatibilityNote:
      'Some internal module and schema names retain the earlier polyglot label for compatibility; the public meaning is multi-language composition.',
    truthBoundary: {
      languageFamiliesMerged: false,
      hiddenProtocolsInferred: false,
      verifierExecutionAuthority: false,
      workspaceMutationAuthority: false,
      automaticPromotionAuthority: false,
      semanticCompatibilityProven: false,
      authority: 'NONE',
    },
  };
  return { ...body, capabilityMapId: digest(body) };
}

module.exports = {
  CAPABILITIES,
  assessMultiLanguageEvidence: assessEvidence,
  assessMultiLanguageTelemetry: assessTelemetry,
  createMultiLanguageComposer,
  createMultiLanguageCurrentnessInspector,
  createMultiLanguageDecisionGate,
  createMultiLanguageEvidenceReceipt: createEvidenceReceipt,
  createMultiLanguageHandoffContract: createHandoffContract,
  createMultiLanguageTelemetryReceipt: createTelemetryReceipt,
  createMultiLanguageVerificationWorkpack,
  createMinimalReverificationPlanner,
  describeMultiLanguageCapability,
  validateMultiLanguageVerificationWorkpack: validateVerificationWorkpack,
};
