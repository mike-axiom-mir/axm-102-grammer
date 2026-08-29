# Local Adapter Packs

Adapter packs attach real locally available parser, structure, semantic, renderer and verifier implementations to the portable backend.

The backend never downloads these automatically. A pack is loaded only from an explicit local module path.

Production adapters should report stable implementation identity and, where practical, a digest of the pinned parser/tool artifact they execute. Test doubles belong only in tests and must not be shipped as capability proof.

The current dependency-free proof path is:

- `builtin-json-strict.js` — strict UTF-8 byte-native JSON parser + structural fact adapter.
- `builtin-json-semantic.js` — JSON-pointer semantic nodes and containment edges.
- `builtin-json-renderer.js` — bounded semantic-node value replacement to exact byte edits.
- `builtin-json-verifier.js` — strict local candidate verification.
- `strict-portable-pack.js` — binds the full JSON chain through the adapter-pack contract.

Use:

```bash
node local-backend/cli.js --adapter-pack ./local-backend/adapters/strict-portable-pack.js
```

The pack contains a bounded G5 component chain, not a promise that every JSON keyboard operation is implemented. Unsupported renderer operations hold explicitly. Runtime verification still requires executing `local-backend/selftest-portable.js`.

Broader language support should be added as vendored/pinned local parser packs or native deterministic frontends are measured. Each language earns its own capability level; one broad parser bundle never promotes all 102 by assumption.
