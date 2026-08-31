# Polyglot Grammar Composition

`polyglot-grammar-composition.js` is an additive core helper for composing two or more existing language organs without merging their identities.

It is **not** a universal-language layer, a hidden planner, an automatic tool router, or part of the recipe-only standalone browser surface.

## Why it exists

Real software often crosses language boundaries: a JavaScript frontend may call a Python service, Python may emit a database query, or Rust may consume a schema produced elsewhere. The 102-language census already preserves the grammar, templates, specialist eyes, keysets, and native discovery stance of each language. This helper lets a caller place several of those organs into one explicit sequence while keeping the seams visible.

## Core policy

- Language organs stay distinct.
- Family metadata never causes a merge.
- Sequence order comes from the caller and repeated stages are preserved.
- Blank language stages are rejected instead of silently removed.
- Interface type and artifact are never guessed.
- Missing or incomplete sequence boundaries remain visible.
- The returned composition receives a deterministic SHA-256 `compositionId`.

## Example

```js
const { createPolyglotGrammarComposer } = require('./polyglot-grammar-composition');

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
- `layers`: one grammar-facing snapshot per sequence stage.
- `handoffs`: caller-declared interface contracts.
- `boundaries`: adjacent sequence boundaries, their `boundaryIndex`, and status.
- `unresolvedHandoffs`: every `missing` or `partial` adjacent boundary.
- `policy`: the non-merge/non-inference rules applied to the composition.
- `compositionId`: deterministic SHA-256 digest of the normalized composition.

A handoff becomes `defined` only when both `kind` and `artifact` are explicit. Supplying only one keeps that boundary `partial`.

### Repeated language pairs

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

The focused selftest covers distinct-language preservation, explicit and unresolved handoffs, partial contracts, deterministic composition IDs, repeated stage preservation, repeated-pair disambiguation, blank-stage rejection, endpoint validation, and language listing.
