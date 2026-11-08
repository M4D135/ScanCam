import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoConstraints, createCameraController, describeCamera } from '../src/camera.js';

const clone = (value) => structuredClone(value);
const capabilities = {
  focusMode: ['manual', 'continuous'],
  focusDistance: { min: 0.1, max: 10, step: 0.1 },
  zoom: { min: 1, max: 4, step: 0.25 },
  exposureMode: ['manual', 'continuous'],
  exposureCompensation: { min: -2, max: 2, step: 0.5 },
  exposureTime: { min: 10, max: 1000, step: 10 },
  brightness: { min: 0, max: 100, step: 5 },
  contrast: { min: 0, max: 100, step: 1 },
  sharpness: { min: 0, max: 10, step: 1 },
  whiteBalanceMode: ['continuous', 'manual'],
  colorTemperature: { min: 2500, max: 7500, step: 100 },
  torch: [false, true],
};
const defaults = {
  width: 1920, height: 1080, frameRate: 29.97,
  focusMode: 'continuous', focusDistance: 2,
  zoom: 1, exposureMode: 'continuous', exposureCompensation: 0,
  exposureTime: 100, brightness: 50, contrast: 50, sharpness: 5,
  whiteBalanceMode: 'continuous', colorTemperature: 5000, torch: false,
  deviceId: 'mock-device-private', groupId: 'mock-group-private',
};

/** A minimal track with independently observable hardware and constraints. */
class FakeTrack extends EventTarget {
  constructor({ caps = capabilities, settings = defaults, constraints, apply } = {}) {
    super();
    this.kind = 'video';
    this.readyState = 'live';
    this.caps = clone(caps);
    this.settings = clone(settings);
    this.constraints = clone(constraints || {
      width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 15, max: 30 },
      deviceId: { exact: 'mock-device-private' },
    });
    this.calls = [];
    this.apply = apply;
    this.inFlight = 0;
    this.maxInFlight = 0;
  }
  getCapabilities() { return clone(this.caps); }
  getSettings() { return clone(this.settings); }
  getConstraints() { return clone(this.constraints); }
  async applyConstraints(constraints) {
    this.calls.push(clone(constraints));
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      if (this.apply) await this.apply(constraints, this);
      else this.applyHardware(constraints);
      this.constraints = clone(constraints);
    } finally {
      this.inFlight -= 1;
    }
  }
  applyHardware(constraints) {
    // Only camera control values change here. Actual stream dimensions stay
    // distinct from the preferred width/height in getConstraints().
    for (const block of [constraints, ...(constraints.advanced || [])]) {
      for (const key of Object.keys(capabilities)) {
        if (Object.hasOwn(block, key)) this.settings[key] = clone(block[key]);
      }
    }
  }
  end() {
    this.readyState = 'ended';
    this.dispatchEvent(new Event('ended'));
  }
}

function control(snapshot, key) {
  return snapshot.controls.find((entry) => entry.key === key);
}

test('camera controls come from genuine advertised capabilities and actual settings', () => {
  const track = new FakeTrack();
  const result = describeCamera(track);
  assert.equal(result.active, true);
  assert.equal(result.adjustable, true);
  assert.equal(result.summary, '1920 × 1080 · 30 i/s');
  assert.equal(Object.hasOwn(result.settings, 'deviceId'), false);
  assert.equal(Object.hasOwn(result.settings, 'groupId'), false);
  assert.deepEqual(control(result, 'focusMode').options, [
    { value: 'manual', label: 'Manuel' },
    { value: 'continuous', label: 'Automatique continu' },
  ]);
  assert.equal(control(result, 'focusDistance').value, 2);
  assert.equal(control(result, 'focusDistance').disabled, true);
  assert.match(control(result, 'focusDistance').help, /manuel/u);
  assert.equal(control(result, 'exposureCompensation').disabled, false);
  assert.equal(control(result, 'exposureTime').disabled, true);
  assert.equal(control(result, 'colorTemperature').disabled, true);
  assert.equal(control(result, 'torch').value, false);
  assert.equal(control(result, 'saturation'), undefined);
});

test('unavailable, fixed, malformed and unobservable camera controls are not presented as usable', () => {
  const track = new FakeTrack({
    caps: {
      focusMode: ['none'], focusDistance: { min: 0, max: 10, step: 1 },
      zoom: { min: 1, max: 4 }, brightness: { min: 0, max: 100, step: 1 },
      contrast: { min: 2, max: 2, step: 1 }, sharpness: { min: 0, max: Infinity },
      torch: [false],
    },
    settings: { width: 640, height: 480, brightness: 40 },
  });
  let result = describeCamera(track);
  assert.deepEqual(result.controls.map(({ key }) => key), ['zoom', 'brightness']);
  assert.equal(control(result, 'zoom').value, null);
  assert.equal(control(result, 'zoom').disabled, true);
  assert.equal(control(result, 'zoom').step, 'any');
  assert.equal(control(result, 'brightness').value, 40);
  result = describeCamera(track, { supportedConstraints: { brightness: true, zoom: false } });
  assert.deepEqual(result.controls.map(({ key }) => key), ['brightness']);
  track.applyConstraints = undefined;
  result = describeCamera(track);
  assert.equal(result.adjustable, false);
  assert.ok(result.controls.every(({ disabled }) => disabled));
  assert.match(result.reason, /navigateur/u);
  track.getCapabilities = () => { throw new Error('not supported'); };
  assert.deepEqual(describeCamera(track).controls, []);
  assert.equal(describeCamera(null).active, false);
  track.end();
  assert.equal(describeCamera(track).summary, 'Caméra arrêtée');
});

