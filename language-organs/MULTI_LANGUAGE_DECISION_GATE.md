# Multi-Language Decision Gate

`multi-language-decision-gate.js` joins two previously separate facts about a saved multi-language composition:

1. **Is the selected source material still current?**
2. **What evidence receipts are bound to the saved handoffs?**

Keeping those answers separate is useful, but a caller can still make a bad decision by looking at only one of them. A composition can have complete old PASS receipts while one of its selected grammar profiles has changed since those receipts were created.

The decision gate refuses to treat “well-evidenced then” as “current now.”

## Basic use

```js
const {
  createMultiLanguageDecisionGate,
} = require('./multi-language-decision-gate.js');

const gate = createMultiLanguageDecisionGate();
const report = gate.evaluate(composition, evidenceReceipts);
```

The gate internally recomputes currentness against the current organ/profile registries and reassesses the supplied evidence against the exact saved composition.

## Decision states

### `CALLER_DECISION_READY_CURRENT_RECEIPTS_NOT_REPLAYED`

The selected language organs and grammar profiles still match their saved digests, the wider source snapshots still match, and every boundary has complete accepted caller PASS receipt coverage.

This does **not** claim execution readiness, semantic compatibility, or replayed verification. It means the deterministic source/evidence conditions checked by this module have no hold.

### `CALLER_DECISION_READY_SELECTED_STAGES_CURRENT_REPOSITORY_DRIFT`

Every selected organ/profile still matches, and evidence coverage is complete, but the wider 102-language repository snapshot changed somewhere outside the selected stages.

This is deliberately not collapsed into selected-stage staleness. The report exposes the repository drift as an advisory rather than claiming the selected languages changed.

### `HELD`

At least one blocking condition exists.

Possible hold codes include:

- `SELECTED_STAGE_SOURCE_DRIFT`
- `SOURCE_IDENTITY_OR_BINDING_DRIFT`
- `EVIDENCE_INCOMPLETE`
- `EVIDENCE_REVIEW_REQUIRED`

Multiple holds are preserved simultaneously. For example, changed SQL grammar plus conflicting PASS/FAIL receipts reports both problems rather than hiding one behind the other.

## Old green evidence cannot override new source drift

Suppose a saved composition is:

```text
Python -> SQL -> Rust
```

and both handoffs have complete caller PASS receipts.

If the selected SQL grammar profile later changes, the evidence report for the old composition can still correctly say:

```text
CALLER_PASS_RECEIPTS_COMPLETE_NOT_REPLAYED
```

Those receipts are genuinely complete for that saved composition. But the multi-language decision gate returns:

```text
HELD
SELECTED_STAGE_SOURCE_DRIFT
```

The old evidence remains historical evidence. It does not become evidence for the changed grammar profile.

## Repository-only drift and compute waste

The currentness layer records repository-wide source snapshots. An unrelated language update elsewhere in the 102-organ body can therefore produce a refresh candidate even when every language selected by the composition is unchanged.

The decision gate makes that distinction explicit.

When selected stages are still current, repository-only drift is advisory:

```text
REPOSITORY_CHANGED_ELSEWHERE_SELECTED_STAGES_CURRENT
```

If accepting the exact-snapshot refresh candidate would change `compositionId`, every accepted evidence receipt remains bound to the old composition. The gate therefore also reports:

```text
REFRESH_WOULD_INVALIDATE_COMPOSITION_BOUND_RECEIPTS
```

and exposes the number of accepted receipt bindings that would require explicit reissue or a separately justified carry-forward mechanism.

This is not an automatic reuse mechanism. It is a cost/truth signal so a caller can avoid blindly refreshing metadata and then unnecessarily rebuilding evidence.

## Refresh summary

The gate includes the current refresh-proposal state without applying it:

- refresh proposal ID
- candidate composition ID, when one exists
- whether the composition ID would change
- stale selected stage indexes
- impacted adjacent boundary indexes
- refresh-blocked stage indexes
- whether caller acceptance or caller decision is required
- count of accepted receipt bindings that would need reissue if the candidate were accepted

The original composition is preserved.

## Truth boundary

Every gate report explicitly records:

```text
selectedSourceCurrentnessChecked: true
evidenceBindingsChecked: true
evidenceExecutionReplayed: false
externalExecutionReceiptContentInspected: false
receiptOriginAuthenticated: false
callerClaimsPromotedToFact: false
semanticCompatibilityProven: false
executionReadinessClaimed: false
automaticPromotionAllowed: false
automaticRefreshAllowed: false
workspaceInspected: false
toolExecution: false
network: false
authority: NONE
```

`CALLER_DECISION_READY` is therefore intentionally narrower than “safe to deploy” or “program proven correct.” It means the deterministic gate found no hold inside the bounded information it actually checks.

## Determinism

The complete normalized report receives `decisionGateId`.

The same composition, current registries, and equivalent accepted receipt set produce the same decision-gate identity. Current source drift, evidence changes, refresh changes, or a new hold changes that identity.

## Verification

Run:

```bash
node language-organs/selftest-multi-language-decision-gate.js
```

The real-body test uses the actual 102-organ and 102-grammar-profile baseline and checks:

- exact-current + complete evidence decision readiness;
- order-independent identity for equivalent accepted receipt sets;
- incomplete evidence hold;
- conflicting evidence hold;
- tampered receipt hold;
- repository-only drift while selected stages remain current;
- exposure of receipt reissue cost after a metadata-only refresh;
- selected SQL grammar drift overriding old complete PASS coverage;
- adjacent boundary impact reporting;
- language identity rebound hold;
- blocked refresh behavior;
- simultaneous source-drift and evidence-conflict holds;
- preservation of the original composition.
