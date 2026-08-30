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
- bounded edit-graph plane and separately authorized graph Hand: present
- graph boundary: 2-4 placement entries and 4-8 exact targets
- focused graph trial: 3 dependency-linked entries and 6 existing targets
- edit-graph planner adversarial holds verified: 6
- graph application adversarial holds verified: 5
- successful isolated six-target graph transactions: 1
- intentional six-target verifier-failure transactions rolled back: 1/1
- graph Hand language-parse receipts exercised: 24
- graph Hand registered-verifier receipts exercised: 6
- six-target graph journal boundaries crash-tested: 23/23
- actual graph worker-process `SIGKILL` recovery probes: 28
- graph restart rollbacks verified: 20
- graph restart commits verified: 2 recovered plus 1 already committed
- original pair Hand held by an active graph lease: verified
- total actual pair-plus-graph `SIGKILL` probes: 53
- universal power-loss recovery and four-to-eight-file atomicity claimed: no
- grammar-driven Hand foundry: present
- foundry placement-plan boundary: 1-4 plans
- production-shaped Python fixture: 6 mapped files, 1 planned source/test pair
- JavaScript graph foundry fixture: 3 plans, 6 targets
- unique role capsules derived per manifest: 6
- total focused foundry capsules exercised: 12
- spawned parser passes: 3 (2 Python, 1 JavaScript)
- spawned parser syntax holds: 1
- candidate programs executed by spawned parsers: 0
- focused foundry workspace mutations: 0
- Hand-foundry adversarial manifest holds verified: 9
- graph digest and exact installation order bound into multi-plan capsules: yes
- current usable fixed tools in verification host: Node, Python 3, `prlimit`
- installed but unusable host sandbox: `bwrap` (`NAMESPACE_PERMISSION_DENIED`)
- exact PR #51 Python donor implementation digest reproduced: yes
- digest-bound bounded Python recipe registry: present
- registered bounded Python recipes: 2
- independently bound builder/verifier-runner digests: 2/2
- registered recipes: record-field transform; required-string-fields validator
- required-fields direct registry adversarial holds: 8
- cross-recipe author-receipt dispatches accepted: 0
- bounded recipe evidence observer Hand: present
- exactly declared evidence files observed: 6/6
- proposal JavaScript files parsed without import/execution: 2/2
- proposal JSON files parsed: 4/4
- current evidence byte-digest matches: 6/6
- core proposal digest bindings to observed files: 3/3
- proposal evidence observation lifetime: 5 minutes
- caller test claims reproduced by observer: no
- semantic safety/human review claimed by observer: no/no
- proposed modules loaded/candidates executed/child processes: 0/0/0
- observer workspace/registry mutations and promotions: 0/0/0
- evidence observer adversarial holds: 19
- non-executing bounded recipe admission plane: present
- deterministic staging receipts: 2
- staged candidate entries / active registry additions: 1/0
- hypothetical next registry entry count: 3
- unresolved activation gaps retained: 5
- current evidence files directly observed and parsed: 6/6
- caller test claims reproduced / semantic safety independently verified: no/no
- proposed source reads by admission plane / observer: 0/2
- proposed module loads/child processes: 0/0
- admission selections/authorizations/promotions: 0/0/0
- admission adversarial holds: 20
- separately authorized Python pair writer/rollback path: present
- provenance-locked Python runtime verifier: present
- successful bounded Python author-to-application transactions: 1
- provenance-locked Python runtime passes: 1
- intentional Python verifier failures restored both original files: 1/1
- bounded Python parser receipts exercised: 8
- bounded Python adversarial holds verified: 11
- deterministic Foundry activation plane: present
- distinct registered recipes activated: 2
- automatic bounded Python Hand assemblies committed: 2
- caller-supplied candidate bundles/parser contexts/verifier adapters during activation: 0/0/0
- activation parser receipts: 8
- activation provenance-locked verifier passes: 2
- activation adversarial holds: 16
- required rollback capsule validated before activation: yes
- Foundry self-authorizations: 0
- arbitrary Python execution or general Python authoring claimed: no
- host namespace/filesystem/network isolation claimed by bounded verifier: no
- production repositories edited by the focused trial: 0

## Truth boundaries retained

