# Multi-language Grammar Capability

This is the plain-language front door for the repository's cross-language capability.

The internal implementation started with the technical label `polyglot`. Publicly, the meaning is simply:

> Several programming-language organs working together while each language keeps its own grammar, identity, hazards, and verification rules.

Use:

```js
const multiLanguage = require('./multi-language.js');
```

## Capability chain

The front door exposes seven connected capabilities:

1. **Compose** language organs in an explicit caller-defined order.
2. **Inspect currentness** against today's organ and grammar registries.
3. **Bind evidence** to one exact handoff contract.
4. **Gate decisions** using both source currentness and evidence state.
5. **Plan minimal re-verification** after selected sources change.
6. **Package work items** for an external verifier or human-controlled hand.
7. **Record measured cost telemetry** after work actually runs.

The front door does not create a universal programming language. It never merges language families or guesses hidden protocols.

## Basic example

```js
const multiLanguage = require('./multi-language.js');

const composer = multiLanguage.createMultiLanguageComposer();
const composition = composer.compose(['javascript', 'python', 'sql'], {
  handoffs: [
    {
      from: 'javascript',
      to: 'python',
      kind: 'http-json',
      artifact: 'request/response JSON contract',
    },
    {
      from: 'python',
      to: 'sql',
      kind: 'database-query',
      artifact: 'parameterized SQL statement + bound values',
    },
  ],
});
```

## Plain public names

The front door provides:

```text
createMultiLanguageComposer
createMultiLanguageCurrentnessInspector
createMultiLanguageHandoffContract
createMultiLanguageEvidenceReceipt
assessMultiLanguageEvidence
createMultiLanguageDecisionGate
createMinimalReverificationPlanner
createMultiLanguageVerificationWorkpack
validateMultiLanguageVerificationWorkpack
createMultiLanguageTelemetryReceipt
assessMultiLanguageTelemetry
describeMultiLanguageCapability
```

Some older internal file names and schema identifiers retain `polyglot` for compatibility. They describe the same multi-language capability and are not a separate system.

## Truth and authority boundary

This capability can describe, compare, bind, plan, package, and measure. It does not silently gain authority from doing so.

It performs no automatic:

- workspace mutation;
- tool execution;
- verifier execution;
- network access;
- receipt promotion;
- refresh acceptance;
- deployment decision;
- language-family merge;
- CANON change.

A digest proves deterministic self-consistency, not identity, consent, authenticity, semantic correctness, or trusted execution.

## Focused documentation

- `POLYGLOT_COMPOSITION.md`: composition and explicit language seams
- `POLYGLOT_CURRENTNESS.md`: ageing and source-drift checks
- `POLYGLOT_HANDOFF_EVIDENCE.md`: exact evidence binding
- `MULTI_LANGUAGE_DECISION_GATE.md`: currentness + evidence decision gate
- `MULTI_LANGUAGE_MINIMAL_REVERIFICATION.md`: local replay reduction
- `MULTI_LANGUAGE_VERIFICATION_WORKPACK.md`: deterministic work packaging
- `MULTI_LANGUAGE_VERIFICATION_TELEMETRY.md`: measured cost receipts and budgets
