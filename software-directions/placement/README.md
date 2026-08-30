# Deterministic Code Placement

This layer answers a narrow question that capable code generators regularly get wrong: **where does this change belong in the existing program?**

`placement-plane.js` accepts a change intent plus one of two project-map inputs:

- a caller-supplied project map describing modules, roles, ownership signals, paths, mutability, digests, and verification seams; or
- a fresh `project-map-hand.js` observation containing that map plus directly observed paths and byte digests;
- a change intent describing the software direction, code-role kind, ownership signals, dependencies, public seams, and requested verifiers.

It binds that input to one of ten code roles and to the selected language organ. It then returns one of three outcomes:

- extend one uniquely owned existing module;
- create one new module under the caller-declared convention;
- hold because ownership, paths, language binding, protection, or verification placement is unsafe or ambiguous.

```js
const placement = require('./placement-plane.js');

const plan = placement.plan({projectMap, change});
const observedPlan = placement.plan({projectMapObservation, change});
```

The planner itself never reads or mutates a workspace. Direct project maps remain caller assertions rather than proof of current files.

## Read-only project-map Hand

`project-map-hand.js` closes the observation gap without receiving editing authority:

```js
const hand = require('./project-map-hand.js');

const projectMapObservation = hand.inspect({
  workspaceRoot: '/absolute/path/to/project',
  declaration
});
```

The declaration supplies meaning that bytes cannot prove: module roles, ownership, mutability, change kinds, direction bindings, exports, and verification relationships. The Hand validates that declaration, scans only its explicit source/test roots, refuses filesystem-root scans and symlinks, requires every matching language file to be mapped, hashes current bytes, and returns a five-minute receipt. Caller limits may only reduce its fixed ceilings: 10,000 visited entries, 4,096 matching files, 4 MiB per file, 32 MiB total, and depth 32.

The placement plane accepts the receipt only while it is live and digest-intact. A digest proves receipt integrity, not who created it, and freshness is not correctness. Every ready plan still names the exact digests that an authorized Hand must recheck immediately before editing, the source and verification destinations, the construction order, and the receipts required afterward.

Focused filesystem tests cover extension, exact-basename, and path-context projects; current-byte drift; zero mutation; and holds for stale, future-dated, overlong, or tampered receipts, ambiguous inputs, missing/unmapped files, symlinks, traversal, broad roots, and limit escalation.

## Separately authorized editing Hand

`workspace-edit-hand.js` applies the first narrow placement transaction without pretending to be the code author:

```js
const editHand = require('./workspace-edit-hand.js');

const transactionReceipt = editHand.apply({
  workspaceRoot,
  journalRoot,
  declaration,
  projectMapObservation,
  placementPlan,
  authorization,
  candidates: {source, verification},
  parserContext,
  verifierAdapters
});

const recoveryReceipt = editHand.recover({
  workspaceRoot,
  journalRoot,
  authorizationId
});
```

The capable model or a deterministic renderer supplies the exact UTF-8 candidate bytes. A host must separately issue one `EXPLICIT_SINGLE_TRANSACTION` authorization, valid for no more than 60 seconds, binding the workspace and separate durable-journal root identities, fresh observation, placement plan, both targets and candidate digests, the language parser, and every verifier adapter. Python transactions additionally bind the Foundry parser-capsule digest and live toolchain-observation digest. The authorization digest detects changed fields; it is not a signature, identity, or consent proof.

Before mutation, the Hand re-observes the complete declared project map, refuses drift or protected targets, rechecks existing target digests, and syntax-parses both candidates. It acquires an exclusive O_EXCL workspace lease in the durable root, appends and fsyncs a digest-chained journal, and writes only the two planned source/test targets through same-directory temporary and backup files. It then re-reads and re-parses the installed bytes and invokes only the bound verifier adapters. A failed write, post-write check, parser, or verifier triggers reverse-order restoration of prior bytes or removal of newly created targets.

On Linux, `recover` validates the journal chain, lease binding, and the exact target/temp/backup digests and modes. A last complete phase before `VERIFIED` rolls back; `VERIFIED` or `CLEANUP_COMPLETE` finishes commit cleanup; a final phase is verified and any crash-left lease is released. One torn trailing record may be removed under the valid lease. Unknown bytes, changed modes, a tampered chain, a missing/mismatched lease, or any other ambiguous state holds without guessing. Leases are never automatically declared stale or broken.

