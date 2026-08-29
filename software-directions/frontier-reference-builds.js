'use strict';

const crypto = require('crypto');

const AUTHORITY = Object.freeze({workspaceRead: false, workspaceMutation: false, toolExecution: false, network: false, install: false, deployment: false, physicalControl: false, promotion: false, canon: false});

function canon(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canon(value[key])}`).join(',')}}`;
}

function hash(value) {
  return crypto.createHash('sha256').update(canon(value)).digest('hex');
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

function artifact(packet, artifactType, output, checks, limitations = []) {
  const body = {
    schema: 'axm.code.frontier-direction-reference-build.v1',
    version: '1.0.0',
    status: 'TEST',
    result: 'REFERENCE_BUILD_EXECUTED',
    directionId: packet.directionId,
    level: packet.level,
    challengeName: packet.challenge.name,
    packetSha256: packet.packetSha256,
    artifactType,
    output,
    checks,
    evidence: {
      capabilities: packet.challenge.requiredCapabilities,
      verifiers: packet.challenge.verifierEvidence
    },
    limitations,
    truth: {
      boundedReferenceOnly: true,
      productionReady: false,
      realDeploymentPerformed: false,
      hardwareEvidenceClaimed: false,
      securityCertificationClaimed: false,
      humanInterventionDuringRun: false
    },
    authority: AUTHORITY
  };
  return freeze({...body, buildSha256: hash(body)});
}

const HANDLERS = {
  'information-website': packet => {
    const stretch = packet.level === 'stretch';
    const pages = stretch ? ['home', 'about', 'contact'] : ['home'];
    const html = pages.map(page => `<!doctype html><html lang="en"><head><title>${page}</title>${stretch ? '<style>@media(max-width:600px){nav{display:block}}</style>' : ''}</head><body><header><nav aria-label="Primary">${pages.join(' ')}</nav></header><main><h1>${page}</h1></main></body></html>`);
    const checks = stretch
      ? {multiPage: html.length === 3, responsive: html.every(item => item.includes('@media')), accessibleNav: html.every(item => item.includes('aria-label="Primary"') && item.includes('<main>'))}
      : {hasLandmarks: html[0].includes('<header>') && html[0].includes('<main>'), hasTitle: /<title>[^<]+<\/title>/.test(html[0])};
    return artifact(packet, 'html-publication-model', {pages, html}, checks, ['No browser rendering or content review was performed.']);
  },
  'interactive-web-app': packet => {
    if (packet.level === 'seed') {
      const state = {count: 0};
      const submit = value => Number.isInteger(value) && value > 0 ? (state.count += value, {ok: true}) : {ok: false};
      const invalid = submit(-1); const valid = submit(2);
      return artifact(packet, 'web-state-model', {state, invalid, valid}, {validatesInput: !invalid.ok && valid.ok, changesState: state.count === 2});
    }
    const routes = new Set(['/login', '/tasks']);
    const session = {authenticated: false};
    const offline = [];
    const visit = route => route === '/tasks' && !session.authenticated ? '/login' : route;
    offline.push({id: 1, action: 'add-task'});
    return artifact(packet, 'offline-web-application-model', {route: visit('/tasks'), offline, routes: [...routes]}, {routes: routes.has('/tasks'), offlineQueue: offline.length === 1, authBoundary: visit('/tasks') === '/login'});
  },
  'mobile-app': packet => {
    if (packet.level === 'seed') {
      const stored = {count: 1}; const resumed = JSON.parse(JSON.stringify(stored)); resumed.count += 1;
      return artifact(packet, 'mobile-lifecycle-model', {stored, resumed}, {lifecyclePersists: stored.count === 1 && resumed.count === 2, touchUpdates: resumed.count === 2});
    }
    const permissions = new Set(); const queue = [{id: 'record-1'}]; const backgroundBudget = 2;
    const capture = () => permissions.has('sensor') ? 'captured' : 'permission-required';
    const before = capture(); permissions.add('sensor'); const after = capture(); const synced = queue.splice(0);
    return artifact(packet, 'offline-mobile-capture-model', {before, after, synced, backgroundBudget}, {permissionGated: before === 'permission-required' && after === 'captured', backgroundBounded: backgroundBudget === 2, offlineSync: queue.length === 0 && synced.length === 1}, ['No mobile OS or device API was invoked.']);
  },
  'desktop-app': packet => {
    if (packet.level === 'seed') {
      const events = ['open', 'edit']; const saveIntent = {relativePath: 'notes/today.txt', content: 'hello', applied: false};
      return artifact(packet, 'desktop-document-intent-model', {events, saveIntent}, {eventLoopResponds: events.includes('edit'), safeLocalWrite: !saveIntent.relativePath.startsWith('/') && saveIntent.applied === false});
    }
    const stateV1 = {version: 1, text: 'draft'}; const stateV2 = {...stateV1, version: 2, encoding: 'utf8'};
    const task = {steps: 10, completed: 3, cancelled: true}; const update = ['stage', 'verify', 'activate', 'rollback-available'];
    return artifact(packet, 'desktop-lifecycle-model', {stateV2, task, update}, {cancelableTask: task.cancelled && task.completed < task.steps, migratedState: stateV2.version === 2 && stateV2.text === stateV1.text, updatePlan: update.includes('rollback-available')}, ['No installer or native filesystem access was used.']);
  },
  game: packet => {
    const play = actions => actions.reduce((state, action) => ({frame: state.frame + 1, x: state.x + (action === 'right' ? 1 : action === 'left' ? -1 : 0), score: state.score + (action === 'collect' ? 10 : 0)}), {frame: 0, x: 0, score: 0});
    if (packet.level === 'seed') {
      const state = play(['right']);
      return artifact(packet, 'deterministic-game-loop', state, {inputMovesPlayer: state.x === 1, frameAdvances: state.frame === 1});
    }
    const actions = ['right', 'collect', 'left', 'collect']; const first = play(actions); const second = play(actions); const save = {version: 2, state: first};
    return artifact(packet, 'replayable-game-challenge', {first, second, save}, {replayDeterministic: canon(first) === canon(second), saveVersioned: save.version === 2, rulesApply: first.score === 20});
  },
  simulation: packet => {
    const step = state => ({time: state.time + 1, population: state.population + state.growth});
    if (packet.level === 'seed') {
      const state = step({time: 0, population: 10, growth: 2}); const measurement = {time: state.time, population: state.population};
      return artifact(packet, 'time-step-simulation', {state, measurement}, {timeAdvances: state.time === 1, measurementEmitted: measurement.population === 12});
    }
    const run = seed => { let state = {time: 0, value: seed}; for (let i = 0; i < 4; i += 1) state = {time: state.time + 1, value: (state.value * 17 + 3) % 97}; return state; };
    const first = run(11); const second = run(11); const snapshot = JSON.stringify(first); const provenance = {scenario: 'seeded-growth', seed: 11, modelVersion: 1};
    return artifact(packet, 'reproducible-simulation', {first, restored: JSON.parse(snapshot), provenance}, {seedReproducible: canon(first) === canon(second), snapshotRestores: canon(first) === canon(JSON.parse(snapshot)), provenanceBound: provenance.seed === 11 && provenance.modelVersion === 1});
  },
  'xr-spatial': packet => {
    if (packet.level === 'seed') {
      const origin = {x: 10, y: 0, z: -2}; const local = {x: 1, y: 2, z: 3}; const world = {x: origin.x + local.x, y: origin.y + local.y, z: origin.z + local.z}; const actions = {select: 'trigger'};
      return artifact(packet, 'xr-coordinate-conformance-model', {world, actions}, {poseTransforms: world.x === 11 && world.z === 1, actionMapped: actions.select === 'trigger'}, ['No headset or pose sensor was used.']);
    }
    const device = {handTracking: false, controller: true}; const inputMode = device.handTracking ? 'hands' : device.controller ? 'controller' : 'gaze'; const frameMs = 11; const requestedSpeed = 5; const safeSpeed = Math.min(requestedSpeed, 2);
    return artifact(packet, 'xr-comfort-capability-model', {inputMode, frameMs, safeSpeed}, {fallbackNegotiated: inputMode === 'controller', latencyBudgeted: frameMs <= 16.7, comfortGuard: safeSpeed === 2}, ['Latency is a modeled value, not a measured headset result.']);
  },
  'creative-media-editor': packet => {
    if (packet.level === 'seed') {
      const original = Object.freeze({pixels: [1, 2, 3]}); const history = []; const edited = {pixels: original.pixels.map(value => value + 1)}; history.push(original); const undone = history.pop();
      return artifact(packet, 'non-destructive-editor-model', {original, edited, undone}, {nonDestructive: original.pixels[0] === 1 && edited.pixels[0] === 2, undoRestores: canon(undone) === canon(original)});
    }
    const layers = [{id: 'background'}, {id: 'subject'}, {id: 'grade'}]; const chunks = [layers.slice(0, 2), layers.slice(2)]; const provenance = {input: 'asset-a', transforms: ['composite', 'grade'], exporter: 'reference-v1'}; const plugin = {permission: 'transform-only'};
    return artifact(packet, 'layered-media-pipeline-model', {layers, chunks, provenance, plugin}, {layerGraph: layers.length === 3, streamBounded: chunks.every(chunk => chunk.length <= 2), provenanceExports: provenance.transforms.length === 2 && plugin.permission === 'transform-only'}, ['No media codec, GPU, or third-party plugin ran.']);
  },
  'backend-api': packet => {
    if (packet.level === 'seed') {
      const handle = request => typeof request.name === 'string' && request.name.trim() ? {status: 200, body: {message: `Hello ${request.name}`}} : {status: 400, body: {error: 'INVALID_NAME'}};
      const valid = handle({name: 'Mike'}); const invalid = handle({name: ''});
      return artifact(packet, 'api-contract-handler', {valid, invalid}, {contractReturns: valid.status === 200 && valid.body.message === 'Hello Mike', invalidRejected: invalid.status === 400});
    }
    const jobs = new Map(); const submit = request => { if (!jobs.has(request.key)) jobs.set(request.key, {id: jobs.size + 1, timeoutMs: 1000}); return jobs.get(request.key); };
    const first = submit({key: 'same'}); const retry = submit({key: 'same'}); const log = {event: 'job.accepted', jobId: first.id};
    return artifact(packet, 'bounded-idempotent-api-model', {first, retry, log}, {retryIdempotent: first.id === retry.id && jobs.size === 1, timeoutBounded: first.timeoutMs === 1000, observable: log.event === 'job.accepted' && !('secret' in log)});
  },
  'distributed-cloud': packet => {
    if (packet.level === 'seed') {
      const nodes = [{id: 'a', healthy: true}, {id: 'b', healthy: false}]; const applied = new Set(); const apply = key => applied.add(key);
      apply('op-1'); apply('op-1');
      return artifact(packet, 'partial-failure-cluster-model', {nodes, applied: [...applied]}, {partialFailureContained: nodes.some(node => node.healthy) && nodes.some(node => !node.healthy), retryIdempotent: applied.size === 1});
    }
    const replicas = [{id: 'a', version: 1}, {id: 'b', version: 1}, {id: 'c', version: 1}]; const quorum = Math.floor(replicas.length / 2) + 1; replicas.push({id: 'd', version: 1}); for (const replica of replicas) replica.version = 2;
    return artifact(packet, 'rolling-replicated-service-model', {replicas, quorum, events: replicas.map(item => `upgraded:${item.id}`)}, {quorumDefined: quorum === 2, scales: replicas.length === 4, rollingChange: replicas.every(item => item.version === 2)});
  },
  'live-media-streaming': packet => {
    if (packet.level === 'seed') {
      const consent = true; const packets = [{seq: 2}, {seq: 1}, {seq: 3}].sort((a, b) => a.seq - b.seq);
      return artifact(packet, 'consent-jitter-buffer-model', {consent, packets}, {bufferOrders: packets.map(item => item.seq).join(',') === '1,2,3', captureConsent: consent === true}, ['No media device was accessed.']);
    }
    const bandwidthKbps = 700; const quality = bandwidthKbps < 1000 ? 'low' : 'high'; const audioClock = 1000; const videoClock = 1025; const devices = {camera: false, microphone: true}; const mode = devices.camera ? 'audio-video' : 'audio-only';
    return artifact(packet, 'adaptive-stream-session-model', {quality, clockSkewMs: Math.abs(audioClock - videoClock), mode}, {adaptsBandwidth: quality === 'low', syncBounded: Math.abs(audioClock - videoClock) <= 40, deviceFallback: mode === 'audio-only'}, ['Bandwidth and clocks are modeled, not measured.']);
  },
  'collaboration-multiplayer': packet => {
    if (packet.level === 'seed') {
      const authority = 'server'; const operations = [{seq: 2, delta: 2}, {seq: 1, delta: 1}].sort((a, b) => a.seq - b.seq); const value = operations.reduce((sum, item) => sum + item.delta, 0);
      return artifact(packet, 'shared-state-operation-model', {authority, operations, value}, {operationsMerge: value === 3, authorityExplicit: authority === 'server'});
    }
    const changes = [{client: 'a', seq: 4, value: 'red'}, {client: 'b', seq: 5, value: 'blue'}]; const winner = changes.sort((a, b) => b.seq - a.seq)[0]; const serverState = {version: 5, color: winner.value}; const reconnected = {...serverState}; const abusive = 'x'.repeat(129); const accepted = abusive.length <= 128;
    return artifact(packet, 'reconnectable-collaboration-model', {winner, serverState, reconnected, accepted}, {conflictResolved: winner.value === 'blue', reconnectResyncs: canon(reconnected) === canon(serverState), abuseRejected: accepted === false});
  },
  'enterprise-workflow': packet => {
    if (packet.level === 'seed') {
      const advance = role => role === 'approver' ? 'approved' : 'pending';
      return artifact(packet, 'role-workflow-state-machine', {viewer: advance('viewer'), approver: advance('approver')}, {roleDenied: advance('viewer') === 'pending', workflowAdvances: advance('approver') === 'approved'});
    }
    const order = {state: 'pending', balance: 100}; const before = {...order}; const ruleVersion = 2; const audit = [{actor: 'approver', action: 'approve', ruleVersion}]; const chargeSucceeded = false; if (chargeSucceeded) { order.state = 'paid'; order.balance = 0; } else Object.assign(order, before);
    return artifact(packet, 'audited-transaction-workflow', {order, audit, ruleVersion}, {auditComplete: audit[0].actor === 'approver' && audit[0].action === 'approve', ruleVersioned: audit[0].ruleVersion === 2, transactionAtomic: canon(order) === canon(before)});
  },
  'database-storage-search': packet => {
    if (packet.level === 'seed') {
      const records = [{id: 1, name: 'alpha'}, {id: 2, name: 'beta'}]; const schemaValid = records.every(item => Number.isInteger(item.id) && typeof item.name === 'string'); const query = records.find(item => item.id === 2);
      return artifact(packet, 'indexed-record-store-model', {records, query}, {schemaValid, queryReturns: query.name === 'beta'});
    }
    const records = [{id: 1, version: 1}, {id: 2, version: 1}]; const index = new Map(records.map(item => [item.id, item])); const backup = JSON.stringify(records); const working = JSON.parse(JSON.stringify(records)); working[0].version = 2; const failed = true; const rolledBack = failed ? JSON.parse(backup) : working; const restored = JSON.parse(backup);
    return artifact(packet, 'transactional-store-recovery-model', {indexed: index.get(2), rolledBack, restored}, {indexUsed: index.get(2).id === 2, transactionRollsBack: rolledBack[0].version === 1, backupRestores: canon(restored) === canon(records)});
  },
  'batch-data-pipeline': packet => {
    if (packet.level === 'seed') {
      const input = [{id: 1, value: 2}, {id: 2, value: null}]; const good = input.filter(row => Number.isFinite(row.value)).map(row => ({...row, value: row.value * 2})); const quarantine = input.filter(row => !Number.isFinite(row.value)); const repeat = input.filter(row => Number.isFinite(row.value)).map(row => ({...row, value: row.value * 2}));
      return artifact(packet, 'validated-batch-transform', {good, quarantine, lineage: ['input', 'multiply-2']}, {transformDeterministic: canon(good) === canon(repeat), badRecordQuarantined: quarantine.length === 1});
    }
    const partitions = [[1, 2], [3, 4]]; const completed = new Set(['partition-0']); const run = id => completed.add(id); run('partition-1'); run('partition-1'); const checkpoint = {next: 2}; const lineage = partitions.flat().map(id => ({id, source: 'input-v1', transform: 'identity-v1'}));
    return artifact(packet, 'restartable-partition-pipeline', {partitions, completed: [...completed], checkpoint, lineage}, {resumeCheckpoint: checkpoint.next === partitions.length, stageIdempotent: completed.size === 2, lineageComplete: lineage.length === 4 && lineage.every(item => item.source && item.transform)});
  },
  'event-stream-processing': packet => {
    if (packet.level === 'seed') {
      const events = [{time: 2, value: 2}, {time: 1, value: 1}, {time: 11, value: 3}]; const ordered = [...events].sort((a, b) => a.time - b.time); const windows = new Map(); for (const event of ordered) { const key = Math.floor(event.time / 10); windows.set(key, (windows.get(key) || 0) + event.value); }
      return artifact(packet, 'event-time-window-model', {ordered, windows: [...windows]}, {windowAggregates: windows.get(0) === 3 && windows.get(1) === 3, orderTracked: ordered[0].time === 1});
    }
    const watermark = 10; const events = [{time: 8}, {time: 12}, {time: 5}]; const late = events.filter(item => item.time < watermark); const queue = events.slice(0, 2); const checkpoint = JSON.stringify({watermark, processed: 2}); const restored = JSON.parse(checkpoint);
    return artifact(packet, 'restartable-late-event-stream', {late, queue, restored}, {lateEventHandled: late.length === 2, backpressureApplied: queue.length <= 2, checkpointRestores: restored.watermark === watermark && restored.processed === 2});
  },
  'analytics-bi': packet => {
    if (packet.level === 'seed') {
      const rows = [{region: 'n', revenue: 10}, {region: 's', revenue: 20}, {region: 'n', revenue: 5}]; const filtered = rows.filter(row => row.region === 'n'); const measure = filtered.reduce((sum, row) => sum + row.revenue, 0);
      return artifact(packet, 'semantic-measure-model', {filtered, measure}, {measureCorrect: measure === 15, filterApplied: filtered.every(row => row.region === 'n')});
    }
    const rows = [{order: 1, revenue: 10}, {order: 2, revenue: 20}]; const dashboard = {measure: 30, drilldown: rows.map(row => row.order), sourceVersion: 'sales-v3', refreshedAtVersion: 7, uncertainty: 'incomplete-late-orders'};
    return artifact(packet, 'traceable-dashboard-model', dashboard, {drilldownTraces: dashboard.drilldown.length === 2, refreshVersioned: dashboard.refreshedAtVersion === 7 && dashboard.sourceVersion === 'sales-v3', uncertaintyShown: Boolean(dashboard.uncertainty)});
  },
  'ai-ml': packet => {
    if (packet.level === 'seed') {
      const weights = [0.5, 0.5]; const infer = input => input.length === weights.length ? input.reduce((sum, value, index) => sum + value * weights[index], 0) : null; const predictions = [[1, 1], [2, 0]].map(infer); const expected = [1, 1]; const mae = predictions.reduce((sum, value, index) => sum + Math.abs(value - expected[index]), 0) / expected.length;
      return artifact(packet, 'shape-checked-model-evaluation', {predictions, mae}, {shapeChecked: infer([1]) === null && infer([1, 1]) === 1, evaluationRuns: mae === 0});
    }
    const binding = {dataset: 'dataset-sha-1', model: 'model-sha-2'}; const acceleratorAvailable = false; const runtime = acceleratorAvailable ? 'accelerator' : 'cpu-fallback'; const baselineMean = 1; const currentMean = 1.7; const drift = Math.abs(currentMean - baselineMean);
    return artifact(packet, 'versioned-model-observation', {binding, runtime, drift, uncertainty: 0.2}, {versionsBound: binding.dataset.startsWith('dataset-') && binding.model.startsWith('model-'), fallbackWorks: runtime === 'cpu-fallback', driftObserved: drift > 0.5});
  },
  'scientific-hpc': packet => {
    if (packet.level === 'seed') {
      const values = [0.1, 0.2, 0.3, 0.4]; const serial = values.reduce((a, b) => a + b, 0); const chunks = [values.slice(0, 2), values.slice(2)]; const parallel = chunks.map(chunk => chunk.reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0); const tolerance = 1e-12;
      return artifact(packet, 'parallel-numerical-reference', {serial, parallel, tolerance}, {precisionBounded: Math.abs(serial - 1) <= tolerance, parallelMatches: Math.abs(serial - parallel) <= tolerance});
    }
    const sequence = seed => Array.from({length: 4}, (_, index) => (seed * 31 + index * 7) % 101); const first = sequence(9); const second = sequence(9); const checkpoint = {completed: 2, remaining: first.slice(2)}; const provenance = {algorithm: 'reference-sweep-v1', seed: 9, dataset: 'reference-4'};
    return artifact(packet, 'checkpointed-scientific-sweep', {first, checkpoint, provenance}, {checkpointResumes: checkpoint.remaining.length === 2, seedReplays: canon(first) === canon(second), provenanceComplete: Object.values(provenance).every(Boolean)});
  },
  'kernel-driver-runtime': packet => {
    if (packet.level === 'seed') {
      const buffer = {owner: 'driver', bytes: [0, 0, 0, 0]}; const request = uid => uid === 0 ? 'allowed' : 'denied';
      return artifact(packet, 'userspace-driver-safety-model', {buffer, root: request(0), user: request(1000)}, {ownershipSafe: buffer.owner === 'driver', privilegeDenied: request(1000) === 'denied'}, ['This is not kernel code and did not access a device.']);
    }
    const interrupt = {operations: 2, budget: 4, deferred: true}; const abi = {major: 1, fields: ['command', 'length']}; const device = {state: 'ready'}; const fault = true; if (fault) device.state = 'contained-fault';
    return artifact(packet, 'interrupt-abi-containment-model', {interrupt, abi, device}, {interruptBounded: interrupt.operations <= interrupt.budget && interrupt.deferred, abiStable: abi.major === 1 && abi.fields.length === 2, faultContained: device.state === 'contained-fault'}, ['No compiler, kernel, interrupt, or hardware verifier ran.']);
  },
  'embedded-firmware-iot': packet => {
    if (packet.level === 'seed') {
      const memory = new Uint8Array(8); memory[0] = 42; const steps = 3; const deadlineSteps = 4;
      return artifact(packet, 'bounded-firmware-simulation', {memory: [...memory], steps, deadlineSteps}, {memoryBounded: memory.byteLength === 8, deadlineMet: steps <= deadlineSteps}, ['Timing is modeled in steps, not measured on hardware.']);
    }
    const power = {sensorMw: 2, radioMw: 5, budgetMw: 10}; const registers = {read: address => address === 1 ? 7 : 0}; const active = {version: 1}; const candidate = {version: 2, bootOk: false}; const final = candidate.bootOk ? candidate : active;
    return artifact(packet, 'firmware-update-safety-model', {power, registerValue: registers.read(1), final}, {powerBudgeted: power.sensorMw + power.radioMw <= power.budgetMw, registerIsolated: registers.read(1) === 7 && registers.read(99) === 0, rollbackSafe: final.version === 1}, ['No board, radio, register, or real-time measurement was used.']);
  },
  'robotics-industrial-control': packet => {
    if (packet.level === 'seed') {
      const command = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0; const normal = command(3); const failed = command(Number.NaN);
      return artifact(packet, 'fail-safe-control-simulation', {normal, failed}, {controlBounded: normal === 1, failSafeStops: failed === 0}, ['No physical actuator was controlled.']);
    }
    const sensors = [{value: 10, time: 100}, {value: 12, time: 102}]; const fused = sensors.reduce((sum, item) => sum + item.value, 0) / sensors.length; const synchronized = Math.max(...sensors.map(item => item.time)) - Math.min(...sensors.map(item => item.time)) <= 5; const trace = {simulationId: 'sim-1', controllerVersion: 'control-v1', hardwareRunId: null};
    return artifact(packet, 'fused-control-trace-simulation', {fused, synchronized, trace}, {sensorFused: fused === 11, timeSynced: synchronized, tracePreserved: Boolean(trace.simulationId && trace.controllerVersion) && trace.hardwareRunId === null}, ['Hardware trace is explicitly absent rather than inferred.']);
  },
  'networking-telecom': packet => {
    const parse = bytes => bytes.length >= 2 && bytes[0] === bytes.length - 1 ? {ok: true, type: bytes[1]} : {ok: false};
    if (packet.level === 'seed') {
      const valid = parse([1, 7]); const malformedInputs = [[], [5, 1], [0, 1]]; const rejected = malformedInputs.every(input => !parse(input).ok);
      return artifact(packet, 'bounded-packet-protocol-model', {valid, rejected}, {packetParsed: valid.ok && valid.type === 7, malformedRejected: rejected});
    }
    const retryPolicy = {attempts: 2, timeoutMs: 50}; const pending = [1, 2, 3, 4].slice(0, 3); const route = destination => destination.startsWith('10.') ? 'lan' : 'wan'; const decoder = version => version === 1 ? 'supported' : 'rejected';
    return artifact(packet, 'congestion-route-compatibility-model', {retryPolicy, pending, route: route('10.0.0.1'), wire: decoder(1)}, {timeoutRetries: retryPolicy.attempts === 2 && retryPolicy.timeoutMs === 50, congestionBackpressure: pending.length === 3, wireCompatible: decoder(1) === 'supported' && decoder(2) === 'rejected'});
  },
  'security-identity-cryptography': packet => {
    if (packet.level === 'seed') {
      const authorize = role => role === 'admin'; const diagnostic = ({token, ...safe}) => safe;
      return artifact(packet, 'least-privilege-session-model', {viewerAllowed: authorize('viewer'), diagnostic: diagnostic({event: 'login', token: 'secret'})}, {unauthorizedDenied: authorize('viewer') === false, secretRedacted: !('token' in diagnostic({event: 'login', token: 'secret'}))});
    }
    const identity = {id: 'user-1', keyVersion: 1}; identity.keyVersion += 1; const audit = [{event: 'identity.rotated', subject: identity.id, keyVersion: identity.keyVersion}]; const primitive = {provider: 'platform-crypto', inventedHere: false}; const attackModel = ['credential-replay', 'privilege-escalation'];
    return artifact(packet, 'identity-lifecycle-boundary-model', {identity, audit, primitive, attackModel}, {identityRotated: identity.keyVersion === 2, auditRecorded: audit[0].event === 'identity.rotated', primitiveExternal: primitive.provider === 'platform-crypto' && !primitive.inventedHere}, ['No cryptographic implementation or security certification is claimed.']);
  },
  'smart-contract-ledger': packet => {
    if (packet.level === 'seed') {
      const ledger = {a: 10, b: 0, nonces: new Set()}; const transfer = (from, to, amount, nonce) => { if (ledger.nonces.has(nonce) || ledger[from] < amount) return false; ledger.nonces.add(nonce); ledger[from] -= amount; ledger[to] += amount; return true; };
      const before = ledger.a + ledger.b; const first = transfer('a', 'b', 3, 'n1'); const replay = transfer('a', 'b', 3, 'n1');
      return artifact(packet, 'ledger-invariant-model', {ledger: {a: ledger.a, b: ledger.b}, first, replay}, {transferInvariant: ledger.a + ledger.b === before && first, replayRejected: replay === false});
    }
    const call = {locked: true, cost: 17, budget: 20}; const governance = {requiredApprovals: 2, approvals: ['alice', 'bob'], activated: false}; if (governance.approvals.length >= governance.requiredApprovals) governance.activated = true;
    return artifact(packet, 'governed-contract-upgrade-model', {call, governance}, {reentrancyHeld: call.locked, costBounded: call.cost <= call.budget, upgradeGoverned: governance.activated && governance.approvals.length === 2}, ['No chain, compiler, formal proof, or economic security review was used.']);
  },
  'cli-automation': packet => {
    if (packet.level === 'seed') {
      const args = ['rename', '--from', 'a.txt', '--to', 'b.txt', '--dry-run']; const parsed = {command: args[0], from: args[2], to: args[4], dryRun: args.includes('--dry-run')}; const intent = {from: parsed.from, to: parsed.to, applied: !parsed.dryRun};
      return artifact(packet, 'dry-run-command-model', {parsed, intent}, {argsParsed: parsed.command === 'rename' && parsed.from === 'a.txt', dryRunNoWrite: parsed.dryRun && !intent.applied});
    }
    const normalize = value => value.replace(/\\/g, '/'); const state = new Set(); const apply = item => state.add(normalize(item)); apply('folder\\file.txt'); apply('folder/file.txt'); const diagnostic = {code: 'ALREADY_PRESENT', path: normalize('folder\\file.txt'), severity: 'info'};
    return artifact(packet, 'portable-idempotent-command-model', {state: [...state], diagnostic}, {idempotentRepeat: state.size === 1, pathsPortable: [...state][0] === 'folder/file.txt', diagnosticStructured: diagnostic.code === 'ALREADY_PRESENT' && diagnostic.severity === 'info'}, ['No process or filesystem operation was executed.']);
  },
  'compiler-interpreter-runtime': packet => {
    const tokenize = source => source.match(/\d+|[+*()]/g) || [];
    if (packet.level === 'seed') {
      const source = '1+2'; const tokens = tokenize(source); const invalid = '1+'; const diagnostic = {offset: invalid.length, code: 'EXPECTED_EXPRESSION'};
      return artifact(packet, 'expression-parser-model', {tokens, diagnostic}, {tokensParsed: tokens.join(',') === '1,+,2', diagnosticLocated: diagnostic.offset === 2 && diagnostic.code === 'EXPECTED_EXPRESSION'});
    }
    const scope = new Map([['x', 2]]); const ir = [{op: 'load', name: 'x'}, {op: 'const', value: 1}, {op: 'add'}]; const sourceValue = scope.get('x') + 1; const irValue = ir[0].name === 'x' ? scope.get('x') + ir[1].value : null; const execution = {enabled: false, boundary: 'adapter-required'};
    return artifact(packet, 'scoped-intermediate-representation', {scope: [...scope], ir, sourceValue, irValue, execution}, {scopeResolved: scope.get('x') === 2, transformPreserves: sourceValue === irValue, executionSeparated: !execution.enabled && execution.boundary === 'adapter-required'});
  },
  'library-sdk-plugin': packet => {
    if (packet.level === 'seed') {
      const api = Object.freeze({version: '1.0.0', greet: name => `Hello ${name}`}); const example = api.greet('Mike');
      return artifact(packet, 'public-library-reference', {version: api.version, example}, {apiStable: api.version === '1.0.0', exampleWorks: example === 'Hello Mike'});
    }
    const hostApi = Object.freeze({version: '1.1.0', emit: value => ({emitted: value})}); const pluginInput = Object.freeze({value: 2}); const pluginOutput = hostApi.emit(pluginInput.value * 2); const migration = '1.0 to 1.1: emit remains compatible; new fields are optional.';
    return artifact(packet, 'versioned-plugin-host-model', {hostVersion: hostApi.version, pluginOutput, migration}, {versionCompatible: hostApi.version.startsWith('1.'), pluginSandboxed: pluginOutput.emitted === 4 && !('host' in pluginInput), migrationDocumented: migration.includes('1.0 to 1.1')}, ['No package manager or untrusted plugin code ran.']);
  },
  'build-deployment-infrastructure': packet => {
    if (packet.level === 'seed') {
      const graph = {compile: [], bundle: ['compile']}; const order = ['compile', 'bundle']; const build = () => hash({order, inputs: ['source-v1']}); const first = build(); const second = build(); const provenance = {inputs: ['source-v1'], builder: 'reference-v1'};
      return artifact(packet, 'reproducible-build-graph', {graph, order, first, provenance}, {graphOrdered: order.indexOf('compile') < order.indexOf('bundle'), buildReproducible: first === second});
    }
    const desired = {service: 'v2', replicas: 2}; const apply = state => ({...state, ...desired}); const first = apply({}); const second = apply(first); const artifactBody = {service: 'v2'}; const runtimeSecret = {injected: true, value: 'not-serialized'}; const rollback = {target: 'v1', steps: ['drain', 'activate-v1', 'verify']};
    return artifact(packet, 'reversible-deployment-model', {first, second, artifactBody, secretInjected: runtimeSecret.injected, rollback}, {applyIdempotent: canon(first) === canon(second), secretNotBaked: !('secret' in artifactBody) && runtimeSecret.injected, rollbackDefined: rollback.target === 'v1' && rollback.steps.includes('verify')}, ['No CI, cloud, credential, or deployment action ran.']);
  }
};

function run(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw Error('FRONTIER_BUILD_PACKET_REQUIRED');
  const handler = HANDLERS[packet.directionId];
  if (!handler) throw Error(`FRONTIER_BUILD_HANDLER_MISSING:${packet.directionId}`);
  return handler(packet);
}

module.exports = {AUTHORITY, HANDLERS, run};
