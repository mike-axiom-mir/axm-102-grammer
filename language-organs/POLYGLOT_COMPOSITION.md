# Polyglot Grammar Composition

`polyglot-grammar-composition.js` is an additive core helper for composing two or more existing language organs without merging their identities.

It is **not** a universal-language layer, a hidden planner, an automatic tool router, or an execution engine.

## Real repository binding

The composer uses the repository's existing CommonJS registries directly:

- `registry.js` via `all()`, `getByLanguageId()`, and `snapshot()`
- `grammar-profile-registry.js` via `all()`, `getByLanguageId()`, and `snapshot()`

It does not invent a second registry model or depend on a separate language dataset. Each selected stage is bound to the real organ SHA-256 and grammar-profile SHA-256 already validated by those registries.

## Why it exists

Real software often crosses language boundaries: a JavaScript frontend may call a Python service, Python may emit a database query, or Rust may consume a schema produced elsewhere. The 102-language body already keeps each language's grammar, hazards, verification focus, execution state, toolchain candidates, and source identity distinct.

This helper lets a caller put several of those organs into one explicit sequence while keeping every seam visible.

## Core policy

- Language organs stay distinct.
- Family metadata never causes a merge.
- Sequence order comes from the caller and repeated stages are preserved.
- Blank language stages are rejected instead of silently removed.
- Interface type and artifact are never guessed.
- Missing or incomplete sequence boundaries remain visible.
- A declared validation step is not treated as executed evidence.
- Semantic compatibility is never claimed by the composer.
- Impact tracing never claims semantic blast radius.
- Capability remains separate from authority.
- The returned composition receives a deterministic SHA-256 `compositionId`.

## Example

```js
const { createPolyglotGrammarComposer } = require('./polyglot-grammar-composition.js');

const composer = createPolyglotGrammarComposer();
const composition = composer.compose(['javascript', 'python', 'sql'], {
  handoffs: [
    {
      from: 'javascript',
      to: 'python',
      kind: 'http-json',
      artifact: 'request/response JSON contract',
      validation: ['validate request and response schemas'],
    },
    {
      from: 'python',
      to: 'sql',
      kind: 'database-query',
      artifact: 'parameterized SQL statement + bound values',
      validation: ['reject unbound placeholders'],
    },
  ],
});
```

The returned object contains:

- `sequence`: normalized caller order with repeated language stages preserved.
- `layers`: one real organ/profile-bound grammar snapshot per sequence stage.
- `handoffs`: caller-declared interface contracts.
- `boundaries`: adjacent sequence seams, their `boundaryIndex`, contract status, evidence state, and review capsule.
- `unresolvedHandoffs`: every `missing` or `partial` adjacent boundary.
- `verificationPendingBoundaryIndexes`: every seam, because this module executes no verifier.
- `sourceSnapshots`: current 102-organ and 102-grammar registry snapshot identities.
- `policy`: the non-merge/non-inference/no-authority rules applied to the composition.
- `compositionId`: deterministic SHA-256 digest of the normalized composition.

## Boundary states

A handoff becomes `defined` only when both `kind` and `artifact` are explicit. Supplying only one keeps that boundary `partial`.

Evidence is deliberately separate from contract completeness:

- `HANDOFF_CONTRACT_MISSING`
- `HANDOFF_CONTRACT_PARTIAL`
- `DECLARED_CONTRACT_UNVERIFIED`
- `DECLARED_VALIDATION_PRESENT_NOT_EXECUTED`

Even the last state is still verification-pending. It means only that the caller named a validation step, not that AXM ran it or that the handoff is correct.

## Grammar-native seam review

Every boundary also gets a deterministic read-only review capsule assembled from the two real grammar profiles:

- producer semantic hazards
- consumer semantic hazards
- producer verification focus
- consumer verification focus
- combined native questions that should be answered before a rewrite

The review explicitly reports:

```text
semanticCompatibilityClaimed: false
interfaceSemanticsInferred: false
verificationExecuted: false
authority: NONE
```

So the composer can expose where two language grammars meet without pretending it understands an unstated protocol or proving that the interface works.

## Digest-bound impact tracing

A composition can also be passed to:

```js
const impact = composer.analyzeImpact(composition, {
  changedStageIndexes: [1],
});
```

Impact tracing first recomputes the composition digest. A stale or modified composition is rejected with `POLYGLOT_COMPOSITION_DIGEST_MISMATCH` instead of being analyzed as though it were the original plan.

For each caller-declared changed stage it deterministically reports:

- `changedStageIndexes`
- neighboring `impactedBoundaryIndexes`
- stages touching those boundaries
- the corresponding language IDs
- the existing boundary review capsules that should be revisited
- verification-pending boundary indexes
- a deterministic SHA-256 `impactId`

For a three-stage chain:

```text
python -> sql -> rust
```

changing stage `1` marks both boundaries `0` and `1` for re-review. Changing stage `0` marks only boundary `0`.

This is **structural adjacency impact only**. It does not inspect code, discover hidden dependencies, infer semantic blast radius, execute tools, or claim that non-adjacent stages are unaffected.

Every impact report therefore states:

```text
semanticImpactClaimed: false
workspaceInspected: false
toolExecution: false
authority: NONE
```

## Repeated language pairs

A language organ may appear more than once in the sequence. For example:

```js
['python', 'sql', 'python', 'sql']
```

That sequence is preserved exactly. Because `python -> sql` appears at both boundary `0` and boundary `2`, a handoff for that pair must explicitly provide `boundaryIndex` so one contract cannot silently apply to both places.

```js
{
  from: 'python',
  to: 'sql',
  boundaryIndex: 2,
  kind: 'database-query',
  artifact: 'second query contract'
}
```

When a directed pair occurs at only one boundary, the helper resolves its boundary index deterministically from the explicit sequence.

## Selftest

```bash
node language-organs/selftest-polyglot-grammar-composition.js
```

The selftest now uses the real repository body rather than a mock registry. It requires:

- exactly 102 real language organs
- exactly 102 real grammar profiles
- valid organ/profile digest bindings
- real Python, SQL, and Rust stages
- explicit, partial, and missing handoff states
- verification-pending truth boundaries
- grammar-native seam reviews
- deterministic composition and impact IDs
- digest rejection after composition tampering
- structural impact tracing for first, middle, and repeated stages
- repeated stage preservation and repeated-pair disambiguation
- blank/unknown stage rejection

The dedicated GitHub Actions workflow also runs the existing organ/profile/specialist/template/keyboard/cheatcode checks plus this real-body composition test.
