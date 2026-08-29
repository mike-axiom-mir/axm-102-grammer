# Frontier-Model Software-Direction Trial

Status: **29/29 beginner reference ready; 58/58 bounded builds passed; 0 production ready**

Date: 2026-08-29

Perspective: one frontier model using the software-direction profiles as a user-side build guide

Human intervention during each individual trial run: none

## What was tested

Every software direction received two executable, deterministic reference challenges:

- **seed** — the smallest useful behavior that exercises core direction concerns;
- **stretch** — a larger multi-concern challenge intended to expose whether the profile remains useful beyond a toy.

The frontier model authored the bounded reference implementations from the direction catalog, then the workbench prepared and executed all 58 packets without per-run human input. A direction reached **beginner reference ready** only when both challenges passed, their declared check surfaces matched exactly, concrete local adapter receipts were valid, deterministic reference placement plans were ready, and unsupported real-world adapters stayed visible.

These are in-memory reference models. They are not installed applications, production services, real networks, hardware runs, security certifications, app-store packages, or proof of arbitrary-program correctness.

## Repairs made during the trial

The first catalog-validation run failed before awarding any pass because the backend stretch challenge requested `RETRY_IDEMPOTENCY`, which belongs to the distributed/cloud profile. The challenge was repaired to use the backend profile's `CONCURRENT_REQUEST_CONTROL` boundary while retaining repeated-request behavior in the executable check.

This was a useful result: the profiles prevented two nearby software directions from silently borrowing each other's capability names.

Binding the concrete adapter plane then exposed three more weaknesses that the earlier declared-target model had missed:

- the creative-editor stretch case requested recovery without restoring an export, so export restoration was added;
- the distributed/cloud stretch case requested recovery but only tested a successful rolling upgrade, so rollback restoration was added;
- the firmware stretch case requested simulation without explicitly identifying its artifact as simulated, so the artifact boundary was corrected.

The adapters were not weakened to accept those builds; the builds were strengthened.

## Concrete adapter outcome

The first adapter plane adds one bounded Node in-memory runtime plus nine executable verifier adapters. Across the 58 builds it produced:

- 58 passed runtime receipts;
- 76 passed verifier-adapter receipts;
- 20 requested verifier targets retained as unsupported;
- 26 of 29 directions with at least one concrete local verifier adapter;
- 10 directions with one or more unsupported verifier targets;
- seven individual build cases with zero concrete verifier coverage, kept visible rather than promoted.

Supported locally: unit test, integration test, deterministic replay, structural parse, recovery test, simulation, numerical validation, data-quality check, and model evaluation.

Still unsupported locally: type check, property test, fuzzing, UI end-to-end, accessibility audit, compatibility matrix, load test, security review, latency budget, conformance suite, and hardware-in-loop.

The trial catalog now calls these fields **requested verifiers**. A requested name becomes evidence only after a concrete adapter runs and returns a passed digest-bound receipt.

## Deterministic placement outcome

The next code-grammar atom addresses a different failure mode: a capable code agent may know how to write a change while still putting it in the wrong module, duplicating an existing owner, bypassing a protected seam, or attaching the wrong tests.

The placement grammar defines ten architectural code roles and forty explicit change kinds. It consumes a caller-supplied project map rather than silently reading a workspace. Across the frontier trial it produced:

- 58 of 58 deterministic reference placement plans ready;
- 58 unique existing-source owner selections;
- 58 matching existing verification-seam selections;
- 29 of 29 software directions covered by ordered role hints;
- language-organ, project-map, source-target, test-target, and dependency digests bound into every plan;
- exact required Hands, construction stages, drift preconditions, parser/verifier receipts, and rollback evidence named before any future mutation;
- zero workspace-read, mutation, execution, install, network, deployment, promotion, or canon authority.

Separate adversarial probes hold rather than guess when ownership is duplicated, an owner is locked, a path traverses outside declared roots, a language binding is missing, forged, conflicting, or inconsistent with the chosen target, the change kind is unknown, or a dependency is absent. A new-module probe also proves that the same planner can choose a convention-bound source and test path when no existing owner exists.

Cross-language placement probes now pass for all 102 organs: 97 bind through an owned extension, OpenAPI/Maven POM/Ansible bind through exact basenames, and GitHub Actions/Kubernetes manifests bind through declared path contexts. Ansible's `/roles/` path-context route passes separately as a second valid binding. A generic YAML or XML suffix is still not proof; the caller must name a signal owned by the selected organ.

These 58 reference maps prove deterministic planner behavior only. They are not observations of a caller's live repository and the resulting plans are not source code. Before applying a comparable plan to a real project, the new read-only Hand must produce a fresh observation and a separately authorized editing Hand must recheck every bound digest, perform the language-aware edit, run the parser/verifiers, and return rollback-capable receipts.

## Read-only project-map Hand outcome

The first filesystem Hand now closes the observation part of that gap without gaining editing authority. In focused tests it observed three isolated workspaces representing extension, exact-basename, and path-context language binding; mapped six declared modules; hashed their current bytes; and passed the resulting fresh receipt directly into the placement plane.

