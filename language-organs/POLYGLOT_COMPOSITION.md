# Polyglot Grammar Composition

`polyglot-grammar-composition.js` is an additive core helper for composing two or more existing language organs without merging their identities.

It is **not** a universal-language layer, a hidden planner, an automatic tool router, or part of the recipe-only standalone browser surface.

## Why it exists

Real software often crosses language boundaries: a JavaScript frontend may call a Python service, Python may emit a database query, or Rust may consume a schema produced elsewhere. The 102-language census already preserves the grammar, templates, specialist eyes, keysets, and native discovery stance of each language. This helper lets a caller place several of those organs into one explicit sequence while keeping the seams visible.

## Core policy

- Language organs stay distinct.
- Family metadata never causes a merge.
- Sequence order comes from the caller.
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

- `sequence`: canonical requested language order after exact duplicate removal.
- `layers`: grammar-facing snapshots for each distinct organ.
- `handoffs`: caller-declared interface contracts.
- `boundaries`: adjacent sequence boundaries and their status.
- `unresolvedHandoffs`: every `missing` or `partial` adjacent boundary.
- `policy`: the non-merge/non-inference rules applied to the composition.
- `compositionId`: deterministic SHA-256 digest of the normalized composition.

A handoff becomes `defined` only when both `kind` and `artifact` are explicit. Supplying only one keeps that boundary `partial`.

## Selftest

```bash
node language-organs/selftest-polyglot-grammar-composition.js
```

The focused selftest covers distinct-language preservation, explicit and unresolved handoffs, partial contracts, deterministic composition IDs, exact duplicate removal, endpoint validation, self-handoff rejection, and language listing.
