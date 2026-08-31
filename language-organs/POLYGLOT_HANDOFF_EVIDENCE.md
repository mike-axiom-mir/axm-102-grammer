# Polyglot Handoff Evidence Passports

`polyglot-handoff-evidence.js` binds caller-supplied verification receipts to one exact handoff in one exact polyglot composition.

It does not run tests. It answers a narrower question:

> Does this self-consistent receipt claim refer to the exact language seam, contract declaration, organ/profile versions, and composition that the caller says it does?

That distinction prevents a passing receipt from one build, one boundary, or one contract revision from quietly becoming proof for another.

## Why it exists

A composition may declare:

```text
Python -> SQL
kind: database-query
artifact: parameterized SQL statement + bound values
validation: reject unbound placeholders
```

The declaration is useful, but it is not evidence that validation actually ran. Later, an external verifier may produce an execution receipt. The evidence-passport layer can reference that receipt and bind the claim to the exact handoff without pretending to have replayed or authenticated the underlying execution.

## Deterministic handoff contracts

```js
const {
  createHandoffContract,
} = require('./polyglot-handoff-evidence.js');

const contract = createHandoffContract(composition, 0);
```

The returned contract binds:

- `compositionId`
- `boundaryIndex`
- `handoffIndex`
- the complete normalized handoff declaration
- producer stage, language, organ ID, organ digest, and grammar-profile digest
- consumer stage, language, organ ID, organ digest, and grammar-profile digest

It receives a deterministic SHA-256 `contractId`.

Only a `defined` handoff can receive an evidence passport. A partial declaration is held until both its interface `kind` and transferred `artifact` are explicit.

## Creating a receipt reference

```js
const {
  createEvidenceReceipt,
} = require('./polyglot-handoff-evidence.js');

const receipt = createEvidenceReceipt({
  composition,
  handoffIndex: 0,
  verifierId: 'sql-placeholder-check-v1',
  verifierDigest: '<64-character SHA-256>',
  evidenceKind: 'contract-check',
  claimedResult: 'PASS',
  executionReceiptSchema: 'example.verifier-execution-receipt/v1',
  executionReceiptDigest: '<64-character SHA-256>',
  subjectDigests: ['<digest of inspected contract or artifact>'],
  outputDigests: ['<optional verifier output digest>'],
  findingCodes: [],
  notes: ['caller-supplied receipt reference'],
});
```

Accepted claimed results are:

- `PASS`
- `FAIL`
- `INCONCLUSIVE`

The builder requires an external execution-receipt schema and digest plus at least one subject digest. It does not inspect that external receipt or authenticate its origin.

Every generated evidence receipt explicitly says:

```text
claimSource: CALLER_SUPPLIED_EXECUTION_RECEIPT_REFERENCE
verificationExecutedByThisModule: false
underlyingExecutionReplayed: false
receiptOriginAuthenticated: false
callerClaimPromotedToFact: false
semanticCompatibilityClaimed: false
automaticPromotion: false
authority: NONE
```

The complete normalized receipt receives a deterministic `receiptId`.

## Assessing a receipt set

```js
const {
  assessEvidence,
} = require('./polyglot-handoff-evidence.js');

const report = assessEvidence(composition, [receipt]);
```

The assessor:

- verifies the saved composition digest and essential sequence/layer/boundary/handoff structure;
- verifies each receipt's exact keys and deterministic digest;
- recomputes the handoff contract from the supplied composition;
- rejects receipts bound to another composition, boundary, handoff, or contract revision;
- rejects duplicate receipt IDs;
- preserves tampered, malformed, stale, or conflicting evidence as explicit rejections or review states;
- groups accepted receipt claims by handoff and boundary;
- never promotes a caller claim into an executed or authenticated fact.

## Report states

Top-level states:

- `CALLER_PASS_RECEIPTS_COMPLETE_NOT_REPLAYED`
- `EVIDENCE_INCOMPLETE`
- `EVIDENCE_REVIEW_REQUIRED`

A complete pass state means every boundary has defined handoff contracts and each relevant handoff has accepted caller-supplied PASS receipt references. It still does not mean this module replayed the verifier or proved semantic compatibility.

Review is required when the input contains rejected receipts, conflicting PASS/FAIL claims, FAIL claims, or an invalid contract binding.

Incomplete includes missing contracts, partial contracts, absent evidence, and inconclusive evidence.

Handoff-level states include:

- `NO_ACCEPTED_EVIDENCE`
- `HANDOFF_CONTRACT_PARTIAL_EVIDENCE_HELD`
- `CALLER_PASS_RECEIPT_PRESENT_NOT_REPLAYED`
- `CALLER_FAIL_RECEIPT_PRESENT_NOT_REPLAYED`
- `CALLER_INCONCLUSIVE_RECEIPT_PRESENT_NOT_REPLAYED`
- mixed PASS/INCONCLUSIVE and FAIL/INCONCLUSIVE states
- `CONFLICTING_CALLER_RESULTS`
- `HANDOFF_CONTRACT_BINDING_INVALID`

## Stale evidence cannot drift forward

A receipt is bound to the exact `compositionId` and `contractId`.

Changing any of the following changes that binding:

- a selected organ digest;
- a selected grammar-profile digest;
- the stage order;
- a handoff kind, artifact, guarantee, assumption, validation declaration, or note;
- a repository snapshot recorded by the composition.

An old receipt is therefore rejected rather than silently reused for a refreshed composition. A caller or verifier must explicitly issue a new receipt reference for the new composition.

## Repeated language pairs

For:

```text
Python -> SQL -> Python -> SQL
```

the first and second `Python -> SQL` seams have different boundary indexes and different handoff indexes. Their `contractId` values are therefore distinct even when their language pair is identical.

## Integrity boundary

A SHA-256 digest proves deterministic self-consistency of the bytes represented by the object. It is not a signature, trusted identity, proof of consent, proof of execution, or truth certificate.

The assessor also checks essential internal relationships so a caller cannot merely alter a handoff status or boundary index and recompute the outer composition digest.

This module performs no:

- workspace reads or writes;
- verifier execution or replay;
- network access;
- dependency installation;
- authentication;
- automatic promotion;
- language switching;
- semantic compatibility claim;
- CANON change.

## Verification

```bash
node language-organs/selftest-polyglot-handoff-evidence.js
```

The real-body selftest uses the actual 102-organ and 102-profile composition layer and covers:

- deterministic contract IDs;
- exact producer/consumer digest bindings;
- complete caller PASS receipt coverage;
- order-independent report identity for valid receipt sets;
- PASS plus INCONCLUSIVE states;
- PASS/FAIL conflicts;
- duplicate receipt rejection;
- tampered receipt rejection;
- extra hidden-key rejection even after self-digest recomputation;
- stale receipt rejection after contract/composition revision;
- partial and missing contract holds;
- repeated-pair contract separation;
- invalid digest and missing-subject rejection;
- self-digested handoff-status contradiction rejection;
- self-digested boundary-to-handoff contradiction rejection;
- preservation of the original composition.
