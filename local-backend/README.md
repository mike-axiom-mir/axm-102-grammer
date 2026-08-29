# AXM 102 Grammar Local Backend

Status: **portable deterministic backend implementation / TEST**

API: `1.2.0`

The backend makes the 102 Grammar body callable by a person, a local application, another AI/agent with shell access, a VM/container, or a packaged host without changing the grammar logic.

Default mode is **local + offline + AI-optional**.

The core does not download parsers, call AI services, browse the web, install packages, or mutate a workspace. Parser/semantic/verifier capability is attached through explicit local adapter packs and remains `NOT_BOUND`/held until measured.

## One core, three transports

All transports call the same `core.handle({op,input})` function.

### Direct Node library

```js
const {createCore}=require('./local-backend/core.js');
const core=createCore();
console.log(core.handle({op:'detect',input:{filePath:'src/main.py'}}));
```

### NDJSON / stdin

Best universal lane for another agent, working chat with local shell access, test harness, or script:

```bash
echo '{"op":"health"}' | node local-backend/cli.js
```

One JSON request per input line, one JSON response per output line.

### Local HTTP

```bash
node local-backend/server.js
```

Default listener: `127.0.0.1:8172`

- `GET /health`
- `GET /languages`
- `POST /v1` with the normal `{op,input}` request envelope

Loopback binding is deliberate. `--host 0.0.0.0` widens the trust boundary and is explicit. CORS is also opt-in with `--cors` so an arbitrary website cannot silently become a local grammar-service caller.

## Real built-in offline proof adapter

The current dependency-free starter pack is:

```text
./local-backend/adapters/strict-portable-pack.js
```

Use it with:

```bash
node local-backend/cli.js --adapter-pack ./local-backend/adapters/strict-portable-pack.js
node local-backend/server.js --adapter-pack ./local-backend/adapters/strict-portable-pack.js
```

It binds JSON to a strict UTF-8 byte-native parser, structural facts, JSON-pointer semantic graph, syntax/semantic-bound value renderer, and strict local verifier. The pack therefore contains the components required for a bounded `G5_VERIFIED_REWRITE` specimen without downloading anything.

That is a **source-level capability statement until `selftest-portable.js` actually executes successfully on a runner**. The repository does not promote the presence of test code into runtime proof. Other languages remain honestly at their independently measured level until their own local adapters exist.

The JSON renderer is intentionally bounded rather than pretending to implement every keyboard operation. Its first verified edit surface is semantic-node value replacement. Unsupported operations return a typed renderer hold.

## Capability ladder

- `G0_IDENTITY`: recovered deterministic identity/profile/hazards.
- `G1_SYNTAX`: real locally bound parser + syntax passport.
- `G2_STRUCTURE`: native construct/dependency structural facts.
- `G3_SEMANTICS`: definitions/references/types/project semantic facts.
- `G4_REWRITE`: syntax/semantic-bound candidate rendering.
- `G5_VERIFIED_REWRITE`: candidate survives locally bound verifier ladder.
- `G6_DEEP_ANALYSIS`: optional language-specific advanced analysis through an explicitly bound deterministic local adapter.

Capability is measured independently per language. Merely naming or finding a tool does not promote a language. A level means a bounded capability exists, not that every possible operation in that language is implemented.

The starter JSON pack deliberately stops at G5. The G6 backend contract exists, but no deep-analysis adapter is bundled merely to make the number larger.

## Source boundary

Source operations accept caller-supplied bytes:

```json
{"source":"UTF-8 text"}
```

or:

```json
{"sourceBase64":"..."}
```

The default backend does not open arbitrary workspace paths. A host that already has explicit workspace authority can read bytes, submit them, inspect the returned candidate/evidence, and separately decide whether to write accepted bytes.

## Operations

Knowledge/control:

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

Source evidence:

- `parse`
- `structure`
- `semantic`
- `analyze`
- `deep-analysis`
- `project-graph`
- `project-impact`

Candidate/verification:

- `render`
- `intent-render`
- `render-verify`
- `intent-render-verify`
- `evidence-passport`

Cross-language comparison:

- `bridge-build`
- `bridge-query`

## Parser-assisted ambiguous detection

The original cheap deterministic detection order remains intact. `detect-assisted` is an optional second stage for cases such as `.m` or `.v`.

It resolves an ambiguity only when every candidate has a bound parser, exactly one parses without errors, and all other candidates produce parse errors. Missing candidate parsers prevent automatic resolution. A zero-error parse remains syntax evidence, not semantic proof.

## Structural and semantic design

