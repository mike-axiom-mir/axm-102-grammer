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

## Truth boundaries retained

- The base organ selftest still reports Python runtime correctness as `UNKNOWN`; source review evidence is donor-bound and is not promoted into a stronger runtime claim.
- `.m` and `.v` remain ambiguous extension cases rather than being silently forced to one language.
- The original keyboard integration selftest imports `code-prebuild-twin.js`. That test was not copied because Prebuild belongs to the wider Creation Fabric. The standalone keyboard bank and router surface were verified directly instead.
- The v2.12 creation-session planner is an integration layer across Work Context, Production Draft, Build Window, Prebuild/admission and other wider platform modules. It is deliberately not bundled into this focused repository.
- Grammar Glass / Code Twister is deliberately excluded and can live in its own repository.

## Repository independence

The temporary recovery courier was removed after verification. The repository now contains the recovered bytes themselves and does not depend on a submodule, symlink, clone script, or source-repository pointer to function as the 102-language body.
