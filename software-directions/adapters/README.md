# Direction Adapter Plane

The adapter plane converts requested verifier categories into concrete local adapter executions and receipts.

```js
const workbench = require('../frontier-direction-workbench.js');
const adapters = require('./adapter-plane.js');

const packet = workbench.prepare({directionId: 'game', level: 'stretch'});
const resolution = adapters.resolve(packet);
const execution = adapters.execute(packet);
const verification = adapters.verifyExecutionReport(execution, {
  expectedPacketSha256: packet.packetSha256,
  expectedReportSha256: execution.reportSha256
});
```

Resolution is not evidence. A verifier ID enters `verifiedVerifierIds` only after its adapter runs and returns `VERIFIER_ADAPTER_PASS`.

Before resolution or execution, the adapter plane recomputes the incoming build packet's `packetSha256` over the complete packet body. Missing, malformed, or stale digests hold before any reference build runs. This preserves identity continuity between the packet that was prepared and the packet named by later receipts; it is not authentication. A caller that constructs different packet bytes and deliberately computes a new valid digest is not thereby trusted, authorized, or proven to be the original producer.

Completed execution reports can be admitted later without rerunning adapters. `verifyExecutionReport()` requires caller-owned pins for both the prepared packet and the exact report, limits an already-materialized input value to 1 MiB of strict finite canonical JSON, verifies the report/build/runtime/verifier digests, binds every adapter to the current registry snapshot, reconstructs the resolution digest, and recomputes result, coverage, evidence, and failure summaries. Unknown top-level fields hold rather than silently extending the v1 contract.

The library verifier starts after a JavaScript value already exists. Its report digest identifies the canonical report body, not an arbitrary raw serialization. It therefore does not by itself prove that a byte stream was bounded, valid UTF-8, or free of duplicate textual object members before `JSON.parse()` collapsed them.

`verify-execution-report-process.js` is the stricter stdin boundary for copied/serialized reports. It stops admission once more than 1 MiB has been observed, decodes with fatal UTF-8 semantics, parses JSON while rejecting duplicate **decoded** member names (including escaped aliases such as `"\\u0072esult"` versus `"result"`), and only then delegates the materialized report to `verifyExecutionReport()`. Its output is a digest-bound `axm.code.direction-adapter-execution-process-verification.v1` receipt. Exit status is 0 only for a verified report and 2 for a bounded HOLD. For an oversized stream, the receipt's `input.byteCount` is the byte count observed at the admission cutoff, not a claim that the rejected remainder was consumed and measured.

```sh
node software-directions/adapters/verify-execution-report-process.js \
  --expected-packet-sha256 "$PACKET_SHA256" \
  --expected-report-sha256 "$REPORT_SHA256" < report.json
```

Process admission proves only the tested byte/text/JSON admission properties plus the existing semantic report verification. It does not authenticate the raw serialization, the report producer, or either caller-owned pin; it does not rerun adapters or turn bounded evidence into universal proof. The process reads stdin but does not inspect a workspace, mutate files, launch child processes, access a network, install anything, promote output, merge, or establish CANON.

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
