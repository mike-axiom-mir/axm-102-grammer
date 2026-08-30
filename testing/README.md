# Standalone verification

Run the complete dependency-free suite from the repository root:

```sh
node testing/run-all.js
```

The runner resolves Python from `AXM_PYTHON`, `python3`, then `python`. It runs every generated-material drift check and every standalone deterministic selftest, continues after an individual failure, and exits non-zero when any check fails. The project-map and workspace-edit Hand checks create isolated temporary workspaces and remove them afterward. The reader snapshots zero mutation; the editors separately prove exact-byte two-target and six-target commits, post-write verifier rollback, artifact cleanup, unrelated-file preservation, deterministic dependency order, and fail-closed graph/authorization/drift/path behavior. The recovery selftests use real `SIGKILL` worker crashes at every pair and graph journal boundary and verify rollback/commit recovery, durable replay refusal, shared lease contention, journal tamper holds, ambiguous byte/mode holds, and torn-tail repair.

Committed transcripts in `testing/logs/` are evidence from the named lane and date. `2026-08-30-durable-workspace-edit-recovery.txt` retains the original pair crash matrix; `2026-08-30-bounded-edit-graph-verification.txt` retains the graph matrix, shared pair/graph lease result, exact recovery counts, 53-probe combined count, and 26-check suite result. These logs are not a runtime-correctness claim for arbitrary programs in the 102 languages.
