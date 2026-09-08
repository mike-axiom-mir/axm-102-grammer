'use strict';

const fs = require('fs');
const path = require('path');
const registry = require('./placement-registry.js');

const HEX64 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_JOURNAL_BYTES = 1024 * 1024;
const PHASES = Object.freeze([
  'PREPARED',
  'SOURCE_TEMP_WRITTEN',
  'SOURCE_BACKED_UP',
  'SOURCE_INSTALLED',
  'VERIFICATION_TEMP_WRITTEN',
  'VERIFICATION_BACKED_UP',
  'VERIFICATION_INSTALLED',
  'INSTALLED_PARSED',
  'VERIFIED',
  'CLEANUP_COMPLETE',
  'COMMITTED',
  'ROLLED_BACK',
  'RECOVERY_COMMITTED',
  'RECOVERY_ROLLED_BACK'
]);
const FINAL_COMMITTED = new Set(['COMMITTED', 'RECOVERY_COMMITTED']);
const FINAL_ROLLED_BACK = new Set(['ROLLED_BACK', 'RECOVERY_ROLLED_BACK']);
const COMMIT_RECOVERY = new Set(['VERIFIED', 'CLEANUP_COMPLETE']);

const NEXT = Object.freeze({
  PREPARED: ['SOURCE_TEMP_WRITTEN', 'ROLLED_BACK', 'RECOVERY_ROLLED_BACK'],
  SOURCE_TEMP_WRITTEN: ['SOURCE_BACKED_UP', 'SOURCE_INSTALLED', 'ROLLED_BACK', 'RECOVERY_ROLLED_BACK'],
  SOURCE_BACKED_UP: ['SOURCE_INSTALLED', 'ROLLED_BACK', 'RECOVERY_ROLLED_BACK'],
  SOURCE_INSTALLED: ['VERIFICATION_TEMP_WRITTEN', 'ROLLED_BACK', 'RECOVERY_ROLLED_BACK'],
  VERIFICATION_TEMP_WRITTEN: ['VERIFICATION_BACKED_UP', 'VERIFICATION_INSTALLED', 'ROLLED_BACK', 'RECOVERY_ROLLED_BACK'],
  VERIFICATION_BACKED_UP: ['VERIFICATION_INSTALLED', 'ROLLED_BACK', 'RECOVERY_ROLLED_BACK'],
  VERIFICATION_INSTALLED: ['INSTALLED_PARSED', 'ROLLED_BACK', 'RECOVERY_ROLLED_BACK'],
  INSTALLED_PARSED: ['VERIFIED', 'ROLLED_BACK', 'RECOVERY_ROLLED_BACK'],
  VERIFIED: ['CLEANUP_COMPLETE', 'RECOVERY_COMMITTED'],
  CLEANUP_COMPLETE: ['COMMITTED', 'RECOVERY_COMMITTED'],
  COMMITTED: [],
  ROLLED_BACK: [],
  RECOVERY_COMMITTED: [],
  RECOVERY_ROLLED_BACK: []
});

function sha256(bytes) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function inside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function realDirectory(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw Error(`${code}_MUST_BE_ABSOLUTE`);
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) throw Error(`${code}_TOO_BROAD`);
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(resolved) !== resolved) throw Error(`${code}_INVALID`);
  return resolved;
}

function roots(workspaceRoot, journalRoot) {
  if (process.platform !== 'linux') throw Error('EDIT_DURABILITY_PLATFORM_UNSUPPORTED');
  const workspace = realDirectory(workspaceRoot, 'EDIT_WORKSPACE_ROOT');
  const journal = realDirectory(journalRoot, 'EDIT_JOURNAL_ROOT');
  if (inside(journal, workspace) || inside(workspace, journal)) throw Error('EDIT_JOURNAL_ROOT_MUST_BE_SEPARATE');
  return {workspace, journal, workspaceIdentitySha256: registry.hash(workspace), journalIdentitySha256: registry.hash(journal)};
}

