import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeScanShortcut, shortcutFromEvent, presetScanShortcut, matchesScanShortcut,
} from '../src/scan-shortcuts.js';

const event = (key, code = '', extra = {}) => ({ type: 'keydown', key, code, ...extra });

test('saved shortcut validation bounds input and replaces untrusted labels without mutating data', () => {
  const saved = Object.freeze({ key: 'A', code: 'KeyQ', label: '<img src=x onerror=alert(1)>', extra: true });
  const normalized = normalizeScanShortcut(saved);
  assert.deepEqual(normalized, { key: 'a', code: 'KeyQ', label: 'A' });
  assert.deepEqual(normalizeScanShortcut(normalized), normalized);
  assert.equal(saved.label, '<img src=x onerror=alert(1)>');
  for (const value of [null, false, 'a', [], {}, { key: 1 }, { key: 'a'.repeat(33) },
    { key: 'a', code: 'x'.repeat(41) }, { key: 'a', code: {} }, { key: 'a', code: 'F5' },
    { key: 'Enter', code: 'KeyA' }, { key: 'a', ctrlKey: true }, { key: 'a', shiftKey: true }]) {
    assert.equal(normalizeScanShortcut(value), null);
  }
});

test('navigation, editing, browser keys and ambiguous keys cannot become a scan shortcut', () => {
  for (const key of ['Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft',
    'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'F1', 'F5', 'F11', 'F12', 'F13',
    'Control', 'Alt', 'Meta', 'Shift', 'AltGraph', 'CapsLock', 'Unidentified', 'Dead',
    'Process', 'AudioVolumeMute', 'CameraFocus', '+', '/', 'ab', '\n']) {
    assert.equal(shortcutFromEvent(event(key)), null, key);
  }
  for (const key of ['F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10']) {
    assert.equal(shortcutFromEvent(event(key, key)).key, key);
  }
});

test('learning and triggering reject modifiers, composition, repeats and consumed events', () => {
  const binding = presetScanShortcut('space');
  for (const extra of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true },
    { repeat: true }, { isComposing: true }, { defaultPrevented: true }, { type: 'keyup' },
    { getModifierState: (modifier) => modifier === 'AltGraph' }]) {
    const received = event(' ', 'Space', extra);
    assert.equal(shortcutFromEvent(received), null);
    assert.equal(matchesScanShortcut(received, binding), false);
  }
  assert.equal(shortcutFromEvent(null), null);
  assert.equal(shortcutFromEvent('AudioVolumeUp'), null);
});

test('presets remain logical keys, including legacy Spacebar and numeric Enter', () => {
  assert.equal(presetScanShortcut('none'), null);
  assert.equal(presetScanShortcut('unexpected'), null);
  assert.equal(presetScanShortcut('custom', { key: 'Escape' }), null);
  const space = presetScanShortcut('space');
  assert.deepEqual(space, { key: ' ', code: '', label: 'Espace' });
  for (const key of [' ', 'Spacebar', 'Space']) assert.equal(matchesScanShortcut(event(key, 'Space'), space), true);
  const enter = presetScanShortcut('enter');
  for (const code of ['', 'Enter', 'NumpadEnter']) assert.equal(matchesScanShortcut(event('Enter', code), enter), true);
  assert.equal(matchesScanShortcut(event('a', 'KeyA'), enter), false);
});

test('learned physical keys survive keyboard layout changes and distinguish different positions', () => {
  const azerty = shortcutFromEvent(event('a', 'KeyQ'));
  assert.equal(matchesScanShortcut(event('q', 'KeyQ'), azerty), true);
  assert.equal(matchesScanShortcut(event('a', 'KeyA'), azerty), false);
  assert.equal(matchesScanShortcut(event('a', ''), azerty), true);
  assert.equal(matchesScanShortcut(event('a', 'Unidentified'), azerty), true);
  assert.equal(matchesScanShortcut(event('q', ''), azerty), false);
  assert.equal(matchesScanShortcut(event('a', 'KeyQ'), { key: 'a', code: '' }), true);
});

test('non-US letter and digit keys normalize safely and survive a storage round trip', () => {
  for (const received of [event('É', 'Digit2'), event('ù', 'Quote'), event('e\u0301', 'KeyE'),
    event('8', 'Numpad8'), event('Ж', 'KeyV'), event('İ', 'KeyI')]) {
    const learned = shortcutFromEvent(received);
    assert.notEqual(learned, null);
    assert.deepEqual(normalizeScanShortcut(JSON.parse(JSON.stringify(learned))), learned);
    assert.equal(matchesScanShortcut(received, learned), true);
    assert.ok(learned.label.length <= 32);
  }
});

test('volume and camera aliases are interpreted only when an actual key value is supplied', () => {
  for (const [oldKey, key, label] of [
    ['VolumeUp', 'AudioVolumeUp', 'Volume +'],
    ['VolumeDown', 'AudioVolumeDown', 'Volume −'],
    ['Camera', 'Camera', 'Caméra'],
  ]) {
    assert.equal(shortcutFromEvent({ type: 'keydown', code: key }), null, 'a code alone is not evidence of a usable key');
    const received = event(oldKey, oldKey);
    assert.deepEqual(shortcutFromEvent(received), { key, code: key, label });
    assert.equal(matchesScanShortcut(event(key), shortcutFromEvent(received)), true);
    assert.equal(presetScanShortcut(oldKey), null, 'hardware support is never fabricated as a preset');
  }
  assert.equal(shortcutFromEvent({ keyCode: 24 }), null, 'Android native numeric key codes are not DOM key values');
  assert.equal(shortcutFromEvent(event('Unidentified', 'AudioVolumeUp')), null);
});

test('custom and unmatched bindings are handled independently without side effects', () => {
  const custom = Object.freeze({ key: 'r', code: 'KeyR', label: 'incorrect' });
  assert.deepEqual(presetScanShortcut('custom', custom), { key: 'r', code: 'KeyR', label: 'R' });
  assert.equal(matchesScanShortcut(event('r', 'KeyR'), custom), true);
  assert.equal(matchesScanShortcut(event('r', 'KeyR'), null), false);
  assert.equal(matchesScanShortcut(event('r', 'KeyR'), { key: 'F5' }), false);
  assert.equal(custom.label, 'incorrect');
});
