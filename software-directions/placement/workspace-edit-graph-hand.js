'use strict';

const path = require('path');
const editGraphPlane = require('./edit-graph-plane.js');
const projectMapHand = require('./project-map-hand.js');
const registry = require('./placement-registry.js');
const editHand = require('./workspace-edit-hand.js');
const graphJournal = require('./workspace-edit-graph-journal.js');
const baseJournal = require('./workspace-edit-journal.js');

const P = editHand.INTERNALS;
const AUTHORITY = Object.freeze({workspaceRead: true, workspaceMutation: true, exactNamedTargetWrite: true, rollbackWrite: true, externalJournalReadWrite: true, workspaceLease: true, verifierAdapterInvocation: true, childProcessExecution: false, network: false, install: false, deployment: false, userFileDeletion: false, transactionArtifactCleanup: true, promotion: false, canon: false});
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_VERIFIER_BINDINGS = 8;
const USED_AUTHORIZATIONS = new Set();

function held(errorCode, details = {}) {
  const body = {schema: 'axm.code.workspace-edit-graph-transaction-receipt.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_GRAPH_TRANSACTION_HELD', errorCode, ...details, truth: {workspaceMutationAttemptedByHand: false, workspaceChangeCausedByHand: false, codeGeneratedByHand: false}, authority: AUTHORITY};
  return P.receipt(body, 'transactionSha256');
}

function validateCandidates(editGraph, candidateEntries) {
  if (!Array.isArray(candidateEntries) || candidateEntries.length !== editGraph.entries.length) throw Error('EDIT_GRAPH_CANDIDATE_ENTRY_COUNT_INVALID');
  const byId = new Map();
  for (const value of candidateEntries) {
    if (!value || !SAFE_ID.test(value.entryId || '') || byId.has(value.entryId)) throw Error('EDIT_GRAPH_CANDIDATE_ENTRY_INVALID');
    const graphEntry = editGraph.entries.find(entry => entry.entryId === value.entryId);
    if (!graphEntry) throw Error('EDIT_GRAPH_CANDIDATE_ENTRY_UNKNOWN');
    const plan = graphEntry.placementPlan;
    byId.set(value.entryId, {
      source: P.candidate(value.source, 'source', plan.sourcePlacement, plan.languageBinding.languageId),
      verification: P.candidate(value.verification, 'verification', plan.verificationPlacement, plan.languageBinding.languageId)
    });
  }
  return byId;
}

