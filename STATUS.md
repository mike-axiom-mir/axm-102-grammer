# AXM 102 Grammar Status

Verified standalone recovery state: **2026-08-29**

Source checkpoint used for recovery:

- repository: `mike-axiom-mir/axm-collaboration-platform`
- branch: `codex/code-creation-fabric-102-grammar-integration-v2.12`
- commit: `386736aaae3993089dfaf970cf2360894959e3c0`
- source PR: `#62`

## Recovered body

- 102 language directories
- 612 per-language files
- six language-specific layers per language:
  - `organ.json`
  - `grammar.profile.json`
  - `specialist.eye.json`
  - `machine.templates.json`
  - `machine.keyboard.json`
  - `machine.cheatcodes.json`
- shared deterministic builders, registries, contracts and focused selftests required by the standalone body are present as source files

## Standalone verification measurements

All measurements below came from the successful recovery verification run before the source body was committed.

### Grammar / organ layer

- organs: 102
- grammar profiles: 102
- unique grammar-profile digests: 102
- main-planner grammar coverage reported by the grammar-profile selftest: 102
- language families: 23
- organ unique digests: 102
- registry/adversarial signal round trips: 263
- extension ambiguities retained: 8
- basename ambiguities: 0
- path ambiguities: 0
- shebang ambiguities: 1

### Specialist-eye layer

- specialist eyes: 102
- unique specialist-eye digests: 102
- language opportunity hints: 102
- human review dimensions: 8

### Machine-template layer

- template banks: 102
- verified templates: 1,224
- structural skeletons: 816
- generated-template drift during check: 0

### Machine-cheatcode layer

- cheatcode banks: 102
- rules per bank: 50
- total rules: 5,100
- phases: 10
- unique bank digests: 102
- influence meshes: 102
- influence nodes: 5,100
- influence edges: 120,125
- generated-cheatcode drift during check: 0

### Machine-keyboard layer

- keyboard banks: 102
- stable keys per bank: 48
- total stable keys: 4,896
- unique keyboard digests: 102
- router surface present: `layout`, `press`
- generated-keyboard drift during check: 0

### Software-direction layer

- reusable direction profiles: 29
- direction families: 5
- explicit direction axes: 7
- runtime axis values: 11
- verification axis values: 20
- primary-source provenance records: 12
- individually composed profiles: 29
- profiles may compose into hybrid stacks without duplicating language grammars
- caller-supplied evidence gaps remain distinct from language incapability
- frontier-model seed builds: 29/29 passed
- frontier-model stretch builds: 29/29 passed
- beginner reference ready: 29/29 directions
- production ready claimed: 0 directions
- per-direction helpfulness and tuning observations: 29

## Truth boundaries retained

- The base organ selftest still reports Python runtime correctness as `UNKNOWN`; source review evidence is donor-bound and is not promoted into a stronger runtime claim.
- `.m` and `.v` remain ambiguous extension cases rather than being silently forced to one language.
- The original keyboard integration selftest imports `code-prebuild-twin.js`. That test was not copied because Prebuild belongs to the wider Creation Fabric. The standalone keyboard bank and router surface were verified directly instead.
- The v2.12 creation-session planner is an integration layer across Work Context, Production Draft, Build Window, Prebuild/admission and other wider platform modules. It is deliberately not bundled into this focused repository.
- Grammar Glass / Code Twister is deliberately excluded and can live in its own repository.

## Repository independence

The temporary recovery courier was removed after verification. The repository now contains the recovered bytes themselves and does not depend on a submodule, symlink, clone script, or source-repository pointer to function as the 102-language body.

## Standalone capability verification lane

Branch: `codex/standalone-capability-verification-v1`

This lane adds a bounded composition surface without importing Grammar Glass or the wider Creation Fabric:

- one deterministic capability capsule across organ, grammar, eye, discovery, cheatcode, influence, template, and semantic-keyboard layers;
- exact language selection with fail-closed ambiguity, conflict, unknown, and case-alias handling;
- a dedicated keyboard selftest covering 102 banks and all 4,896 stable keys;
- a cross-platform Node test runner for all standalone checks;
- a committed full-suite verification transcript.
- 29 reusable software-direction overlays, seven axis catalogs, hybrid composition, non-selecting suggestions, and caller-evidence gap reports;
- optional direction binding in the standalone capability capsule.
- a 58-build frontier-user maturity trial with per-direction usefulness and tuning logs.

Lane verification result: **18/18 checks passed**.

The composition test also verifies all 102 explicit language identities, Rust file detection, Python shebang detection, compatible `.m` disambiguation, conflicting `.py`/Rust refusal, missing/unknown language holds, malformed-input refusal, deterministic capsule hashing, suggestion-without-selection, a game/multiplayer hybrid, direction tensions, gap semantics, and the no-source/no-execution/no-mutation boundary. The frontier workbench test executes all 58 seed/stretch reference builds twice for determinism, preserves real-world verifier gaps, and refuses production-readiness promotion. The repository-independence test verifies the 102 six-file bodies, all 29 direction profiles, all seven direction axes, the 58-trial catalog and contract, parses every JSON file, and refuses symlinks or submodules.
