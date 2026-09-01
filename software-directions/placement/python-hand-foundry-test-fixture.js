'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const placementPlane = require('./placement-plane.js');
const projectMapHand = require('./project-map-hand.js');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function put(root, relative, content) { const target = path.join(root, ...relative.split('/')); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, content); }
function moduleValue({id, modulePath, role, kind, owner, verifies = [], exports = []}) { return {id, path: modulePath, role, status: 'active', mutable: true, accepts: [kind], owns: [owner], directionIds: ['backend-api'], exports, verifies}; }

function snapshot(root) {
  const values = [];
  function walk(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const target = path.join(directory, name); const relative = path.relative(root, target).split(path.sep).join('/'); const stat = fs.lstatSync(target);
      if (stat.isDirectory()) { values.push({path: relative, type: 'directory'}); walk(target); }
      else values.push({path: relative, type: 'file', sha256: sha256(fs.readFileSync(target)), mode: stat.mode & 0o777});
    }
  }
  walk(root); return values;
}

function candidate(lane, targetPath, content) {
  return {schema: 'axm.code.edit-candidate.v1', version: '1.0.0', lane, targetPath, languageId: 'python', content, contentSha256: sha256(Buffer.from(content, 'utf8'))};
}

function create(prefix = 'axm-python-hand-foundry-') {
  const harnessRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); const workspaceRoot = path.join(harnessRoot, 'workspace');
  fs.mkdirSync(workspaceRoot);
  const files = {
    'src/domain/pricing.py': 'def calculate_total(cents: int) -> int:\n    return cents\n',
    'testing/domain/pricing_test.py': 'from src.domain.pricing import calculate_total\n\n\ndef test_total() -> None:\n    assert calculate_total(1200) == 1200\n',
    'src/application/checkout.py': 'def checkout(total: int) -> dict[str, int]:\n    return {"total": total}\n',
    'testing/application/checkout_test.py': 'from src.application.checkout import checkout\n\n\ndef test_checkout() -> None:\n    assert checkout(4) == {"total": 4}\n',
    'src/boundary/api.py': 'def health() -> dict[str, str]:\n    return {"status": "ok"}\n',
    'testing/boundary/api_test.py': 'from src.boundary.api import health\n\n\ndef test_health() -> None:\n    assert health()["status"] == "ok"\n'
  };
  for (const [relative, content] of Object.entries(files)) put(workspaceRoot, relative, content);
  const modules = [
    moduleValue({id: 'pricing-domain', modulePath: 'src/domain/pricing.py', role: 'domain', kind: 'rule', owner: 'PRICING_CORE', exports: ['calculate_total']}),
    moduleValue({id: 'pricing-verification', modulePath: 'testing/domain/pricing_test.py', role: 'verification', kind: 'test', owner: 'PRICING_TESTS', verifies: ['src/domain/pricing.py']}),
    moduleValue({id: 'checkout-application', modulePath: 'src/application/checkout.py', role: 'application', kind: 'workflow', owner: 'CHECKOUT_FLOW', exports: ['checkout']}),
    moduleValue({id: 'checkout-verification', modulePath: 'testing/application/checkout_test.py', role: 'verification', kind: 'test', owner: 'CHECKOUT_TESTS', verifies: ['src/application/checkout.py']}),
    moduleValue({id: 'api-boundary', modulePath: 'src/boundary/api.py', role: 'boundary', kind: 'api', owner: 'API_BOUNDARY', exports: ['health']}),
    moduleValue({id: 'api-verification', modulePath: 'testing/boundary/api_test.py', role: 'verification', kind: 'test', owner: 'API_TESTS', verifies: ['src/boundary/api.py']})
  ];
  const declaration = {
    schema: 'axm.code.project-map-declaration.v1', version: '1.0.0', projectId: 'python-production-shaped-fixture', languageId: 'python',
    conventions: {sourceRoot: 'src', testRoot: 'testing', fileExtension: '.py', languageBinding: {kind: 'extension', signal: '.py'}, sourceFilePattern: '{name}{ext}', roleDirectory: true, testFilePattern: '{name}_test{ext}', naming: 'kebab-case'},
    modules, protectedPaths: []
  };
  const observation = projectMapHand.inspect({workspaceRoot, declaration});
  if (observation.result !== 'PROJECT_MAP_OBSERVED_READ_ONLY') throw Error(`PYTHON_FOUNDRY_FIXTURE_OBSERVATION_FAILED:${observation.errorCode}`);
  const change = {schema: 'axm.code.change-intent.v1', changeId: 'pricing-rounding-change', directionId: 'backend-api', kind: 'rule', name: 'pricing', ownerSignals: ['PRICING_CORE'], expectedExports: ['calculate_total'], dependencyModuleIds: [], requestedVerifiers: ['unit-test']};
  const placementPlan = placementPlane.plan({projectMapObservation: observation, change});
  if (placementPlan.result !== 'PLACEMENT_PLAN_READY_NO_MUTATION_AUTHORITY') throw Error(`PYTHON_FOUNDRY_FIXTURE_PLAN_FAILED:${placementPlan.errorCode}`);
  const source = candidate('source', placementPlan.sourcePlacement.targetPath, 'def calculate_total(cents: int) -> int:\n    """Round an integer-cent total without losing precision."""\n    return cents\n');
  const verification = candidate('verification', placementPlan.verificationPlacement.targetPath, 'from src.domain.pricing import calculate_total\n\n\ndef test_total() -> None:\n    assert calculate_total(1200) == 1200\n');
  const invalidSource = candidate('source', placementPlan.sourcePlacement.targetPath, 'def calculate_total(cents: int) -> int\n    return cents\n');
  return {harnessRoot, workspaceRoot, declaration, observation, change, placementPlan, candidates: {source, verification, invalidSource}, before: snapshot(workspaceRoot)};
}

module.exports = {create, snapshot, candidate, sha256};
