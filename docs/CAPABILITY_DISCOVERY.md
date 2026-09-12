# Public Capability Discovery

This repository already contains reusable deterministic capability surfaces. This lane makes a deliberately small subset machine-discoverable without making discovery an execution or authority layer.

## Declared capabilities

`registry/public-capabilities.jsonl` currently exposes exactly two `TEST` declarations:

- `axm.code.standalone-capability-capsule.v1` — the read-only 102-language standalone composition surface implemented by `language-organs/standalone-capability-router.js`.
- `axm.code.software-direction-stack.v1` — the explicit software-direction composition surface in `software-directions/direction-stack.js`, including the separate `axm.code.software-direction-suggestion-report.v1` suggestion interface.

The source modules remain authoritative for behavior, status, exports, and authority. The generated registry is discovery evidence only.

## Deterministic generation

Node.js 18+ is enough; the generator has no third-party dependency.

```sh
node tools/capability-discovery/generate-registry.mjs
node tools/capability-discovery/generate-registry.mjs --check
node --test tools/capability-discovery/test-registry.mjs
```

Generation fails closed if the curated source contract/result, CommonJS export surface, or no-authority fields drift. It also rejects source symlinks and binds each admitted source plus `LICENSE` to its exact Git blob identity in `registry/public-capabilities.receipt.json`.

The registry pattern is adapted from the source-backed discovery lane in `mike-axiom-mir/axm-grammer-glass` (`automation/capability-weaver-grammar-glass-discovery-v0.1`), which itself records the earlier Local Game Hub generated-registry pattern. No implementation is imported from either repository at runtime.

## Public discovery bridge

`.axm/discovery-public.json` is an explicit opt-in for Discovery Buddy's bounded public mode. CI pins Discovery Buddy at commit `1a94fc2481d1cfc9234dea7c86af4777126d3924`, scans a real worktree of this repository, and requires both declarations to appear with `TEST` status.

That pin is a compatibility probe, not a dependency of the grammar body.

## License and provenance

The repository carries Apache License 2.0 in `LICENSE`. The generator verifies that license text before emitting the public registry and includes the exact `LICENSE` Git blob identity in its receipt. This is provenance/integrity evidence; it is not author authentication or legal advice.

## Truth and authority boundary

A capability declaration does not prove runtime compatibility with a consumer, semantic correctness, production readiness, safety, performance, package availability, or quality. Discovery does not read a caller workspace, execute source, install dependencies, select a direction, mutate files, promote output, merge work, or declare CANON.

New capabilities are not exported automatically. They must be deliberately added to the generator with source-backed checks.
