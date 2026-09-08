'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const plane = require('./placement-plane.js');
const registry = require('./placement-registry.js');

const AUTHORITY = Object.freeze({workspaceRead: true, workspaceMutation: false, toolExecution: false, network: false, install: false, deployment: false, promotion: false, canon: false});
const TTL_MS = 5 * 60 * 1000;
const LIMITS = Object.freeze({maxEntries: 10000, maxFiles: 4096, maxFileBytes: 4 * 1024 * 1024, maxTotalBytes: 32 * 1024 * 1024, maxDepth: 32});
const MODULE_KEYS = Object.freeze(['id', 'path', 'role', 'status', 'mutable', 'accepts', 'owns', 'directionIds', 'exports', 'verifies']);

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

function held(errorCode, details = {}) {
  const body = {
    schema: 'axm.code.project-map-observation.v1',
    version: '1.0.0',
    status: 'TEST',
    result: 'PROJECT_MAP_OBSERVATION_HELD',
    errorCode,
    ...details,
    truth: {workspaceMutated: false, sourceMeaningInferredFromBytes: false, observationIsMutationAuthority: false},
    authority: AUTHORITY
  };
  return freeze({...body, observationSha256: registry.hash(body)});
}

function safeRelative(value, code, {root = false} = {}) {
  if (root && value === '.') return value;
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[A-Za-z]:/.test(value)) throw Error(`${code}_INVALID`);
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..') || path.posix.normalize(value) !== value) throw Error(`${code}_TRAVERSAL_OR_EMPTY`);
  return value;
}

function inside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveInside(root, relative, code) {
  const normalized = safeRelative(relative, code, {root: true});
  const resolved = normalized === '.' ? root : path.resolve(root, ...normalized.split('/'));
  if (!inside(resolved, root)) throw Error(`${code}_ESCAPES_WORKSPACE`);
  return resolved;
}

function limitsFor(requested) {
  if (requested == null) return {...LIMITS};
  if (!requested || typeof requested !== 'object' || Array.isArray(requested)) throw Error('PROJECT_MAP_LIMITS_INVALID');
  const result = {};
  for (const [key, ceiling] of Object.entries(LIMITS)) {
    const value = requested[key] == null ? ceiling : requested[key];
    if (!Number.isSafeInteger(value) || value <= 0) throw Error(`PROJECT_MAP_LIMIT_INVALID:${key}`);
    if (value > ceiling) throw Error(`PROJECT_MAP_LIMIT_ESCALATION_FORBIDDEN:${key}`);
    result[key] = value;
  }
  return result;
}

function moduleDeclaration(module) {
  const result = {};
  for (const key of MODULE_KEYS) result[key] = module?.[key];
  return result;
}

function provisionalProjectMap(declaration) {
  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration) || declaration.schema !== 'axm.code.project-map-declaration.v1' || declaration.version !== '1.0.0') throw Error('PROJECT_MAP_DECLARATION_HEADER_INVALID');
  if (!Array.isArray(declaration.modules) || !Array.isArray(declaration.protectedPaths)) throw Error('PROJECT_MAP_DECLARATION_BODY_INVALID');
  const modules = declaration.modules.map(module => ({...moduleDeclaration(module), contentSha256: '0'.repeat(64)}));
  const projectMap = {schema: 'axm.code.project-map.v1', projectId: declaration.projectId, languageId: declaration.languageId, conventions: declaration.conventions, modules, protectedPaths: [...declaration.protectedPaths]};
  plane.validateProjectMap(projectMap);
  return projectMap;
}

function pathMatcher(conventions, lane) {
  const extension = conventions.fileExtension.toLowerCase();
  if (lane === 'test') return relative => relative.toLowerCase().endsWith(extension);
  const binding = conventions.languageBinding;
  const signal = binding.signal.toLowerCase();
  if (binding.kind === 'extension') return relative => relative.toLowerCase().endsWith(signal);
  if (binding.kind === 'basename') return relative => path.posix.basename(relative).toLowerCase() === signal;
  return relative => relative.toLowerCase().endsWith(extension) && `/${relative.toLowerCase()}`.includes(signal);
}

