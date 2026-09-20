# Composable code programs — 2026-09-20

Implemented on `codex/composable-code-programs-v1`, based on main
`1b7313ca3cc9c29caa760e7e0bdbf778b546f87f`.

## Outcome

The deterministic machine can now combine 48 typed operations into JavaScript
and Python functions/modules, with explicit data contracts, function dependency
checking, source hashes, function source maps and optional emitted tests. The
eight examples are starting recipes, not an authoring allowlist. An additive
archive captures every function with its dependency closure, deduplicates
renames, preserves constants/types/field names/logic, and restores portable
programs for compilation.

This is integrated into the offline npm package, `axm-code-program` CLI,
existing backend and public capability registry. Package version is
`1.1.0-test`; backend API is `1.3.0`. The source discovery checker and package
license metadata were also repaired to match the already-existing MPL license.

## Fresh verification

- Baseline: `node testing/run-all.js` — 37 passed, 0 failed.
- Final: the same complete runner — 39 passed, 0 failed.
- New compiler: 48 operations actually exercised across both targets.
- 32 standalone compiled modules parsed and executed in real Node/Python processes.
- 32 generated selftest runs and 1,604 behavior checks passed.
- Included 768 seeded independent-oracle cases per language.
- 32 compiler/protocol/archive refusals checked, alongside runtime error cases.
- Nine unique reusable functions captured; dependency-preserving restoration ran
  successfully in both languages. Renaming deduplicates; changed logic remains distinct.
- An offline packed-and-installed consumer invoked the new compiler/CLI and
  executed its generated program. It also captured and restored a recipe.
- All old source generation, parser, Foundry, crash/recovery, capsule and package
  checks remain in the suite. Discovery now runs in that complete suite too.

`2026-09-20-code-programs-suite-v2.txt` preserves the final full output.
The original suite transcript remains as historical evidence.
`2026-09-20-code-programs-evidence-v2.json` binds the current implementation files
and log by SHA-256, with runtime versions and observation time.

## Specific fixes found during verification

- The independent scalar test oracle distinguished negative zero; the public
  contract explicitly normalizes it. The test now compares canonical data.
- Python builtins are qualified so public function names cannot replace the
  generated runtime's helpers. JavaScript binding conflicts are refused.
- Sorting uses a shared deterministic cost model, scalar values remain typed,
  and Unicode order/slicing use code points consistently across targets.
- Container literals receive recursive work charging to prevent a compact
  program from hiding repeated large allocations behind one expression step.
- Discovery's old Apache-only check was inconsistent with current main's MPL
  migration. It now binds the actual MPL text; historical license files were
  not changed.

Final review reproduced a cross-language budget mismatch for numbered record
keys: JavaScript reached `STEP_LIMIT` while Python returned 0. Record comparison
and validation now traverse keys in canonical Unicode order, arrays remain
positional, and the exact regression returns 0 in both targets. The full suite
was rerun after this correction. The earlier evidence remains preserved.

## Boundaries

The compiler returns source and archives as data. It does not run generated
code, write caller workspaces, persist archives, import arbitrary source,
activate unregistered Python recipes, or elevate native G0–G6 measurements for
all 102 languages. Runtime bounds are work/data limits, not OS isolation.
Passing this corpus is evidence for these operations and cases, not universal
semantic correctness or financial-grade numeric accuracy. Archive origins are
caller-declared; captured recipes are not automatically verified or promoted.

## Next useful build

Add new source-backed operation families where real consumers need them:
explicit state transitions, deterministic parsers/serializers and named module
interfaces. Then add native language emitters with their own compiler/runtime
parity evidence. Keep the portable expression subset separate from arbitrary
native AST rewriting. The existing Foundry writer should receive a dedicated,
source-bound adapter before it accepts this compiler's Python outputs; its
current recipe boundary remains intact.
