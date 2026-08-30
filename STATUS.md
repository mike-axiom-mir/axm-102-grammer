# AXM 102 Grammar Status

Verified standalone recovery state: **2026-08-30**

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
- concrete local adapters: 10 (one runtime, nine verifiers)
- passed runtime adapter receipts: 58
- passed verifier adapter receipts: 76
- unsupported verifier targets retained: 20
- directions with at least one concrete local verifier: 26/29
- verifier categories still requiring external/specialized adapters: 11/20
- deterministic code roles: 10
- deterministic change kinds: 40
- direction-to-role hint coverage: 29/29
- frontier reference placement plans: 58/58 ready
- placement holds during valid frontier references: 0
- adversarial placement holds verified: 10
- explicit language placement bindings: 102/102 ready
- extension bindings: 97
- exact-basename bindings: 3
- path-context bindings: 2
- additional Ansible path-context route: passed
- bounded read-only project-map Hand: present
- directly observed temporary workspaces: 3
- directly observed module files: 6
- live language-binding modes observed: extension, exact basename, path context
- project-map observation lifetime: 5 minutes
- no-mutation workspace snapshot probe: passed
- project-map Hand adversarial holds verified: 13
- separately authorized JavaScript workspace-edit Hand: present
- exact target count per editing transaction: 2
- successful isolated editing transactions: 2 (replace and create)
- intentional verifier-failure transactions rolled back: 1/1
- editing Hand language-parse receipts exercised: 14
- editing Hand registered-verifier receipts exercised: 3
- editing Hand adversarial holds verified: 10
- durable workspace-edit journal and exclusive cooperating-Hand lease: present
- actual worker-process `SIGKILL` recovery probes: 25
- replace journal boundaries crash-tested: 11/11
- create journal boundaries crash-tested: 9/9
- restart rollbacks verified: 14
- restart commits verified: 4 recovered plus 2 already committed
- restart-surviving replay, lease contention, tamper, unknown-byte, mode-drift, and torn-tail behavior: verified
- universal power-loss recovery and two-file atomicity claimed: no
- production repositories edited by the focused trial: 0

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
- a concrete local adapter plane with runtime/verifier receipts and explicit unsupported targets.
- a deterministic code-placement grammar with language binding, unique-owner selection, verification placement, drift preconditions, required Hands, and fail-closed ambiguity/protection/path rules.
- a bounded read-only project-map Hand with complete matching-file coverage, current-byte digests, five-minute freshness, and fail-closed symlink/traversal/broad-root/stale/tamper rules.
- a separately authorized exact-byte JavaScript editing Hand with immediate map/digest preflight, parser and verifier receipts, two-target commit, durable Linux crash recovery, restart-surviving replay refusal, and an exclusive cooperating-Hand lease.

Lane verification result: **23/23 checks passed**.

The composition test also verifies all 102 explicit language identities, Rust file detection, Python shebang detection, compatible `.m` disambiguation, conflicting `.py`/Rust refusal, missing/unknown language holds, malformed-input refusal, deterministic capsule hashing, suggestion-without-selection, a game/multiplayer hybrid, direction tensions, gap semantics, and the no-source/no-execution/no-mutation boundary. The frontier workbench test executes all 58 seed/stretch reference builds twice for determinism, binds all 58 to deterministic placement plans, preserves real-world verifier gaps, and refuses production-readiness promotion. The placement test verifies extend/create decisions plus ambiguity, locked owner, unsafe path, language mismatch, invalid kind, and missing-dependency holds. The project-map Hand test observes extension, basename, and path-context workspaces; proves byte drift changes the map digest; snapshots zero mutation; and verifies 13 fail-closed receipt/filesystem cases. The editing Hand test commits replace/create candidates, forces and verifies exact rollback, exercises 14 parser and three verifier receipts, and checks ten authorization/digest/drift/path/protection holds without touching a production repository. Its recovery test performs 25 real `SIGKILL` events, covers all replace/create journal boundaries, and verifies deterministic rollback/commit recovery plus replay, lease, tamper, ambiguity, mode, and torn-tail behavior. The adapter test verifies 58 runtime receipts, 76 concrete verifier receipts, the supported/unsupported partition of all 20 verifier categories, and no workspace, child-process, network, install, deployment, or physical-control authority. The repository-independence test verifies the 102 six-file bodies, all 29 direction profiles, all seven direction axes, the 58-trial, placement, both Hands, and adapter contracts/catalogs, parses every JSON file, and refuses symlinks or submodules.