The focused transaction trial proves two successful transactions (replace and create), one intentional post-write verifier failure with both targets restored, 14 language-parse receipts, three registered-verifier receipts, and ten adversarial holds covering replay, parse failure, drift, stale/tampered/unbound authorization, target mismatch, inconsistent nested observation digests, and a forged protected-target plan. A separate recovery trial kills real worker processes at all 11 replace boundaries and all nine create boundaries, then proves 14 rollbacks, four recovered commits, and two already-committed finalizations. Five additional crash setups prove cross-process replay refusal, lease contention, tampered-journal refusal, unknown-byte and mode-drift refusal, and torn-tail recovery. All workspaces are generated test fixtures; no production repository was edited.

This v1.2 Hand supports Linux durability, JavaScript under Node's CommonJS script parse goal, and Python under the Foundry's isolated-mode AST parser. It still handles exactly two files, existing parent directories, candidates up to 1 MiB each, journals up to 1 MiB, and up to eight verifier bindings. It provides process-crash recovery, restart-surviving replay refusal, and mutual exclusion between cooperating Hand transactions. It does not claim universal power-loss recovery, two-file filesystem atomicity, automatic stale-lease recovery, or protection from external writers that bypass the Hand. Verifier adapters are trusted registered code; the Hand limits the context it gives them but cannot prove their purity.

This is a placement and application grammar, not a substitute for coding competence and not yet a source generator. Its purpose is to keep capable deterministic or model-based code creation attached to the correct architectural owner and verification seam.

## Bounded multi-entry edit graph

`edit-graph-plane.js` composes two to four already-ready placement plans from the same fresh project-map observation. Each entry keeps its original source/test ownership decision and may explicitly depend on up to three other entries. The plane refuses unknown/self dependencies, cycles, duplicate entry IDs, duplicate target paths, mixed observations, and graphs outside the four-to-eight-target boundary. It sorts entry IDs and derives one stable topological node order without reading or mutating the workspace.

```js
const graphPlane = require('./edit-graph-plane.js');
const graphHand = require('./workspace-edit-graph-hand.js');

const editGraph = graphPlane.compose({
  projectMapObservation,
  entries: [
    {entryId: 'core', dependsOnEntryIds: [], placementPlan: corePlan},
    {entryId: 'api', dependsOnEntryIds: ['core'], placementPlan: apiPlan}
  ]
});

const receipt = graphHand.apply({
  workspaceRoot,
  journalRoot,
  declaration,
  projectMapObservation,
  editGraph,
  candidateEntries,
  authorization,
  verifierAdapters
});
```

The graph Hand requires a separate `EXPLICIT_SINGLE_GRAPH_TRANSACTION` authorization binding the graph, ordered targets, every candidate digest, verifier adapters, workspace, and journal root. It uses the same workspace lease namespace as the two-target Hand, so cooperating pair and graph transactions cannot overlap. One graph-specific digest-chained journal records every target's temp, backup, and install boundary followed by graph-wide parse, verify, cleanup, and commit gates.

The focused graph trial uses three dependency-linked placement entries and six existing files. One transaction commits all six exact candidates in topological order; one intentional verifier failure restores all six prior files and modes. Six planner holds cover cycles, unknown dependencies, duplicate targets, the eight-target limit, digest tampering, and a digest-valid forged order. The recovery matrix performs 28 real worker `SIGKILL` events: all 23 six-target journal boundaries plus lease/replay, tamper, unknown-byte, mode-drift, and torn-tail scenarios. It verifies 20 restart rollbacks, two recovered commits, and one already-committed finalization.

This v1 graph layer remains JavaScript/Linux-only, supports exactly two to four placement entries and four to eight files, requires existing parent directories, and trusts registered verifier code. Its all-or-restore behavior is controlled transaction logic, not filesystem atomicity. It does not protect against writers that bypass the Hand, automatically break stale leases, prove sudden-power-loss behavior on arbitrary storage, infer missing dependencies, or turn dependency ordering into coding competence.

## Grammar-driven Hand foundry

`hand-foundry-plane.js` converts the placement plane's existing `requiredHands` list into digest-bound capability capsules. It accepts one to four ready plans from the same fresh project-map observation plus a five-minute `toolchain-environment-hand.js` receipt. A multi-plan request must additionally provide the validated `edit-graph-plane.js` receipt; its digest and installation order are copied into every capsule. Plans are rechecked against their observation, current organ and grammar-profile digests, exact Hand sequence, language, graph membership, and unique targets before any capsule is returned.

```js
const environment = require('./toolchain-environment-hand.js').inspect();
const foundry = require('./hand-foundry-plane.js');
const parser = require('./spawned-parser-hand.js');

const manifest = foundry.spawn({
  projectMapObservation,
  placementPlans: [placementPlan],
  environmentObservation: environment
});

const parserCapsule = manifest.handCapsules.find(hand => hand.handRole === 'language-parser');
const parseReceipt = parser.parse({
  capsule: parserCapsule,
  environmentObservation: environment,
  candidate
});
```

