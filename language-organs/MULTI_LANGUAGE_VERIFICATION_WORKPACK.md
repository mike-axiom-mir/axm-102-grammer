# Multi-language Verification Workpacks

`multi-language-verification-workpack.js` turns the decision gate and minimal re-verification plan into deterministic work items that can be handed to an external verifier, local hand, CI adapter, or human-controlled workflow.

It packages work. It does not execute it.

## Why this layer exists

The earlier layers can answer:

- which language sources changed;
- whether old evidence still belongs to the saved composition;
- which handoffs locally changed;
- where verifier replay is recommended;
- where only a new receipt binding may be needed.

A worker still needs an exact target. The workpack provides that target without inventing commands, tools, concurrency, or authority.

## Create a workpack

```js
const {
  createMultiLanguageVerificationWorkpack,
} = require('./multi-language-verification-workpack.js');

const builder = createMultiLanguageVerificationWorkpack();
const workpack = builder.create(composition, receipts, {
  countBudget: {
    maxVerifierRuns: 2,
    maxReceiptReissueReviews: 4,
  },
});
```

## Workpack states

- `NO_WORK_REQUIRED`: selected sources are current and every defined seam has accepted caller PASS receipt coverage.
- `WORK_ITEMS_READY_CALLER_DISPATCH_REQUIRED`: deterministic work items exist and fit the declared count limits.
- `DECLARED_COUNT_BUDGET_HOLD`: the visible plan exceeds at least one caller-declared task-count limit.
- `SOURCE_HOLD_CALLER_DECISION_REQUIRED`: no safe refresh candidate exists because a selected source is missing, rebound, or invalidly bound.

A ready state is not execution permission. `callerDispatchEligible` means the caller has enough structured information to decide what to dispatch. Every work item still carries `authority.dispatch: false`.

## Work item kinds

### `DECLARE_HANDOFF_CONTRACT`

An adjacent language boundary has no handoff declaration.

### `COMPLETE_HANDOFF_CONTRACT`

A handoff exists, but its interface kind and transferred artifact are not both explicit.

### `RUN_VERIFIER_AND_ISSUE_RECEIPT`

A defined handoff lacks accepted PASS evidence or its local organ/grammar/contract fingerprint changed.

The work item binds the exact target composition, boundary, handoff, and contract ID. It requests a candidate-bound evidence receipt but does not select or run a verifier.

### `REISSUE_OR_REPLAY_POLICY_REVIEW`

The local handoff fingerprint is unchanged and accepted historical PASS evidence exists, but the refreshed composition has a new identity.

The external verifier or governance policy must decide whether it can issue a new candidate-bound receipt from unchanged execution evidence or must replay the verifier. Automatic carry-forward remains forbidden.

### `RESOLVE_EVIDENCE_REVIEW`

Accepted evidence contains a FAIL, conflict, binding problem, or PASS plus INCONCLUSIVE mixture requiring explicit review.

When selected source drift also creates a refreshed candidate, the historical evidence problem remains a separate visible work item alongside the new candidate's verification work. Refresh cannot make an old conflict disappear.

### `REVIEW_REJECTED_RECEIPTS`

One or more submitted receipts failed shape, digest, composition, contract, or truth-boundary validation.

## Exact target binding

Each work item contains:

- previous composition ID;
- target composition ID;
- whether the target is a refresh candidate;
- boundary and handoff indexes;
- producer and consumer language IDs;
- target boundary digest;
- target handoff digest;
- target contract ID when the handoff is defined;
- accepted historical receipt IDs and PASS receipt IDs;
- the requested output kind;
- deterministic `workItemId`.

The complete embedded target composition is included so the packet is self-contained.

## Count budgets without fake cost claims

A caller may declare limits for:

```text
maxTotalWorkItems
maxVerifierRuns
maxReceiptReissueReviews
maxContractCompletions
maxEvidenceReviews
```

These are exact structural counts. They do not pretend to know runtime duration, RAM, energy, token use, or money.

If a limit is exceeded, the full plan remains visible but the workpack moves to `DECLARED_COUNT_BUDGET_HOLD`.

## Phases are grouping, not hidden scheduling

Work items are grouped into stable phases:

```text
CONTRACT
EVIDENCE_REVIEW
VERIFY
RECEIPT_REISSUE_REVIEW
```

The grouping makes packets readable and deterministic. It does not infer dependency order, parallelism, tooling, or commands. Every phase states that execution order and concurrency were not inferred.

## Integrity checks

`validateVerificationWorkpack(workpack)` verifies:

- exact top-level, work-item, binding, evidence, outcome, budget, constraint, and authority shapes;
- workpack and work-item digests;
- unique work-item IDs;
- task-type-to-phase consistency;
- fixed no-authority and no-execution values inside each work item;
- normalized and internally consistent evidence references;
- recomputed target boundary, handoff, and contract bindings;
- current-versus-refresh target identity rules;
- recomputed counts;
- recomputed count-budget results;
- recomputed phase membership;
- internal composition structure;
- state and dispatch-eligibility consistency;
- the complete workpack truth boundary.

This rejects hidden extra fields and also rejects a caller who changes `authority.dispatch` to `true` and recalculates every visible digest. Self-consistency cannot manufacture authority.

## Truth boundary

The workpack explicitly claims no:

- command inference;
- tool selection;
- concurrency inference;
- verifier execution;
- receipt reissue;
- external policy approval;
- compute or memory estimate;
- automatic dispatch;
- automatic refresh acceptance;
- automatic evidence carry-forward;
- semantic compatibility proof;
- execution-readiness authority.

## Verification

```bash
node language-organs/selftest-multi-language-verification-workpack.js
```

The real-body test covers:

- no-work state with current complete evidence;
- missing-evidence verifier work;
- evidence-conflict review;
- rejected-receipt review;
- repository-only drift producing reissue-policy work instead of verifier replay;
- SQL grammar drift producing two verifier tasks;
- refresh-time preservation of an old PASS/FAIL conflict beside the new verifier work;
- Rust grammar drift producing one verifier task and one reissue review;
- declared count-budget holds;
- source-identity rebound holds;
- partial and missing contract work;
- invalid budget input;
- hidden-key rejection after digest recomputation;
- re-hashed authority-escalation rejection;
- deterministic IDs and input preservation.
