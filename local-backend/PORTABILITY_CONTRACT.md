# Portable Backend Contract

The AXM 102 Grammar backend is designed so the same deterministic body can be exercised by:

- a person on a local machine,
- another AI/agent with shell access,
- a local browser page through an explicitly enabled localhost HTTP bridge,
- a VM/container,
- a packaged desktop/native host,
- a removable/offline distribution.

The transport layer never defines grammar truth. It only carries requests and deterministic evidence objects.

## Required properties

- Node.js built-ins only for transport.
- No account or API key required.
- No network dependency for core operations.
- No AI dependency for core operations.
- Loopback-only HTTP binding by default.
- No arbitrary path reads in the default API.
- No workspace mutation in the default API.
- Adapter packs are explicitly selected local code.
- Native parser/verifier versions and artifacts are evidence, not assumed capability.
- All candidate source output remains a candidate until an explicit external caller chooses to write it.

## Stable request envelope

```json
{"op":"detect","input":{"filePath":"src/main.py"}}
```

The same envelope is accepted by direct library calls, NDJSON stdin and HTTP `POST /v1`.

This makes later testing independent of the chat/product that happens to invoke the engine.
