'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const registry = require('./placement-registry.js');

const TTL_MS = 5 * 60 * 1000;
const PROBE_TIMEOUT_MS = 3000;
const MAX_PROBE_OUTPUT_BYTES = 64 * 1024;
const TOOL_IDS = Object.freeze(['node', 'python3', 'prlimit', 'bubblewrap']);
const AUTHORITY = Object.freeze({environmentRead: true, fixedToolExecution: true, workspaceRead: false, workspaceMutation: false, candidateExecution: false, network: false, install: false, deployment: false, promotion: false, canon: false});

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function executable(name) {
  if (name === 'node') return process.execPath;
  for (const directory of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.resolve(directory, name);
    try {
      const resolved = fs.realpathSync(candidate);
      const stat = fs.statSync(resolved);
      if (stat.isFile()) { fs.accessSync(resolved, fs.constants.X_OK); return resolved; }
    } catch (error) { /* keep searching fixed PATH entries */ }
  }
  return null;
}

function boundedSpawn(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', timeout: PROBE_TIMEOUT_MS, maxBuffer: MAX_PROBE_OUTPUT_BYTES,
    env: {PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1'}
  });
  const stdout = String(result.stdout || ''); const stderr = String(result.stderr || '');
  return {status: result.status, signal: result.signal || null, timedOut: result.error?.code === 'ETIMEDOUT', stdoutSha256: sha256(stdout), stderrSha256: sha256(stderr), combined: `${stdout}\n${stderr}`.trim()};
}

function unavailable(id, command) { return {id, command, installed: false, usable: false, executablePath: null, executablePathSha256: null, version: null, errorCode: 'TOOL_NOT_INSTALLED'}; }

function tool(id, command, probe) {
  const executablePath = executable(command);
  if (!executablePath) return unavailable(id, command);
  const outcome = probe(executablePath);
  return {id, command, installed: true, usable: outcome.usable, executablePath, executablePathSha256: registry.hash(executablePath), version: outcome.version || null, errorCode: outcome.errorCode || null, probe: outcome.probe || null};
}

function versionLine(value) { return String(value || '').split(/\r?\n/).map(line => line.trim()).find(Boolean) || null; }
function probeReceipt(probe) { return {status: probe.status, signal: probe.signal, timedOut: probe.timedOut, stdoutSha256: probe.stdoutSha256, stderrSha256: probe.stderrSha256}; }

