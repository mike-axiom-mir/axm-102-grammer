# Testing the portable backend

Primary local test:

```bash
node local-backend/selftest-portable.js
```

The test checks two deliberately different truth states:

1. with no adapter pack, ordinary languages remain at `G0_IDENTITY` and parsing is held;
2. with `local-backend/adapters/strict-portable-pack.js`, JSON has the bounded parser → structure → semantic graph → renderer → verifier components required for the G5 specimen.

The selftest is designed to exercise UTF-8 byte ranges, malformed JSON, invalid UTF-8, semantic JSON-pointer nodes, project impact traversal, semantic keyboard replacement, candidate verification, evidence passport binding, Grammar Bridge queries, and unresolved parser-assisted ambiguity.

The test is source code in this PR. Its presence is **not** a claim that it has already executed in this GitHub connector session. A local/working-chat runner must execute it before treating the new backend as runtime-verified.

No always-on GitHub Actions workflow is added by this workstream. Testing can be run locally or by an explicitly chosen CI runner without introducing continuous compute use.
