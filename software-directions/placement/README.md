# Deterministic Code Placement

This layer answers a narrow question that capable code generators regularly get wrong: **where does this change belong in the existing program?**

`placement-plane.js` accepts only two explicit inputs:

- a caller-supplied project map describing modules, roles, ownership signals, paths, mutability, digests, and verification seams;
- a change intent describing the software direction, code-role kind, ownership signals, dependencies, public seams, and requested verifiers.

It binds that input to one of ten code roles and to the selected language organ. It then returns one of three outcomes:

- extend one uniquely owned existing module;
- create one new module under the caller-declared convention;
- hold because ownership, paths, language binding, protection, or verification placement is unsafe or ambiguous.

```js
const placement = require('./placement-plane.js');

const plan = placement.plan({projectMap, change});
```

The planner never reads or mutates a workspace. A project map is an assertion supplied by the caller, not proof of current files. Every ready plan therefore names the exact digests that an authorized Hand must recheck immediately before editing, the source and verification destinations, the required Hands, the construction order, and the receipts required afterward.

This is a placement grammar, not a substitute for coding competence and not yet a source generator. Its purpose is to keep capable deterministic or model-based code creation attached to the correct architectural owner and verification seam.

The v1 language-path convention is deliberately narrower than the full 102-organ body. It verifies extension-owned placement for 97 language organs. Five path- or basename-detected organs—GitHub Actions, OpenAPI, Maven POM, Kubernetes manifests, and Ansible—hold until explicit path/basename project conventions are added; the planner does not borrow a generic YAML/XML extension and pretend the binding is unambiguous.
