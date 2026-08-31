# Polyglot Composition Currentness

`polyglot-composition-currentness.js` is a read-only integrity layer for compositions produced by `polyglot-grammar-composition.js`.

A valid composition records the exact language-organ and grammar-profile digests used when it was created. Those sources can change later. Currentness inspection compares the saved composition with the registries that exist now without quietly replacing the old record.

## Why this layer exists

A repository-wide snapshot can change for two very different reasons:

1. one of the languages selected by the composition changed; or
2. an unrelated language elsewhere in the 102-organ body changed.

Those situations should not be collapsed into one vague “stale” label. The inspector separates selected-stage drift from repository drift elsewhere.

```js
const {
  createPolyglotGrammarComposer,
} = require('./polyglot-grammar-composition.js');
const {
  createPolyglotCurrentnessInspector,
} = require('./polyglot-composition-currentness.js');

const composer = createPolyglotGrammarComposer();
const composition = composer.compose(['python', 'sql', 'rust']);

const inspector = createPolyglotCurrentnessInspector();
const report = inspector.inspect(composition);
```

## Report states

The top-level report uses three states:

- `CURRENT_EXACT`: selected stages and both repository snapshots still match.
- `SELECTED_STAGES_CURRENT_REPOSITORY_CHANGED_ELSEWHERE`: the selected organ/profile digests still match, but the wider 102-organ or grammar snapshot changed.
- `STALE_SELECTED_STAGE_BINDINGS`: at least one selected stage no longer matches its saved source identity.

Every selected stage receives its own status:

- `CURRENT`
- `ORGAN_CHANGED`
- `GRAMMAR_PROFILE_CHANGED`
- `ORGAN_AND_GRAMMAR_CHANGED`
- `LANGUAGE_AND_GRAMMAR_MISSING`
- `LANGUAGE_ORGAN_MISSING`
- `GRAMMAR_PROFILE_MISSING`
- `LANGUAGE_ID_REBOUND_TO_DIFFERENT_ORGAN`
- `CURRENT_REGISTRY_BINDING_INVALID`

A changed digest can produce a refresh candidate. A missing source, invalid live binding, or language ID rebound is held for caller review instead of being silently accepted.

## Structural integrity before currentness

Before comparing sources, the inspector requires:

- the saved composition digest to match;
- sequence, layer, boundary, and handoff collections to have the expected shapes;
- each layer index and language ID to match the saved sequence;
- each boundary index and endpoint to match adjacent sequence stages;
- saved organ and grammar snapshot identities to be present.

This catches a self-digested but internally contradictory object. The composition digest proves deterministic self-consistency only. It is not a signature, identity proof, consent record, or authenticity certificate.

Every currentness report states:

```text
integrityMeaning: SELF_CONSISTENCY_AND_CURRENT_SOURCE_COMPARISON_NOT_AUTHENTICITY
semanticCompatibilityRevalidated: false
verificationExecuted: false
workspaceInspected: false
toolExecution: false
network: false
automaticReplacement: false
authority: NONE
```

## Impact of source drift

When a selected stage is stale, the inspector marks the adjacent boundary indexes that need renewed review.

For:

```text
python -> sql -> rust
```

- stale Python marks boundary `0`;
- stale SQL marks boundaries `0` and `1`;
- stale Rust marks boundary `1`.

This is structural adjacency only. It does not inspect source files, discover hidden dependencies, or claim semantic blast radius.

## Explicit refresh proposals

Currentness inspection never replaces a composition. A separate explicit call may prepare a candidate:

```js
const proposal = inspector.proposeRefresh(composition);
```

Possible proposal states are:

- `NO_REFRESH_REQUIRED`
- `REFRESH_CANDIDATE_READY_CALLER_ACCEPTANCE_REQUIRED`
- `REFRESH_HELD_CALLER_DECISION_REQUIRED`

A ready proposal preserves the original composition and returns a new candidate built from the current registries with the exact saved sequence and handoff declarations. It also identifies changed stage digests and boundary review capsules.

A held proposal contains no candidate. Holds include missing organs/profiles, invalid current organ-profile binding, and a language ID that now points at a different organ identity.

No proposal performs replacement, verification, workspace reads, tool execution, network access, installation, promotion, or CANON changes.

## Determinism

Currentness reports receive `currentnessId`. Refresh proposals receive `refreshProposalId`. Both are SHA-256 digests over their normalized report bodies.

The same composition against the same registry views produces the same IDs. Changing the saved composition, a selected organ/profile identity, or a repository snapshot changes the corresponding report identity.

## Verification

Run the real-body checks with:

```bash
node language-organs/selftest-polyglot-grammar-composition.js
node language-organs/selftest-polyglot-composition-currentness.js
```

The currentness selftest uses the real 102-organ and 102-profile body for the baseline composition. It then constructs bounded synthetic registry views to verify:

- exact-current detection;
- unrelated repository drift;
- grammar-only drift;
- organ-plus-grammar drift;
- adjacent seam re-review;
- deterministic refresh candidates;
- caller-acceptance requirements;
- language-ID rebound holds;
- invalid live binding holds;
- missing-source holds;
- tampered-digest rejection;
- self-digested structural-contradiction rejection;
- preservation of the original composition.