The first foundry trial provides real JavaScript and Python syntax-parser capsules. Every parser invocation revalidates the live environment receipt and exact executable/resource-limit bindings; a self-hashed capsule cannot substitute another process path. Python source is sent through stdin to `python3 -I -S` and `ast.parse`; it is never imported or executed. When available, `prlimit` bounds CPU, address space, file descriptors, and wall time. JavaScript uses Node's in-process script parser and likewise never executes the candidate. Syntax success is not behavioral correctness.

Other capsules truthfully route what exists: the read-only map Hand is available without editing authority; JavaScript and Python pair write/rollback Hands require separate host authorization; JavaScript verifiers require digest-bound host adapters. The reviewed Python donor source is present as one bounded recipe, but the capsule remains `RECIPE_INPUT_REQUIRED` until its exact layout and parameters are supplied. Its provenance-locked verifier likewise requires that author receipt and never becomes a general sandbox. An installed `bwrap` binary is not called usable when its harmless namespace probe fails. The foundry cannot generate missing code, grant mutation, grant candidate execution, install tools, deploy, promote, or change canon.

## Bounded Python application path

`bounded-python-record-transform-author-hand.js` is the first complete non-JavaScript author-to-application route. It retains the six reviewed PR #51 donor functions exactly enough to reproduce builder digest `ad281fa5a1381de86d71e1c4a2ffbad30ee20683cb705b4a09d778464ea5227c`. It accepts only the donor's bounded string/null record-transform parameters and only a Python placement plan targeting `capability.py` plus `selftest.py`.

`bounded-python-record-transform-verifier-adapter.js` validates the author receipt, independently regenerates both candidates, demands exact paths/content/digests, and then executes the source and emitted selftest in memory under isolated Python mode and `prlimit`. The candidate import surface contains only `json` and the in-memory `capability` module. This is safe enough for the exact reviewed recipe because substitution is refused; it is not a security boundary for arbitrary candidate code. Current `bwrap` namespace probing fails, so the adapter truthfully records that host filesystem and network isolation are absent.

The focused trial proves one complete Python application transaction, four pre/post Python parser receipts, one provenance-locked runtime pass, one intentional verifier failure with both files restored, and eleven adversarial holds for missing or mismatched parser bindings, syntax failure, drift, stale authorization, wrong donor layout, invalid parameters, tampered plans, forged author receipts, substituted runtime content, and environment path drift. It does not claim general Python authoring or universal runtime correctness.

## Foundry activation plane

`foundry-activation-plane.js` assembles the bounded Python path without requiring the caller to manually pass candidate bytes, a parser context, or verifier adapters:

```js
const activation = require('./foundry-activation-plane.js');

const activationReceipt = activation.activate({
  workspaceRoot,
  journalRoot,
  declaration,
  projectMapObservation,
  placementPlan,
  manifest,
  environmentObservation,
  recipeSelection,
  authorization
});
```

The recipe selection binds the exact donor recipe, builder digests, and parameters. The separate `EXPLICIT_SINGLE_ACTIVATION` authorization binds that selection plus the manifest, placement plan, project/environment receipts, workspace and journal identities, parser capsule, author implementation, verifier implementation, TTL, rollback, and durable recovery. The plane validates that authority and deterministically narrows it into the existing exact candidate-bound edit authorization; it does not create or broaden permission.

The focused activation trial supplies zero candidate bundles, zero parser contexts, and zero verifier adapters from the caller. It automatically assembles the author, parser, verifier, writer, and required rollback capsule, commits one two-target Python transaction, produces four parser receipts and one provenance-locked runtime pass, and leaves an unrelated human file unchanged. Thirteen holds cover repeat activation after state change, missing authority, manifest tamper, missing rollback implementation, selection tamper, unsupported recipe, invalid parameters, authorization binding/authority/staleness, parser mismatch, environment tamper, and workspace drift. All hold fixtures remain byte-identical at return.

This is still one recipe, one Python pair, and one explicit activation. There is no general recipe registry, arbitrary candidate activation, graph activation, self-authorization, deployment, promotion, or canon authority. Durable rollback, recovery, replay refusal, and lease behavior come from the already-tested pair Hand rather than being reimplemented.

The v1.1 project-map convention requires one explicit language-binding kind and signal:

- `extension` for 97 extension-owned organs;
- `basename` for OpenAPI, Maven POM, and Ansible;
- `path-context` for GitHub Actions and Kubernetes manifests.

All 102 organ bindings pass focused placement probes. Ansible's `/roles/` path-context signal also passes as an additional route alongside its basename route. A generic YAML or XML suffix is never treated as ownership proof: missing, forged, or mismatched signals hold before placement.
