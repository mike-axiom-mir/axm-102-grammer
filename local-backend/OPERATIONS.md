# Local Backend Operations

All transports use the same request envelope:

```json
{"op":"health","input":{}}
```

## Read-only deterministic knowledge operations

- `health`
- `languages`
- `language`
- `detect`
- `detect-assisted`
- `grammar-plan`
- `eye-plan`
- `discover`
- `keyboard-layout`
- `keyboard-press`
- `keyboard-program`
- `capability`

## Source evidence operations

- `parse`
- `structure`
- `semantic`
- `analyze`
- `deep-analysis`
- `project-graph`
- `project-impact`

These consume caller-supplied UTF-8 or base64 bytes or already-produced evidence objects. They do not read arbitrary paths.

## Candidate / verification operations

- `render`
- `intent-render`
- `render-verify`
- `intent-render-verify`
- `evidence-passport`

These create candidate bytes and evidence. They do not write files.

## Cross-language operations

- `bridge-build`
- `bridge-query`

The transport contract stays the same as capability grows. Language-specific power comes from explicit local adapter packs rather than separate backend implementations.
