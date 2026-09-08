# Software Direction Layers

Software direction layers describe what a program is trying to become. They sit above the 102 language grammars, which continue to describe language-native meaning, constructs, hazards, and verification focus.

The catalog contains 29 reusable profiles across human-interface, service/network, data/intelligence, system/hardware, and creation/operations families. Profiles can be combined with seven explicit axes:

- runtime;
- execution model;
- state model;
- quality priority;
- risk;
- verification;
- distribution.

This avoids copying each grammar once for every software type. A Rust game/server hybrid, for example, keeps one Rust grammar and composes the `game`, `collaboration-multiplayer`, and any caller-selected axis overlays.

## Compose a direction stack

```js
const directions = require('./direction-stack.js');

const stack = directions.compose({
  directionIds: ['game', 'collaboration-multiplayer'],
  execution: ['hard-real-time'],
  verification: ['deterministic-replay']
});
```

Every expectation retains its source direction. Conflicting pressures are returned as tensions for review; they are not silently rejected or repaired.

## Suggest without selecting

```js
const report = directions.suggest({
  goals: ['Build a multiplayer RTS game with world simulation.']
});
```

Suggestions are ranked candidates only. `automaticSelection` remains `false`.

## Compare caller evidence with expectations

```js
const gaps = require('./direction-gap-detector.js').evaluate({
  stack,
  languageId: 'rust',
  observed: {
    capabilities: ['FRAME_LOOP', 'SHARED_STATE_PROTOCOL'],
    verifiers: ['unit-test', 'deterministic-replay']
  }
});
```

A missing item means that evidence was not supplied. It does not mean the language is incapable, and it never triggers an automatic language switch.

The standalone capability router accepts the same input under `directions`, binds the selected stack and gap report by digest, and also returns non-selecting suggestions:

```js
const {compose} = require('../language-organs/standalone-capability-router.js');

const capsule = compose({
  languageId: 'rust',
  directions: {
    directionIds: ['game', 'collaboration-multiplayer'],
    observed: {
      capabilities: ['FRAME_LOOP'],
      verifiers: ['unit-test']
    }
  }
});
```

`provenance.json` records the primary sources used to synthesize the catalog and the limits of the taxonomy claim. The catalog is a tested design model, not a universal or exhaustive classification of software.

## Frontier-model maturity trial

`frontier-direction-workbench.js` prepares a bounded build packet for every profile and executes two reference challenges per direction through `frontier-reference-builds.js`:

- `seed`: the smallest executable behavior exercising core concerns;
- `stretch`: a larger multi-concern challenge.

```js
const workbench = require('./frontier-direction-workbench.js');

const packet = workbench.prepare({directionId: 'game', level: 'stretch'});
const trial = workbench.runTrial({directionId: 'game', level: 'stretch'});
const allDirections = workbench.runAll();
```

The current bounded run executes 58 reference builds and marks a direction `beginnerReferenceReady` only if both levels pass deterministically. That state is deliberately weaker than production readiness. Real browsers, devices, networks, kernels, hardware, cloud infrastructure, security audits, app stores, and human/domain authority remain external evidence.

See `FRONTIER_USER_TRIAL_REPORT.md` for the per-direction frontier-user observations, the first repair found by the trial, and the next tuning gaps.

## Concrete adapter receipts

`adapters/adapter-plane.js` resolves each trial's requested verifier categories against locally available adapters, executes the bounded Node reference runtime, and returns digest-bound runtime/verifier receipts.

```js
const adapters = require('./adapters/adapter-plane.js');

const resolution = adapters.resolve(packet);
const execution = adapters.execute(packet);
```

Resolution alone is not evidence. Only a passed adapter receipt enters `verifiedVerifierIds`. The first plane supports nine local verifier categories and keeps eleven external or specialized categories unsupported. See `adapters/README.md` for the exact partition and authority boundary.

## Deterministic code placement

`placement/placement-plane.js` addresses the architectural placement seam between knowing how to write code and knowing where that code belongs.

```js
const placement = require('./placement/placement-plane.js');

const plan = placement.plan({projectMap, change});
```

The caller supplies a digest-bound project map, an explicit extension/basename/path-context language signal, and a change intent. The planner resolves one of ten code roles and forty change kinds, binds the selected language organ, and either extends one unique owner, creates a convention-bound module, or holds on ambiguity, protection, traversal, missing/forged language signals, or an unsafe verification seam. Focused probes cover all 102 organs.

A caller can also ask the separately bounded `placement/project-map-hand.js` to observe one explicit absolute workspace root. That Hand combines caller-declared architectural meaning with current path and byte digests, requires complete mapping of matching language files, refuses symlinks and unsafe/broad roots, and emits a five-minute receipt. The planner validates that receipt without acquiring read authority itself:

```js
const projectMapHand = require('./placement/project-map-hand.js');

const projectMapObservation = projectMapHand.inspect({workspaceRoot, declaration});
const observedPlan = placement.plan({projectMapObservation, change});
```

A ready plan includes its source/test destinations, existing target digests, dependency bindings, required Hands, ordered construction stages, drift preconditions, and required parser/verifier/rollback receipts. Neither the reader nor planner can mutate the workspace.

The separately authorized `placement/workspace-edit-hand.js` exercises the first application seam for JavaScript. It accepts model- or renderer-authored exact bytes, not a request to invent code; binds one 60-second authorization to two planned targets and a separate durable root; re-observes and parses before mutation; journals every installed state under an exclusive workspace lease; re-parses and runs registered verifiers after writing; and restores both targets when a verifier fails.

`placement/edit-graph-plane.js` and `placement/workspace-edit-graph-hand.js` now extend that seam to two through four dependency-linked placement entries and four through eight exact targets. The original placement plans remain authoritative, cycles and duplicate targets hold, and one authorization/lease/journal covers graph-wide parse, verification, rollback, and restart recovery. The focused editing trials now include 53 actual process crashes across the two-target and six-target boundaries. Linux restart recovery is provided, but multi-file filesystem atomicity, universal power-loss safety, external-writer exclusion, automatic stale-lease breaking, and a production repository trial are not claimed. See `placement/README.md` for the contracts and full truth boundary.
