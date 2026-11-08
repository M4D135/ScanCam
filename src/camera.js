/**
 * Camera controls use only capabilities advertised by the active video track.
 * No device identifiers or hardware settings are persisted by this module.
 *
 * References:
 * https://w3c.github.io/mediacapture-image/#mediatrackcapabilities-dictionary
 * https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings
 */

const MODE_LABELS = Object.freeze({
  none: 'Désactivé',
  manual: 'Manuel',
  'single-shot': 'Automatique ponctuel',
  continuous: 'Automatique continu',
});

const DEFINITIONS = Object.freeze([
  { key: 'focusMode', label: 'Mise au point', type: 'select' },
  { key: 'focusDistance', label: 'Distance de mise au point', type: 'range',
    mode: 'focusMode', modes: ['manual'], help: 'Ajuste jusqu’à distinguer nettement les traits ou les petits carrés du code.' },
  { key: 'zoom', label: 'Zoom de la caméra', type: 'range',
    help: 'Garde le code entier et une marge autour de lui.' },
  { key: 'exposureMode', label: 'Exposition', type: 'select' },
  { key: 'exposureCompensation', label: 'Correction d’exposition', type: 'range', unit: 'EV',
    mode: 'exposureMode', modes: ['continuous', 'single-shot'],
    help: 'Diminue si une étiquette claire ou métallique semble surexposée.' },
  { key: 'exposureTime', label: 'Temps d’exposition', type: 'range', unit: '× 0,1 ms',
    mode: 'exposureMode', modes: ['manual'],
    help: 'Un temps plus court limite le flou de mouvement, mais demande davantage de lumière.' },
  { key: 'brightness', label: 'Luminosité de la caméra', type: 'range' },
  { key: 'contrast', label: 'Contraste de la caméra', type: 'range' },
  { key: 'sharpness', label: 'Netteté de la caméra', type: 'range' },
  { key: 'saturation', label: 'Saturation', type: 'range' },
  { key: 'whiteBalanceMode', label: 'Balance des blancs', type: 'select' },
  { key: 'colorTemperature', label: 'Température des couleurs', type: 'range', unit: 'K',
    mode: 'whiteBalanceMode', modes: ['manual'] },
  { key: 'torch', label: 'Éclairage de la caméra', type: 'checkbox' },
]);

const KEYS = new Set(DEFINITIONS.map(({ key }) => key));
const RESOLUTIONS = Object.freeze({
  hd: [1280, 720], fullhd: [1920, 1080], uhd: [3840, 2160],
});

function readTrack(track, method) {
  try {
    const value = typeof track?.[method] === 'function' ? track[method]() : null;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function browserSupport() {
  try {
    const devices = globalThis.navigator?.mediaDevices;
    return typeof devices?.getSupportedConstraints === 'function'
      ? devices.getSupportedConstraints() : null;
  } catch {
    return null;
  }
}

function liveTrack(track) {
  return Boolean(track && track.readyState !== 'ended' && (!track.kind || track.kind === 'video'));
}

function modesFor(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((mode) => typeof mode === 'string' && Object.hasOwn(MODE_LABELS, mode)))]
    : [];
}

function rangeFor(value) {
  if (!value || !Number.isFinite(value.min) || !Number.isFinite(value.max) || value.min >= value.max) return null;
  return {
    min: value.min,
    max: value.max,
    // "any" means that the device has not specified a positive step. It does
    // not invent a hardware precision or round a continuous focus control.
    step: Number.isFinite(value.step) && value.step > 0 ? value.step : 'any',
  };
}

function hasTorchControl(value) {
  // Older Image Capture implementations used a boolean capability.
  return value === true || (Array.isArray(value) && value.includes(true) && value.includes(false));
}

function valueKnown(definition, value) {
  if (definition.type === 'range') return Number.isFinite(value);
  if (definition.type === 'select') return typeof value === 'string' && Object.hasOwn(MODE_LABELS, value);
  return typeof value === 'boolean';
}

function reasonForMode(definition) {
  if (definition.modes.includes('manual')) {
    if (definition.mode === 'focusMode') return 'Passe la mise au point en mode manuel pour ajuster la distance.';
    if (definition.mode === 'whiteBalanceMode') return 'Passe la balance des blancs en mode manuel pour ajuster la température.';
    return 'Passe l’exposition en mode manuel pour ajuster sa durée.';
  }
  return 'Passe l’exposition en mode automatique pour ajuster sa correction.';
}

