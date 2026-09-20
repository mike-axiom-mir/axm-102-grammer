# Composable code programs

Build real JavaScript or Python modules from explicit typed program data. The
same 48 small operations can serve a game rule, a record validator, a business
calculation, a collection pipeline, or another bounded pure function. No AI,
network, third-party package, parser download, or source execution is needed to
compile. A human, an AI, or deterministic code can provide exactly the same JSON.

The eight bundled recipes demonstrate combinations; they are not the limit of
what the compiler can compose. `selftest.js` also creates and executes 48 new
seeded expression-tree functions, checking 768 cases per language independently
of those recipes.

This is a restricted portable expression grammar for new code. It does not
translate arbitrary existing source or replace native language trees. The 102
language organs, existing keyboard, native G0–G6 measurements, JSON renderer,
placement writers, and two registered Python author Hands keep their contracts.

## Try an actual recipe

From this checkout:

```sh
node bin/axm-code-program.js --pretty < code-programs/examples/invoice-totals.json
```

The response contains `module.js`, `selftest.js`, source hashes, the checked
function order, types for every expression, function-to-source line mappings,
and structural identities for reusable functions. `verification.executed` is
always false here. Generating a test is not running it.

The Node API lets an authorized caller save and execute these candidates:

```js
const fs = require('node:fs');
const path = require('node:path');
const programs = require('./code-programs');
const output = programs.compileRecipe({id: 'invoice-totals', languageId: 'javascript'});
if (output.result !== 'CODE_PROGRAM_CANDIDATE_READY') throw Error(output.errorCode);
fs.mkdirSync('invoice-demo'); // intentionally fails if it already exists
for (const artifact of output.artifacts) {
  fs.writeFileSync(path.join('invoice-demo', artifact.path), artifact.content, {flag: 'wx'});
}
```

```sh
node invoice-demo/selftest.js
```

For Python, select `languageId: 'python'`, then run
`python3 invoice-demo/selftest.py`. The generated Python module exposes named
functions and a `FUNCTIONS` dictionary. JavaScript uses CommonJS exports.
Each generated module includes its bounded runtime; it needs no AXM package at
execution time. Python only imports standard-library `math` and `builtins`.

The invoice example computes a subtotal of 12, tax of 3, and total of 15, while
ignoring an inactive line and trimming the active label. These are floating-point
calculations; use an appropriate exact-money implementation when that is needed.

## Three entry points

- Installed library: `require('axm-102-grammar-body/code-programs')`.
- Installed CLI: `axm-code-program [--pretty]`, one UTF-8 JSON request on stdin.
- Existing NDJSON/HTTP backend: `{op:'code-program', input:{action:...}}`.

CLI actions and request fields:

| Action | Required fields after `action` | Optional fields | Returns |
| --- | --- | --- | --- |
| `catalog` | None | None | Operations, recipes, languages, bounds |
| `validate` | `program` | None | Normalized program, types, dependency order |
| `compile` | `program`, `languageId` | `cases` | Source and optional test artifacts |
| `recipe` | `id`, `languageId` | None | Compiled bundled recipe and tests |
| `capture` | `program` | `archive`, `origin` | A new additive archive |
| `restore` | `archive`, `structuralSha256` | `name` | A portable program ready to compile |

Compilation errors return `CODE_PROGRAM_HELD` with a diagnostic code and path.
Malformed CLI requests write a JSON refusal to stderr and exit 2. Inputs are
limited to one MiB. The compiler/CLI/backend never load arbitrary candidate
modules, execute generated tests, or write an archive/workspace.

## Program contract

```json
{
  "schema": "axm.code.program.v1",
  "name": "healthRule",
  "functions": [{
    "name": "remainingHealth",
    "params": [{"name": "health", "type": "number"}, {"name": "damage", "type": "number"}],
    "returns": "number",
    "body": {
      "op": "max",
      "left": {"op": "literal", "type": "number", "value": 0},
      "right": {
        "op": "subtract",
        "left": {"op": "ref", "name": "health"},
        "right": {"op": "ref", "name": "damage"}
      }
    }
  }],
  "exports": ["remainingHealth"]
}
```

Types are `number`, `string`, `boolean`, `null`, `{list: T}`, `{record: {key: T}}`,
and `{nullable: T}`. Record inputs have exactly the declared fields. Nullable
means explicitly null or a typed value; it does not mean a missing field.
Functions have typed positional parameters and one expression result. `let`
creates an immutable lexical binding; `call` composes functions in the same
program. All references, argument/return types, exports, branches and dependency
cycles are checked before emission. Recursion, unknown operations, raw source,
implicit type coercion, hidden extra fields, and shadowed local bindings are
refused. Function/export declaration order and object key order do not affect
compilation identity; parameter and operation order do.

## Operation shapes

Every expression has an `op` plus exactly these fields:

