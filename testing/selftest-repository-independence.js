'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ORGAN_ROOT = path.join(ROOT, 'language-organs', 'organs');
const REQUIRED_PAYLOADS = [
  'grammar.profile.json',
  'machine.cheatcodes.json',
  'machine.keyboard.json',
  'machine.templates.json',
  'organ.json',
  'specialist.eye.json'
];

function walk(root, files = []) {
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const target = path.join(root, entry.name);
    const stat = fs.lstatSync(target);
    assert.strictEqual(stat.isSymbolicLink(), false, `symlink forbidden in standalone body: ${path.relative(ROOT, target)}`);
    if (stat.isDirectory()) walk(target, files);
    else files.push(target);
  }
  return files;
}

assert.strictEqual(fs.existsSync(path.join(ROOT, '.gitmodules')), false, 'standalone body must not use git submodules');

const organDirectories = fs.readdirSync(ORGAN_ROOT, {withFileTypes: true})
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();
assert.strictEqual(organDirectories.length, 102, 'exactly 102 language directories');

let payloadCount = 0;
for (const directory of organDirectories) {
  const jsonFiles = fs.readdirSync(path.join(ORGAN_ROOT, directory))
    .filter(name => name.endsWith('.json'))
    .sort();
  assert.deepStrictEqual(jsonFiles, REQUIRED_PAYLOADS, `${directory} must contain the six standalone payloads`);
  payloadCount += jsonFiles.length;
}
assert.strictEqual(payloadCount, 612, '102 x six language payloads');

const files = walk(ROOT);
const jsonFiles = files.filter(file => file.endsWith('.json'));
for (const file of jsonFiles) {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')), `valid JSON: ${path.relative(ROOT, file)}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
assert.strictEqual(packageJson.private, true);
assert.strictEqual(packageJson.scripts.test, 'node testing/run-all.js');

const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'language-organs', 'standalone-capability-router.contract.json'), 'utf8'));
assert.strictEqual(contract.schema, 'axm.code.standalone-capability-router-contract.v1');
assert.strictEqual(contract.status, 'TEST');
assert.deepStrictEqual(contract.permissions, []);
assert.strictEqual(contract.authority, 'NONE');
assert.strictEqual(contract.truth.capabilityIsAuthority, false);
assert.strictEqual(contract.truth.runtimeCorrectnessAutomaticallyClaimed, false);

const directionContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'software-direction.contract.json'), 'utf8'));
const directionCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'direction-catalog.json'), 'utf8'));
const directionAxes = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'axis-catalog.json'), 'utf8'));
const frontierContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'frontier-direction-workbench.contract.json'), 'utf8'));
const frontierTrials = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'frontier-trial-catalog.json'), 'utf8'));
const adapterContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'adapters', 'adapter-plane.contract.json'), 'utf8'));
const adapterCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'adapters', 'adapter-catalog.json'), 'utf8'));
const placementContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'placement-plane.contract.json'), 'utf8'));
const projectMapHandContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'project-map-hand.contract.json'), 'utf8'));
const workspaceEditHandContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'workspace-edit-hand.contract.json'), 'utf8'));
const editGraphPlaneContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'edit-graph-plane.contract.json'), 'utf8'));
const workspaceEditGraphHandContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'workspace-edit-graph-hand.contract.json'), 'utf8'));
const toolchainEnvironmentHandContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'toolchain-environment-hand.contract.json'), 'utf8'));
const handFoundryPlaneContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'hand-foundry-plane.contract.json'), 'utf8'));
const boundedPythonAuthorContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'bounded-python-record-transform-author-hand.contract.json'), 'utf8'));
const boundedPythonVerifierContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'bounded-python-record-transform-verifier-adapter.contract.json'), 'utf8'));
const boundedPythonRequiredFieldsAuthorContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'bounded-python-required-fields-author-hand.contract.json'), 'utf8'));
const boundedPythonRequiredFieldsVerifierContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'bounded-python-required-fields-verifier-adapter.contract.json'), 'utf8'));
const boundedPythonRecipeRegistryContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'bounded-python-recipe-registry.contract.json'), 'utf8'));
const foundryActivationContract = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'foundry-activation-plane.contract.json'), 'utf8'));
const placementCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'software-directions', 'placement', 'placement-catalog.json'), 'utf8'));
assert.strictEqual(directionContract.schema, 'axm.code.software-direction-contract.v1');
assert.strictEqual(directionContract.authority, 'NONE');
assert.deepStrictEqual(directionContract.permissions, []);
assert.strictEqual(directionContract.principles.duplicateGrammarBodiesPerDirection, false);
assert.strictEqual(directionContract.principles.suggestionIsSelection, false);
assert.strictEqual(directionContract.principles.missingEvidenceMeansImpossible, false);
assert.strictEqual(directionCatalog.profiles.length, 29);
assert.strictEqual(new Set(directionCatalog.profiles.map(profile => profile.id)).size, 29);
assert.deepStrictEqual(Object.keys(directionAxes.axes).sort(), ['distribution', 'execution', 'quality', 'risk', 'runtime', 'state', 'verification']);
assert.strictEqual(frontierContract.schema, 'axm.code.frontier-direction-workbench-contract.v1');
assert.strictEqual(frontierContract.authority, 'BOUNDED_LOCAL_ADAPTER_ONLY');
assert.deepStrictEqual(frontierContract.permissions, ['current-node-version-read', 'bounded-in-memory-reference-execution']);
assert.strictEqual(frontierContract.truth.beginnerReferenceReadyIsProductionReady, false);
assert.strictEqual(frontierTrials.trials.length, 29);
assert.strictEqual(frontierTrials.method.trialCount, 58);
assert.strictEqual(frontierTrials.method.humanInterventionDuringTrialRun, false);
assert.strictEqual(frontierTrials.method.productionReadinessClaimed, false);
assert.strictEqual(adapterContract.schema, 'axm.code.direction-adapter-plane-contract.v1');
assert.strictEqual(adapterContract.authority, 'BOUNDED_LOCAL_ADAPTER_ONLY');
assert.strictEqual(adapterContract.truth.requestedVerifierIsEvidence, false);
assert.strictEqual(adapterContract.executionBoundary.workspaceRead, false);
assert.strictEqual(adapterContract.executionBoundary.workspaceMutation, false);
assert.strictEqual(adapterContract.executionBoundary.childProcessExecution, false);
assert.strictEqual(adapterCatalog.adapters.length, 10);
assert.strictEqual(adapterCatalog.adapters.filter(adapter => adapter.kind === 'runtime').length, 1);
assert.strictEqual(adapterCatalog.adapters.filter(adapter => adapter.kind === 'verifier').length, 9);
assert.strictEqual(adapterCatalog.knownUnsupportedVerifierIds.length, 11);
assert.strictEqual(placementContract.schema, 'axm.code.placement-plane-contract.v1');
assert.strictEqual(placementContract.authority, 'NONE');
assert.deepStrictEqual(placementContract.permissions, []);
assert.strictEqual(placementContract.truth.placementPlanIsSourceCode, false);
assert.strictEqual(placementContract.truth.placementPlanIsWorkspaceMutation, false);
assert.strictEqual(placementContract.truth.ambiguousOwnerMayBeGuessed, false);
assert.strictEqual(placementContract.version, '1.2.0');
assert.strictEqual(placementContract.truth.explicitLanguageBindingSignalRequired, true);
assert.strictEqual(placementContract.truth.extensionLanguageBindingSupported, true);
assert.strictEqual(placementContract.truth.basenameLanguageBindingSupported, true);
assert.strictEqual(placementContract.truth.pathContextLanguageBindingSupported, true);
assert.strictEqual(placementContract.truth.targetPathMustMatchDeclaredLanguageSignal, true);
assert.strictEqual(placementContract.truth.plannerReadsWorkspace, false);
assert.strictEqual(placementContract.truth.freshReadOnlyHandObservationMayBindPlanning, true);
assert.strictEqual(placementContract.truth.liveObservationRemovesPreMutationRecheck, false);
assert.strictEqual(projectMapHandContract.schema, 'axm.code.project-map-hand-contract.v1');
assert.strictEqual(projectMapHandContract.authority, 'BOUNDED_WORKSPACE_READ_ONLY');
assert.deepStrictEqual(projectMapHandContract.permissions, ['bounded-explicit-root-workspace-read']);
assert.strictEqual(projectMapHandContract.truth.filePathsAndBytesAreDirectlyObserved, true);
assert.strictEqual(projectMapHandContract.truth.semanticRolesAreCallerDeclared, true);
assert.strictEqual(projectMapHandContract.truth.observationIsMutationAuthority, false);
assert.strictEqual(workspaceEditHandContract.schema, 'axm.code.workspace-edit-hand-contract.v1');
assert.strictEqual(workspaceEditHandContract.authority, 'EXPLICIT_SINGLE_TRANSACTION_WORKSPACE_EDIT');
assert(workspaceEditHandContract.permissions.includes('explicit-two-target-workspace-write'));
assert.strictEqual(workspaceEditHandContract.truth.handGeneratesCode, false);
assert.strictEqual(workspaceEditHandContract.truth.multiFileAtomicityClaimed, false);
assert.strictEqual(workspaceEditHandContract.version, '1.2.0');
assert(workspaceEditHandContract.supportedParserBindings.includes('python:python-ast-exec-syntax-v1'));
assert.strictEqual(workspaceEditHandContract.truth.pythonParserExecutesCandidate, false);
assert.strictEqual(workspaceEditHandContract.truth.linuxProcessCrashRecoveryProvided, true);
assert.strictEqual(workspaceEditHandContract.truth.universalPowerLossRecoveryClaimed, false);
assert.strictEqual(workspaceEditHandContract.truth.concurrentMutationRaceEliminated, false);
assert.strictEqual(workspaceEditHandContract.truth.simultaneousHandMutationPreventedByLease, true);
assert.strictEqual(workspaceEditHandContract.truth.externalNonHandMutationPrevented, false);
assert.strictEqual(workspaceEditHandContract.truth.processLocalRollbackProvided, true);
assert.strictEqual(workspaceEditHandContract.truth.replayProtectionSurvivesRestart, true);
assert.strictEqual(editGraphPlaneContract.schema, 'axm.code.edit-graph-plane-contract.v1');
assert.strictEqual(editGraphPlaneContract.authority, 'NONE');
assert.deepStrictEqual(editGraphPlaneContract.permissions, []);
assert.strictEqual(editGraphPlaneContract.limits.maxEntries, 4);
assert.strictEqual(editGraphPlaneContract.limits.maxTargets, 8);
assert.strictEqual(editGraphPlaneContract.truth.graphIsFilesystemAtomicityProof, false);
assert.strictEqual(workspaceEditGraphHandContract.schema, 'axm.code.workspace-edit-graph-hand-contract.v1');
assert.strictEqual(workspaceEditGraphHandContract.authority, 'EXPLICIT_SINGLE_GRAPH_TRANSACTION_WORKSPACE_EDIT');
assert.strictEqual(workspaceEditGraphHandContract.limits.maxTargets, 8);
assert.strictEqual(workspaceEditGraphHandContract.truth.handGeneratesCode, false);
assert.strictEqual(workspaceEditGraphHandContract.truth.linuxProcessCrashRecoveryProvided, true);
assert.strictEqual(workspaceEditGraphHandContract.truth.universalPowerLossRecoveryClaimed, false);
assert.strictEqual(workspaceEditGraphHandContract.truth.multiFileAtomicityClaimed, false);
assert.strictEqual(toolchainEnvironmentHandContract.schema, 'axm.code.toolchain-environment-hand-contract.v1');
assert.strictEqual(toolchainEnvironmentHandContract.authority, 'BOUNDED_ENVIRONMENT_OBSERVATION_ONLY');
assert.strictEqual(toolchainEnvironmentHandContract.truth.toolInstalledMeansUsable, false);
assert.strictEqual(toolchainEnvironmentHandContract.truth.candidateCodeExecuted, false);
assert.strictEqual(handFoundryPlaneContract.schema, 'axm.code.hand-foundry-plane-contract.v1');
assert.strictEqual(handFoundryPlaneContract.authority, 'NONE');
assert.deepStrictEqual(handFoundryPlaneContract.permissions, []);
assert.strictEqual(handFoundryPlaneContract.limits.maxPlacementPlans, 4);
assert.strictEqual(handFoundryPlaneContract.truth.grammarCanParameterizeHands, true);
assert.strictEqual(handFoundryPlaneContract.truth.multiPlanManifestRequiresEditGraphBinding, true);
assert.strictEqual(handFoundryPlaneContract.truth.foundryCanInventMissingImplementation, false);
assert.strictEqual(handFoundryPlaneContract.truth.foundryCanSelfAuthorize, false);
assert.strictEqual(handFoundryPlaneContract.truth.spawnedParserExecutesCandidate, false);
assert.strictEqual(handFoundryPlaneContract.version, '1.2.0');
assert.strictEqual(handFoundryPlaneContract.truth.boundedPythonRecipeRegistryPresent, true);
assert.strictEqual(handFoundryPlaneContract.truth.registeredPythonRecipeCount, 2);
assert.strictEqual(handFoundryPlaneContract.truth.pythonPairWriterAvailableBehindAuthorization, true);
assert.strictEqual(handFoundryPlaneContract.truth.boundedRecipeMeansGeneralAuthoring, false);
assert.strictEqual(boundedPythonAuthorContract.authority, 'BOUNDED_IN_MEMORY_AUTHORING_ONLY');
assert.strictEqual(boundedPythonAuthorContract.truth.generalPythonAuthoringClaimed, false);
assert.strictEqual(boundedPythonAuthorContract.donor.builderSha256, 'ad281fa5a1381de86d71e1c4a2ffbad30ee20683cb705b4a09d778464ea5227c');
assert.strictEqual(boundedPythonVerifierContract.authority, 'PROVENANCE_LOCKED_RUNTIME_VERIFICATION_ONLY');
assert.strictEqual(boundedPythonVerifierContract.truth.arbitraryCandidateExecution, false);
assert.strictEqual(boundedPythonVerifierContract.truth.hostNamespaceSandbox, false);
assert.strictEqual(boundedPythonRequiredFieldsAuthorContract.authority, 'BOUNDED_IN_MEMORY_AUTHORING_ONLY');
assert.strictEqual(boundedPythonRequiredFieldsAuthorContract.truth.humanReviewClaimed, false);
assert.strictEqual(boundedPythonRequiredFieldsVerifierContract.authority, 'PROVENANCE_LOCKED_RUNTIME_VERIFICATION_ONLY');
assert.strictEqual(boundedPythonRequiredFieldsVerifierContract.truth.arbitraryCandidateExecution, false);
assert.strictEqual(boundedPythonRecipeRegistryContract.authority, 'ROUTING_ONLY_NO_MUTATION_OR_EXECUTION_AUTHORITY');
assert.strictEqual(boundedPythonRecipeRegistryContract.limits.registeredRecipeCount, 2);
assert.strictEqual(boundedPythonRecipeRegistryContract.truth.crossRecipeDispatchAllowed, false);
assert.strictEqual(boundedPythonRecipeRegistryContract.truth.registryGrantsMutationAuthority, false);
assert.strictEqual(foundryActivationContract.schema, 'axm.code.foundry-activation-plane-contract.v1');
assert.strictEqual(foundryActivationContract.authority, 'EXPLICIT_SINGLE_BOUNDED_RECIPE_ACTIVATION');
assert.strictEqual(foundryActivationContract.limits.maxTargets, 2);
assert.strictEqual(foundryActivationContract.limits.registeredRecipeCount, 2);
assert.strictEqual(foundryActivationContract.limits.boundedRecipeRegistryPresent, true);
assert.strictEqual(foundryActivationContract.limits.unboundedRecipeRegistryPresent, false);
assert.strictEqual(foundryActivationContract.truth.foundrySelfAuthorizes, false);
assert.strictEqual(foundryActivationContract.truth.hostAuthorizationIsNarrowedToExactCandidates, true);
assert.strictEqual(foundryActivationContract.truth.crossRecipeDispatch, false);
assert.strictEqual(foundryActivationContract.truth.arbitraryCandidateExecution, false);
assert.strictEqual(foundryActivationContract.truth.underlyingDurableRollbackAndRecoveryReused, true);
assert.strictEqual(placementCatalog.schema, 'axm.code.placement-role-catalog.v1');
assert.strictEqual(placementCatalog.roles.length, 10);
assert.strictEqual(new Set(placementCatalog.roles.flatMap(role => role.changeKinds)).size, 40);
assert.strictEqual(placementCatalog.directionRoleHints.length, 29);
assert.strictEqual(new Set(placementCatalog.directionRoleHints.map(item => item.directionId)).size, 29);