function validateAuthorization(authorization, context, adapters) {
  P.validateDigestReceipt(authorization, 'authorizationSha256', 'EDIT_GRAPH_AUTHORIZATION');
  if (authorization.schema !== 'axm.code.edit-graph-authorization.v1' || authorization.version !== '1.0.0' || authorization.status !== 'TEST' || authorization.result !== 'EDIT_GRAPH_TRANSACTION_AUTHORIZED' || !SAFE_ID.test(authorization.authorizationId || '') || authorization.approval !== 'EXPLICIT_SINGLE_GRAPH_TRANSACTION') throw Error('EDIT_GRAPH_AUTHORIZATION_HEADER_INVALID');
  if (USED_AUTHORIZATIONS.has(authorization.authorizationSha256)) throw Error('EDIT_GRAPH_AUTHORIZATION_REPLAYED');
  const issuedAt = Date.parse(authorization.issuedAt); const expiresAt = Date.parse(authorization.expiresAt); const now = Date.now();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || new Date(issuedAt).toISOString() !== authorization.issuedAt || new Date(expiresAt).toISOString() !== authorization.expiresAt || expiresAt <= issuedAt || authorization.ttlMs !== expiresAt - issuedAt || authorization.ttlMs > editHand.AUTHORIZATION_TTL_MS) throw Error('EDIT_GRAPH_AUTHORIZATION_TIME_INVALID');
  if (issuedAt > now + 5000) throw Error('EDIT_GRAPH_AUTHORIZATION_FUTURE');
  if (now > expiresAt || expiresAt > Date.parse(context.observation.expiresAt)) throw Error('EDIT_GRAPH_AUTHORIZATION_STALE');
  if (authorization.workspaceRootIdentitySha256 !== registry.hash(context.root) || authorization.journalRootIdentitySha256 !== context.journalRootIdentitySha256 || authorization.projectMapObservationSha256 !== context.observation.observationSha256 || authorization.editGraphSha256 !== context.editGraph.editGraphSha256 || authorization.parserId !== 'node-vm-script-syntax-v1' || authorization.rollbackRequired !== true || authorization.durableRecoveryRequired !== true) throw Error('EDIT_GRAPH_AUTHORIZATION_BINDING_INVALID');
  const expectedTargets = context.editGraph.installationOrder.map(nodeId => {
    const node = context.editGraph.nodes.find(item => item.nodeId === nodeId);
    const candidate = context.candidates.get(node.entryId)[node.lane];
    return {nodeId, entryId: node.entryId, lane: node.lane, targetPath: node.targetPath, action: node.action, expectedBeforeSha256: node.expectedBeforeSha256, candidateSha256: candidate.contentSha256};
  });
  if (registry.canon(authorization.targets) !== registry.canon(expectedTargets)) throw Error('EDIT_GRAPH_AUTHORIZATION_TARGET_MISMATCH');
  if (!Array.isArray(authorization.verifierBindings) || authorization.verifierBindings.length === 0 || authorization.verifierBindings.length > MAX_VERIFIER_BINDINGS || new Set(authorization.verifierBindings.map(item => item?.id)).size !== authorization.verifierBindings.length) throw Error('EDIT_GRAPH_AUTHORIZATION_VERIFIERS_INVALID');
  const requested = new Set(context.editGraph.entries.flatMap(entry => entry.placementPlan.verificationPlacement.requestedVerifiers));
  const provided = new Set(authorization.verifierBindings.map(item => item?.providesVerifierId));
  if ([...requested].some(id => !provided.has(id))) throw Error('EDIT_GRAPH_REQUESTED_VERIFIER_UNBOUND');
  const bindings = authorization.verifierBindings.map(binding => {
    if (!binding || !SAFE_ID.test(binding.id || '') || !/^[a-f0-9]{64}$/.test(binding.adapterSha256 || '') || typeof binding.providesVerifierId !== 'string') throw Error('EDIT_GRAPH_VERIFIER_BINDING_INVALID');
    const adapter = adapters.find(item => item?.id === binding.id);
    if (!adapter || adapter.adapterSha256 !== binding.adapterSha256 || adapter.providesVerifierId !== binding.providesVerifierId || typeof adapter.verify !== 'function') throw Error(`EDIT_GRAPH_VERIFIER_ADAPTER_MISMATCH:${binding.id}`);
    return {binding, adapter};
  });
  if (authorization.authority?.workspaceMutation !== true || authorization.authority?.rollbackWrite !== true || authorization.authority?.externalJournalReadWrite !== true || authorization.authority?.workspaceLease !== true || authorization.authority?.network !== false || authorization.authority?.install !== false || authorization.authority?.deployment !== false || authorization.authority?.userFileDeletion !== false || authorization.truth?.digestIsSignerOrConsentProof !== false || authorization.truth?.candidateGenerationDelegated !== true || authorization.truth?.graphWasHumanOrHostAuthorized !== true) throw Error('EDIT_GRAPH_AUTHORIZATION_AUTHORITY_INVALID');
  return bindings;
}

function parseWrapper(nodeId, entryId, value, phase) {
  const parserReceipt = P.parseReceipt(value, phase);
  return Object.freeze({nodeId, entryId, lane: value.lane, parserReceipt});
}

function verifierWrapper(entryId, binding, adapter, source, verification, planSha256) {
  return Object.freeze({entryId, verifierReceipt: P.verifierReceipt(binding, adapter, {source, verification, planSha256})});
}