function syncDirectory(directory) {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function safeId(value) {
  if (!SAFE_ID.test(value || '')) throw Error('EDIT_JOURNAL_AUTHORIZATION_ID_INVALID');
  return value;
}

function pathsFor(resolved, authorizationId) {
  const id = safeId(authorizationId);
  const workspaceToken = resolved.workspaceIdentitySha256.slice(0, 32);
  return {
    journalPath: path.join(resolved.journal, `${id}.journal.jsonl`),
    leasePath: path.join(resolved.journal, `workspace-${workspaceToken}.lease.json`)
  };
}

function writeNewFile(target, bytes, mode) {
  let fd = null;
  try {
    fd = fs.openSync(target, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, mode);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
  syncDirectory(path.dirname(target));
}

function leaseBody(resolved, authorization) {
  return {
    schema: 'axm.code.workspace-edit-lease.v1', version: '1.0.0', status: 'TEST',
    authorizationId: authorization.authorizationId,
    authorizationSha256: authorization.authorizationSha256,
    workspaceRootIdentitySha256: resolved.workspaceIdentitySha256,
    journalRootIdentitySha256: resolved.journalIdentitySha256,
    createdAt: new Date().toISOString(),
    processId: process.pid,
    truth: {leaseIsIdentityProof: false, automaticStaleLeaseBreaking: false}
  };
}

function acquireLease(resolved, paths, authorization) {
  const body = leaseBody(resolved, authorization);
  const lease = {...body, leaseSha256: registry.hash(body)};
  try {
    writeNewFile(paths.leasePath, Buffer.from(`${JSON.stringify(lease)}\n`, 'utf8'), 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') throw Error('EDIT_WORKSPACE_LEASE_HELD');
    throw error;
  }
  return lease;
}

function validateLease(paths, prepared) {
  if (!fs.existsSync(paths.leasePath)) throw Error('EDIT_RECOVERY_LEASE_MISSING');
  const stat = fs.lstatSync(paths.leasePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw Error('EDIT_RECOVERY_LEASE_INVALID');
  let lease;
  try { lease = JSON.parse(fs.readFileSync(paths.leasePath, 'utf8')); } catch (error) { throw Error('EDIT_RECOVERY_LEASE_INVALID'); }
  const body = {...lease}; delete body.leaseSha256;
  if (!HEX64.test(lease.leaseSha256 || '') || registry.hash(body) !== lease.leaseSha256 || lease.schema !== 'axm.code.workspace-edit-lease.v1' || lease.authorizationId !== prepared.authorizationId || lease.authorizationSha256 !== prepared.authorizationSha256 || lease.workspaceRootIdentitySha256 !== prepared.workspaceRootIdentitySha256 || lease.journalRootIdentitySha256 !== prepared.journalRootIdentitySha256) throw Error('EDIT_RECOVERY_LEASE_BINDING_INVALID');
  return lease;
}

function releaseLease(handle) {
  if (!fs.existsSync(handle.paths.leasePath)) return false;
  const stat = fs.lstatSync(handle.paths.leasePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('EDIT_LEASE_RELEASE_TYPE_INVALID');
  if (handle.lease) {
    let observed;
    try { observed = JSON.parse(fs.readFileSync(handle.paths.leasePath, 'utf8')); } catch (error) { throw Error('EDIT_LEASE_RELEASE_BINDING_INVALID'); }
    if (observed.leaseSha256 !== handle.lease.leaseSha256 || registry.hash(observed) !== registry.hash(handle.lease)) throw Error('EDIT_LEASE_RELEASE_BINDING_INVALID');
  }
  fs.unlinkSync(handle.paths.leasePath);
  syncDirectory(handle.resolved.journal);
  return true;
}

function recordBody(handle, phase, details) {
  return {
    schema: 'axm.code.workspace-edit-journal-record.v1', version: '1.0.0', status: 'TEST',
    transactionId: handle.authorizationId,
    sequence: handle.records.length,
    previousRecordSha256: handle.records.length ? handle.records.at(-1).recordSha256 : null,
    phase,
    recordedAt: new Date().toISOString(),
    details
  };
}

function maybeCrash(phase) {
  if (process.env.AXM_EDIT_ENABLE_TEST_CRASH === '1' && process.env.AXM_EDIT_TEST_CRASH_AFTER === phase) process.kill(process.pid, 'SIGKILL');
}

function append(handle, phase, details = {}) {
  const previous = handle.records.length ? handle.records.at(-1).phase : null;
  if (!PHASES.includes(phase) || (previous === null ? phase !== 'PREPARED' : !NEXT[previous].includes(phase))) throw Error(`EDIT_JOURNAL_TRANSITION_INVALID:${previous || 'NONE'}:${phase}`);
  const body = recordBody(handle, phase, details);
  const record = {...body, recordSha256: registry.hash(body)};
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  if (handle.byteCount + bytes.length > MAX_JOURNAL_BYTES) throw Error('EDIT_JOURNAL_SIZE_LIMIT');
  if (handle.records.length === 0) writeNewFile(handle.paths.journalPath, bytes, 0o600);
  else {
    const fd = fs.openSync(handle.paths.journalPath, fs.constants.O_APPEND | fs.constants.O_WRONLY);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  handle.records.push(record);
  handle.byteCount += bytes.length;
  maybeCrash(phase);
  return record;
}

function descriptor(resolved, state) {
  const tempRelativePath = path.relative(resolved.workspace, state.tempPath).split(path.sep).join('/');
  const backupRelativePath = path.relative(resolved.workspace, state.backupPath).split(path.sep).join('/');
  return {
    lane: state.lane,
    targetPath: state.relativePath,
    tempRelativePath,
    backupRelativePath,
    existedBefore: state.beforeSha256 !== null,
    beforeSha256: state.beforeSha256,
    candidateSha256: state.candidate.contentSha256,
    mode: state.mode
  };
}

function prepare({workspaceRoot, journalRoot, authorization, placementPlanSha256, states}) {
  const resolved = roots(workspaceRoot, journalRoot);
  if (authorization.journalRootIdentitySha256 !== resolved.journalIdentitySha256 || authorization.workspaceRootIdentitySha256 !== resolved.workspaceIdentitySha256 || authorization.durableRecoveryRequired !== true) throw Error('EDIT_AUTHORIZATION_DURABILITY_BINDING_INVALID');
  const paths = pathsFor(resolved, authorization.authorizationId);
  if (fs.existsSync(paths.journalPath)) {
    const prior = readJournalFile(resolved, paths, authorization.authorizationId);
    const priorAuthorization = prior.records[0]?.details?.authorizationSha256;
    if (priorAuthorization === authorization.authorizationSha256) throw Error('EDIT_AUTHORIZATION_REPLAYED_DURABLE');
    throw Error('EDIT_AUTHORIZATION_ID_REUSED');
  }
  const handle = {resolved, paths, authorizationId: authorization.authorizationId, records: [], byteCount: 0, lease: null};
  handle.lease = acquireLease(resolved, paths, authorization);
  try {
    append(handle, 'PREPARED', {
      authorizationId: authorization.authorizationId,
      authorizationSha256: authorization.authorizationSha256,
      placementPlanSha256,
      workspaceRootIdentitySha256: resolved.workspaceIdentitySha256,
      journalRootIdentitySha256: resolved.journalIdentitySha256,
      rollbackRequired: true,
      targets: states.map(state => descriptor(resolved, state)),
      truth: {digestIsSignerOrConsentProof: false, candidateBytesStoredInJournal: false}
    });
  } catch (error) {
    if (!fs.existsSync(paths.journalPath)) releaseLease(handle);
    throw error;
  }
  return handle;
}

function readJournalFile(resolved, paths, authorizationId) {
  if (!fs.existsSync(paths.journalPath)) throw Error('EDIT_RECOVERY_JOURNAL_MISSING');
  const stat = fs.lstatSync(paths.journalPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > MAX_JOURNAL_BYTES) throw Error('EDIT_RECOVERY_JOURNAL_INVALID');
  const bytes = fs.readFileSync(paths.journalPath);
  const finalNewline = bytes.lastIndexOf(0x0a);
  const completeByteCount = finalNewline + 1;
  const trailingPartialRecordIgnored = completeByteCount < bytes.length;
  const pieces = bytes.subarray(0, completeByteCount).toString('utf8').split('\n');
  pieces.pop();
  const records = [];
  for (const line of pieces) {
    if (!line) throw Error('EDIT_RECOVERY_JOURNAL_EMPTY_RECORD');
    let record;
    try { record = JSON.parse(line); } catch (error) { throw Error('EDIT_RECOVERY_JOURNAL_JSON_INVALID'); }
    const body = {...record}; delete body.recordSha256;
    const previous = records.length ? records.at(-1) : null;
    if (record.schema !== 'axm.code.workspace-edit-journal-record.v1' || record.version !== '1.0.0' || record.status !== 'TEST' || record.transactionId !== authorizationId || record.sequence !== records.length || record.previousRecordSha256 !== (previous?.recordSha256 || null) || !HEX64.test(record.recordSha256 || '') || registry.hash(body) !== record.recordSha256 || !PHASES.includes(record.phase) || (previous ? !NEXT[previous.phase].includes(record.phase) : record.phase !== 'PREPARED')) throw Error('EDIT_RECOVERY_JOURNAL_CHAIN_INVALID');
    records.push(record);
  }
  if (!records.length) throw Error('EDIT_RECOVERY_JOURNAL_NO_COMPLETE_RECORD');
  return {resolved, paths, authorizationId, records, byteCount: stat.size, completeByteCount, trailingPartialRecordIgnored};
}

function discardTrailingPartialRecord(handle) {
  if (!handle.trailingPartialRecordIgnored) return false;
  const fd = fs.openSync(handle.paths.journalPath, fs.constants.O_WRONLY);
  try {
    fs.ftruncateSync(fd, handle.completeByteCount);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  syncDirectory(handle.resolved.journal);
  handle.byteCount = handle.completeByteCount;
  handle.trailingPartialRecordIgnored = false;
  return true;
}

function read({workspaceRoot, journalRoot, authorizationId}) {
  const resolved = roots(workspaceRoot, journalRoot);
  const paths = pathsFor(resolved, authorizationId);
  const handle = readJournalFile(resolved, paths, authorizationId);
  const prepared = handle.records[0].details;
  if (prepared.authorizationId !== authorizationId || !HEX64.test(prepared.authorizationSha256 || '') || !HEX64.test(prepared.placementPlanSha256 || '') || prepared.workspaceRootIdentitySha256 !== resolved.workspaceIdentitySha256 || prepared.journalRootIdentitySha256 !== resolved.journalIdentitySha256 || prepared.rollbackRequired !== true || !Array.isArray(prepared.targets) || prepared.targets.length !== 2) throw Error('EDIT_RECOVERY_PREPARED_BINDING_INVALID');
  if (prepared.targets[0]?.lane !== 'source' || prepared.targets[1]?.lane !== 'verification' || new Set(prepared.targets.map(target => target?.targetPath)).size !== 2 || prepared.targets.some(target => {
    if (typeof target !== 'object' || typeof target.targetPath !== 'string' || target.targetPath.length === 0 || target.targetPath.includes('\\') || target.targetPath.includes('\0') || target.targetPath.startsWith('/') || /^[A-Za-z]:/.test(target.targetPath) || path.posix.normalize(target.targetPath) !== target.targetPath || target.targetPath.split('/').some(item => !item || item === '.' || item === '..') || typeof target.tempRelativePath !== 'string' || typeof target.backupRelativePath !== 'string' || typeof target.existedBefore !== 'boolean' || (target.existedBefore ? !HEX64.test(target.beforeSha256 || '') : target.beforeSha256 !== null) || !HEX64.test(target.candidateSha256 || '') || !Number.isInteger(target.mode) || target.mode < 0 || target.mode > 0o777) return true;
    const directory = path.posix.dirname(target.targetPath);
    const prefix = directory === '.' ? '' : `${directory}/`;
    const basename = path.posix.basename(target.targetPath);
    const extension = path.posix.extname(basename) || '.txt';
    const token = authorizationId.slice(0, 32);
    return target.tempRelativePath !== `${prefix}.axm-${token}-${basename}.tmp${extension}` || target.backupRelativePath !== `${prefix}.axm-${token}-${basename}.bak${extension}`;
  })) throw Error('EDIT_RECOVERY_TARGET_DESCRIPTOR_INVALID');
  handle.prepared = prepared;
  return handle;
}

function absoluteArtifact(resolved, relative, targetPath, code) {
  if (typeof relative !== 'string' || relative.includes('\\') || relative.includes('\0') || relative.startsWith('/') || relative.split('/').some(item => !item || item === '.' || item === '..')) throw Error(`${code}_PATH_INVALID`);
  const absolute = path.resolve(resolved.workspace, ...relative.split('/'));
  const target = path.resolve(resolved.workspace, ...targetPath.split('/'));
  if (!inside(absolute, resolved.workspace) || path.dirname(absolute) !== path.dirname(target) || !path.basename(absolute).startsWith('.axm-')) throw Error(`${code}_PATH_BINDING_INVALID`);
  return absolute;
}

function fileState(target, code) {
  if (!fs.existsSync(target)) return {kind: 'absent', sha256: null, mode: null};
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error(`${code}_TYPE_INVALID`);
  return {kind: 'file', sha256: sha256(fs.readFileSync(target)), mode: stat.mode & 0o777};
}

function observedTarget(handle, target) {
  const targetPath = path.resolve(handle.resolved.workspace, ...target.targetPath.split('/'));
  if (!inside(targetPath, handle.resolved.workspace)) throw Error('EDIT_RECOVERY_TARGET_ESCAPE');
  const parent = path.dirname(targetPath);
  const parentStat = fs.lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || fs.realpathSync(parent) !== parent || !inside(parent, handle.resolved.workspace)) throw Error('EDIT_RECOVERY_TARGET_PARENT_INVALID');
  const tempPath = absoluteArtifact(handle.resolved, target.tempRelativePath, target.targetPath, 'EDIT_RECOVERY_TEMP');
  const backupPath = absoluteArtifact(handle.resolved, target.backupRelativePath, target.targetPath, 'EDIT_RECOVERY_BACKUP');
  return {...target, targetAbsolute: targetPath, tempAbsolute: tempPath, backupAbsolute: backupPath, observed: {target: fileState(targetPath, 'EDIT_RECOVERY_TARGET'), temp: fileState(tempPath, 'EDIT_RECOVERY_TEMP'), backup: fileState(backupPath, 'EDIT_RECOVERY_BACKUP')}};
}

function knownState(item, intent) {
  const target = item.observed.target.sha256;
  const temp = item.observed.temp.sha256;
  const backup = item.observed.backup.sha256;
  const absent = value => value === null;
  if (![null, item.beforeSha256, item.candidateSha256].includes(target) || ![null, item.candidateSha256].includes(temp) || ![null, item.beforeSha256].includes(backup)) return false;
  if ((target !== null && item.observed.target.mode !== item.mode) || (temp !== null && item.observed.temp.mode !== item.mode) || (backup !== null && item.observed.backup.mode !== item.mode)) return false;
  if (item.existedBefore) {
    if (intent === 'commit') return target === item.candidateSha256 && absent(temp) && (absent(backup) || backup === item.beforeSha256);
    if (target === item.beforeSha256 && absent(backup)) return true;
    if (absent(target) && backup === item.beforeSha256) return true;
    if (target === item.candidateSha256 && backup === item.beforeSha256) return true;
    return false;
  }
  if (!absent(backup)) return false;
  if (intent === 'commit') return target === item.candidateSha256 && absent(temp);
  if (target === item.candidateSha256 && absent(temp)) return true;
  if (absent(target) && (absent(temp) || temp === item.candidateSha256)) return true;
  return false;
}

function unlinkKnown(target) {
  if (fs.existsSync(target)) { fs.unlinkSync(target); syncDirectory(path.dirname(target)); }
}

function restore(item) {
  if (item.observed.target.sha256 === item.candidateSha256) unlinkKnown(item.targetAbsolute);
  if (!fs.existsSync(item.targetAbsolute) && fs.existsSync(item.backupAbsolute)) {
    fs.renameSync(item.backupAbsolute, item.targetAbsolute);
    syncDirectory(path.dirname(item.targetAbsolute));
  }
  unlinkKnown(item.tempAbsolute);
}

function finalize(item) {
  unlinkKnown(item.backupAbsolute);
  unlinkKnown(item.tempAbsolute);
}

function verifyFinal(items, intent) {
  return items.map(item => {
    const target = fileState(item.targetAbsolute, 'EDIT_RECOVERY_FINAL_TARGET');
    const temp = fileState(item.tempAbsolute, 'EDIT_RECOVERY_FINAL_TEMP');
    const backup = fileState(item.backupAbsolute, 'EDIT_RECOVERY_FINAL_BACKUP');
    const expectedSha256 = intent === 'commit' ? item.candidateSha256 : item.beforeSha256;
    const targetMatches = expectedSha256 === null ? target.kind === 'absent' : target.sha256 === expectedSha256 && target.mode === item.mode;
    return {lane: item.lane, targetPath: item.targetPath, expectedSha256, observedSha256: target.sha256, targetMatches, artifactsAbsent: temp.kind === 'absent' && backup.kind === 'absent'};
  });
}

function recoveryReceipt(body) {
  return Object.freeze({...body, recoverySha256: registry.hash(body)});
}

function recoveryHeld(errorCode, details = {}) {
  return recoveryReceipt({
    schema: 'axm.code.workspace-edit-recovery-receipt.v1', version: '1.0.0', status: 'TEST',
    result: 'EDIT_RECOVERY_HELD', errorCode, ...details,
    truth: {workspaceMutationAttemptedByRecovery: false, ambiguousStateGuessed: false, digestIsSignerOrConsentProof: false}
  });
}

function recover({workspaceRoot = null, journalRoot = null, authorizationId = null} = {}) {
  let mutationStarted = false; let handle = null;
  try {
    handle = read({workspaceRoot, journalRoot, authorizationId});
    const latest = handle.records.at(-1).phase;
    const intent = FINAL_COMMITTED.has(latest) || COMMIT_RECOVERY.has(latest) ? 'commit' : 'rollback';
    const items = handle.prepared.targets.map(target => observedTarget(handle, target));
    if (!items.every(item => knownState(item, intent))) return recoveryHeld('EDIT_RECOVERY_WORKSPACE_STATE_AMBIGUOUS', {authorizationId, journalLatestPhase: latest, observedTargets: items.map(item => ({lane: item.lane, targetPath: item.targetPath, observed: item.observed}))});
    if (FINAL_COMMITTED.has(latest) || FINAL_ROLLED_BACK.has(latest)) {
      const final = verifyFinal(items, intent);
      if (!final.every(item => item.targetMatches && item.artifactsAbsent)) return recoveryHeld('EDIT_RECOVERY_FINAL_STATE_MISMATCH', {authorizationId, journalLatestPhase: latest, targets: final});
      let leaseReleased = false;
      const hadTrailingPartialRecord = handle.trailingPartialRecordIgnored;
      if (fs.existsSync(handle.paths.leasePath)) {
        validateLease(handle.paths, handle.prepared);
        discardTrailingPartialRecord(handle);
        leaseReleased = releaseLease(handle);
      } else if (hadTrailingPartialRecord) {
        return recoveryHeld('EDIT_RECOVERY_TRAILING_PARTIAL_WITHOUT_LEASE', {authorizationId, journalLatestPhase: latest});
      }
      return recoveryReceipt({schema: 'axm.code.workspace-edit-recovery-receipt.v1', version: '1.0.0', status: 'TEST', result: intent === 'commit' ? 'EDIT_RECOVERY_ALREADY_COMMITTED' : 'EDIT_RECOVERY_ALREADY_ROLLED_BACK', errorCode: null, authorizationId, authorizationSha256: handle.prepared.authorizationSha256, journalLatestPhase: latest, recoveryAction: 'none', targets: final, leaseReleased, trailingPartialRecordIgnored: hadTrailingPartialRecord, truth: {workspaceMutationAttemptedByRecovery: false, journalTailRepairAttempted: hadTrailingPartialRecord, finalStateVerified: true, ambiguousStateGuessed: false, crashRecoveryIsUniversalPowerLossProof: false}});
    }
    validateLease(handle.paths, handle.prepared);
    const hadTrailingPartialRecord = handle.trailingPartialRecordIgnored;
    discardTrailingPartialRecord(handle);
    mutationStarted = true;
    for (const item of [...items].reverse()) {
      if (intent === 'commit') finalize(item); else restore(item);
    }
    const final = verifyFinal(items, intent);
    if (!final.every(item => item.targetMatches && item.artifactsAbsent)) throw Error('EDIT_RECOVERY_POSTCONDITION_FAILED');
    append(handle, intent === 'commit' ? 'RECOVERY_COMMITTED' : 'RECOVERY_ROLLED_BACK', {targets: final, trailingPartialRecordIgnored: hadTrailingPartialRecord});
    const leaseReleased = releaseLease(handle);
    return recoveryReceipt({schema: 'axm.code.workspace-edit-recovery-receipt.v1', version: '1.0.0', status: 'TEST', result: intent === 'commit' ? 'EDIT_RECOVERY_COMMITTED' : 'EDIT_RECOVERY_ROLLED_BACK', errorCode: null, authorizationId, authorizationSha256: handle.prepared.authorizationSha256, journalLatestPhase: latest, recoveryAction: intent, targets: final, leaseReleased, trailingPartialRecordIgnored: hadTrailingPartialRecord, truth: {workspaceMutationAttemptedByRecovery: true, journalTailRepairAttempted: hadTrailingPartialRecord, finalStateVerified: true, ambiguousStateGuessed: false, crashRecoveryIsUniversalPowerLossProof: false}});
  } catch (error) {
    const message = String(error?.message || 'EDIT_RECOVERY_FAILED');
    const errorCode = message.startsWith('EDIT_') ? message : (typeof error?.code === 'string' ? `EDIT_RECOVERY_FILESYSTEM_${error.code}` : 'EDIT_RECOVERY_FAILED');
    if (!mutationStarted) return recoveryHeld(errorCode, {authorizationId});
    return recoveryReceipt({schema: 'axm.code.workspace-edit-recovery-receipt.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_RECOVERY_FAILED', errorCode, authorizationId, truth: {workspaceMutationAttemptedByRecovery: true, finalStateVerified: false, ambiguousStateGuessed: false, leaseRetainedForRetry: true, crashRecoveryIsUniversalPowerLossProof: false}});
  }
}

module.exports = {MAX_JOURNAL_BYTES, PHASES, roots, prepare, append, releaseLease, recover, syncDirectory};
