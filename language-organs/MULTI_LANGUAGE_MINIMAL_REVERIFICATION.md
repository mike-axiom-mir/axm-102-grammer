# Multi-language Minimal Re-verification

`multi-language-minimal-reverification.js` reduces unnecessary verification work after a saved multi-language composition becomes stale.

It does **not** reuse evidence automatically. It separates two very different refresh costs:

1. a selected language organ, grammar profile, or handoff contract changed locally, so the affected seam should be re-verified;
2. only the wider repository snapshot changed while the exact local handoff stayed the same, so the grammar layer has no local-delta reason to replay that verifier.

That distinction matters because evidence receipts are deliberately bound to one exact `compositionId`. Even a metadata-only refresh creates a new composition identity and therefore requires new candidate-bound receipt references. The planner identifies when that rebinding may be possible without needlessly replaying unchanged local verification, subject to the external verifier's own policy.

## Local handoff fingerprint

For each defined handoff the planner derives a deterministic local fingerprint from:

- boundary index;
- handoff index;
- complete normalized handoff declaration;
- producer stage index and language ID;
- producer organ ID and digest;
- producer grammar-profile digest;
- consumer stage index and language ID;
- consumer organ ID and digest;
- consumer grammar-profile digest.

The fingerprint deliberately excludes repository-wide snapshot digests and `compositionId`. This means an unrelated change elsewhere in the 102-language body does not make an unchanged Python → SQL seam look locally different.

The fingerprint is only a deterministic locality comparison. It is not semantic equivalence proof.

## Planner states

`createMinimalReverificationPlanner().plan(composition, receipts)` returns one of:

- `NO_REFRESH_REQUIRED`
- `REFRESH_HELD_NO_CANDIDATE`
- `LOCAL_HANDOFFS_UNCHANGED_RECEIPT_REBIND_REVIEW_ONLY`
- `PARTIAL_LOCAL_REVERIFICATION_RECOMMENDED`
- `ALL_DEFINED_HANDOFFS_LOCALLY_CHANGED_REVERIFICATION_RECOMMENDED`
- `CONTRACT_COMPLETION_REQUIRED_BEFORE_COMPLETE_EVIDENCE`

For each candidate handoff it reports either:

- `LOCAL_HANDOFF_UNCHANGED_NEW_RECEIPT_BINDING_REQUIRED`
- `LOCAL_HANDOFF_CHANGED_REVERIFICATION_RECOMMENDED`
- `CONTRACT_COMPLETION_REQUIRED`

## Example: unrelated repository drift

For `Python → SQL → Rust`, suppose another language elsewhere in the 102-language registry changes while Python, SQL, Rust, their grammar profiles, and both handoff declarations remain identical.

The global composition identity changes because the repository snapshot changed. Existing receipts cannot be reused as-is because they reference the old composition ID.

The planner nevertheless reports zero local replay recommendations. If both old handoffs had accepted PASS receipt references, both appear in `potentialReplaySavingsHandoffIndexes`.

This does **not** authorize automatic receipt carry-forward. It means only that no local organ/grammar/contract delta was found that would independently justify replaying those verifiers.

## Example: SQL grammar changed

For `Python → SQL → Rust`, if the selected SQL grammar profile changes, both adjacent handoffs change their local fingerprints:

- `Python → SQL`
- `SQL → Rust`

Both are reported in `replayRecommendedHandoffIndexes`.

## Example: Rust grammar changed

If only the selected Rust grammar changes, `Python → SQL` stays locally equivalent while `SQL → Rust` changes. The plan therefore recommends replay only for the Rust-adjacent handoff and marks the unchanged seam as a receipt-rebind review candidate.

## Existing evidence remains historical

The planner first assesses the old receipt set against the old composition. Accepted old PASS receipts are useful only for identifying where prior verification evidence existed.

It never rewrites those receipts for the refreshed composition. When `compositionId` changes, every old accepted receipt binding is invalid on the candidate by design.

A new candidate-bound receipt must be explicitly produced. Whether an external verifier can reissue a receipt from unchanged execution evidence without replaying the verifier is outside this module and remains policy-dependent.

## Cost signal

The planner exposes structural counts rather than invented resource estimates:

- local handoffs where replay is recommended;
- local handoffs where replay is not indicated by grammar/contract delta;
- handoffs with prior PASS evidence where replay may potentially be avoided;
- receipt bindings that need a new candidate binding.

It explicitly keeps `computeCostEstimated` and `memoryCostEstimated` false until measured execution data exists.

## Truth boundary

Every candidate plan states that local equivalence is not semantic proof, external verifier policy was not checked, verifier replay was not executed, external receipt content was not inspected, receipts were not reissued, automatic carry-forward is forbidden, semantic compatibility was not proven, execution readiness is not claimed, and this module has no workspace, tool, network, promotion, or CANON authority.

## Verification

Run:

```bash
node language-organs/selftest-multi-language-minimal-reverification.js
```

The real-body test covers no-refresh behavior, repository-only drift with zero local replay recommendations, replay-savings signals only where prior PASS evidence exists, SQL grammar drift affecting both adjacent seams, Rust grammar drift affecting only the Rust seam, held refresh after language identity rebound, deterministic local handoff fingerprints, handoff declaration changes invalidating local equivalence, repeated language pairs retaining distinct local fingerprints, and preservation of the original composition.
