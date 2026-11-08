import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVolume, volumeToGain, playScanBeep } from '../src/sound.js';

test('volume is bounded, quiet at zero, and provides a higher ceiling', () => {
  assert.equal(normalizeVolume('85'), 85);
  assert.equal(normalizeVolume(''), 70);
  assert.equal(normalizeVolume(NaN), 70);
  assert.equal(volumeToGain(-12), 0);
  assert.equal(volumeToGain(0), 0);
  assert.equal(volumeToGain(500), 0.6);
  assert.ok(volumeToGain(70) > 0.075);
  assert.ok(volumeToGain(30) < volumeToGain(70));
});

function audioContext() {
  const voices = [];
  const envelopes = [];
  return {
    state: 'running', currentTime: 10, destination: {}, voices, envelopes,
    createOscillator() {
      const voice = { frequency: { setValueAtTime() {} }, stops: [],
        connect() {}, disconnect() {}, start() {}, stop(time) { this.stops.push(time); } };
      voices.push(voice); return voice;
    },
    createGain() {
      const values = [];
      envelopes.push(values);
      return { connect() {}, disconnect() {}, gain: {
        setValueAtTime(value, time) { values.push([value, time]); },
        linearRampToValueAtTime(value, time) { values.push([value, time]); },
        exponentialRampToValueAtTime(value, time) { values.push([value, time]); },
      }};
    },
  };
}

test('silent or blocked audio creates no voice; overlapping confirmations replace the voice', () => {
  const context = audioContext();
  assert.equal(playScanBeep(context, 0), false);
  assert.equal(context.voices.length, 0);
  assert.equal(playScanBeep({state:'suspended'}, 100), false);
  assert.equal(playScanBeep(context, 100), true);
  assert.ok(context.envelopes[0].every(([value]) => value >= 0 && value <= 0.6));
  assert.equal(playScanBeep(context, 40), true);
  assert.deepEqual(context.voices[0].stops, [10.19, undefined]);
  context.voices[0].onended();
  assert.equal(playScanBeep(context, 40), true);
  assert.deepEqual(context.voices[1].stops, [10.19, undefined]);
  context.voices[2].onended();
});
