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
  declaration,
  projectMapObservation,
  placementPlan,
  authorization,
  candidates: {source, verification},
  verifierAdapters
});
```

The capable model or a deterministic renderer supplies the exact UTF-8 candidate bytes. A host must separately issue one `EXPLICIT_SINGLE_TRANSACTION` authorization, valid for no more than 60 seconds, binding the root identity, fresh observation, placement plan, both targets and candidate digests, the JavaScript parser, and every verifier adapter. The authorization digest detects changed fields; it is not a signature, identity, or consent proof.

Before mutation, the Hand re-observes the complete declared project map, refuses drift or protected targets, rechecks existing target digests, and syntax-parses both candidates. It writes only the two planned source/test targets through same-directory temporary and backup files. It then re-reads and re-parses the installed bytes and invokes only the bound verifier adapters. A failed write, post-write check, parser, or verifier triggers reverse-order restoration of prior bytes or removal of newly created targets.

The focused trial proves two successful transactions (replace and create), one intentional post-write verifier failure with both targets restored, 14 language-parse receipts, three registered-verifier receipts, and ten adversarial holds covering replay, parse failure, drift, stale/tampered/unbound authorization, target mismatch, inconsistent nested observation digests, and a forged protected-target plan. All workspaces are generated test fixtures; no production repository was edited.

This v1 Hand supports only JavaScript under Node's CommonJS script parse goal, exactly two files, existing parent directories, candidates up to 1 MiB each, and up to eight verifier bindings. Its rollback and replay memory are process-local. It does not provide a durable crash journal, multi-file atomicity, inter-process locking, or elimination of concurrent mutation races. Verifier adapters are trusted registered code; the Hand limits the context it gives them but cannot prove their purity.

This is a placement and application grammar, not a substitute for coding competence and not yet a source generator. Its purpose is to keep capable deterministic or model-based code creation attached to the correct architectural owner and verification seam.

The v1.1 project-map convention requires one explicit language-binding kind and signal:

- `extension` for 97 extension-owned organs;
- `basename` for OpenAPI, Maven POM, and Ansible;
- `path-context` for GitHub Actions and Kubernetes manifests.

All 102 organ bindings pass focused placement probes. Ansible's `/roles/` path-context signal also passes as an additional route alongside its basename route. A generic YAML or XML suffix is never treated as ownership proof: missing, forged, or mismatched signals hold before placement.