test('camera startup requests stay optional for size and frame rate and never request audio', () => {
  assert.deepEqual(buildVideoConstraints(), {
    frameRate: { ideal: 15, max: 30 }, facingMode: { ideal: 'environment' },
  });
  const expected = { hd: [1280, 720], fullhd: [1920, 1080], uhd: [3840, 2160] };
  for (const [resolution, [width, height]] of Object.entries(expected)) {
    assert.deepEqual(buildVideoConstraints({ deviceId: 'selected-camera', resolution, frameRate: '30' }), {
      frameRate: { ideal: 30, max: 30 }, deviceId: { exact: 'selected-camera' },
      width: { ideal: width }, height: { ideal: height },
    });
  }
  for (const value of [{ deviceId: null }, { resolution: '__proto__' }, { frameRate: Infinity }, { frameRate: '' }]) {
    assert.throws(() => buildVideoConstraints(value), TypeError);
  }
});

test('hardware ranges with a partial final step do not receive an out-of-grid value', async () => {
  const track = new FakeTrack({
    caps: { zoom: { min: 1, max: 2, step: 0.3 } }, settings: { zoom: 1 },
  });
  const controller = createCameraController(track);
  await controller.set('zoom', 2);
  assert.equal(track.settings.zoom, 1.9);
  track.settings.zoom = 10;
  const description = controller.describe();
  assert.equal(control(description, 'zoom').value, 10, 'the actual camera value is never replaced by an invented value');
  assert.equal(control(description, 'zoom').disabled, true);
  await assert.rejects(controller.set('zoom', 1.6), /possibilités annoncées/u);
  controller.destroy();
});

test('rapid edits are serialized, clamped to hardware steps and preserve stream constraints', async () => {
  const track = new FakeTrack({
    constraints: {
      width: { ideal: 1920 }, frameRate: { ideal: 15, max: 30 },
      advanced: [{ contrast: 50, focusMode: 'continuous' }],
    },
    apply: async (constraints, camera) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      camera.applyHardware(constraints);
    },
  });
  const controller = createCameraController(track);
  const [zoomResult, brightnessResult] = await Promise.all([
    controller.set('zoom', 99),
    controller.set('brightness', '61.1'),
  ]);
  assert.equal(track.maxInFlight, 1);
  assert.equal(control(zoomResult, 'zoom').value, 4);
  assert.equal(control(brightnessResult, 'brightness').value, 60);
  assert.equal(control(brightnessResult, 'zoom').value, 4);
  assert.deepEqual(track.constraints.width, { ideal: 1920 });
  assert.deepEqual(track.constraints.frameRate, { ideal: 15, max: 30 });
  assert.equal(track.settings.contrast, 50);
  assert.equal(track.settings.focusMode, 'continuous');
  assert.equal(track.constraints.advanced.flatMap(Object.keys).filter((key) => key === 'zoom').length, 1);
  await controller.set('zoom', -5);
  assert.equal(track.settings.zoom, 1);
  controller.destroy();
});

test('manual focus and exposure are gated by mode and stop being imposed when auto returns', async () => {
  const track = new FakeTrack();
  const controller = createCameraController(track);
  await assert.rejects(controller.set('focusDistance', 4), /manuel/u);
  await controller.set('focusMode', 'manual');
  assert.equal(control(controller.describe(), 'focusDistance').disabled, false);
  await controller.set('focusDistance', '3.14');
  assert.equal(track.settings.focusDistance, 3.1);
  await controller.set('focusMode', 'continuous');
  assert.ok(track.constraints.advanced.every((block) => !Object.hasOwn(block, 'focusDistance')));
  await controller.set('exposureMode', 'manual');
  assert.equal(control(controller.describe(), 'exposureCompensation').disabled, true);
  assert.equal(control(controller.describe(), 'exposureTime').disabled, false);
  await controller.set('exposureTime', 220);
  await controller.set('whiteBalanceMode', 'manual');
  await controller.set('colorTemperature', 5900);
  await controller.set('torch', true);
  assert.equal(track.settings.torch, true);
  controller.destroy();
});

test('invalid values and unsupported keys cannot mutate the track or poison the queue', async () => {
  const track = new FakeTrack();
  const controller = createCameraController(track);
  for (const value of [null, undefined, '', ' ', true, {}, [], Infinity, NaN, '0x10', '3px']) {
    await assert.rejects(controller.set('zoom', value), { name: 'TypeError' });
  }
  await assert.rejects(controller.set('torch', 'false'), { name: 'TypeError' });
  await assert.rejects(controller.set('focusMode', 'unsupported'), { name: 'TypeError' });
  await assert.rejects(controller.set('__proto__', 1), { name: 'NotSupportedError' });
  assert.equal(track.calls.length, 0);
  await controller.set('zoom', 1.5);
  assert.equal(track.settings.zoom, 1.5);
  controller.destroy();
});

