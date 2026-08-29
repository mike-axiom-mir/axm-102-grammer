# Frontier-Model Software-Direction Trial

Status: **29/29 beginner reference ready; 58/58 bounded builds passed; 0 production ready**

Date: 2026-08-29

Perspective: one frontier model using the software-direction profiles as a user-side build guide

Human intervention during each individual trial run: none

## What was tested

Every software direction received two executable, deterministic reference challenges:

- **seed** — the smallest useful behavior that exercises core direction concerns;
- **stretch** — a larger multi-concern challenge intended to expose whether the profile remains useful beyond a toy.

The frontier model authored the bounded reference implementations from the direction catalog, then the workbench prepared and executed all 58 packets without per-run human input. A direction reached **beginner reference ready** only when both challenges passed, their declared check surfaces matched exactly, and their modeled evidence stayed inside that direction's catalog profile.

These are in-memory reference models. They are not installed applications, production services, real networks, hardware runs, security certifications, app-store packages, or proof of arbitrary-program correctness.

## Repair made during the trial

The first catalog-validation run failed before awarding any pass because the backend stretch challenge requested `RETRY_IDEMPOTENCY`, which belongs to the distributed/cloud profile. The challenge was repaired to use the backend profile's `CONCURRENT_REQUEST_CONTROL` boundary while retaining repeated-request behavior in the executable check.

This was a useful result: the profiles prevented two nearby software directions from silently borrowing each other's capability names.

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

The layer is already useful to a frontier model as a **pre-build directional checklist and gap lens**. It consistently changes what the model notices before writing code and reduces generic app-shaped reasoning.

The biggest remaining weakness is adapter depth. Profiles describe what must matter, but they do not yet bind a concrete framework, toolchain, device, verifier, infrastructure target, or human/domain authority. Capability evidence is also still coarse: future versions should give important capability IDs richer acceptance schemas instead of relying on a name plus a bounded reference check.

The next meaningful maturation step is a local comparison across multiple frontier and local models, with human observations added separately rather than silently merged into this machine-side report.

## Evidence entrypoints

- machine-readable challenges and per-direction observations: `frontier-trial-catalog.json`
- executable reference builds: `frontier-reference-builds.js`
- packet, assessment, and aggregate report logic: `frontier-direction-workbench.js`
- deterministic 58-build verification: `selftest-frontier-direction-workbench.js`

Aggregate report digest from the first successful focused run: `e12901415fcbd6c2480a96d835b85788eed9f5377b8b55c3d76efd1a9cabe72d`
