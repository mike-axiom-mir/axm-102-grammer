'use strict';

const registry = require('./placement-registry.js');

function contentDigest(value) {
  return registry.hash({referenceFixtureContent: value});
}

function forPacket(packet) {
  if (!packet || packet.schema !== 'axm.code.frontier-direction-build-packet.v1') throw Error('REFERENCE_PLACEMENT_PACKET_INVALID');
  const hint = registry.hint(packet.directionId);
  if (!hint) throw Error(`REFERENCE_PLACEMENT_DIRECTION_UNKNOWN:${packet.directionId}`);
  const role = registry.get(hint.preferredRoles[0]);
  const kind = role.changeKinds[0];
  const signal = `${packet.directionId.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_CORE`;
  const sourcePath = `src/${role.directory}/${packet.directionId}.js`;
  const testPath = `testing/${role.directory}/${packet.directionId}.test.js`;
  const projectMap = {
    schema: 'axm.code.project-map.v1',
    projectId: `reference-${packet.directionId}`,
    languageId: 'javascript',
    conventions: {sourceRoot: 'src', testRoot: 'testing', fileExtension: '.js', testFilePattern: '{name}.test{ext}', naming: 'kebab-case'},
    modules: [
      {id: `${packet.directionId}-core`, path: sourcePath, role: role.id, status: 'active', mutable: true, accepts: [kind], owns: [signal], directionIds: [packet.directionId], exports: ['run'], verifies: [], contentSha256: contentDigest(`${packet.directionId}:source`)},
      {id: `${packet.directionId}-verification`, path: testPath, role: 'verification', status: 'active', mutable: true, accepts: ['test'], owns: [`${signal}_VERIFICATION`], directionIds: [packet.directionId], exports: [], verifies: [sourcePath], contentSha256: contentDigest(`${packet.directionId}:verification`)}
    ],
    protectedPaths: ['src/runtime/bootstrap.js']
  };
  const change = {
    schema: 'axm.code.change-intent.v1',
    changeId: `${packet.directionId}-${packet.level}-change`,
    directionId: packet.directionId,
    kind,
    name: `${packet.directionId}-${packet.level}`,
    ownerSignals: [signal],
    expectedExports: [`run${packet.level[0].toUpperCase()}${packet.level.slice(1)}`],
    dependencyModuleIds: [],
    requestedVerifiers: [...packet.challenge.requestedVerifiers]
  };
  return {projectMap, change};
}

module.exports = {forPacket};