The Hand requires the caller to declare semantic roles, ownership, mutability, exports, and verification relationships because filesystem bytes cannot prove those meanings. It then directly checks the bounded facts that a caller declaration could previously invent: source/test roots, complete matching-file coverage, exact paths, regular-file status, and content digests. Receipts expire after five minutes and every future edit still requires an immediate digest recheck.

The focused test snapshots the temporary workspace before and after observation and found no path or byte mutation. It also proved that changed bytes produce a different project-map and observation digest, and verified 13 fail-closed cases covering stale, future-dated, overlong, or tampered receipts; ambiguous direct/observed inputs; unmapped or missing files; absent roots; symlinks; traversal; filesystem-root scope; relative roots; and limit escalation.

This is real filesystem observation, but only inside generated test workspaces. It is not yet an editing trial on a production repository, a semantic ownership inference engine, signer proof, parser execution, or arbitrary-program correctness evidence.

## Separately authorized editing Hand outcome

The next gap is now exercised for the first JavaScript boundary. The editing Hand does not attempt to out-code the model: a capable model or deterministic renderer supplies exact source and test bytes, while the Hand binds those bytes to the previously observed architectural destination and applies only a separately authorized transaction.

The focused test used generated workspaces and produced:

- two successful two-target transactions, one replacing an existing source/test pair and one creating a convention-bound pair;
- 14 pre/post JavaScript parse receipts and three registered-verifier receipts;
- one intentionally failed post-write verifier transaction, followed by byte-and-mode restoration of both targets;
- ten fail-closed cases covering authorization replay, syntax rejection before mutation, workspace drift, stale authorization, authorization tampering, missing verifier binding, candidate-target mismatch, an internally inconsistent observation receipt, and a digest-valid forged plan aimed at a protected target;
- no leftover transaction artifacts, no changed unrelated fixture file, and no production-repository edit.

The authorization is valid for at most 60 seconds and binds the workspace identity, observation, placement plan, two target/action/pre-digest/candidate tuples, parser, and verifier adapters. The Hand immediately re-observes the project, rechecks target bytes, parses before mutation, writes through same-directory temporary/backup paths, re-reads and parses installed bytes, and accepts the transaction only after every requested bound verifier passes.

This is still a narrow TEST capability. It supports JavaScript under Node's CommonJS script parse goal, existing parent directories, two targets, and process-local rollback/replay memory. It has no durable crash journal, multi-file atomicity, inter-process lock, proof of adapter purity, or guarantee against a concurrent mutation race. It is guidance and controlled application for code supplied elsewhere, not a claim of deterministic perfect code generation.

## Per-direction frontier-user observations

