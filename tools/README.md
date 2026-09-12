# Capability console

The standalone router returns a large deterministic capsule for machines. The capability console presents the same capsule as a bounded terminal orientation for a human without changing the underlying body.

First useful run:

```sh
node tools/capsule-console.js --demo
```

Orient around caller-supplied evidence:

```sh
node tools/capsule-console.js \
  --file src/world.rs \
  --operation refactor \
  --risk "unsafe boundaries" \
  --fact VERIFIER_MISSING \
  --direction game \
  --capability FRAME_LOOP \
  --verifier unit-test
```

Use `--input request.json` or `--stdin` for the complete composition input. Use `--json` when another machine needs the original full capsule rather than the human view.

The readable view exposes:

- deterministic language resolution or an explicit selection hold;
- active hazards, gap candidates, and hard rule activations;
- the cheapest stated next check and native verifier candidates;
- caller-evidenced direction coverage and missing evidence;
- top template and semantic-keyboard handles;
- the capsule receipt and the no-mutation/no-execution/no-authority boundary.

ANSI color is progressive enhancement only. Labels carry the same meaning without color, `NO_COLOR=1` and `--no-color` are honored, and `--width` supports bounded output from 56 to 120 columns.

The console does not scan a workspace, read the target file, execute a verifier, render source, select a language during ambiguity, mutate files, install dependencies, promote output, or change CANON.

Focused verification:

```sh
node tools/selftest-capsule-console.js
```
