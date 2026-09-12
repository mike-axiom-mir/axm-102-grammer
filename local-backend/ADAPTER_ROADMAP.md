# Adapter rollout roadmap

The portable core is intentionally adapter-provider-neutral.

Recommended rollout:

1. Keep the built-in dependency-free JSON adapter as a transport/parser proof.
2. Add a vendored, pinned Tree-sitter adapter pack for broad G1/G2 coverage where grammars are mature.
3. Add native/LSP/compiler semantic adapters only where they provide deterministic locally measurable facts.
4. Add language-specific intent renderers for G4.
5. Bind native verifiers for G5.
6. Add optional deep-analysis adapters for G6.

Every language advances independently; incomplete breadth does not block deep capability in a mature language.
