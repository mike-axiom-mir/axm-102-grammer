# Standalone verification

Run the complete dependency-free suite from the repository root:

```sh
node testing/run-all.js
```

The runner resolves Python from `AXM_PYTHON`, `python3`, then `python`. It runs every generated-material drift check and every standalone deterministic selftest, continues after an individual failure, and exits non-zero when any check fails. The project-map and workspace-edit Hand checks create isolated temporary workspaces and remove them afterward. The reader snapshots zero mutation; the editor separately proves exact-byte replace/create commits, post-write verifier rollback, artifact cleanup, unrelated-file preservation, and fail-closed authorization/drift/path behavior. The recovery selftest uses real `SIGKILL` worker crashes at every replace/create journal boundary and verifies rollback/commit recovery, durable replay refusal, lease contention, journal tamper holds, ambiguous byte/mode holds, and torn-tail repair.

Committed transcripts in `testing/logs/` are evidence from the named lane and date. `2026-08-30-durable-workspace-edit-recovery.txt` retains the crash matrix, exact recovery counts, suite result, and truth boundary. These logs are not a runtime-correctness claim for arbitrary programs in the 102 languages.
