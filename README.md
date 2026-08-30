# AXM 102 Grammar Body

Status: **RECOVERED STANDALONE TEST BODY**

This is the clean standalone home for the AXM 102 code/language grammar body.

It contains the actual recovered source and generated language-specific materializations for all 102 code/language organs, including grammar-native profiles, specialist eyes, machine template banks, machine keyboard banks, and machine cheatcode banks, together with their focused deterministic generators, registries, and checks.

## Recovery checkpoint

- source repository: `mike-axiom-mir/axm-collaboration-platform`
- source branch: `codex/code-creation-fabric-102-grammar-integration-v2.12`
- source commit: `386736aaae3993089dfaf970cf2360894959e3c0`
- source PR: `#62`

## Deliberate boundary

Grammar Glass / Code Twister is **not** in this repository. It is a separate layer and can develop independently against this 102-grammar body.

The wider Creation Fabric session planner is also not copied here because it imports Work Context, Production Draft, Build Window, admission, and other platform layers. This repository keeps the 102-language body itself clean instead of smuggling the wider platform back in.

See `RECOVERY_RECEIPT.md` for the exact recovery receipt and `language-organs/SOURCE_README.md` for the source package's original technical description.

## Standalone capability capsule

`language-organs/standalone-capability-router.js` composes the recovered layers into one read-only, digest-bound capsule for a caller-supplied file/language and observation:

- deterministic language resolution with ambiguity and conflict holds;
- organ, grammar, and specialist-eye plans;
- the selected specialist review plus the bounded discovery report;
- hard cheatcode activations and separately marked soft influence candidates;
- deterministic machine/AI template capsules;
- a context-ranked semantic keyboard layout;
- optional software-direction stacks and caller-evidence gap reports.

It does not inspect a caller workspace, render source, execute tools, install anything, switch languages, mutate files, promote candidates, or change canon.

```js
const {compose} = require('./language-organs/standalone-capability-router.js');

const capsule = compose({
  filePath: 'src/world.rs',
  operation: 'refactor',
  intent: 'refactor',
  signals: ['borrow semantics', 'safe refactor', 'tests'],
  observation: {
    risks: ['unsafe boundaries'],
    factCodes: ['LIFETIME_CHANGED', 'VERIFIER_MISSING']
  },
  directions: {
    directionIds: ['game', 'collaboration-multiplayer'],
    execution: ['hard-real-time'],
    observed: {
      capabilities: ['FRAME_LOOP', 'SHARED_STATE_PROTOCOL'],
      verifiers: ['unit-test', 'deterministic-replay']
    }
  }
});
```

An explicit language may resolve a compatible ambiguous signal such as `.m`. It may not silently override a conflicting signal such as `languageId: rust` with a `.py` path.

## Software direction layers

`software-directions/direction-stack.js` supplies 29 composable software profiles plus runtime, execution, state, quality, risk, verification, and distribution axes. It separates language grammar from software purpose: one language profile can serve websites, games, services, firmware, data systems, or hybrids without duplicating the grammar body.

`software-directions/direction-gap-detector.js` compares the selected direction's expectations only with caller-supplied capability and verifier evidence. Missing evidence is reported as a gap, never as proof that a language is incapable. The suggestion router ranks possible directions but does not choose one automatically. See `software-directions/README.md` for the catalog model and examples.

`software-directions/frontier-direction-workbench.js` adds a bounded frontier-user trial over all 29 profiles: one seed build and one stretch build per direction. Its 58 executable reference models test whether the profiles guide a frontier model beyond labels while retaining absent production, hardware, security, deployment, and domain evidence as explicit gaps. The per-direction observations are in `software-directions/FRONTIER_USER_TRIAL_REPORT.md`.

`software-directions/adapters/adapter-plane.js` turns requested verifier categories into actual local executions and digest-bound receipts. The first plane provides one bounded Node reference runtime and nine verifier adapters. Unsupported browser, compatibility, load, security-review, latency, conformance, fuzzing/property, type-check, and hardware targets remain explicit instead of being counted as evidence.