const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
assert(readme.includes('standalone-capability-router.js'));
assert(readme.includes('software-directions/direction-stack.js'));
assert(readme.includes('frontier-direction-workbench.js'));
assert(readme.includes('adapters/adapter-plane.js'));
assert(readme.includes('placement/placement-plane.js'));
assert(readme.includes('placement/project-map-hand.js'));
assert(readme.includes('placement/workspace-edit-hand.js'));
assert(readme.includes('placement/edit-graph-plane.js'));
assert(readme.includes('placement/workspace-edit-graph-hand.js'));
assert(readme.includes('placement/hand-foundry-plane.js'));
assert(readme.includes('placement/spawned-parser-hand.js'));
assert(readme.includes('placement/bounded-python-record-transform-author-hand.js'));
assert(readme.includes('placement/bounded-python-record-transform-verifier-adapter.js'));
assert(readme.includes('placement/bounded-python-recipe-registry.js'));
assert(readme.includes('placement/bounded-python-required-fields-author-hand.js'));
assert(readme.includes('placement/bounded-python-required-fields-verifier-adapter.js'));
assert(readme.includes('placement/foundry-activation-plane.js'));
assert(readme.includes('node testing/run-all.js'));

console.log(JSON.stringify({
  ok: true,
  languageDirectoryCount: organDirectories.length,
  perLanguagePayloadCount: payloadCount,
  parsedJsonFileCount: jsonFiles.length,
  softwareDirectionProfileCount: directionCatalog.profiles.length,
  softwareDirectionAxisCount: Object.keys(directionAxes.axes).length,
  frontierDirectionTrialCount: frontierTrials.method.trialCount,
  concreteAdapterCount: adapterCatalog.adapters.length,
  unsupportedVerifierAdapterCount: adapterCatalog.knownUnsupportedVerifierIds.length,
  placementRoleCount: placementCatalog.roles.length,
  placementChangeKindCount: placementCatalog.roles.flatMap(role => role.changeKinds).length,
  placementDirectionHintCount: placementCatalog.directionRoleHints.length,
  editGraphMaxTargetCount: editGraphPlaneContract.limits.maxTargets,
  handFoundryMaxPlacementPlans: handFoundryPlaneContract.limits.maxPlacementPlans,
  symlinkCount: 0,
  submoduleFilePresent: false,
  capabilityContractAuthority: contract.authority
}, null, 2));