- The base organ selftest still reports general Python runtime correctness as `UNKNOWN`. The runtime evidence is narrower: two exact registered recipes were independently regenerated, receipt-bound, and passed their emitted selftests plus recipe-specific semantic probes. That does not imply competence outside either recipe.
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
- a separately authorized exact-byte JavaScript/Python pair editing Hand with immediate map/digest preflight, language-bound parser and verifier receipts, two-target commit, durable Linux crash recovery, restart-surviving replay refusal, and an exclusive cooperating-Hand lease.
- a separately authorized bounded edit-graph Hand for two to four placement entries and four to eight targets, with deterministic dependency order, all-target rollback, graph journaling/recovery, and the same workspace lease namespace as the pair Hand.
- a grammar-driven Hand foundry that derives scoped capability capsules from placement plans, environment evidence, and current organ/profile digests; it now binds a non-executing JavaScript/Python syntax parser, the authorized Python pair writer, and the available bounded donor recipe without treating it as general authoring.
- a bounded Python record-transform author plus provenance-locked runtime verifier that complete one real author-to-application route while refusing arbitrary candidate substitution.
- a second independently implemented required-fields recipe with its own builder, receipt, runner digest, semantic probes, and cross-recipe refusal; it is current-source/test bound and makes no human-review claim.
- a digest-bound registry that routes only its two exact bounded recipes and invalidates old manifest/selection/authorization bindings when membership changes.
- an exact-six-file read-only proposal evidence observer that binds current bytes and non-executing JavaScript/JSON parse results without importing, executing, writing, or reproducing caller test claims.
- a non-executing admission/staging plane that requires that live observation before receipting a proposed entry and hypothetical registry digest, while retaining human review, explicit source change, regression, manifest, and authorization as unresolved gates.
- a Foundry activation plane that consumes explicit host authority and automatically assembles the selected bounded author, parser, recipe-specific verifier, writer, rollback, and receipts without caller-supplied glue.

Lane verification result: **33/33 checks passed**.

The composition test also verifies all 102 explicit language identities, Rust file detection, Python shebang detection, compatible `.m` disambiguation, conflicting `.py`/Rust refusal, missing/unknown language holds, malformed-input refusal, deterministic capsule hashing, suggestion-without-selection, a game/multiplayer hybrid, direction tensions, gap semantics, and the no-source/no-execution/no-mutation boundary. The frontier workbench test executes all 58 seed/stretch reference builds twice for determinism, binds all 58 to deterministic placement plans, preserves real-world verifier gaps, and refuses production-readiness promotion. The placement test verifies extend/create decisions plus ambiguity, locked owner, unsafe path, language mismatch, invalid kind, and missing-dependency holds. The project-map Hand test observes extension, basename, and path-context workspaces; proves byte drift changes the map digest; snapshots zero mutation; and verifies 13 fail-closed receipt/filesystem cases. The foundry tests probe fixed tool capabilities, rebind all executable paths at use time, retain the unusable namespace sandbox as a seam, derive 12 scoped capsules across Python and JavaScript, bind the graph digest and exact installation order, pass three syntax parses, hold one invalid Python candidate, execute no candidate program, mutate no workspace, and verify twelve environment/foundry fail-closed cases. The bounded Python application test reproduces the reviewed donor digest, authors and commits one exact application/test pair, executes the exact recipe under resource limits, restores both files after a forced verifier failure, and proves eleven fail-closed cases without claiming arbitrary Python support. The registry test binds two distinct builders and verifier runners, runs the required-fields recipe directly, and proves eight registry/selection/candidate/parameter/cross-recipe holds. The proposal evidence observer directly reads six exact files, parses two JavaScript sources and four JSON objects without import or execution, and proves nineteen filesystem/digest/parse/binding holds. The admission test consumes that live receipt, deterministically stages one unreviewed proposal twice, computes a hypothetical next registry digest, retains five activation gaps, leaves the active registry unchanged, and proves twenty structural/evidence/observation/collision/authority holds. The activation test supplies only the manifest, recipe selection, live receipts, roots, declaration, and explicit host authority; the plane assembles every Hand for both active entries, commits two transactions, requires rollback capability, and proves sixteen no-mutation holds without caller-supplied candidates, parser context, or verifier adapter. The pair editing Hand test commits JavaScript replace/create candidates, forces and verifies exact rollback, exercises 14 parser and three verifier receipts, and checks ten authorization/digest/drift/path/protection holds without touching a production repository; its recovery test performs 25 real `SIGKILL` events. The graph tests deterministically order three dependency-linked entries, commit or restore six targets, exercise 24 parser and six verifier receipts, prove eleven planner/application holds, and perform 28 real `SIGKILL` events across all 23 graph journal boundaries plus replay, cross-API lease, tamper, ambiguity, mode, and torn-tail cases. The adapter test verifies 58 runtime receipts, 76 concrete verifier receipts, the supported/unsupported partition of all 20 verifier categories, and no workspace, child-process, network, install, deployment, or physical-control authority. The repository-independence test verifies the 102 six-file bodies, all 29 direction profiles, all seven direction axes, the 58-trial, placement, foundry, evidence-observer, admission, registry, activation, pair and graph Hands, all bounded Python contracts, and adapter contracts/catalogs, parses every JSON file, and refuses symlinks or submodules.