| Operations | Additional fields |
| --- | --- |
| `literal` | `type`, `value` (plain JSON data) |
| `ref` | `name` |
| `record` | `fields`: field-to-expression map |
| `list` | `itemType`, `items`: expressions |
| `field` | `value`: record expression, `key`: declared field |
| `call` | `function`: declared name, `args`: expressions |
| `let` | `name`, `value`, `body` |
| `if` | `condition`, `then`, `else` (branches have the same type) |
| `map`, `filter`, `some`, `every` | `input`: list, `item`: binding name, `body` |
| `fold` | `input`, `item`, `acc`: binding name, `initial`, `body` |
| `sortBy` | `input`, `item`, `key`: number/string expression, `descending`: boolean |
| `at` | `input`: list, `index`: number, `fallback` |
| `slice` | `input`: list/string, `start`, `end` |
| `join` | `input`: list of strings, `separator`: string expression |
| `length`, `trim`, `asciiLower`, `asciiUpper`, `not`, `negate`, `abs`, `floor`, `ceil`, `isNull` | `value` |
| `coalesce` | `value`: nullable expression, `fallback` |
| `add`, `subtract`, `multiply`, `divide`, `remainder`, `min`, `max`, `lt`, `lte`, `gt`, `gte` | `left`, `right`: numbers |
| `equal`, `notEqual` | `left`, `right`: equal types; structural equality |
| `and`, `or` | `left`, `right`: booleans |
| `concat`, `contains`, `startsWith`, `endsWith`, `split` | `left`, `right`: strings |

`map` transforms; `filter` keeps matches; `some`/`every` test membership;
`fold` accumulates from an explicit initial value. Stable sorting evaluates each
key once and preserves input order for equal keys. Arithmetic and comparisons
never silently convert strings or booleans to numbers.

## Portable semantics and work limits

- Numbers use finite binary floating-point values with magnitude at most
  9,007,199,254,740,991. Arithmetic outside this range is a runtime error;
  negative zero normalizes to zero. Division/remainder by zero is an error.
  Remainder follows truncation toward zero in both targets.
- Strings contain Unicode scalar values. Length and slicing count code points,
  including emoji as one code point, not grapheme clusters. Unpaired surrogates
  are rejected. String sorting uses code-point order, not locale collation.
- `asciiLower`/`asciiUpper` change ASCII letters only. `trim` removes only space,
  tab, CR, LF, vertical tab and form feed. Unicode normalization is not implied.
- `if`, `and`, `or`, `coalesce`, `at` fallback, `some` and `every` evaluate lazily.
  Other operands evaluate left-to-right. Fold iteration is left-to-right.
- Indices are nonnegative integers, slice end is exclusive, out-of-range `at`
  uses its fallback, empty `every` is true and empty `some` is false.
- Each public function invocation shares a 100,000-unit deterministic work
  budget through nested calls. Expressions, validation, collection iterations,
  list/string sizes and a common sort-cost bound consume it. Literal containers
  are recursively charged. This is not an OS sandbox or a timing guarantee.
- Bounds: 32 functions, 16 parameters each, 4,096 expression nodes, expression
  depth 48, type depth 12, 128 record fields, 4,096 list items, 16,384 code points
  per string, and one MiB per compiler request/source artifact. Complex valid
  programs can hit the explicit runtime budget before reaching a size bound.

The common rules deliberately avoid relying on Python's boolean-as-integer or
permissive non-finite JSON defaults. Reference: [Python JSON documentation](https://docs.python.org/3.12/library/json.html).
Generated JavaScript syntax checks use Node's documented
[`--check` mode](https://nodejs.org/docs/latest-v24.x/api/cli.html#-c---check).
These references informed compatibility checks; no upstream implementation was copied.

## Grow an archive from useful work

```js
let archive = programs.emptyArchive();
const capture = programs.remember({
  archive,
  program: programs.getRecipe('invoice-totals').program,
  origin: 'invoice-project'
});
archive = capture.archive;
// The caller stores this JSON using its normal authorized persistence boundary.
const chosen = capture.captured.find(row => row.function === 'invoice');
const restored = programs.restore({
  archive,
  structuralSha256: chosen.structuralSha256,
  name: 'anotherInvoice'
});
const next = programs.compile({program: restored, languageId: 'python'});
```

Capture retains every function and its full dependency closure. Reusing or
renaming module, function, parameter, or local binding names does not create a
new structural atom. Constants, field names, types, argument/operation order and
dependency bodies remain part of identity. This is exact structural deduplication,
not an equivalence solver for differently written algorithms. A restored
function can be combined with new functions by editing the explicit program
before compilation.

Archives are immutable return values with digest verification and deterministic
ordering. Repeating the same capture is idempotent; new origin records are
additive. Existing entries are never evicted automatically when a bound is hit.
The current archive accepts at most 128 unique functions and 128 origin records
per entry, subject to the one-MiB data bound. Origins are caller-declared, not
signed provenance. Capture proves type validity and structural identity; it does
not promote a recipe, claim tests passed, or change the bounded Python registry.

## Verification

```sh
node code-programs/selftest.js
node testing/run-all.js
```

The focused check compiles, parses and executes standalone modules in fresh Node
and Python processes, compares them to explicit expected values and seeded
independent oracles, checks input preservation and parity, exercises every
operation, restores an archived dependency closure, and checks malformed/type/
cycle/source-injection/Unicode/limit cases. The installed-package check separately
packs and installs offline, invokes the compiler and CLI, then executes an emitted
program. A passing corpus is bounded evidence, not general program correctness.
