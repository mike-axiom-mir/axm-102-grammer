'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const registry = require('./placement-registry.js');
const baseJournal = require('./workspace-edit-journal.js');

const HEX64 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_JOURNAL_BYTES = 1024 * 1024;
const FINAL_COMMITTED = new Set(['GRAPH_COMMITTED', 'GRAPH_RECOVERY_COMMITTED']);
const FINAL_ROLLED_BACK = new Set(['GRAPH_ROLLED_BACK', 'GRAPH_RECOVERY_ROLLED_BACK']);
const COMMIT_RECOVERY = new Set(['GRAPH_VERIFIED', 'GRAPH_CLEANUP_COMPLETE']);
const TERMINAL = new Set([...FINAL_COMMITTED, ...FINAL_ROLLED_BACK]);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function inside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function safeId(value, code = 'EDIT_GRAPH_JOURNAL_AUTHORIZATION_ID_INVALID') {
  if (!SAFE_ID.test(value || '')) throw Error(code);
  return value;
}

function pathsFor(resolved, authorizationId) {
  const id = safeId(authorizationId);
  return {
    journalPath: path.join(resolved.journal, `${id}.journal.jsonl`),
    leasePath: path.join(resolved.journal, `workspace-${resolved.workspaceIdentitySha256.slice(0, 32)}.lease.json`)
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
  baseJournal.syncDirectory(path.dirname(target));
}

function leaseBody(resolved, authorization) {
  return {
    schema: 'axm.code.workspace-edit-lease.v1', version: '1.0.0', status: 'TEST',
    authorizationId: authorization.authorizationId,
    authorizationSha256: authorization.authorizationSha256,
    workspaceRootIdentitySha256: resolved.workspaceIdentitySha256,
    journalRootIdentitySha256: resolved.journalIdentitySha256,
    createdAt: new Date().toISOString(), processId: process.pid,
    truth: {leaseIsIdentityProof: false, automaticStaleLeaseBreaking: false, graphTransaction: true}
  };
}

function acquireLease(resolved, paths, authorization) {
  const body = leaseBody(resolved, authorization);
  const lease = {...body, leaseSha256: registry.hash(body)};
  try { writeNewFile(paths.leasePath, Buffer.from(`${JSON.stringify(lease)}\n`, 'utf8'), 0o600); }
  catch (error) { if (error?.code === 'EEXIST') throw Error('EDIT_GRAPH_WORKSPACE_LEASE_HELD'); throw error; }
  return lease;
}

function validateLease(paths, prepared) {
  if (!fs.existsSync(paths.leasePath)) throw Error('EDIT_GRAPH_RECOVERY_LEASE_MISSING');
  const stat = fs.lstatSync(paths.leasePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw Error('EDIT_GRAPH_RECOVERY_LEASE_INVALID');
  let lease;
  try { lease = JSON.parse(fs.readFileSync(paths.leasePath, 'utf8')); } catch (error) { throw Error('EDIT_GRAPH_RECOVERY_LEASE_INVALID'); }
  const body = {...lease}; delete body.leaseSha256;
  if (!HEX64.test(lease.leaseSha256 || '') || registry.hash(body) !== lease.leaseSha256 || lease.schema !== 'axm.code.workspace-edit-lease.v1' || lease.truth?.graphTransaction !== true || lease.authorizationId !== prepared.authorizationId || lease.authorizationSha256 !== prepared.authorizationSha256 || lease.workspaceRootIdentitySha256 !== prepared.workspaceRootIdentitySha256 || lease.journalRootIdentitySha256 !== prepared.journalRootIdentitySha256) throw Error('EDIT_GRAPH_RECOVERY_LEASE_BINDING_INVALID');
  return lease;
}

function releaseLease(handle) {
  if (!fs.existsSync(handle.paths.leasePath)) return false;
  const stat = fs.lstatSync(handle.paths.leasePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('EDIT_GRAPH_LEASE_RELEASE_TYPE_INVALID');
  if (handle.lease) {
    let observed;
    try { observed = JSON.parse(fs.readFileSync(handle.paths.leasePath, 'utf8')); } catch (error) { throw Error('EDIT_GRAPH_LEASE_RELEASE_BINDING_INVALID'); }
    if (registry.hash(observed) !== registry.hash(handle.lease)) throw Error('EDIT_GRAPH_LEASE_RELEASE_BINDING_INVALID');
  }
  fs.unlinkSync(handle.paths.leasePath);
  baseJournal.syncDirectory(handle.resolved.journal);
  return true;
}

function descriptor(resolved, state) {
  return {
    nodeId: state.nodeId, entryId: state.entryId, lane: state.lane,
    targetPath: state.relativePath,
    tempRelativePath: path.relative(resolved.workspace, state.tempPath).split(path.sep).join('/'),
    backupRelativePath: path.relative(resolved.workspace, state.backupPath).split(path.sep).join('/'),
    existedBefore: state.beforeSha256 !== null,
    beforeSha256: state.beforeSha256,
    candidateSha256: state.candidate.contentSha256,
    mode: state.mode
  };
}

function expectedSequence(prepared) {
  const sequence = [];
  for (const target of prepared.targets) {
    sequence.push({phase: 'GRAPH_TARGET_TEMP_WRITTEN', nodeId: target.nodeId});
    if (target.existedBefore) sequence.push({phase: 'GRAPH_TARGET_BACKED_UP', nodeId: target.nodeId});
    sequence.push({phase: 'GRAPH_TARGET_INSTALLED', nodeId: target.nodeId});
  }
  sequence.push({phase: 'GRAPH_INSTALLED_PARSED'}, {phase: 'GRAPH_VERIFIED'}, {phase: 'GRAPH_CLEANUP_COMPLETE'}, {phase: 'GRAPH_COMMITTED'});
  return sequence;
}

function eventMatches(expected, record) {
  return expected.phase === record.phase && (expected.nodeId === undefined || expected.nodeId === record.details?.nodeId);
}

function validateNext(records, record) {
  if (!records.length) return record.phase === 'GRAPH_PREPARED';
  const prepared = records[0].details;
  const latest = records.at(-1).phase;
  if (TERMINAL.has(latest)) return false;
  if (record.phase === 'GRAPH_ROLLED_BACK' || record.phase === 'GRAPH_RECOVERY_ROLLED_BACK') return latest !== 'GRAPH_VERIFIED' && latest !== 'GRAPH_CLEANUP_COMPLETE';
  if (record.phase === 'GRAPH_RECOVERY_COMMITTED') return latest === 'GRAPH_VERIFIED' || latest === 'GRAPH_CLEANUP_COMPLETE';
  const expected = expectedSequence(prepared)[records.length - 1];
  return Boolean(expected) && eventMatches(expected, record);
}

function crashToken(phase, details) {
  return details?.nodeId ? `${phase}:${details.nodeId}` : phase;
}

function maybeCrash(phase, details) {
  if (process.env.AXM_EDIT_ENABLE_TEST_CRASH === '1' && process.env.AXM_EDIT_GRAPH_TEST_CRASH_AFTER === crashToken(phase, details)) process.kill(process.pid, 'SIGKILL');
}

function append(handle, phase, details = {}) {
  const preview = {phase, details};
  if (!validateNext(handle.records, preview)) throw Error(`EDIT_GRAPH_JOURNAL_TRANSITION_INVALID:${handle.records.at(-1)?.phase || 'NONE'}:${phase}`);
  const body = {
    schema: 'axm.code.workspace-edit-graph-journal-record.v1', version: '1.0.0', status: 'TEST',
    transactionId: handle.authorizationId, sequence: handle.records.length,
    previousRecordSha256: handle.records.length ? handle.records.at(-1).recordSha256 : null,
    phase, recordedAt: new Date().toISOString(), details
  };
  const record = {...body, recordSha256: registry.hash(body)};
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  if (handle.byteCount + bytes.length > MAX_JOURNAL_BYTES) throw Error('EDIT_GRAPH_JOURNAL_SIZE_LIMIT');
  if (!handle.records.length) writeNewFile(handle.paths.journalPath, bytes, 0o600);
  else {
    const fd = fs.openSync(handle.paths.journalPath, fs.constants.O_APPEND | fs.constants.O_WRONLY);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  handle.records.push(record); handle.byteCount += bytes.length;
  maybeCrash(phase, details);
  return record;
}

function prepare({workspaceRoot, journalRoot, authorization, editGraphSha256, states}) {
  const resolved = baseJournal.roots(workspaceRoot, journalRoot);
  if (authorization.journalRootIdentitySha256 !== resolved.journalIdentitySha256 || authorization.workspaceRootIdentitySha256 !== resolved.workspaceIdentitySha256 || authorization.durableRecoveryRequired !== true) throw Error('EDIT_GRAPH_AUTHORIZATION_DURABILITY_BINDING_INVALID');
  const paths = pathsFor(resolved, authorization.authorizationId);
  if (fs.existsSync(paths.journalPath)) throw Error('EDIT_GRAPH_AUTHORIZATION_REPLAYED_DURABLE');
  const handle = {resolved, paths, authorizationId: authorization.authorizationId, records: [], byteCount: 0, lease: null};
  handle.lease = acquireLease(resolved, paths, authorization);
  try {
    append(handle, 'GRAPH_PREPARED', {
      authorizationId: authorization.authorizationId, authorizationSha256: authorization.authorizationSha256, editGraphSha256,
      workspaceRootIdentitySha256: resolved.workspaceIdentitySha256, journalRootIdentitySha256: resolved.journalIdentitySha256,
      rollbackRequired: true, targets: states.map(state => descriptor(resolved, state)),
      truth: {digestIsSignerOrConsentProof: false, candidateBytesStoredInJournal: false, graphTargetOrderIsInstallOrder: true}
    });
  } catch (error) {
    if (!fs.existsSync(paths.journalPath)) releaseLease(handle);
    throw error;
  }
  return handle;
}

function readJournalFile(resolved, paths, authorizationId) {
  if (!fs.existsSync(paths.journalPath)) throw Error('EDIT_GRAPH_RECOVERY_JOURNAL_MISSING');
  const stat = fs.lstatSync(paths.journalPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > MAX_JOURNAL_BYTES) throw Error('EDIT_GRAPH_RECOVERY_JOURNAL_INVALID');
  const bytes = fs.readFileSync(paths.journalPath);
  const finalNewline = bytes.lastIndexOf(0x0a);
  const completeByteCount = finalNewline + 1;
  const trailingPartialRecordIgnored = completeByteCount < bytes.length;
  const lines = bytes.subarray(0, completeByteCount).toString('utf8').split('\n'); lines.pop();
  const records = [];
  for (const line of lines) {
    if (!line) throw Error('EDIT_GRAPH_RECOVERY_JOURNAL_EMPTY_RECORD');
    let record;
    try { record = JSON.parse(line); } catch (error) { throw Error('EDIT_GRAPH_RECOVERY_JOURNAL_JSON_INVALID'); }
    const body = {...record}; delete body.recordSha256;
    const previous = records.at(-1);
    if (record.schema !== 'axm.code.workspace-edit-graph-journal-record.v1' || record.version !== '1.0.0' || record.status !== 'TEST' || record.transactionId !== authorizationId || record.sequence !== records.length || record.previousRecordSha256 !== (previous?.recordSha256 || null) || !HEX64.test(record.recordSha256 || '') || registry.hash(body) !== record.recordSha256 || !validateNext(records, record)) throw Error('EDIT_GRAPH_RECOVERY_JOURNAL_CHAIN_INVALID');
    records.push(record);
  }
  if (!records.length) throw Error('EDIT_GRAPH_RECOVERY_JOURNAL_NO_COMPLETE_RECORD');
  return {resolved, paths, authorizationId, records, byteCount: stat.size, completeByteCount, trailingPartialRecordIgnored};
}

function expectedArtifactRelative(target, authorizationId, kind) {
  const directory = path.posix.dirname(target.targetPath);
  const prefix = directory === '.' ? '' : `${directory}/`;
  const basename = path.posix.basename(target.targetPath);
  const extension = path.posix.extname(basename) || '.txt';
  return `${prefix}.axm-${authorizationId.slice(0, 32)}-${basename}.${kind}${extension}`;
}

function validatePrepared(handle) {
  const prepared = handle.records[0].details;
  if (prepared.authorizationId !== handle.authorizationId || !HEX64.test(prepared.authorizationSha256 || '') || !HEX64.test(prepared.editGraphSha256 || '') || prepared.workspaceRootIdentitySha256 !== handle.resolved.workspaceIdentitySha256 || prepared.journalRootIdentitySha256 !== handle.resolved.journalIdentitySha256 || prepared.rollbackRequired !== true || !Array.isArray(prepared.targets) || prepared.targets.length < 4 || prepared.targets.length > 8) throw Error('EDIT_GRAPH_RECOVERY_PREPARED_BINDING_INVALID');
  const nodeIds = prepared.targets.map(target => target?.nodeId);
  const paths = prepared.targets.map(target => target?.targetPath);
  if (new Set(nodeIds).size !== nodeIds.length || new Set(paths).size !== paths.length || prepared.targets.some(target => {
    if (!target || !SAFE_ID.test(target.nodeId || '') || !SAFE_ID.test(target.entryId || '') || !['source', 'verification'].includes(target.lane) || typeof target.targetPath !== 'string' || target.targetPath.includes('\\') || target.targetPath.includes('\0') || target.targetPath.startsWith('/') || /^[A-Za-z]:/.test(target.targetPath) || path.posix.normalize(target.targetPath) !== target.targetPath || target.targetPath.split('/').some(part => !part || part === '.' || part === '..') || typeof target.existedBefore !== 'boolean' || (target.existedBefore ? !HEX64.test(target.beforeSha256 || '') : target.beforeSha256 !== null) || !HEX64.test(target.candidateSha256 || '') || !Number.isInteger(target.mode) || target.mode < 0 || target.mode > 0o777) return true;
    return target.tempRelativePath !== expectedArtifactRelative(target, handle.authorizationId, 'tmp') || target.backupRelativePath !== expectedArtifactRelative(target, handle.authorizationId, 'bak');
  })) throw Error('EDIT_GRAPH_RECOVERY_TARGET_DESCRIPTOR_INVALID');
  handle.prepared = prepared;
  return handle;
}

function read({workspaceRoot, journalRoot, authorizationId}) {
  const resolved = baseJournal.roots(workspaceRoot, journalRoot);
  return validatePrepared(readJournalFile(resolved, pathsFor(resolved, authorizationId), authorizationId));
}

function discardTrailingPartialRecord(handle) {
  if (!handle.trailingPartialRecordIgnored) return false;
  const fd = fs.openSync(handle.paths.journalPath, fs.constants.O_WRONLY);
  try { fs.ftruncateSync(fd, handle.completeByteCount); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  baseJournal.syncDirectory(handle.resolved.journal);
  handle.byteCount = handle.completeByteCount; handle.trailingPartialRecordIgnored = false;
  return true;
}

function absoluteArtifact(resolved, relative, targetPath, code) {
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
  const targetAbsolute = path.resolve(handle.resolved.workspace, ...target.targetPath.split('/'));
  if (!inside(targetAbsolute, handle.resolved.workspace)) throw Error('EDIT_GRAPH_RECOVERY_TARGET_ESCAPE');
  const parent = path.dirname(targetAbsolute); const parentStat = fs.lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || fs.realpathSync(parent) !== parent || !inside(parent, handle.resolved.workspace)) throw Error('EDIT_GRAPH_RECOVERY_TARGET_PARENT_INVALID');
  const tempAbsolute = absoluteArtifact(handle.resolved, target.tempRelativePath, target.targetPath, 'EDIT_GRAPH_RECOVERY_TEMP');
  const backupAbsolute = absoluteArtifact(handle.resolved, target.backupRelativePath, target.targetPath, 'EDIT_GRAPH_RECOVERY_BACKUP');
  return {...target, targetAbsolute, tempAbsolute, backupAbsolute, observed: {target: fileState(targetAbsolute, 'EDIT_GRAPH_RECOVERY_TARGET'), temp: fileState(tempAbsolute, 'EDIT_GRAPH_RECOVERY_TEMP'), backup: fileState(backupAbsolute, 'EDIT_GRAPH_RECOVERY_BACKUP')}};
}

function knownState(item, intent) {
  const target = item.observed.target.sha256; const temp = item.observed.temp.sha256; const backup = item.observed.backup.sha256;
  const absent = value => value === null;
  if (![null, item.beforeSha256, item.candidateSha256].includes(target) || ![null, item.candidateSha256].includes(temp) || ![null, item.beforeSha256].includes(backup)) return false;
  if ((target !== null && item.observed.target.mode !== item.mode) || (temp !== null && item.observed.temp.mode !== item.mode) || (backup !== null && item.observed.backup.mode !== item.mode)) return false;
  if (item.existedBefore) {
    if (intent === 'commit') return target === item.candidateSha256 && absent(temp) && (absent(backup) || backup === item.beforeSha256);
    return (target === item.beforeSha256 && absent(backup)) || (absent(target) && backup === item.beforeSha256) || (target === item.candidateSha256 && backup === item.beforeSha256);
  }
  if (!absent(backup)) return false;
  if (intent === 'commit') return target === item.candidateSha256 && absent(temp);
  return (target === item.candidateSha256 && absent(temp)) || (absent(target) && (absent(temp) || temp === item.candidateSha256));
}

function unlinkKnown(target) {
  if (fs.existsSync(target)) { fs.unlinkSync(target); baseJournal.syncDirectory(path.dirname(target)); }
}

function restore(item) {
  if (item.observed.target.sha256 === item.candidateSha256) unlinkKnown(item.targetAbsolute);
  if (!fs.existsSync(item.targetAbsolute) && fs.existsSync(item.backupAbsolute)) { fs.renameSync(item.backupAbsolute, item.targetAbsolute); baseJournal.syncDirectory(path.dirname(item.targetAbsolute)); }
  unlinkKnown(item.tempAbsolute);
}

function finalize(item) { unlinkKnown(item.backupAbsolute); unlinkKnown(item.tempAbsolute); }

function verifyFinal(items, intent) {
  return items.map(item => {
    const target = fileState(item.targetAbsolute, 'EDIT_GRAPH_RECOVERY_FINAL_TARGET');
    const temp = fileState(item.tempAbsolute, 'EDIT_GRAPH_RECOVERY_FINAL_TEMP');
    const backup = fileState(item.backupAbsolute, 'EDIT_GRAPH_RECOVERY_FINAL_BACKUP');
    const expectedSha256 = intent === 'commit' ? item.candidateSha256 : item.beforeSha256;
    const targetMatches = expectedSha256 === null ? target.kind === 'absent' : target.sha256 === expectedSha256 && target.mode === item.mode;
    return {nodeId: item.nodeId, entryId: item.entryId, lane: item.lane, targetPath: item.targetPath, expectedSha256, observedSha256: target.sha256, targetMatches, artifactsAbsent: temp.kind === 'absent' && backup.kind === 'absent'};
  });
}

function receipt(body) { return Object.freeze({...body, recoverySha256: registry.hash(body)}); }
function held(errorCode, details = {}) { return receipt({schema: 'axm.code.workspace-edit-graph-recovery-receipt.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_GRAPH_RECOVERY_HELD', errorCode, ...details, truth: {workspaceMutationAttemptedByRecovery: false, ambiguousStateGuessed: false, digestIsSignerOrConsentProof: false}}); }

function recover({workspaceRoot = null, journalRoot = null, authorizationId = null} = {}) {
  let mutationStarted = false; let handle = null;
  try {
    handle = read({workspaceRoot, journalRoot, authorizationId});
    const latest = handle.records.at(-1).phase;
    const intent = FINAL_COMMITTED.has(latest) || COMMIT_RECOVERY.has(latest) ? 'commit' : 'rollback';
    const items = handle.prepared.targets.map(target => observedTarget(handle, target));
    if (!items.every(item => knownState(item, intent))) return held('EDIT_GRAPH_RECOVERY_WORKSPACE_STATE_AMBIGUOUS', {authorizationId, journalLatestPhase: latest, observedTargets: items.map(item => ({nodeId: item.nodeId, targetPath: item.targetPath, observed: item.observed}))});
    if (FINAL_COMMITTED.has(latest) || FINAL_ROLLED_BACK.has(latest)) {
      const final = verifyFinal(items, intent);
      if (!final.every(item => item.targetMatches && item.artifactsAbsent)) return held('EDIT_GRAPH_RECOVERY_FINAL_STATE_MISMATCH', {authorizationId, journalLatestPhase: latest, targets: final});
      let leaseReleased = false; const hadTrailingPartialRecord = handle.trailingPartialRecordIgnored;
      if (fs.existsSync(handle.paths.leasePath)) { validateLease(handle.paths, handle.prepared); discardTrailingPartialRecord(handle); leaseReleased = releaseLease(handle); }
      else if (hadTrailingPartialRecord) return held('EDIT_GRAPH_RECOVERY_TRAILING_PARTIAL_WITHOUT_LEASE', {authorizationId, journalLatestPhase: latest});
      return receipt({schema: 'axm.code.workspace-edit-graph-recovery-receipt.v1', version: '1.0.0', status: 'TEST', result: intent === 'commit' ? 'EDIT_GRAPH_RECOVERY_ALREADY_COMMITTED' : 'EDIT_GRAPH_RECOVERY_ALREADY_ROLLED_BACK', errorCode: null, authorizationId, authorizationSha256: handle.prepared.authorizationSha256, editGraphSha256: handle.prepared.editGraphSha256, journalLatestPhase: latest, recoveryAction: 'none', targets: final, leaseReleased, trailingPartialRecordIgnored: hadTrailingPartialRecord, truth: {workspaceMutationAttemptedByRecovery: false, journalTailRepairAttempted: hadTrailingPartialRecord, finalStateVerified: true, ambiguousStateGuessed: false, universalPowerLossRecoveryClaimed: false}});
    }
    validateLease(handle.paths, handle.prepared);
    const hadTrailingPartialRecord = handle.trailingPartialRecordIgnored; discardTrailingPartialRecord(handle); mutationStarted = true;
    for (const item of [...items].reverse()) { if (intent === 'commit') finalize(item); else restore(item); }
    const final = verifyFinal(items, intent);
    if (!final.every(item => item.targetMatches && item.artifactsAbsent)) throw Error('EDIT_GRAPH_RECOVERY_POSTCONDITION_FAILED');
    append(handle, intent === 'commit' ? 'GRAPH_RECOVERY_COMMITTED' : 'GRAPH_RECOVERY_ROLLED_BACK', {targets: final, trailingPartialRecordIgnored: hadTrailingPartialRecord});
    const leaseReleased = releaseLease(handle);
    return receipt({schema: 'axm.code.workspace-edit-graph-recovery-receipt.v1', version: '1.0.0', status: 'TEST', result: intent === 'commit' ? 'EDIT_GRAPH_RECOVERY_COMMITTED' : 'EDIT_GRAPH_RECOVERY_ROLLED_BACK', errorCode: null, authorizationId, authorizationSha256: handle.prepared.authorizationSha256, editGraphSha256: handle.prepared.editGraphSha256, journalLatestPhase: latest, recoveryAction: intent, targets: final, leaseReleased, trailingPartialRecordIgnored: hadTrailingPartialRecord, truth: {workspaceMutationAttemptedByRecovery: true, journalTailRepairAttempted: hadTrailingPartialRecord, finalStateVerified: true, ambiguousStateGuessed: false, universalPowerLossRecoveryClaimed: false}});
  } catch (error) {
    const message = String(error?.message || 'EDIT_GRAPH_RECOVERY_FAILED');
    const errorCode = message.startsWith('EDIT_GRAPH_') ? message : (typeof error?.code === 'string' ? `EDIT_GRAPH_RECOVERY_FILESYSTEM_${error.code}` : 'EDIT_GRAPH_RECOVERY_FAILED');
    if (!mutationStarted) return held(errorCode, {authorizationId});
    return receipt({schema: 'axm.code.workspace-edit-graph-recovery-receipt.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_GRAPH_RECOVERY_FAILED', errorCode, authorizationId, truth: {workspaceMutationAttemptedByRecovery: true, finalStateVerified: false, ambiguousStateGuessed: false, leaseRetainedForRetry: true, universalPowerLossRecoveryClaimed: false}});
  }
}

module.exports = {MAX_JOURNAL_BYTES, prepare, append, releaseLease, recover};
