import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAimedResult, createManualScanner } from '../src/manual-scan.js';

const dimensions = Object.freeze({ width: 1000, height: 800, region: Object.freeze({ x: 120, y: 96, width: 760, height: 608 }) });
const frame = Object.freeze({ ...dimensions, image: Object.freeze({ fixture: 'synthetic-frame' }) });
const code = (text, x = 500, y = 400, format = 'QRCode') => Object.freeze({
  text, format,
  position: Object.freeze({
    topLeft: Object.freeze({ x: x - 15, y: y - 15 }), topRight: Object.freeze({ x: x + 15, y: y - 15 }),
    bottomLeft: Object.freeze({ x: x - 15, y: y + 15 }), bottomRight: Object.freeze({ x: x + 15, y: y + 15 }),
  }),
});
const flush = async () => { for (let i = 0; i < 16; i += 1) await Promise.resolve(); };
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function clock() {
  let time = 0;
  let id = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout: (callback, delay) => {
      const handle = ++id;
      timers.set(handle, { at: time + delay, callback });
      return handle;
    },
    clearTimeout: (handle) => timers.delete(handle),
    pending: () => timers.size,
    jump: (value) => { time = value; },
    async advance(delta) {
      const target = time + delta;
      await flush();
      while (true) {
        const next = [...timers].filter(([, item]) => item.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        time = next[1].at;
        next[1].callback();
        await flush();
      }
      time = target;
      await flush();
    },
  };
}

test('aiming chooses the nearest eligible code, not decoder order or codes outside the crop', () => {
  const outside = code('OUTSIDE', 100, 400);
  const edge = code('EDGE', 140, 110);
  const target = code('TARGET', 501, 402);
  const other = code('OTHER', 600, 460, 'DataMatrix');
  const input = Object.freeze([outside, edge, other, target]);
  assert.strictEqual(chooseAimedResult(input, dimensions), target);
  assert.strictEqual(chooseAimedResult([target, other, edge, outside], dimensions), target);
  assert.equal(chooseAimedResult([outside], dimensions), null);
});

test('aiming uses full-frame coordinates and the supplied target centre', () => {
  const right = code('RIGHT', 750, 400);
  const middle = code('MIDDLE', 500, 400);
  assert.strictEqual(chooseAimedResult([middle, right], {
    width: 1000, height: 800, region: { x: 400, y: 100, width: 600, height: 600 },
  }), right);
  assert.equal(chooseAimedResult([right], { width: 1000, height: 800, region: { x: 900, y: 0, width: 200, height: 100 } }), null);
  assert.equal(chooseAimedResult([right], { width: NaN, height: 800 }), null);
});

test('geometry-free fallback requires one distinct format/content and no contradictory geometry', () => {
  const sole = Object.freeze({ text: 'SOLE', format: 'QRCode' });
  assert.strictEqual(chooseAimedResult([sole, { ...sole }], dimensions), sole);
  assert.equal(chooseAimedResult([sole, { ...sole, format: 'DataMatrix' }], dimensions), null);
  assert.equal(chooseAimedResult([sole, { text: 'OTHER', format: 'QRCode' }], dimensions), null);
  assert.equal(chooseAimedResult([sole, code('SOLE', 950, 400)], dimensions), null);
  assert.equal(chooseAimedResult([{ ...sole, position: { topLeft: { x: NaN, y: 0 } } }], dimensions), null);
  assert.equal(chooseAimedResult([], dimensions), null);
});

test('idle never reads; a trigger accepts one aimed code and overlapping triggers are ignored', async () => {
  const time = clock();
  const waiting = deferred();
  const accepted = [];
  const states = [];
  let captures = 0;
  let decodes = 0;
  const target = code('TARGET');
  const reader = createManualScanner({
    ...time,
    capture: () => { captures += 1; return frame; },
    decode: () => { decodes += 1; return waiting.promise; },
    accept: (result, captured) => accepted.push({ result, captured }),
    onState: ({ status }) => states.push(status),
  });
  await time.advance(10000);
  assert.equal(captures, 0);
  const reading = reader.trigger();
  assert.equal(reader.isBusy, true);
  await flush();
  assert.deepEqual(await reader.trigger(), { status: 'busy' });
  assert.equal(captures, 1);
  assert.equal(decodes, 1);
  waiting.resolve([code('NEIGHBOUR', 700, 400), target]);
  const outcome = await reading;
  assert.equal(outcome.status, 'success');
  assert.strictEqual(outcome.result, target);
  assert.deepEqual(accepted, [{ result: target, captured: frame }]);
  assert.equal(reader.isBusy, false);
  assert.deepEqual(states, ['scanning', 'success']);
  assert.equal(time.pending(), 0);
  await time.advance(10000);
  assert.equal(decodes, 1, 'no continuous scan follows a successful trigger');
});

test('a short burst captures fresh frames and allows the same code on a later deliberate trigger', async () => {
  const time = clock();
  const target = code('REPEATED');
  const accepted = [];
  const captured = [];
  let ordinal = 0;
  const reader = createManualScanner({
    ...time,
    capture: () => ({ ...frame, ordinal: ++ordinal }),
    decode: async (next) => { captured.push(next.ordinal); return next.ordinal === 1 ? [] : [target]; },
    accept: (result) => accepted.push(result),
  });
  const reading = reader.trigger();
  await flush();
  assert.deepEqual(captured, [1]);
  await time.advance(80);
  assert.equal((await reading).status, 'success');
  assert.deepEqual(captured, [1, 2]);
  assert.equal((await reader.trigger()).status, 'success');
  assert.deepEqual(accepted, [target, target]);
  assert.deepEqual(captured, [1, 2, 3]);
});

