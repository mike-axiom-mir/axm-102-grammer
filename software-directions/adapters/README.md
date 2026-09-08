# Direction Adapter Plane

The adapter plane converts requested verifier categories into concrete local adapter executions and receipts.

```js
const workbench = require('../frontier-direction-workbench.js');
const adapters = require('./adapter-plane.js');

const packet = workbench.prepare({directionId: 'game', level: 'stretch'});
const resolution = adapters.resolve(packet);
const execution = adapters.execute(packet);
```

Resolution is not evidence. A verifier ID enters `verifiedVerifierIds` only after its adapter runs and returns `VERIFIER_ADAPTER_PASS`.

The first plane contains one bounded Node in-memory runtime and nine verifier adapters:

- unit test;
- integration test;
- deterministic replay;
- structural parse;
- recovery test;
- simulation;
- numerical validation;
- data-quality check;
- model evaluation.

The following verifier categories remain explicitly unsupported locally: type check, property test, fuzzing, UI end-to-end, accessibility audit, compatibility matrix, load test, security review, latency budget, conformance suite, and hardware-in-loop.

The runtime reads only the current Node version and executes reference handlers in memory. It does not inspect or mutate a workspace, launch child processes, access a network, install dependencies, deploy software, or control hardware.

An unsupported target is an adapter gap. It is not a direction failure and not proof that a language is incapable.