function inspect() {
  const node = tool('node', 'node', () => ({usable: true, version: process.version, probe: {status: 0, signal: null, timedOut: false, stdoutSha256: sha256(process.version), stderrSha256: sha256('')}}));
  const python = tool('python3', 'python3', executablePath => {
    const probe = boundedSpawn(executablePath, ['--version']);
    return {usable: probe.status === 0 && !probe.timedOut, version: versionLine(probe.combined), errorCode: probe.status === 0 ? null : 'PYTHON_VERSION_PROBE_FAILED', probe: probeReceipt(probe)};
  });
  const prlimit = tool('prlimit', 'prlimit', executablePath => {
    const probe = boundedSpawn(executablePath, ['--cpu=1', '--as=268435456', '--nofile=64', '--', '/bin/true']);
    return {usable: probe.status === 0 && !probe.timedOut, version: null, errorCode: probe.status === 0 ? null : 'RESOURCE_LIMIT_PROBE_FAILED', probe: probeReceipt(probe)};
  });
  const bubblewrap = tool('bubblewrap', 'bwrap', executablePath => {
    if (process.platform !== 'linux') return {usable: false, errorCode: 'BUBBLEWRAP_PLATFORM_UNSUPPORTED'};
    const probe = boundedSpawn(executablePath, ['--die-with-parent', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', '--unshare-net', '--new-session', '--', '/bin/true']);
    let errorCode = null;
    if (probe.status !== 0) errorCode = /operation not permitted|permission denied/i.test(probe.combined) ? 'NAMESPACE_PERMISSION_DENIED' : (probe.timedOut ? 'BUBBLEWRAP_PROBE_TIMEOUT' : 'BUBBLEWRAP_PROBE_FAILED');
    return {usable: probe.status === 0 && !probe.timedOut, version: null, errorCode, probe: probeReceipt(probe)};
  });
  const tools = [node, python, prlimit, bubblewrap];
  const issuedMs = Date.now();
  const body = {
    schema: 'axm.code.toolchain-environment-observation.v1', version: '1.0.0', status: 'TEST', result: 'TOOLCHAIN_ENVIRONMENT_OBSERVED', errorCode: null,
    issuedAt: new Date(issuedMs).toISOString(), expiresAt: new Date(issuedMs + TTL_MS).toISOString(), ttlMs: TTL_MS,
    platform: {os: process.platform, architecture: process.arch}, tools,
    candidateExecutionIsolation: {required: true, providerId: 'bubblewrap', installed: bubblewrap.installed, usable: bubblewrap.usable, errorCode: bubblewrap.errorCode, hostEnforcedFilesystemIsolation: bubblewrap.usable, hostEnforcedNetworkIsolation: bubblewrap.usable},
    resourceLimits: {providerId: 'prlimit', usable: prlimit.usable, cpuSeconds: 2, addressSpaceBytes: 268435456, openFileLimit: 64, wallTimeoutMs: 3000},
    environmentSeams: [
      ...(python.usable ? [] : ['PYTHON3_UNAVAILABLE']),
      ...(prlimit.usable ? [] : ['HARD_RESOURCE_LIMITS_UNAVAILABLE']),
      ...(bubblewrap.usable ? [] : [`HOST_SANDBOX_UNAVAILABLE:${bubblewrap.errorCode}`])
    ],
    truth: {candidateCodeExecuted: false, workspaceRead: false, workspaceMutation: false, installedToolAssumedUsable: false, failedSandboxProbePromoted: false, rawProbeOutputRetained: false, observationIsExecutionAuthority: false},
    authority: AUTHORITY
  };
  return freeze({...body, environmentObservationSha256: registry.hash(body)});
}

function validate(observation) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation) || !/^[a-f0-9]{64}$/.test(observation.environmentObservationSha256 || '')) throw Error('TOOLCHAIN_ENVIRONMENT_OBSERVATION_INVALID');
  const body = {...observation}; delete body.environmentObservationSha256;
  if (registry.hash(body) !== observation.environmentObservationSha256) throw Error('TOOLCHAIN_ENVIRONMENT_OBSERVATION_DIGEST_MISMATCH');
  const issuedAt = Date.parse(observation.issuedAt); const expiresAt = Date.parse(observation.expiresAt);
  if (observation.schema !== 'axm.code.toolchain-environment-observation.v1' || observation.version !== '1.0.0' || observation.status !== 'TEST' || observation.result !== 'TOOLCHAIN_ENVIRONMENT_OBSERVED' || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt || observation.ttlMs !== expiresAt - issuedAt || observation.ttlMs > TTL_MS) throw Error('TOOLCHAIN_ENVIRONMENT_OBSERVATION_CONTRACT_INVALID');
  if (Date.now() > expiresAt) throw Error('TOOLCHAIN_ENVIRONMENT_OBSERVATION_STALE');
  if (!Array.isArray(observation.tools) || registry.canon(observation.tools.map(item => item?.id)) !== registry.canon(TOOL_IDS) || observation.truth?.candidateCodeExecuted !== false || observation.truth?.observationIsExecutionAuthority !== false || registry.canon(observation.authority) !== registry.canon(AUTHORITY)) throw Error('TOOLCHAIN_ENVIRONMENT_OBSERVATION_BINDING_INVALID');
  for (const value of observation.tools) {
    if (typeof value.command !== 'string' || typeof value.installed !== 'boolean' || typeof value.usable !== 'boolean' || (value.usable && !value.installed)) throw Error('TOOLCHAIN_ENVIRONMENT_TOOL_CONTRACT_INVALID');
    const currentPath = executable(value.command);
    if (value.installed !== Boolean(currentPath)) throw Error('TOOLCHAIN_ENVIRONMENT_TOOL_INSTALL_STATE_DRIFT');
    if (value.installed) {
      if (!path.isAbsolute(value.executablePath || '') || value.executablePath !== currentPath || value.executablePathSha256 !== registry.hash(value.executablePath)) throw Error('TOOLCHAIN_ENVIRONMENT_TOOL_PATH_BINDING_INVALID');
    } else if (value.executablePath !== null || value.executablePathSha256 !== null || value.usable !== false || value.errorCode !== 'TOOL_NOT_INSTALLED') throw Error('TOOLCHAIN_ENVIRONMENT_TOOL_ABSENCE_INVALID');
  }
  const prlimit = observation.tools.find(value => value.id === 'prlimit'); const bubblewrap = observation.tools.find(value => value.id === 'bubblewrap');
  if (observation.resourceLimits?.providerId !== 'prlimit' || observation.resourceLimits?.usable !== prlimit.usable || observation.resourceLimits?.cpuSeconds !== 2 || observation.resourceLimits?.addressSpaceBytes !== 268435456 || observation.resourceLimits?.openFileLimit !== 64 || observation.resourceLimits?.wallTimeoutMs !== 3000) throw Error('TOOLCHAIN_ENVIRONMENT_RESOURCE_LIMIT_BINDING_INVALID');
  if (observation.candidateExecutionIsolation?.providerId !== 'bubblewrap' || observation.candidateExecutionIsolation?.installed !== bubblewrap.installed || observation.candidateExecutionIsolation?.usable !== bubblewrap.usable || observation.candidateExecutionIsolation?.errorCode !== bubblewrap.errorCode || observation.candidateExecutionIsolation?.hostEnforcedFilesystemIsolation !== bubblewrap.usable || observation.candidateExecutionIsolation?.hostEnforcedNetworkIsolation !== bubblewrap.usable) throw Error('TOOLCHAIN_ENVIRONMENT_ISOLATION_BINDING_INVALID');
  const expectedSeams = [...(observation.tools.find(value => value.id === 'python3').usable ? [] : ['PYTHON3_UNAVAILABLE']), ...(prlimit.usable ? [] : ['HARD_RESOURCE_LIMITS_UNAVAILABLE']), ...(bubblewrap.usable ? [] : [`HOST_SANDBOX_UNAVAILABLE:${bubblewrap.errorCode}`])];
  if (registry.canon(observation.environmentSeams) !== registry.canon(expectedSeams)) throw Error('TOOLCHAIN_ENVIRONMENT_SEAM_BINDING_INVALID');
  return observation;
}

function get(observation, id) { validate(observation); return observation.tools.find(toolValue => toolValue.id === id) || null; }

module.exports = {AUTHORITY, TTL_MS, PROBE_TIMEOUT_MS, MAX_PROBE_OUTPUT_BYTES, TOOL_IDS, inspect, validate, get};
