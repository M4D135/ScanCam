/**
 * Keyboard bindings for the manual scanner. These helpers only interpret events
 * supplied by the caller; a named hardware key is not a capability guarantee.
 */
const KEY_ALIASES = new Map([
  ['Space', ' '], ['Spacebar', ' '],
  ['VolumeUp', 'AudioVolumeUp'], ['VolumeDown', 'AudioVolumeDown'],
]);
const CODE_ALIASES = new Map([
  ['Spacebar', 'Space'], ['VolumeUp', 'AudioVolumeUp'], ['VolumeDown', 'AudioVolumeDown'],
]);
const LABELS = new Map([
  [' ', 'Espace'], ['Enter', 'Entrée'],
  ['AudioVolumeUp', 'Volume +'], ['AudioVolumeDown', 'Volume −'],
  ['Camera', 'Caméra'],
]);
const CHARACTER_KEY = /^[\p{L}\p{N}]$/u;
const FUNCTION_KEY = /^F(?:[2-4]|[6-9]|10)$/;
const LETTER_NUMBER_CODE = /^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9])$/;
// A non-US layout can produce a letter on one of these physical positions.
const OTHER_CHARACTER_CODES = new Set([
  'Backquote', 'Backslash', 'BracketLeft', 'BracketRight', 'Comma', 'Equal',
  'IntlBackslash', 'IntlRo', 'IntlYen', 'Minus', 'Period', 'Quote', 'Semicolon', 'Slash',
]);
const SPECIAL_CODES = new Set(['Space', 'Enter', 'NumpadEnter', 'AudioVolumeUp', 'AudioVolumeDown', 'Camera']);

function unmodified(value) {
  return !value.ctrlKey && !value.altKey && !value.metaKey && !value.shiftKey;
}

function normalizeKey(value) {
  if (typeof value !== 'string' || !value.length || value.length > 32) return null;
  const key = KEY_ALIASES.get(value) ?? value.normalize('NFC');
  if (LABELS.has(key) || FUNCTION_KEY.test(key)) return key;
  if (!CHARACTER_KEY.test(key)) return null;
  const lower = key.toLowerCase();
  // Some Unicode case conversions expand to more than one character. Keep
  // those keys intact so a saved binding always survives normalization again.
  return CHARACTER_KEY.test(lower) ? lower : key;
}

function normalizeCode(value) {
  if (value === undefined || value === '' || value === 'Unidentified') return '';
  if (typeof value !== 'string' || value.length > 40) return null;
  const code = CODE_ALIASES.get(value) ?? value;
  if (SPECIAL_CODES.has(code) || FUNCTION_KEY.test(code)
      || LETTER_NUMBER_CODE.test(code) || OTHER_CHARACTER_CODES.has(code)) return code;
  return null;
}

function compatibleKeyAndCode(key, code) {
  if (!code) return true;
  if (CHARACTER_KEY.test(key)) return LETTER_NUMBER_CODE.test(code) || OTHER_CHARACTER_CODES.has(code);
  if (key === ' ') return code === 'Space';
  if (key === 'Enter') return code === 'Enter' || code === 'NumpadEnter';
  return key === code;
}

/** Validate saved data, discard extra fields and derive a bounded plain label. */
export function normalizeScanShortcut(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !unmodified(value)) return null;
  const key = normalizeKey(value.key);
  const code = normalizeCode(value.code);
  if (key === null || code === null || !compatibleKeyAndCode(key, code)) return null;
  return { key, code, label: LABELS.get(key) ?? key.toUpperCase() };
}

/** Read only the actual received key, never infer a volume/camera event. */
export function shortcutFromEvent(event) {
  if (!event || typeof event !== 'object' || event.repeat || event.isComposing
      || event.defaultPrevented || (event.type && event.type !== 'keydown')) return null;
  if (typeof event.getModifierState === 'function' && event.getModifierState('AltGraph')) return null;
  return normalizeScanShortcut(event);
}

/** Presets use key semantics, so Enter also works on a numeric keypad. */
export function presetScanShortcut(preset, custom) {
  if (preset === 'space') return normalizeScanShortcut({ key: ' ', code: '' });
  if (preset === 'enter') return normalizeScanShortcut({ key: 'Enter', code: '' });
  if (preset === 'custom') return normalizeScanShortcut(custom);
  return null;
}

/** Prefer a learned physical position; fall back to key when a code is absent. */
export function matchesScanShortcut(event, binding) {
  const received = shortcutFromEvent(event);
  const saved = normalizeScanShortcut(binding);
  if (!received || !saved) return false;
  return received.code && saved.code ? received.code === saved.code : received.key === saved.key;
}