function statDirectory(directory, code) {
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink()) throw Error(`${code}_SYMLINK_FORBIDDEN`);
  if (!stat.isDirectory()) throw Error(`${code}_NOT_DIRECTORY`);
}

function scanTree({workspaceRoot, scanRoot, skipRoot, matcher, limits, state}) {
  statDirectory(scanRoot, 'PROJECT_SCAN_ROOT');
  function walk(directory, depth) {
    if (depth > limits.maxDepth) throw Error('PROJECT_MAP_MAX_DEPTH_EXCEEDED');
    const names = fs.readdirSync(directory).sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      const target = path.join(directory, name);
      if (skipRoot && target === skipRoot) continue;
      state.entryCount += 1;
      if (state.entryCount > limits.maxEntries) throw Error('PROJECT_MAP_MAX_ENTRIES_EXCEEDED');
      const stat = fs.lstatSync(target);
      const relative = path.relative(workspaceRoot, target).split(path.sep).join('/');
      if (stat.isSymbolicLink()) throw Error(`PROJECT_MAP_SYMLINK_FORBIDDEN:${relative}`);
      if (stat.isDirectory()) {
        walk(target, depth + 1);
      } else if (stat.isFile() && matcher(relative)) {
        state.fileCount += 1;
        state.byteCount += stat.size;
        if (state.fileCount > limits.maxFiles) throw Error('PROJECT_MAP_MAX_FILES_EXCEEDED');
        if (stat.size > limits.maxFileBytes) throw Error(`PROJECT_MAP_FILE_TOO_LARGE:${relative}`);
        if (state.byteCount > limits.maxTotalBytes) throw Error('PROJECT_MAP_TOTAL_BYTES_EXCEEDED');
        if (state.files.has(relative)) throw Error(`PROJECT_MAP_SCAN_DUPLICATE:${relative}`);
        state.files.set(relative, {absolute: target, stat});
      }
    }
  }
  walk(scanRoot, 0);
}

