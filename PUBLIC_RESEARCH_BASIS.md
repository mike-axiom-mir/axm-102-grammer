# Public Research Basis for the Deterministic Capability Workstream

Status: `RESEARCH / ARCHITECTURE REFERENCE`

The public web was reviewed before this backend workstream was designed. These projects/specifications are architecture references, not runtime dependencies and not copied source bodies.

## Syntax / parsing

- Tree-sitter — https://tree-sitter.github.io/tree-sitter/
  - Reference ideas: incremental concrete syntax trees, error-tolerant structural parsing, queries, local/tag/injection concepts.
- ANTLR — https://www.antlr.org/
  - Reference idea: explicit grammar-driven parser generation for languages where another local parser is a better fit.

## Semantic/project intelligence

- Language Server Protocol — https://microsoft.github.io/language-server-protocol/
  - Reference ideas: definitions, references, symbols, call/type hierarchy, diagnostics, rename/code-action boundaries.
- SCIP — https://github.com/scip-code/scip
  - Reference idea: normalizing document occurrences, symbols and semantic relationships without erasing language-native facts.

## Structural rewriting

- ast-grep — https://ast-grep.github.io/
  - Reference ideas: syntax-aware structural matching and rewriting rather than blind text replacement.
- OpenRewrite Lossless Semantic Trees — https://docs.openrewrite.org/concepts-and-explanations/lossless-semantic-trees
  - Reference ideas: preserve source formatting/trivia while attaching semantic/type information for transformations.

## Optional deeper analysis references

- CodeQL — https://codeql.github.com/docs/codeql-overview/about-codeql/
  - Reference ideas: AST/control/data-flow representations as optional deeper language analysis.
- Semgrep — https://semgrep.dev/docs/
  - Reference ideas: bounded pattern/data-flow analysis adapters and explicit finding evidence.

## AXM design conclusion

The AXM implementation deliberately does **not** make any of these projects a mandatory cloud or internet dependency. The portable backend contracts are provider-neutral. Approved parser/analyzer artifacts can later be vendored or pinned locally, while the recovered 102 language identities, native grammar knowledge, authority boundaries and evidence rules remain AXM-owned source.

The strongest combined pattern is:

`native parser -> native structural facts -> normalized semantic relations -> bounded structural renderer -> native/local verification -> digest-bound evidence`

Cross-language normalization is an envelope around native facts, not a universal AST that flattens different grammars into one model.
