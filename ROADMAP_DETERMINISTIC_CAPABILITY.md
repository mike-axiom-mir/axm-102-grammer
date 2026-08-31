# AXM 102 Grammar Deterministic Capability Roadmap

Status: `ACTIVE DESIGN / TEST IMPLEMENTATION`

Default operating mode: **local, deterministic, offline, AI-optional**.

AI and network access are never required for the core grammar capability path. They may be attached later as explicit proposal or research lanes, but they do not define correctness, authority, parsing, rendering, verification, or admission.

## Capability ladder

Every language organ can progress independently through these measured levels:

- `G0_IDENTITY`: deterministic language identity, profile, hazards, verification intent.
- `G1_SYNTAX`: executable parser adapter, syntax tree, parser errors and recovery nodes.
- `G2_STRUCTURE`: native constructs, scopes, imports/dependencies, embedded-language regions and structural queries.
- `G3_SEMANTICS`: definitions, references, symbols, callers/consumers, type/shape facts and project graph edges.
- `G4_REWRITE`: syntax-bound candidate rendering with exact input/output byte digests and no direct mutation authority.
- `G5_VERIFIED_REWRITE`: candidate survives deterministic verifier ladder such as reparse, static checks, type checks, linters, targeted tests or builds when locally available.
- `G6_DEEP_ANALYSIS`: optional native control flow, data flow, taint, concurrency, transaction, lifetime or other language-specific analyses.

No level is inferred from the existence of a tool name. A level is earned only from locally measurable adapter capability.

## Spine

The implementation direction is:

`102 identity -> parser adapter -> syntax passport -> structural facts -> semantic graph -> existing specialist eye -> existing cheatcodes/templates/keyboard -> deterministic renderer -> candidate patch -> verifier ladder -> evidence passport -> admission decision`

The existing six per-language layers remain intact. New executable capability is placed underneath and beside them rather than replacing language identity with one universal AST.

## Invariants

1. No network access is required by default.
2. No AI is required by default.
3. Parser/tool execution must be explicitly bound to a local adapter.
4. Unknown parser/tool/runtime state is not PASS.
5. Structural edits target syntax/token boundaries rather than blind text search.
6. Rendered source is a candidate, not an authorized workspace mutation.
7. Verification results are evidence, not authority.
8. Ambiguous language detection remains selection-required unless deterministic parser evidence resolves it.
9. Native semantics are preserved even when normalized into a shared graph.
10. Every executable adapter reports its implementation identity, version and digest inputs.

## Development sequence

### Phase A: Capability passports

Introduce a deterministic capability registry that records measured `G0-G6` support per language and explicit adapter availability for parser, structure, semantic graph, renderer and verifier lanes.

### Phase B: Parser spine

Bind local parser adapters. Tree-sitter-style CST adapters are a preferred broad-coverage shape where available, but the contract is parser-provider-neutral and also permits native parsers or other local deterministic frontends.

### Phase C: Syntax passports

For caller-supplied bytes, return bounded syntax evidence:

- source digest
- parser identity/version
- language identity
- parse state
- root/native node facts
- error/recovery nodes
- embedded-language regions when supported
- syntax-passport digest

### Phase D: Structural query layer

Bind native constructs and dependency forms to executable structural queries. Profiles remain descriptive knowledge; query adapters turn selected profile concepts into observed facts.

### Phase E: Semantic graph

Normalize deterministic facts into a project graph while retaining native fact payloads. Core edge classes include definition, reference, import/dependency, caller/callee, implementation, schema/contract, generated-source and embedded-language relations.

### Phase F: Renderer plane

Interpret existing semantic keyboard intents against syntax/semantic evidence and emit candidate byte patches. The renderer does not mutate workspaces.

### Phase G: Verification ladder

Verify candidates cheapest-falsifier-first:

1. input digest/currentness
2. patch boundary validation
3. reparse
4. parser error delta
5. structural invariants
6. language-native syntax/static verifier
7. type/schema verifier
8. linter/static analysis
9. targeted tests
10. build/sandbox execution when explicitly authorized and locally bound

### Phase H: Grammar Bridge Atlas

Add evidence-backed cross-language concept relations without flattening native grammars. Bridges are comparisons, not automatic migration authority.

## Priority depth wave

Deepen these first because they already occupy the high-priority core of the recovered body:

HTML, Python, JavaScript, TypeScript, CSS, JSON, YAML, Bash/POSIX Shell, PowerShell, SQL, TOML, Docker, Go, Rust, C#, Java, C and C++.

Breadth work should still attempt parser/structure coverage across all 102 where local adapters are available.