| Direction | Where the layer helped | Where it still needs tuning |
|---|---|---|
| Information website | Kept semantics, navigation, responsiveness, and accessibility ahead of visual polish. | Needs a browser/render adapter and human content-quality review. |
| Interactive web app | Exposed state, validation, routes, authentication, and offline behavior. | Needs framework lifecycle, browser storage, and threat-model bindings. |
| Mobile app | Corrected desktop assumptions through lifecycle, permission, offline, and background limits. | Needs Android/iOS adapters and representative device testing. |
| Desktop app | Made file boundaries, migration, cancellation, install, and update visible. | Needs OS-specific packaging, signing, permissions, and native integration. |
| Game | Produced a coherent loop/input/world/rules/save/replay skeleton. | Needs engine binding, assets, feel, rendering, and measured frame performance. |
| Simulation | Separated model time, state, measurement, seed, and provenance from visuals. | Needs domain equations, calibration data, uncertainty, and numerical validation. |
| XR/spatial | Forced coordinate, capability, latency, and comfort assumptions into the open. | Needs headset observation, comfort study, and hardware-in-loop evidence. |
| Creative/media editor | Favored reversible edits, history, graph topology, streaming, and provenance. | Needs codec, color/audio, GPU, and hostile-plugin evidence. |
| Backend/API | Prevented happy-path-only design through contracts, validation, persistence, errors, timeout, and observation. | Needs framework, database, auth, load target, and deployment bindings. |
| Distributed/cloud | Gave precise partial-failure, idempotency, consistency, scaling, and rolling-change questions. | Needs scheduler, partition, cloud-cost, discovery, and real-load evidence. |
| Live media/streaming | Made capture consent, jitter, synchronization, adaptation, and device negotiation structural. | Needs codecs, media stacks, packet-loss tests, measured latency, and load. |
| Collaboration/multiplayer | Exposed authority, ordering, conflict, reconnect, prediction, and abuse boundaries. | Needs transport, scale, moderation/anti-cheat, and measured latency decisions. |
| Enterprise/workflow | Made roles, audit, rule versions, transactions, and long-lived state explicit. | Needs real regulation, accounting, policy, and integration owners. |
| Database/storage/search | Joined schema, query, index, transaction, migration, durability, and recovery. | Needs engine isolation, realistic data, disk failure, and performance evidence. |
| Batch/data pipeline | Added lineage, drift, checkpoints, idempotency, partitioning, and quarantine. | Needs dataset/privacy contracts, scheduler behavior, and throughput evidence. |
| Event-stream processing | Clarified event time, windows, delivery, backpressure, checkpoints, and late events. | Needs broker semantics, watermarks, scale, and operational recovery adapters. |
| Analytics/BI | Prevented attractive but ambiguous measures through filter, provenance, refresh, drilldown, and uncertainty. | Needs business owners, source validation, privacy, and usability review. |
| AI/ML | Enforced dataset/model boundaries, train/inference separation, evaluation, versions, uncertainty, and drift. | Needs real data, weights, safety evals, accelerator evidence, and monitoring. |
| Scientific/HPC | Shifted reasoning toward precision, decomposition, seeds, checkpoints, provenance, and references. | Needs real algorithms, hardware topology, memory pressure, and large-scale validation. |
| Kernel/driver/runtime | Strongly corrected app-level assumptions with privilege, ownership, interrupt, ABI, and containment. | The trial is userspace only; kernel, compiler, races, devices, fuzzing, and hardware remain. |
| Embedded/firmware/IoT | Focused the model on bounded memory, power, interrupts, registers, deadlines, and rollback. | Needs board/toolchain, electrical, timing, radio, and hardware-in-loop evidence. |
| Robotics/industrial control | Made physical consequences, safety envelopes, time, fail-safe, and traceability unavoidable. | Needs plant dynamics, safety experts, sensors, RTOS, and hardware-in-loop evidence. |
| Networking/telecom | Gave precise protocol, packet, retry, congestion, routing, wire, and malformed-input seams. | Needs sockets, kernel queues, captures, interoperability, load, and latency evidence. |
| Security/identity/cryptography | Prevented casual invented security by naming trust, identity, authorization, secrets, primitives, audit, and attacks. | Cannot self-certify; needs approved primitives, threat review, fuzzing, operations, and independent audit. |
| Smart contract/ledger | Brought determinism, invariants, cost, reentrancy, governance, audit, and irreversible holds forward. | Needs chain/compiler semantics, formal verification, economic review, and independent security review. |
| CLI/automation | Improved safety through argument, filesystem/process, dry-run, diagnostic, path, and idempotency boundaries. | Needs actual shell, permissions, signals, platforms, and destructive-operation policy. |
| Compiler/interpreter/runtime | Created a coherent parse/scope/IR/invariant/execution/diagnostic pipeline. | Needs grammar/type depth, optimization proof, target ABI, fuzz corpus, and compatibility. |
| Library/SDK/plugin | Pushed the model toward stable APIs, versions, consumers, lifecycle, sandboxing, migration, and examples. | Needs ecosystem, binary/API matrices, hostile plugins, releases, and real consumers. |
| Build/deployment infrastructure | Made graph, reproducibility, desired state, idempotency, secrets, rollback, and provenance structural. | Needs real CI/runtime, credentials, policy, supply-chain scanning, and rollback drills. |

## Cross-direction finding

The layer is already useful to a frontier model as a **pre-build directional checklist, placement stabilizer, and gap lens**. It consistently changes what the model notices before writing code, reduces generic app-shaped reasoning, and gives actual code a deterministic architectural destination before an editing Hand receives authority.

The first local adapter plane closes part of the earlier adapter gap, but depth remains the main weakness. It does not yet bind a concrete framework, browser, mobile/desktop package, compiler, device, cloud target, external verifier, or human/domain authority. Capability evidence is also still coarse: future versions should give important capability IDs richer acceptance schemas instead of relying on a name plus a bounded reference check.

The first separately authorized editing Hand trial now closes the process-local application loop for JavaScript fixtures. The next placement maturation gaps are a durable recovery journal plus inter-process coordination, followed by real sandboxed language/parser/verifier adapters beyond Node's script goal. A later production-like but disposable repository trial should compare frontier and local models and measure whether the placement grammar actually reduces destination drift, repair work, and unrelated edits.

## Evidence entrypoints

- machine-readable challenges and per-direction observations: `frontier-trial-catalog.json`
- executable reference builds: `frontier-reference-builds.js`
- packet, assessment, and aggregate report logic: `frontier-direction-workbench.js`
- concrete adapter registry, resolver, implementations, and receipts: `adapters/`
- deterministic role catalog, placement planner, fixtures, and adversarial holds: `placement/`
- bounded read-only workspace observer, freshness receipt, and no-mutation/adversarial tests: `placement/project-map-hand.js`, `placement/selftest-project-map-hand.js`
- separately authorized exact-byte editor, transaction contract, rollback logic, and focused adversarial test: `placement/workspace-edit-hand.js`, `placement/workspace-edit-hand.contract.json`, `placement/selftest-workspace-edit-hand.js`
- deterministic 58-build verification: `selftest-frontier-direction-workbench.js`

Aggregate adapter-and-placement-bound frontier report digest: `8cf10067834ec10da62b92794ca28fc23af553b9743a75ea2e7d946e9452395a`
