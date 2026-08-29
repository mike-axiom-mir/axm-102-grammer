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
