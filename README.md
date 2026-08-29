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
- a context-ranked semantic keyboard layout.

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
  }
});
```

An explicit language may resolve a compatible ambiguous signal such as `.m`. It may not silently override a conflicting signal such as `languageId: rust` with a `.py` path.

## Run every standalone check

Requires Node.js 18+ and Python 3. The suite installs no dependencies and uses no network.

```sh
node testing/run-all.js
```

In a normal local npm environment, `npm test` invokes that same runner. Set `AXM_PYTHON` only when the Python executable is not available as `python3` or `python`.

The expanded suite contains 15 checks: five generated-material drift checks and ten deterministic selftests, including all 4,896 stable keyboard keys, the standalone composition boundary, and repository independence. The committed verification transcript is under `testing/logs/`.