AXM does **not** flatten all languages into one universal AST. Each language keeps its native tree and native facts. Shared envelopes normalize evidence such as byte ranges, definitions, references, imports, dependencies, calls, implementations, type relations, schema/contract links, generated-source links, and embedded-language relations.

`project-graph` combines per-document semantic graphs. `project-impact` performs bounded deterministic graph traversal, reporting reachability as an impact candidate rather than pretending graph reachability proves runtime behavior.

`deep-analysis` is a provider-neutral G6 lane. A future local adapter may expose language-appropriate advanced findings while keeping source/evidence binding and no-authority rules intact.

## Rendering

The generic candidate renderer accepts exact byte-range edits and produces new candidate bytes plus input/output digests. It never writes a file.

The intent renderer connects existing semantic keyboard operations to a language-specific local rendering adapter. A keyboard intent can therefore become a candidate patch while preserving the existing rule:

`intent -> candidate -> verification -> evidence -> external admission/write decision`

No renderer grants mutation authority. Unsupported or insufficiently evidenced intents can return a deterministic HOLD instead of being forced into a rewrite.

## Verification

The verifier ladder is cheapest-falsifier-first:

1. source/currentness digest
2. exact edit boundaries
3. reparse
4. parse-error delta
5. language-specific local verifiers in declared cost order
6. later native type/schema/lint/test/build/sandbox adapters where explicitly bound

A missing parser/verifier is not PASS.

## Evidence passports

Evidence passports bind the source digest to syntax, structure, semantic graph, project graph, rendering and verification digests. Evidence remains evidence, never authority.

## Grammar Bridge Atlas

The bridge atlas can record evidence-backed relations between native concepts in different languages without erasing either grammar. Bridges support comparison and translation reasoning, not automatic language switching or migration.

## Adapter packs

Select a pack explicitly:

```bash
node local-backend/cli.js --adapter-pack ./path/to/local-pack.js
```

or:

```text
AXM_GRAMMAR_ADAPTER_PACK=/absolute/path/to/local-pack.js
```

A pack can expose:

```js
module.exports={
  parsers:{python:pythonParserAdapter},
  structures:{python:pythonStructureAdapter},
  semantics:{python:pythonSemanticAdapter},
  intentRenderers:{python:pythonIntentRenderer},
  verifiers:{python:[pythonSyntaxVerifier,pythonTypeVerifier]},
  deepAnalysis:{python:pythonAdvancedAnalysisAdapter}
};
```

Production parser/verifier artifacts should be vendored or otherwise explicitly installed and pinned locally with versions/digests. Runtime auto-download is not the default architecture.

The next adapter wave should target the high-priority core first while independently measuring broad parser coverage: HTML, Python, JavaScript, TypeScript, CSS, JSON, YAML, Bash/POSIX Shell, PowerShell, SQL, TOML, Docker, Go, Rust, C#, Java, C and C++.

## Testing

Primary portable test:

```bash
node local-backend/selftest-portable.js
```

It is designed to check:

- all 102 identities remain visible;
- an unbound language remains `G0_IDENTITY`;
- missing parsers return `PARSER_ADAPTER_NOT_BOUND`;
- the strict built-in JSON pack exposes the bounded G5 component chain;
- UTF-8/multibyte byte ranges remain bounded correctly;
- malformed JSON and invalid UTF-8 become parse-error evidence;
- project semantic graph + bounded impact traversal work;
- a semantic keyboard value replacement becomes a candidate and survives the strict verifier ladder;
- an evidence passport binds the resulting chain;
- Grammar Bridge queries remain comparison-only;
- unresolved language ambiguity stays held when candidate parsers are absent.

The selftest has **not been executed by this GitHub connector session**. Its successful runtime result must be established later by a local/working-chat runner.

No always-on GitHub Actions workflow is added here. Tests can be run locally or by an explicitly chosen CI runner without creating continuous compute noise.

## Portable handoff

A future tester does not need this chat context. Check out the PR branch, run the portable selftest, then use either NDJSON or HTTP with the strict starter pack. New language adapters should only raise capability levels after their local deterministic tests actually pass.

Zero-dependency npm shortcuts are also available from `local-backend/`:

```bash
npm run selftest
npm run health
npm run server
npm run server:json
```

See also:

- `PORTABILITY_CONTRACT.md`
- `SECURITY.md`
- `adapter-pack.contract.json`
- `EXAMPLE_REQUESTS.ndjson`
- `../ROADMAP_DETERMINISTIC_CAPABILITY.md`
- `../PUBLIC_RESEARCH_BASIS.md`