test('camera rejection refreshes actual values and leaves the next edit usable', async () => {
  const events = [];
  let rejectNext = true;
  const track = new FakeTrack({ apply: (constraints, camera) => {
    if (rejectNext) {
      rejectNext = false;
      const error = new Error('unsupported combination');
      error.name = 'OverconstrainedError';
      throw error;
    }
    camera.applyHardware(constraints);
  } });
  const controller = createCameraController(track, {
    onChange: (snapshot, meta) => events.push({ kind: meta.status, zoom: control(snapshot, 'zoom').value }),
    onError: (error, snapshot) => events.push({ kind: error.name, zoom: control(snapshot, 'zoom').value }),
  });
  await assert.rejects(controller.set('zoom', 3), { name: 'OverconstrainedError' });
  assert.deepEqual(events, [
    { kind: 'failed', zoom: 1 }, { kind: 'OverconstrainedError', zoom: 1 },
  ]);
  assert.equal(control(controller.describe(), 'zoom').value, 1);
  await controller.set('brightness', 75);
  assert.equal(track.settings.zoom, 1);
  assert.equal(track.settings.brightness, 75);
  assert.equal(events.at(-1).kind, 'applied');
  controller.destroy();
});

test('a fulfilled but ignored hardware request is reported as failure rather than fake success', async () => {
  const track = new FakeTrack({ apply: () => {} });
  const controller = createCameraController(track);
  await assert.rejects(controller.set('zoom', 2), /n’a pas confirmé/u);
  assert.equal(track.getConstraints().advanced.at(-1).zoom, 2, 'requested value is not the actual value');
  assert.equal(control(controller.describe(), 'zoom').value, 1);
  track.apply = (constraints, camera) => camera.applyHardware(constraints);
  await controller.set('brightness', 55);
  assert.equal(track.settings.zoom, 1, 'ignored zoom must not be reapplied by the next edit');
  assert.equal(track.settings.brightness, 55);
  controller.destroy();
});

test('a delayed hardware setting is confirmed from getSettings before success', async () => {
  const track = new FakeTrack({ apply: (constraints, camera) => {
    setTimeout(() => camera.applyHardware(constraints), 15);
  } });
  const controller = createCameraController(track);
  const result = await controller.set('zoom', 1.75);
  assert.equal(control(result, 'zoom').value, 1.75);
  controller.destroy();
});

test('reset restores values captured before automatic focus was changed and retains resolution', async () => {
  const track = new FakeTrack({ settings: { ...defaults, focusMode: 'manual', focusDistance: 1.2 } });
  const controller = createCameraController(track);
  await controller.set('focusMode', 'continuous');
  await controller.set('zoom', 2.5);
  await controller.set('brightness', 70);
  await controller.set('torch', true);
  await controller.set('exposureMode', 'manual');
  await controller.set('exposureTime', 300);
  const result = await controller.reset();
  for (const [key, value] of Object.entries({
    focusMode: 'manual', focusDistance: 1.2, zoom: 1, brightness: 50,
    torch: false, exposureMode: 'continuous', exposureCompensation: 0,
  })) {
    assert.equal(control(result, key).value, value);
  }
  assert.ok(track.constraints.advanced.every((block) => !Object.hasOwn(block, 'exposureTime')));
  assert.deepEqual(track.constraints.width, { ideal: 1920 });
  assert.deepEqual(track.constraints.height, { ideal: 1080 });
  const applied = track.calls.length;
  await controller.reset();
  assert.equal(track.calls.length, applied, 'a second unchanged reset does not reapply settings');
  controller.destroy();
});

test('destroying or ending a track cancels queued changes and suppresses stale callbacks', async () => {
  for (const stop of ['destroy', 'ended']) {
    let finish;
    let entered;
    const started = new Promise((resolve) => { entered = resolve; });
    const blocked = new Promise((resolve) => { finish = resolve; });
    const callbacks = [];
    const track = new FakeTrack({ apply: async (constraints, camera) => {
      entered();
      await blocked;
      camera.applyHardware(constraints);
    } });
    const controller = createCameraController(track, {
      onChange: () => callbacks.push('change'), onError: () => callbacks.push('error'),
    });
    const first = controller.set('zoom', 2);
    const second = controller.set('brightness', 80);
    const outcomes = Promise.allSettled([first, second]);
    await started;
    if (stop === 'destroy') controller.destroy();
    else track.end();
    finish();
    for (const result of await outcomes) {
      assert.equal(result.status, 'rejected');
      assert.equal(result.reason.name, 'AbortError');
    }
    assert.equal(track.calls.length, 1);
    assert.deepEqual(callbacks, []);
    assert.equal(controller.describe().active, false);
    assert.equal(track.readyState, stop === 'destroy' ? 'live' : 'ended', 'the owner remains responsible for stopping its track');
  }
});