function stableDigest(file, workspaceRoot) {
  const before = fs.lstatSync(file.absolute);
  if (!before.isFile() || before.isSymbolicLink()) throw Error(`PROJECT_MAP_FILE_TYPE_DRIFT:${path.relative(workspaceRoot, file.absolute)}`);
  const real = fs.realpathSync(file.absolute);
  if (!inside(real, workspaceRoot)) throw Error('PROJECT_MAP_REALPATH_ESCAPE');
  const bytes = fs.readFileSync(file.absolute);
  const after = fs.lstatSync(file.absolute);
  if (!after.isFile() || after.isSymbolicLink() || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino || bytes.length !== after.size) throw Error(`PROJECT_MAP_FILE_DRIFT_DURING_READ:${path.relative(workspaceRoot, file.absolute)}`);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function inspect({workspaceRoot = null, declaration = null, limits = null} = {}) {
  try {
    if (typeof workspaceRoot !== 'string' || !path.isAbsolute(workspaceRoot)) throw Error('PROJECT_WORKSPACE_ROOT_MUST_BE_ABSOLUTE');
    const resolvedRoot = path.resolve(workspaceRoot);
    if (resolvedRoot === path.parse(resolvedRoot).root) throw Error('PROJECT_WORKSPACE_ROOT_TOO_BROAD');
    statDirectory(resolvedRoot, 'PROJECT_WORKSPACE_ROOT');
    if (path.relative(resolvedRoot, fs.realpathSync(resolvedRoot)) !== '') throw Error('PROJECT_WORKSPACE_ROOT_SYMLINK_OR_ALIAS');
    const boundedLimits = limitsFor(limits);
    const provisional = provisionalProjectMap(declaration);
    const sourceRoot = resolveInside(resolvedRoot, provisional.conventions.sourceRoot, 'PROJECT_SOURCE_ROOT');
    const testRoot = resolveInside(resolvedRoot, provisional.conventions.testRoot, 'PROJECT_TEST_ROOT');
    const state = {entryCount: 0, fileCount: 0, byteCount: 0, files: new Map()};
    scanTree({workspaceRoot: resolvedRoot, scanRoot: sourceRoot, skipRoot: inside(testRoot, sourceRoot) && testRoot !== sourceRoot ? testRoot : null, matcher: pathMatcher(provisional.conventions, 'source'), limits: boundedLimits, state});
    scanTree({workspaceRoot: resolvedRoot, scanRoot: testRoot, skipRoot: null, matcher: pathMatcher(provisional.conventions, 'test'), limits: boundedLimits, state});

    const declaredPaths = new Set(provisional.modules.map(module => module.path));
    const discoveredPaths = [...state.files.keys()].sort();
    const unmappedPaths = discoveredPaths.filter(item => !declaredPaths.has(item));
    if (unmappedPaths.length) return held('PROJECT_MAP_UNMAPPED_LANGUAGE_FILES', {unmappedPaths: unmappedPaths.slice(0, 32), unmappedPathCount: unmappedPaths.length});
    const missingPaths = [...declaredPaths].filter(item => !state.files.has(item)).sort();
    if (missingPaths.length) return held('PROJECT_MAP_DECLARED_MODULE_NOT_OBSERVED', {missingPaths: missingPaths.slice(0, 32), missingPathCount: missingPaths.length});

    const modules = provisional.modules.map(module => ({...module, contentSha256: stableDigest(state.files.get(module.path), resolvedRoot)})).sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
    const projectMap = freeze({...provisional, modules, protectedPaths: [...provisional.protectedPaths].sort()});
    plane.validateProjectMap(projectMap);
    const observedAtMs = Date.now();
    const observedAt = new Date(observedAtMs).toISOString();
    const expiresAt = new Date(observedAtMs + TTL_MS).toISOString();
    const body = {
      schema: 'axm.code.project-map-observation.v1',
      version: '1.0.0',
      status: 'TEST',
      result: 'PROJECT_MAP_OBSERVED_READ_ONLY',
      projectId: projectMap.projectId,
      declarationSha256: registry.hash(declaration),
      projectMap,
      projectMapSha256: registry.hash(projectMap),
      workspaceRootIdentitySha256: registry.hash(resolvedRoot),
      observedAt,
      ttlMs: TTL_MS,
      expiresAt,
      volatilityClass: 'active-project-files',
      limits: boundedLimits,
      coverage: {
        sourceRoot: provisional.conventions.sourceRoot,
        testRoot: provisional.conventions.testRoot,
        languageBinding: {...provisional.conventions.languageBinding},
        visitedEntryCount: state.entryCount,
        observedFileCount: state.fileCount,
        observedByteCount: state.byteCount,
        discoveredPathsSha256: registry.hash(discoveredPaths),
        allMatchingFilesMapped: true,
        symlinksFollowed: false
      },
      truth: {
        workspaceObserved: true,
        workspaceMutated: false,
        fileBytesDigestBound: true,
        semanticRolesCallerDeclared: true,
        semanticRolesInferredFromBytes: false,
        mutabilityCallerDeclared: true,
        digestIsSignerProof: false,
        freshnessIsCorrectness: false,
        receiptIsMutationAuthority: false,
        preMutationRecheckStillRequired: true
      },
      authority: AUTHORITY
    };
    return freeze({...body, observationSha256: registry.hash(body)});
  } catch (error) {
    const message = String(error?.message || '');
    if (message.startsWith('PROJECT_')) return held(message);
    if (typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)) return held(`PROJECT_MAP_FILESYSTEM_${error.code}`);
    return held('PROJECT_MAP_OBSERVATION_FAILED');
  }
}

function freshness(observation, {now = Date.now()} = {}) {
  const observedAt = Date.parse(observation?.observedAt);
  const expiresAt = Date.parse(observation?.expiresAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(expiresAt)) return freeze({status: 'UNTIMED', ageMs: null, ttlMs: null, nextRecheckDue: null});
  if (now < observedAt) return freeze({status: 'UNTIMED', ageMs: null, ttlMs: expiresAt - observedAt, nextRecheckDue: observation.observedAt});
  const ageMs = now - observedAt;
  return freeze({status: now <= expiresAt ? 'LIVE' : 'STALE', ageMs, ttlMs: expiresAt - observedAt, nextRecheckDue: observation.expiresAt});
}

module.exports = {AUTHORITY, LIMITS, TTL_MS, inspect, freshness};