function installState(state, journalHandle) {
  P.install(state, legacyPhase => {
    const suffix = legacyPhase.slice(legacyPhase.indexOf('_') + 1);
    graphJournal.append(journalHandle, `GRAPH_TARGET_${suffix}`, {nodeId: state.nodeId, entryId: state.entryId, lane: state.lane, targetPath: state.relativePath});
  });
}

function apply({workspaceRoot = null, journalRoot = null, declaration = null, projectMapObservation = null, editGraph = null, candidateEntries = null, authorization = null, verifierAdapters = []} = {}) {
  const states = []; const parserReceipts = []; const verifierReceipts = [];
  let mutationStarted = false; let verificationRecorded = false; let authorizationSha256 = null; let journalHandle = null; let durability = null;
  try {
    const root = P.workspaceRoot(workspaceRoot);
    durability = baseJournal.roots(root, journalRoot);
    P.validateObservation(projectMapObservation, root, declaration);
    editGraphPlane.validateGraph(editGraph, projectMapObservation);
    for (const entry of editGraph.entries) P.validatePlan(entry.placementPlan, projectMapObservation);
    const freshObservation = projectMapHand.inspect({workspaceRoot: root, declaration});
    if (freshObservation.result !== 'PROJECT_MAP_OBSERVED_READ_ONLY') throw Error(`EDIT_GRAPH_FRESH_PROJECT_MAP_HELD:${freshObservation.errorCode}`);
    if (freshObservation.projectMapSha256 !== projectMapObservation.projectMapSha256 || freshObservation.projectMapSha256 !== editGraph.projectMapSha256) throw Error('EDIT_GRAPH_WORKSPACE_DRIFT_SINCE_PLACEMENT');
    const candidates = validateCandidates(editGraph, candidateEntries);
    const context = {root, journalRootIdentitySha256: durability.journalIdentitySha256, observation: projectMapObservation, editGraph, candidates};
    const adapterBindings = validateAuthorization(authorization, context, verifierAdapters);
    authorizationSha256 = authorization.authorizationSha256;
    const statesByNode = new Map();
    for (const nodeId of editGraph.installationOrder) {
      const node = editGraph.nodes.find(item => item.nodeId === nodeId);
      const entry = editGraph.entries.find(item => item.entryId === node.entryId);
      const placement = node.lane === 'source' ? entry.placementPlan.sourcePlacement : entry.placementPlan.verificationPlacement;
      const state = P.targetState(root, placement, candidates.get(node.entryId)[node.lane], authorization.authorizationId);
      state.nodeId = nodeId; state.entryId = node.entryId;
      states.push(state); statesByNode.set(nodeId, state);
      parserReceipts.push(parseWrapper(nodeId, node.entryId, state.candidate, 'pre-mutation'));
    }
    const failedPreParse = parserReceipts.find(item => item.parserReceipt.result !== 'LANGUAGE_PARSE_PASS');
    if (failedPreParse) throw Error(`EDIT_GRAPH_${failedPreParse.nodeId.toUpperCase().replaceAll('-', '_')}_PARSE_FAILED`);
    journalHandle = graphJournal.prepare({workspaceRoot: root, journalRoot: durability.journal, authorization, editGraphSha256: editGraph.editGraphSha256, states});
    USED_AUTHORIZATIONS.add(authorizationSha256); mutationStarted = true;
    for (const state of states) installState(state, journalHandle);
    const installedByNode = new Map();
    for (const state of states) {
      const installed = P.installedCandidate(state); installedByNode.set(state.nodeId, installed);
      parserReceipts.push(parseWrapper(state.nodeId, state.entryId, installed, 'post-mutation'));
    }
    const failedPostParse = parserReceipts.find(item => item.parserReceipt.phase === 'post-mutation' && item.parserReceipt.result !== 'LANGUAGE_PARSE_PASS');
    if (failedPostParse) throw Error(`EDIT_GRAPH_${failedPostParse.nodeId.toUpperCase().replaceAll('-', '_')}_POSTWRITE_PARSE_FAILED`);
    graphJournal.append(journalHandle, 'GRAPH_INSTALLED_PARSED', {parserReceiptSha256: parserReceipts.filter(item => item.parserReceipt.phase === 'post-mutation').map(item => item.parserReceipt.receiptSha256)});
    for (const entry of editGraph.entries) {
      const requested = new Set(entry.placementPlan.verificationPlacement.requestedVerifiers);
      const source = installedByNode.get(`${entry.entryId}-source`); const verification = installedByNode.get(`${entry.entryId}-verification`);
      for (const {binding, adapter} of adapterBindings.filter(item => requested.has(item.binding.providesVerifierId))) verifierReceipts.push(verifierWrapper(entry.entryId, binding, adapter, source, verification, entry.placementPlan.planSha256));
    }
    const failedVerifier = verifierReceipts.find(item => item.verifierReceipt.result !== 'WORKSPACE_VERIFIER_PASS');
    if (failedVerifier) throw Error(`EDIT_GRAPH_VERIFIER_FAILED:${failedVerifier.entryId}:${failedVerifier.verifierReceipt.adapterId}`);
    graphJournal.append(journalHandle, 'GRAPH_VERIFIED', {verifierReceiptSha256: verifierReceipts.map(item => item.verifierReceipt.receiptSha256)});
    verificationRecorded = true;
    const cleanupFailures = P.cleanup(states);
    if (!cleanupFailures.length) {
      graphJournal.append(journalHandle, 'GRAPH_CLEANUP_COMPLETE', {targetCount: states.length});
      graphJournal.append(journalHandle, 'GRAPH_COMMITTED', {targetCount: states.length});
      graphJournal.releaseLease(journalHandle);
    }
    const body = {
      schema: 'axm.code.workspace-edit-graph-transaction-receipt.v1', version: '1.0.0', status: 'TEST', result: cleanupFailures.length ? 'EDIT_GRAPH_TRANSACTION_COMMITTED_WITH_CLEANUP_HOLD' : 'EDIT_GRAPH_TRANSACTION_COMMITTED', errorCode: cleanupFailures.length ? 'EDIT_GRAPH_TRANSACTION_ARTIFACT_CLEANUP_INCOMPLETE' : null,
      authorizationId: authorization.authorizationId, authorizationSha256, projectMapObservationSha256: projectMapObservation.observationSha256, freshPreflightObservationSha256: freshObservation.observationSha256, editGraphSha256: editGraph.editGraphSha256,
      installationOrder: [...editGraph.installationOrder], targets: states.map(state => ({nodeId: state.nodeId, entryId: state.entryId, lane: state.lane, targetPath: state.relativePath, action: state.beforeBytes ? 'replace' : 'create', beforeSha256: state.beforeSha256, afterSha256: state.candidate.contentSha256})),
      parserReceipts, verifierReceipts, rollbackReceipt: null, cleanupFailures,
      durableJournal: {authorizationId: authorization.authorizationId, journalRootIdentitySha256: durability.journalIdentitySha256, latestPhase: cleanupFailures.length ? 'GRAPH_VERIFIED' : 'GRAPH_COMMITTED', recoveryRequired: cleanupFailures.length > 0},
      truth: {workspaceMutationAttempted: true, exactCandidateBytesInstalled: true, graphTargetCount: states.length, codeGeneratedByHand: false, requestedVerifiersPassed: true, dependencyOrderFollowed: true, multiFileAtomicityClaimed: false, processCrashRecoveryProvided: true, replayProtectionSurvivesRestart: true, universalPowerLossRecoveryClaimed: false, simultaneousHandMutationPreventedByLease: true, externalMutationRaceEliminated: false, declarationUpdateRequired: states.some(state => !state.beforeBytes)}, authority: AUTHORITY
    };
    return P.receipt(body, 'transactionSha256');
  } catch (error) {
    const message = String(error?.message || 'EDIT_GRAPH_TRANSACTION_FAILED');
    const errorCode = message.startsWith('EDIT_GRAPH_') ? message : (message.startsWith('EDIT_') ? `EDIT_GRAPH_${message.slice('EDIT_'.length)}` : (typeof error?.code === 'string' ? `EDIT_GRAPH_FILESYSTEM_${error.code}` : 'EDIT_GRAPH_TRANSACTION_FAILED'));
    if (!mutationStarted) return held(errorCode, {authorizationSha256, parserReceipts, verifierReceipts});
    if (verificationRecorded) {
      return P.receipt({schema: 'axm.code.workspace-edit-graph-transaction-receipt.v1', version: '1.0.0', status: 'TEST', result: 'EDIT_GRAPH_TRANSACTION_COMMITTED_WITH_RECOVERY_HOLD', errorCode, authorizationSha256, editGraphSha256: editGraph?.editGraphSha256 || null, targets: states.map(state => ({nodeId: state.nodeId, targetPath: state.relativePath, beforeSha256: state.beforeSha256, candidateSha256: state.candidate.contentSha256})), parserReceipts, verifierReceipts, rollbackReceipt: null, durableJournal: {authorizationId: authorization?.authorizationId || null, journalRootIdentitySha256: durability?.journalIdentitySha256 || null, latestPhase: journalHandle?.records?.at(-1)?.phase || null, recoveryRequired: true}, truth: {workspaceMutationAttempted: true, verifiedCandidatesPreservedForRecovery: true, codeGeneratedByHand: false, multiFileAtomicityClaimed: false, processCrashRecoveryProvided: true, leaseRetainedForRecovery: true}, authority: AUTHORITY}, 'transactionSha256');
    }
    const rollbackReceipt = P.rollback(states); let journalErrorCode = null;
    if (rollbackReceipt.result === 'ROLLBACK_PASS' && journalHandle) {
      try { graphJournal.append(journalHandle, 'GRAPH_ROLLED_BACK', {rollbackReceiptSha256: rollbackReceipt.receiptSha256}); graphJournal.releaseLease(journalHandle); }
      catch (journalError) { journalErrorCode = String(journalError?.message || 'EDIT_GRAPH_JOURNAL_ROLLBACK_RECORD_FAILED'); }
    }
    return P.receipt({schema: 'axm.code.workspace-edit-graph-transaction-receipt.v1', version: '1.0.0', status: 'TEST', result: rollbackReceipt.result === 'ROLLBACK_PASS' ? (journalErrorCode ? 'EDIT_GRAPH_TRANSACTION_ROLLED_BACK_WITH_JOURNAL_HOLD' : 'EDIT_GRAPH_TRANSACTION_ROLLED_BACK') : 'EDIT_GRAPH_TRANSACTION_ROLLBACK_FAILED', errorCode, journalErrorCode, authorizationSha256, editGraphSha256: editGraph?.editGraphSha256 || null, targets: states.map(state => ({nodeId: state.nodeId, targetPath: state.relativePath, beforeSha256: state.beforeSha256, candidateSha256: state.candidate.contentSha256})), parserReceipts, verifierReceipts, rollbackReceipt, durableJournal: {authorizationId: authorization?.authorizationId || null, journalRootIdentitySha256: durability?.journalIdentitySha256 || null, latestPhase: journalHandle?.records?.at(-1)?.phase || null, recoveryRequired: rollbackReceipt.result !== 'ROLLBACK_PASS' || journalErrorCode !== null}, truth: {workspaceMutationAttempted: true, finalWorkspaceRestored: rollbackReceipt.result === 'ROLLBACK_PASS', codeGeneratedByHand: false, failedVerificationWasNotAccepted: true, processCrashRecoveryProvided: true, replayProtectionSurvivesRestart: true, multiFileAtomicityClaimed: false, simultaneousHandMutationPreventedByLease: true}, authority: AUTHORITY}, 'transactionSha256');
  }
}

module.exports = {AUTHORITY, MAX_TARGETS: editGraphPlane.MAX_ENTRIES * 2, MAX_VERIFIER_BINDINGS, apply, recover: graphJournal.recover};