test('deadline releases a hung decoder, aborts its signal and rejects its late result', async () => {
  const time = clock();
  const waiting = deferred();
  const accepted = [];
  const states = [];
  let signal;
  const reader = createManualScanner({
    ...time, capture: () => frame,
    decode: (_frame, options) => { signal = options.signal; return waiting.promise; },
    accept: (result) => accepted.push(result), onState: ({ status }) => states.push(status),
  });
  const reading = reader.trigger({ timeoutMs: 1500 });
  await flush();
  await time.advance(1500);
  assert.equal((await reading).status, 'not-found');
  assert.equal(signal.aborted, true);
  assert.equal(reader.isBusy, false);
  assert.equal(time.pending(), 0);
  waiting.resolve([code('TOO-LATE')]);
  await flush();
  assert.deepEqual(accepted, []);
  assert.deepEqual(states, ['scanning', 'not-found']);
});

test('cancel settles immediately; a new trigger waits for old decoding and cannot accept its stale result', async () => {
  const time = clock();
  const first = deferred();
  const second = deferred();
  const accepted = [];
  const states = [];
  let calls = 0;
  let firstSignal;
  const reader = createManualScanner({
    ...time, capture: () => frame,
    decode: (_frame, options) => {
      calls += 1;
      if (calls === 1) { firstSignal = options.signal; return first.promise; }
      return second.promise;
    },
    accept: (result) => accepted.push(result.text), onState: ({ status }) => states.push(status),
  });
  const oldJob = reader.trigger();
  await flush();
  assert.equal(reader.cancel(), true);
  assert.equal((await oldJob).status, 'cancelled');
  assert.equal(firstSignal.aborted, true);
  const newJob = reader.trigger();
  await flush();
  assert.equal(calls, 1, 'still-running old decode prevents overlapping decoder work');
  first.resolve([code('STALE')]);
  await flush();
  assert.equal(calls, 2);
  assert.deepEqual(accepted, []);
  second.resolve([code('CURRENT')]);
  assert.equal((await newJob).status, 'success');
  assert.deepEqual(accepted, ['CURRENT']);
  assert.deepEqual(states, ['scanning', 'cancelled', 'scanning', 'success']);
  assert.equal(reader.cancel(), false);
});

test('a replacement trigger can expire while old decoding is stuck, without issuing another call', async () => {
  const time = clock();
  const waiting = deferred();
  const accepted = [];
  let calls = 0;
  const reader = createManualScanner({
    ...time, capture: () => frame,
    decode: () => { calls += 1; return waiting.promise; }, accept: (result) => accepted.push(result),
  });
  const first = reader.trigger();
  await flush();
  reader.cancel();
  await first;
  const next = reader.trigger({ timeoutMs: 1500 });
  await time.advance(1500);
  assert.equal((await next).status, 'not-found');
  assert.equal(calls, 1);
  waiting.reject(new Error('late failure'));
  await flush();
  assert.equal(reader.isBusy, false);
  assert.deepEqual(accepted, []);
  assert.equal(time.pending(), 0);
});

test('a synchronous decoder result arriving after its budget cannot be committed', async () => {
  const time = clock();
  const accepted = [];
  const reader = createManualScanner({
    ...time, capture: () => frame,
    decode: () => { time.jump(1600); return [code('OVERRUN')]; },
    accept: (result) => accepted.push(result),
  });
  assert.equal((await reader.trigger({ timeoutMs: 1500 })).status, 'not-found');
  assert.deepEqual(accepted, []);
  assert.equal(time.pending(), 0);
});

test('video not ready retries within the deadline; cancellation removes retry and deadline timers', async () => {
  const time = clock();
  let captures = 0;
  const reader = createManualScanner({
    ...time, capture: () => { captures += 1; return null; },
    decode: () => { throw new Error('must not decode absent frame'); }, accept: () => { throw new Error('must not accept'); },
  });
  const reading = reader.trigger();
  await flush();
  await time.advance(80);
  assert.equal(captures, 2);
  reader.cancel();
  assert.equal((await reading).status, 'cancelled');
  assert.equal(time.pending(), 0);
  await time.advance(10000);
  assert.equal(captures, 2);
});

test('capture/decoder failures settle with error and presentation callbacks cannot strand the reader', async () => {
  for (const broken of ['capture', 'decode', 'accept']) {
    const time = clock();
    const failure = new Error(`broken ${broken}`);
    const reader = createManualScanner({
      ...time,
      capture: () => { if (broken === 'capture') throw failure; return frame; },
      decode: () => { if (broken === 'decode') return Promise.reject(failure); return [code('VALID')]; },
      accept: () => { if (broken === 'accept') throw failure; },
      onState: () => { throw new Error('presentation failure'); },
    });
    const result = await reader.trigger();
    assert.equal(result.status, 'error');
    assert.strictEqual(result.error, failure);
    assert.equal(reader.isBusy, false);
    assert.equal(time.pending(), 0);
  }
});

test('duration is bounded and a missing decode candidate never commits a result', async () => {
  const time = clock();
  let budget;
  const waiting = deferred();
  const reader = createManualScanner({
    ...time, capture: () => frame,
    decode: (_frame, options) => { budget = options.budgetMs; return waiting.promise; },
    accept: () => { throw new Error('unexpected acceptance'); },
  });
  const result = reader.trigger({ timeoutMs: 999999 });
  await flush();
  assert.equal(budget, 700);
  await time.advance(4999);
  assert.equal(reader.isBusy, true);
  await time.advance(1);
  assert.equal((await result).status, 'not-found');
  waiting.resolve([]);
  await flush();
  assert.equal(time.pending(), 0);
});