function describe(track, supportedConstraints, forceInactive = false) {
  const active = !forceInactive && liveTrack(track);
  const capabilities = active ? readTrack(track, 'getCapabilities') : {};
  const rawSettings = active ? readTrack(track, 'getSettings') : {};
  // Expose only presentation values. deviceId/groupId never leave the module.
  const settings = {};
  for (const key of ['width', 'height', 'frameRate', ...KEYS]) {
    if (Object.hasOwn(rawSettings, key)) settings[key] = rawSettings[key];
  }
  const canApply = active && typeof track.applyConstraints === 'function';
  const controls = [];

  for (const definition of DEFINITIONS) {
    const { key, label, type } = definition;
    if (supportedConstraints && supportedConstraints[key] !== true) continue;
    const capability = capabilities[key];
    let details;
    if (type === 'select') {
      const values = modesFor(capability);
      if (values.length < 2) continue;
      details = { options: values.map((value) => ({ value, label: MODE_LABELS[value] })) };
    } else if (type === 'range') {
      details = rangeFor(capability);
      if (!details) continue;
    } else if (!hasTorchControl(capability)) continue;

    if (definition.mode) {
      const possibleModes = new Set([...modesFor(capabilities[definition.mode]), rawSettings[definition.mode]]);
      if (!definition.modes.some((mode) => possibleModes.has(mode))) continue;
    }

    const known = valueKnown(definition, rawSettings[key]);
    const inRange = !known || type !== 'range' || (rawSettings[key] >= details.min && rawSettings[key] <= details.max);
    const advertisedMode = !known || type !== 'select' || details.options.some((option) => option.value === rawSettings[key]);
    const modeEnabled = !definition.mode || definition.modes.includes(rawSettings[definition.mode]);
    const disabled = !canApply || !known || !inRange || !advertisedMode || !modeEnabled;
    let help = definition.help || '';
    if (!canApply) help = 'Ce navigateur ne permet pas de modifier les réglages de cette caméra.';
    else if (!known) help = 'La caméra ne communique pas la valeur actuelle de ce réglage.';
    else if (!inRange || !advertisedMode) help = 'La valeur actuelle ne correspond pas aux possibilités annoncées par la caméra.';
    else if (!modeEnabled) help = reasonForMode(definition);
    controls.push({
      key, label, type, ...details,
      value: known ? rawSettings[key] : null,
      disabled, help, unit: definition.unit || '',
    });
  }

  const dimensions = Number.isFinite(settings.width) && Number.isFinite(settings.height)
    ? `${settings.width} × ${settings.height}` : '';
  const cadence = Number.isFinite(settings.frameRate) && settings.frameRate > 0
    ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(settings.frameRate)} i/s` : '';
  const summary = !active ? 'Caméra arrêtée' : [dimensions, cadence].filter(Boolean).join(' · ') || 'Caméra active';
  return {
    active, controls, settings, summary,
    adjustable: controls.some(({ disabled }) => !disabled),
    reason: !active ? 'Active la webcam pour accéder à ses réglages.'
      : !canApply ? 'Les réglages matériels ne sont pas disponibles dans ce navigateur.'
        : controls.length === 0 ? 'Cette caméra ne propose pas de réglages matériels accessibles au navigateur.' : '',
  };
}

/** Inspect the active camera without requesting permissions or changing it. */
export function describeCamera(track, { supportedConstraints = browserSupport() } = {}) {
  return describe(track, supportedConstraints);
}

/**
 * Build the video part of a getUserMedia request; the caller supplies audio:false.
 * Sizes/rates are preferences, not promises. Display the actual getSettings()
 * values after opening the camera. "auto" lets the browser choose the size.
 */
export function buildVideoConstraints({ deviceId = '', resolution = 'auto', frameRate = 15 } = {}) {
  if (typeof deviceId !== 'string') throw new TypeError('Identifiant de caméra invalide.');
  if (resolution !== 'auto' && !Object.hasOwn(RESOLUTIONS, resolution)) throw new TypeError('Résolution inconnue.');
  const rate = typeof frameRate === 'string' && /^(15|30)$/u.test(frameRate) ? Number(frameRate) : frameRate;
  if (rate !== 15 && rate !== 30) throw new TypeError('Cadence inconnue.');
  const constraints = {
    frameRate: { ideal: rate, max: 30 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
  };
  if (resolution !== 'auto') {
    const [width, height] = RESOLUTIONS[resolution];
    constraints.width = { ideal: width };
    constraints.height = { ideal: height };
  }
  return constraints;
}

function copy(value) {
  // Constraint dictionaries contain only structured data. Make an independent
  // copy so neither this module nor a browser mock can mutate another call.
  return JSON.parse(JSON.stringify(value));
}

function controlError(message, name = 'NotSupportedError', cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = name;
  return error;
}

function normalize(control, value) {
  if (control.type === 'range') {
    const numeric = typeof value === 'number' ? value
      : typeof value === 'string' && value.trim() && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value.trim())
        ? Number(value) : NaN;
    if (!Number.isFinite(numeric)) throw controlError(`${control.label} : valeur numérique invalide.`, 'TypeError');
    let bounded = Math.min(control.max, Math.max(control.min, numeric));
    if (typeof control.step === 'number') {
      const lastStep = Math.floor((control.max - control.min) / control.step + 1e-9);
      const step = Math.min(lastStep, Math.max(0, Math.round((bounded - control.min) / control.step)));
      bounded = control.min + step * control.step;
    }
    return Number(Math.min(control.max, Math.max(control.min, bounded)).toPrecision(12));
  }
  if (control.type === 'select') {
    if (!control.options.some((option) => option.value === value)) throw controlError(`${control.label} : mode indisponible.`, 'TypeError');
    return value;
  }
  if (typeof value !== 'boolean') throw controlError(`${control.label} : valeur invalide.`, 'TypeError');
  return value;
}

function sameValue(actual, expected) {
  return typeof expected === 'number'
    ? Number.isFinite(actual) && Math.abs(actual - expected) <= Math.max(0.000001, Math.abs(expected) * 0.000001)
    : actual === expected;
}

function removeKeys(constraints, keys) {
  for (const key of keys) delete constraints[key];
  if (Array.isArray(constraints.advanced)) {
    constraints.advanced = constraints.advanced.map((entry) => {
      const result = { ...entry };
      for (const key of keys) delete result[key];
      return result;
    }).filter((entry) => Object.keys(entry).length);
    if (!constraints.advanced.length) delete constraints.advanced;
  }
}

function mergeValues(base, values, settings) {
  const result = copy(base);
  const replaced = new Set(Object.keys(values));
  const effective = { ...settings, ...values };
  // A manual value must not keep being imposed after re-enabling automation.
  for (const definition of DEFINITIONS) {
    if (definition.mode && Object.hasOwn(values, definition.mode) && !definition.modes.includes(effective[definition.mode])) {
      replaced.add(definition.key);
    }
  }
  removeKeys(result, replaced);
  const additions = {};
  for (const definition of DEFINITIONS) {
    if (!Object.hasOwn(values, definition.key)) continue;
    if (definition.mode && !definition.modes.includes(effective[definition.mode])) continue;
    additions[definition.key] = values[definition.key];
  }
  // Image Capture implementations commonly expose these properties through
  // advanced constraints. An optional set can be ignored, so getSettings() is
  // always checked below; a resolved promise alone never counts as success.
  if (Object.keys(additions).length) result.advanced = [...(result.advanced || []), additions];
  return result;
}

function callSafely(callback, ...args) {
  try { callback?.(...args); } catch { /* A rendering error must not poison the settings queue. */ }
}

/**
 * Owns settings for one track. Call destroy() before replacing/stopping it.
 * set() and reset() serialize requests and resolve to the actual camera state.
 * Unsupported, refused or ignored changes reject; onChange still refreshes the
 * real values and onError receives the same error. Aborted old tracks never
 * emit stale callbacks. destroy() deliberately does not stop the track itself.
 */
export function createCameraController(track, {
  onChange, onError, supportedConstraints = browserSupport(),
} = {}) {
  let destroyed = false;
  let queue = Promise.resolve();
  const initial = describe(track, supportedConstraints);
  const initialConstraints = copy(readTrack(track, 'getConstraints'));
  let acceptedConstraints = copy(initialConstraints);
  const changed = new Set();

  function assertActive() {
    if (destroyed || !liveTrack(track)) throw controlError('La caméra a été arrêtée ou remplacée.', 'AbortError');
    if (typeof track.applyConstraints !== 'function') throw controlError('Ce navigateur ne permet pas de régler la caméra.');
  }

  function snapshot() {
    return describe(track, supportedConstraints, destroyed);
  }

  function enqueue(operation, metadata) {
    const pending = queue.then(async () => {
      try {
        assertActive();
        const result = await operation();
        assertActive();
        callSafely(onChange, result, { ...metadata, status: 'applied' });
        return result;
      } catch (error) {
        if (destroyed || !liveTrack(track)) throw controlError('La caméra a été arrêtée ou remplacée.', 'AbortError');
        const current = snapshot();
        callSafely(onChange, current, { ...metadata, status: 'failed' });
        callSafely(onError, error, current);
        throw error;
      }
    });
    // Catch only the queue tail. The promise returned to the UI still rejects.
    queue = pending.catch(() => {});
    return pending;
  }

  async function apply(next, expected, label) {
    try {
      await track.applyConstraints(copy(next));
    } catch (cause) {
      assertActive();
      throw controlError(`${label} : la caméra a refusé ce réglage.`, cause?.name || 'OperationError', cause);
    }
    assertActive();
    let current = snapshot();
    const missing = () => Object.entries(expected).filter(([key, value]) => !sameValue(current.settings[key], value));
    // Some hardware reports focus/zoom changes shortly after applyConstraints
    // resolves. Keep this bounded; never pretend a missing value was applied.
    for (const delay of [40, 80, 120]) {
      if (!missing().length) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      assertActive();
      current = snapshot();
    }
    const unapplied = missing();
    if (unapplied.length) {
      // Do not carry an ignored request into later edits. Preserve any actual
      // value returned by the device instead of the requested slider value.
      const actual = {};
      for (const key of Object.keys(expected)) {
        const definition = DEFINITIONS.find((entry) => entry.key === key);
        if (definition && valueKnown(definition, current.settings[key])) actual[key] = current.settings[key];
      }
      removeKeys(acceptedConstraints, new Set(Object.keys(expected).filter((key) => !Object.hasOwn(actual, key))));
      acceptedConstraints = mergeValues(acceptedConstraints, actual, current.settings);
      throw controlError(`${label} : la caméra n’a pas confirmé ce réglage. Les valeurs affichées restent celles de la caméra.`, 'NotSupportedError');
    }
    acceptedConstraints = next;
    return current;
  }

  function set(key, value) {
    return enqueue(async () => {
      const current = snapshot();
      const control = current.controls.find((entry) => entry.key === key);
      if (!control) throw controlError('Ce réglage n’est pas disponible sur cette caméra.');
      if (control.disabled) throw controlError(control.help || 'Ce réglage n’est pas disponible dans le mode actuel.');
      const requested = normalize(control, value);
      changed.add(key);
      const next = mergeValues(acceptedConstraints, { [key]: requested }, current.settings);
      return apply(next, { [key]: requested }, control.label);
    }, { type: 'set', key });
  }

  function reset() {
    return enqueue(async () => {
      if (!changed.size) return snapshot();
      const values = {};
      for (const definition of DEFINITIONS) {
        const key = definition.key;
        // Restore the initial hardware values we could actually observe. In
        // automatic modes do not freeze the changing exposure/focus values.
        if (!valueKnown(definition, initial.settings[key])) continue;
        if (definition.mode && !definition.modes.includes(initial.settings[definition.mode])) continue;
        if (initial.controls.some((control) => control.key === key) || changed.has(key)) {
          values[key] = initial.settings[key];
        }
      }
      const next = mergeValues(initialConstraints, values, initial.settings);
      const current = await apply(next, values, 'Réinitialisation');
      changed.clear();
      return current;
    }, { type: 'reset' });
  }

  function destroy() {
    destroyed = true;
    track?.removeEventListener?.('ended', destroy);
  }
  track?.addEventListener?.('ended', destroy, { once: true });

  return Object.freeze({ set, reset, destroy, describe: snapshot });
}
