'use strict';

const crypto = require('crypto');
const directions = require('../direction-registry.js');
const catalog = require('./placement-catalog.json');

let ROLES = null;
let HINTS = null;
let SNAPSHOT = null;

function canon(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canon(value[key])}`).join(',')}}`;
}

function hash(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : canon(value)).digest('hex');
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}

function strings(value, code, {allowEmpty = false, pattern = null} = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw Error(`${code}_NOT_ARRAY_OR_EMPTY`);
  if (value.some(item => typeof item !== 'string' || !item.trim())) throw Error(`${code}_ITEM_INVALID`);
  if (new Set(value).size !== value.length) throw Error(`${code}_DUPLICATE`);
  if (pattern && value.some(item => !pattern.test(item))) throw Error(`${code}_FORMAT_INVALID`);
}

function build() {
  if (catalog.schema !== 'axm.code.placement-role-catalog.v1' || catalog.version !== '1.0.0' || catalog.status !== 'TEST' || catalog.authority !== 'NONE') throw Error('PLACEMENT_CATALOG_INVALID');
  if (!Array.isArray(catalog.roles) || catalog.roles.length !== 10) throw Error('PLACEMENT_ROLE_COUNT_INVALID');
  const roleIds = catalog.roles.map(role => role.id);
  strings(roleIds, 'PLACEMENT_ROLE_IDS', {pattern: /^[a-z]+(?:-[a-z]+)*$/});
  const directories = catalog.roles.map(role => role.directory);
  strings(directories, 'PLACEMENT_ROLE_DIRECTORIES', {pattern: /^[a-z]+(?:-[a-z]+)*$/});
  const kinds = [];
  const roles = catalog.roles.map(role => {
    if (typeof role.responsibility !== 'string' || !role.responsibility.trim()) throw Error(`PLACEMENT_ROLE_RESPONSIBILITY_INVALID:${role.id}`);
    strings(role.changeKinds, `PLACEMENT_ROLE_CHANGE_KINDS:${role.id}`, {pattern: /^[a-z]+(?:-[a-z]+)*$/});
    kinds.push(...role.changeKinds);
    const body = {...role, schema: 'axm.code.placement-role.v1', version: '1.0.0', status: 'TEST', authority: 'NONE'};
    return freeze({...body, roleSha256: hash(body)});
  });
  if (new Set(kinds).size !== kinds.length) throw Error('PLACEMENT_CHANGE_KIND_AMBIGUOUS');

  if (!Array.isArray(catalog.directionRoleHints) || catalog.directionRoleHints.length !== 29) throw Error('PLACEMENT_DIRECTION_HINT_COUNT_INVALID');
  const knownDirections = new Set(directions.all().map(profile => profile.id));
  const hintIds = catalog.directionRoleHints.map(item => item.directionId);
  strings(hintIds, 'PLACEMENT_DIRECTION_HINT_IDS', {pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/});
  if (hintIds.some(id => !knownDirections.has(id)) || [...knownDirections].some(id => !hintIds.includes(id))) throw Error('PLACEMENT_DIRECTION_HINT_COVERAGE_INVALID');
  const roleSet = new Set(roleIds);
  const hints = catalog.directionRoleHints.map(item => {
    strings(item.preferredRoles, `PLACEMENT_DIRECTION_ROLES:${item.directionId}`);
    if (item.preferredRoles.some(id => !roleSet.has(id))) throw Error(`PLACEMENT_DIRECTION_ROLE_UNKNOWN:${item.directionId}`);
    return freeze({...item});
  });
  return {roles: freeze(roles), hints: freeze(hints)};
}

function ensure() {
  if (!ROLES) {
    const built = build();
    ROLES = built.roles;
    HINTS = built.hints;
  }
}

function all() { ensure(); return ROLES; }
function get(id) { return all().find(role => role.id === id) || null; }
function roleForKind(kind) { return all().find(role => role.changeKinds.includes(kind)) || null; }
function hint(directionId) { ensure(); return HINTS.find(item => item.directionId === directionId) || null; }

function snapshot() {
  if (!SNAPSHOT) {
    ensure();
    const body = {
      schema: 'axm.code.placement-registry-snapshot.v1',
      roleCount: ROLES.length,
      changeKindCount: ROLES.reduce((sum, role) => sum + role.changeKinds.length, 0),
      directionHintCount: HINTS.length,
      roles: ROLES.map(role => ({id: role.id, roleSha256: role.roleSha256})),
      directionHintsSha256: hash(HINTS),
      authority: 'NONE'
    };
    SNAPSHOT = freeze({...body, snapshotSha256: hash(body)});
  }
  return SNAPSHOT;
}

module.exports = {all, get, roleForKind, hint, snapshot, canon, hash};
