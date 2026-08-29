# Standalone verification

Run the complete dependency-free suite from the repository root:

```sh
node testing/run-all.js
```

The runner resolves Python from `AXM_PYTHON`, `python3`, then `python`. It runs every generated-material drift check and every standalone deterministic selftest, continues after an individual failure, and exits non-zero when any check fails.

Committed transcripts in `testing/logs/` are evidence from the named lane and date. They are not a runtime-correctness claim for arbitrary programs in the 102 languages.
