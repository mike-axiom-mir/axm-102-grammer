'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const ROOT = __dirname;
const REPO_ROOT = path.join(ROOT, '..');
const SCHEMA = 'axm.grammar-102.capability-snapshot.v1';
const DEFAULT_REPO = 'mike-axiom-mir/axm-102-grammer';

const grammar = require('./grammar-profile-registry.js');
const eyes = require('./specialist-eye-registry.js');
const keyboards = require('./machine-code-keyboard-fabric.js');
const mesh = require('./machine-cheatcode-influence-mesh.js');

function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
}
function sha256(v) {
  return crypto.createHash('sha256').update(typeof v === 'string' ? v : canon(v)).digest('hex');
}
function git(args) {
  try {
    return cp.execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}
function isHex(v, n) {
  return typeof v === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(v);
}
function sourceMetadata(input = {}) {
  const commitSha = input.commitSha || process.env.AXM_SOURCE_COMMIT_SHA || git(['rev-parse', 'HEAD']);
  const treeSha = input.treeSha || process.env.AXM_SOURCE_TREE_SHA || git(['rev-parse', 'HEAD^{tree}']);
  const branch = input.branch || process.env.AXM_SOURCE_BRANCH || git(['rev-parse', '--abbrev-ref', 'HEAD']) || null;
  const repoFullName = input.repoFullName || process.env.AXM_SOURCE_REPO || DEFAULT_REPO;
  if (!isHex(commitSha, 40)) throw Error('GRAMMAR_GLASS_EXPORT_SOURCE_COMMIT_REQUIRED');
  if (treeSha != null && !isHex(treeSha, 40)) throw Error('GRAMMAR_GLASS_EXPORT_SOURCE_TREE_INVALID');
  return {repoFullName, commitSha, treeSha: treeSha || null, branch};
}
function item(id, digest) {
  return {id: String(id), digest: String(digest)};
}
function present(layer, metrics, items, digest) {
  return {state: 'PRESENT', digest, ...metrics, items};
}
function unknown(reason) {
  return {state: 'UNKNOWN', reason};
}
function buildSnapshot({source = {}} = {}) {
  const profileSnapshot = grammar.snapshot();
  const profileList = grammar.all();
  const eyeSnapshot = eyes.snapshot();
  const eyeList = eyes.all();
  const keyboardSnapshot = keyboards.snapshot();
  const keyboardBanks = keyboards.all();
  const meshSnapshot = mesh.meshSnapshot();

  if (profileList.length !== 102 || eyeList.length !== 102 || keyboardBanks.length !== 102) {
    throw Error('GRAMMAR_GLASS_EXPORT_102_BODY_INCOMPLETE');
  }

  const languageIds = profileList.map(x => x.languageId).sort();
  if (new Set(languageIds).size !== 102) throw Error('GRAMMAR_GLASS_EXPORT_LANGUAGE_ID_DUPLICATE');

  const specialistItems = eyeList
    .map(x => item(x.languageId, x.eyeSha256))
    .sort((a, b) => a.id.localeCompare(b.id));

  const semanticItems = [];
  for (const bank of keyboardBanks) {
    for (const key of bank.keys) {
      semanticItems.push(item(`${bank.languageId}:${key.keyId}`, sha256(key)));
    }
  }
  semanticItems.sort((a, b) => a.id.localeCompare(b.id));

  const cheatItems = [];
  for (const entry of meshSnapshot.entries) {
    const bank = require('./machine-cheatcode-fabric.js').build(entry.languageId);
    for (const rule of bank.rules) cheatItems.push(item(rule.id, sha256(rule)));
  }
  cheatItems.sort((a, b) => a.id.localeCompare(b.id));

  if (semanticItems.length !== 4896) throw Error(`GRAMMAR_GLASS_EXPORT_KEY_COUNT:${semanticItems.length}`);
  if (cheatItems.length !== 5100) throw Error(`GRAMMAR_GLASS_EXPORT_CHEATCODE_COUNT:${cheatItems.length}`);

  const core = {
    schema: SCHEMA,
    version: '1.0.0',
    source: sourceMetadata(source),
    grammarIdentity: {
      profileCount: profileSnapshot.profileCount,
      profileSnapshotSha256: profileSnapshot.snapshotSha256,
      languageIds
    },
    layers: {
      specialistEyes: present(
        'specialistEyes',
        {eyeCount: eyeSnapshot.eyeCount},
        specialistItems,
        eyeSnapshot.snapshotSha256
      ),
      semanticKeyboards: present(
        'semanticKeyboards',
        {
          bankCount: keyboardSnapshot.bankCount,
          keysPerBank: keyboardSnapshot.keysPerBank,
          totalStableKeyCount: keyboardSnapshot.totalStableKeyCount
        },
        semanticItems,
        keyboardSnapshot.snapshotSha256
      ),
      cheatcodeInfluence: present(
        'cheatcodeInfluence',
        {
          meshCount: meshSnapshot.meshCount,
          nodeCount: meshSnapshot.totalNodeCount,
          edgeCount: meshSnapshot.totalEdgeCount
        },
        cheatItems,
        meshSnapshot.snapshotSha256
      ),
      softwareDirections: unknown('NOT_PRESENT_ON_THIS_EXACT_SOURCE_TREE'),
      capabilityPassports: unknown('NOT_PRESENT_ON_THIS_EXACT_SOURCE_TREE'),
      grammarBridgeAtlas: unknown('NOT_PRESENT_ON_THIS_EXACT_SOURCE_TREE')
    },
    truth: {
      portableSnapshotOnly: true,
      sourceCodeEmbedded: false,
      sourceRepositoryRuntimeDependency: false,
      networkUsed: false,
      grammarGlassImported: false,
      grammarGlassMutationAuthority: false,
      missingLayerIsNotLanguageIncapability: true,
      snapshotIsNotCorrectnessProof: true,
      snapshotIsNotQualityScore: true,
      authority: 'NONE'
    }
  };
  return Object.freeze({...core, capabilitySnapshotSha256: sha256(core)});
}
function parseArgs(argv) {
  const out = {source: {}};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--commit') { out.source.commitSha = value; i++; }
    else if (key === '--tree') { out.source.treeSha = value; i++; }
    else if (key === '--branch') { out.source.branch = value; i++; }
    else if (key === '--repo') { out.source.repoFullName = value; i++; }
    else if (key === '--pretty') out.pretty = true;
    else if (key === '--out') { out.out = value; i++; }
    else throw Error(`GRAMMAR_GLASS_EXPORT_UNKNOWN_ARG:${key}`);
  }
  return out;
}
function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const snapshot = buildSnapshot(args);
  const text = JSON.stringify(snapshot, null, args.pretty ? 2 : 0) + '\n';
  if (args.out) fs.writeFileSync(path.resolve(args.out), text, 'utf8');
  else process.stdout.write(text);
  return snapshot;
}
if (require.main === module) main();
module.exports = {SCHEMA, canon, sha256, sourceMetadata, buildSnapshot, parseArgs, main};
