'use strict';

const assert = require('assert');
const fabric = require('./machine-code-keyboard-fabric.js');
const router = require('./machine-code-keyboard-router.js');

const banks = fabric.all();
assert.strictEqual(banks.length, 102, 'exactly 102 keyboard banks');
assert.strictEqual(new Set(banks.map(bank => bank.keyboardSha256)).size, 102, 'unique keyboard digests');

let totalKeys = 0;
for (const bank of banks) {
  assert.strictEqual(bank.keys.length, 48, `${bank.languageId} key count`);
  assert.strictEqual(new Set(bank.keys.map(key => key.keyId)).size, 48, `${bank.languageId} unique key ids`);
  assert.deepStrictEqual(bank.keys.map(key => key.keyId), Array.from({length: 48}, (_, index) => `K${String(index + 1).padStart(2, '0')}`));
  assert.strictEqual(bank.truth.semanticKeyboardNotTextKeyboard, true);
  assert.strictEqual(bank.truth.keyPressIsEditIntentNotSource, true);
  assert.strictEqual(bank.truth.sourceRendererRequiredForSourceMutations, true);
  assert.strictEqual(bank.authority.workspaceRead, false);
  assert.strictEqual(bank.authority.workspaceMutation, false);
  assert.strictEqual(bank.authority.toolExecution, false);
  for (const key of bank.keys) {
    assert.strictEqual(key.sourceCode, null, `${bank.languageId}:${key.keyId} source boundary`);
    assert.strictEqual(key.authority, 'NONE', `${bank.languageId}:${key.keyId} authority`);
    assert(Array.isArray(key.argumentSchema.fields), `${bank.languageId}:${key.keyId} argument schema`);
  }
  totalKeys += bank.keys.length;
}
assert.strictEqual(totalKeys, 4896, '102 x 48 stable semantic keys');

const snapshot = fabric.snapshot();
assert.strictEqual(snapshot.bankCount, 102);
assert.strictEqual(snapshot.keysPerBank, 48);
assert.strictEqual(snapshot.totalStableKeyCount, 4896);
assert(/^[a-f0-9]{64}$/.test(snapshot.snapshotSha256));

const layoutInput = {
  languageId: 'rust',
  role: 'native game runtime',
  intent: 'refactor',
  signals: ['borrow semantics', 'safe refactor', 'tests'],
  hotKeyCount: 12
};
const layout = router.layout(layoutInput);
const repeatedLayout = router.layout(layoutInput);
assert.deepStrictEqual(repeatedLayout, layout, 'same input must produce same layout and digest');
assert.strictEqual(layout.result, 'MACHINE_KEYBOARD_READY');
assert.strictEqual(layout.hotKeys.length, 12);
assert.strictEqual(new Set(layout.hotKeys.map(key => key.hotKeyId)).size, 12);
assert.strictEqual(new Set(layout.hotKeys.map(key => key.stableKeyId)).size, 12);
assert(Object.values(layout.hotboardPolicy.categoryCounts).every(count => count <= 3), 'category cap');
assert.strictEqual(layout.truth.sourceCodeProduced, false);
assert.strictEqual(layout.authority.workspaceMutation, false);

const edit = router.press({languageId: 'rust', keyId: 'K01', arguments: {unitName: 'World'}, targetRef: 'src/world.rs'});
assert.strictEqual(edit.result, 'EDIT_INTENT_READY');
assert.strictEqual(edit.rendering.state, 'RENDER_HELD_NO_ADAPTER');
assert.strictEqual(edit.sourceCode, null);
assert.strictEqual(edit.truth.workspaceMutated, false);
assert.strictEqual(edit.truth.toolExecuted, false);

const control = router.press({languageId: 'rust', keyId: 'K43', arguments: {candidateRef: 'candidate-1'}});
assert.strictEqual(control.result, 'CONTROL_INTENT_READY');
assert.strictEqual(control.rendering.state, 'NON_SOURCE_CONTROL_INTENT');

const hot = router.press({languageId: 'rust', keyId: 'H01', layout, arguments: {targetRef: 'src/world.rs'}});
assert(['EDIT_INTENT_READY', 'CONTROL_INTENT_READY'].includes(hot.result));
assert.strictEqual(hot.hotKeyId, 'H01');
assert.strictEqual(hot.layoutSha256, layout.layoutSha256);

const stale = router.press({languageId: 'rust', keyId: 'H01', layout: {...layout, keyboardSha256: '0'.repeat(64)}});
assert.strictEqual(stale.result, 'STALE_KEYBOARD_LAYOUT');
assert.strictEqual(router.press({languageId: 'rust', keyId: 'H01'}).result, 'HOTKEY_LAYOUT_REQUIRED');
assert.strictEqual(router.press({languageId: 'rust', keyId: 'K99'}).result, 'UNKNOWN_KEY');
assert.strictEqual(router.press({languageId: 'not-a-language', keyId: 'K01'}).result, 'UNKNOWN_LANGUAGE');

const program = router.program({
  languageId: 'rust',
  renderer: {id: 'rust.renderer.test', digest: 'renderer-digest'},
  presses: [
    {keyId: 'K01', arguments: {unitName: 'World'}, targetRef: 'src/world.rs'},
    {keyId: 'K43', arguments: {candidateRef: 'candidate-1'}}
  ]
});
assert.strictEqual(program.result, 'EDIT_PROGRAM_READY');
assert.strictEqual(program.presses.length, 2);
assert.strictEqual(program.sourceCode, null);
assert.strictEqual(program.truth.workspaceMutated, false);
assert.strictEqual(program.truth.toolExecuted, false);
assert(program.invalidates.includes('parse'));
assert(program.verificationHints.length > 0);

const heldProgram = router.program({languageId: 'rust', presses: [{keyId: 'K99'}]});
assert.strictEqual(heldProgram.result, 'PROGRAM_HELD');
assert.strictEqual(router.program({languageId: 'rust', presses: Array(129).fill({keyId: 'K43'})}).result, 'INVALID_PRESS_SEQUENCE');

const mismatch = router.layout({
  languageId: 'rust',
  role: 'renderer',
  prebuildPlan: {result: 'PREBUILD_TWIN_READY', nodes: [{role: 'renderer', state: 'BOUND', boundLanguageId: 'python', families: []}]}
});
assert.strictEqual(mismatch.result, 'ROLE_LANGUAGE_MISMATCH');

console.log(JSON.stringify({
  ok: true,
  bankCount: banks.length,
  keysPerBank: 48,
  totalStableKeyCount: totalKeys,
  layoutHotKeyCount: layout.hotKeys.length,
  editIntentResult: edit.result,
  controlIntentResult: control.result,
  programResult: program.result,
  snapshotSha256: snapshot.snapshotSha256,
  authority: 'NONE'
}, null, 2));