`software-directions/placement/placement-plane.js` adds a deterministic architectural placement grammar. From a project map and change intent it binds one of ten code roles and forty change kinds to a language organ, unique source owner, verification seam, preflight digests, required Hands, and rollback evidence. `software-directions/placement/project-map-hand.js` can produce that map from one explicitly bounded workspace using direct read-only path and byte observations while leaving semantic roles caller-declared. `software-directions/placement/workspace-edit-hand.js` is the separately authorized two-target application boundary for JavaScript and Python: it accepts exact source/test bytes from a capable model or bounded renderer, re-observes the project, parses before and after writing, invokes digest-bound verifier adapters, and restores both targets after failure. Python authorizations additionally bind the exact spawned parser capsule and live environment receipt. A separate caller-bound durable root holds an exclusive workspace lease and digest-chained journal; on Linux, restart recovery rolls pre-verification phases back and finishes verified commits only when exact bytes, modes, and artifacts match known states.

`software-directions/placement/edit-graph-plane.js` and `software-directions/placement/workspace-edit-graph-hand.js` extend that boundary without changing the stable two-target API. Two to four ready placement entries become a cycle-free dependency graph of four to eight exact source/test targets. One explicit authorization, lease, and journal covers the graph; targets install in deterministic topological order, every target is parsed, every entry's requested verifier runs, and any pre-verification failure restores the whole graph. The graph layer does not generate code, install dependencies, deploy, claim universal power-loss safety, or claim filesystem atomicity across all targets. All 102 organs pass explicit extension, basename, or path-context placement probes. Ambiguous ownership, dependency cycles, duplicate targets, protected or unsafe paths, stale/tampered observations or authorizations, unmapped files, and missing/forged/conflicting language signals hold instead of being guessed.

`software-directions/placement/hand-foundry-plane.js` now consumes the `requiredHands` emitted by one to four digest-bound placement plans and derives one capsule per unique role. More than one plan must also carry the validated edit-graph digest and installation order; a loose collection cannot be routed into the graph writer. It binds known implementations to the current language organ, grammar profile, targets, environment observation, and remaining authority gate. `software-directions/placement/spawned-parser-hand.js` parses JavaScript with Node's script grammar and passes Python through stdin to isolated-mode `ast.parse` under fixed resource limits when `prlimit` is available. Neither parser executes candidate code. JavaScript pair/graph writers and the Python pair writer/rollback path are routed as authorization-required implementations.

The first deterministic non-JavaScript application path is deliberately narrow. `software-directions/placement/bounded-python-record-transform-author-hand.js` reproduces the exact reviewed PR #51 donor builder digest and renders only its dependency-free record-field transform plus selftest for the required `capability.py`/`selftest.py` layout. `software-directions/placement/bounded-python-record-transform-verifier-adapter.js` regenerates and digest-matches those exact candidates, then runs them in memory with restricted imports/builtins and hard resource limits. The host's namespace sandbox is unavailable here, so this adapter explicitly refuses arbitrary Python and does not claim filesystem/network isolation or general Python competence. A capable model remains the author outside this recipe. The foundry itself reads no workspace, writes nothing, generates no code, and cannot authorize mutation or candidate execution.

## Run every standalone check

Requires Node.js 18+ and Python 3. The suite installs no dependencies and uses no network.

```sh
node testing/run-all.js
```

In a normal local npm environment, `npm test` invokes that same runner. Set `AXM_PYTHON` only when the Python executable is not available as `python3` or `python`.

The expanded suite contains 29 checks: five generated-material drift checks and twenty-four deterministic selftests, including all 4,896 stable keyboard keys, all 29 software-direction profiles, 58 seed/stretch frontier reference builds, 58 deterministic placement plans, bounded read-only filesystem observations, environment-qualified Hand derivation, spawned JavaScript/Python parser receipts, JavaScript and bounded-Python two-target commit/rollback trials, six-target JavaScript graph trials, 53 actual `SIGKILL` crash/restart probes, concrete adapter receipts, adversarial placement/foundry/graph/editing/recovery holds, hybrid stacks, gap semantics, the standalone composition boundary, and repository independence. The committed verification transcript is under `testing/logs/`.
