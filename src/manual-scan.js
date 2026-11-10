const POSITION_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
const STOPPED = Symbol('stopped');
const RETRY_DELAY_MS = 80;

function scanBounds({ width, height, region } = {}) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  const bounds = region || { x: 0, y: 0, width, height };
  if (!['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key])) ||
      bounds.x < 0 || bounds.y < 0 || bounds.width <= 0 || bounds.height <= 0 ||
      bounds.x + bounds.width > width || bounds.y + bounds.height > height) return null;
  return bounds;
}

/**
 * readFrame() maps positions back to the full captured frame, even when its
 * search was cropped. Record only one code whose centre is inside that crop,
 * preferring the one nearest the aiming centre. Input objects are never changed.
 * A result without any geometry is usable only when it is the sole distinct
 * code and no positioned occurrence contradicts it. The caller must have
 * decoded the supplied region; this fallback cannot validate an uncropped read.
 */
export function chooseAimedResult(results, dimensions) {
  const bounds = scanBounds(dimensions);
  if (!bounds || !Array.isArray(results)) return null;
  const centreX = bounds.x + bounds.width / 2;
  const centreY = bounds.y + bounds.height / 2;
  const identities = new Set();
  let closest = null;
  let bestDistance = Infinity;
  let withoutPosition = null;
  let hasPosition = false;
  for (const result of results) {
    if (!result || typeof result.text !== 'string') continue;
    identities.add(JSON.stringify([result.symbology || result.format || 'Inconnu', result.text]));
    if (!result.position) {
      withoutPosition ||= result;
      continue;
    }
    hasPosition = true;
    const points = POSITION_KEYS.map((key) => result.position[key]);
    if (points.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue;
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    if (x < bounds.x || x > bounds.x + bounds.width || y < bounds.y || y > bounds.y + bounds.height) continue;
    const distance = (x - centreX) ** 2 + (y - centreY) ** 2;
    if (distance < bestDistance) {
      closest = result;
      bestDistance = distance;
    }
  }
  return closest || (identities.size === 1 && !hasPosition ? withoutPosition : null);
}

function callSafely(callback, value) {
  try { callback?.(value); } catch { /* Presentation must not strand a scan. */ }
}

/**
 * An idle scanner never captures or decodes. Each trigger owns a bounded burst
 * of fresh frames and commits at most one result. capture() may return null
 * while video is not ready, otherwise { image, width, height, region }.
 * decode(frame, { signal, budgetMs }) returns normal readFrame() results.
 * accept(result, frame) is synchronous; onState receives scanning then one
 * terminal outcome. Terminal results also resolve trigger()'s promise.
 *
 * The UI deadline settles even if a decoder promise ignores AbortSignal. Such
 * work is observed and serialized with the next trigger, never allowed to
 * commit late. A synchronous WASM call cannot be interrupted on the JS thread;
 * elapsed time is checked again before accepting its returned result.
 */
export function createManualScanner({
  capture, decode, accept, onState,
  now = () => globalThis.performance?.now() ?? Date.now(),
  setTimeout: schedule = globalThis.setTimeout.bind(globalThis),
  clearTimeout: unschedule = globalThis.clearTimeout.bind(globalThis),
} = {}) {
  if (typeof capture !== 'function' || typeof decode !== 'function' || typeof accept !== 'function') {
    throw new TypeError('capture, decode et accept sont nécessaires au déclenchement manuel.');
  }
  let current = null;
  let decoding = null;

  function finish(job, outcome) {
    if (job.done) return;
    job.done = true;
    unschedule(job.deadlineTimer);
    if (job.retryTimer !== null) unschedule(job.retryTimer);
    job.abort.abort();
    job.release(STOPPED);
    if (outcome.status === 'success') {
      try { accept(outcome.result, outcome.frame); }
      catch (error) { outcome = { status: 'error', error }; }
    }
    if (current === job) current = null;
    callSafely(onState, outcome);
    job.resolve(outcome);
  }

  function active(job) {
    if (job.done || current !== job) return false;
    if (now() >= job.deadline) {
      finish(job, { status: 'not-found' });
      return false;
    }
    return true;
  }

  function waitFor(job, pending) {
    // Promise.race observes both branches, including a decoder which rejects
    // after this job was cancelled, so its rejection is never unhandled.
    return Promise.race([pending, job.stopped]);
  }

  async function pause(job) {
    if (!active(job)) return;
    await waitFor(job, new Promise((resolve) => {
      job.retryTimer = schedule(() => {
        job.retryTimer = null;
        resolve();
      }, Math.min(RETRY_DELAY_MS, Math.max(0, job.deadline - now())));
    }));
  }

  async function run(job) {
    try {
      while (active(job)) {
        if (decoding) {
          // A prior cancelled read may still be returning. A new trigger can
          // expire while waiting, but cannot start a concurrent decoder call.
          try { await waitFor(job, decoding); } catch { /* Its owner handled it. */ }
          if (!active(job)) return;
        }
        const frame = await waitFor(job, Promise.resolve().then(() => capture()));
        if (!active(job)) return;
        if (frame) {
          const budgetMs = Math.max(0, Math.min(700, job.deadline - now()));
          const pending = Promise.resolve().then(() => {
            if (!active(job)) return [];
            return decode(frame, { signal: job.abort.signal, budgetMs });
          });
          decoding = pending;
          const release = () => { if (decoding === pending) decoding = null; };
          pending.then(release, release);
          const results = await waitFor(job, pending);
          if (!active(job)) return;
          const result = chooseAimedResult(results, frame);
          if (result) {
            finish(job, { status: 'success', result, frame });
            return;
          }
        }
        await pause(job);
      }
    } catch (error) {
      if (active(job)) finish(job, { status: 'error', error });
    }
  }

  function trigger({ timeoutMs = 3000 } = {}) {
    if (current) return Promise.resolve({ status: 'busy' });
    const duration = Number.isFinite(timeoutMs) ? Math.min(5000, Math.max(1500, timeoutMs)) : 3000;
    const job = {
      done: false, abort: new AbortController(), deadline: now() + duration,
      deadlineTimer: null, retryTimer: null,
    };
    job.stopped = new Promise((resolve) => { job.release = resolve; });
    const result = new Promise((resolve) => { job.resolve = resolve; });
    current = job;
    job.deadlineTimer = schedule(() => finish(job, { status: 'not-found' }), duration);
    callSafely(onState, { status: 'scanning' });
    if (!job.done) void run(job);
    return result;
  }

  function cancel() {
    if (!current) return false;
    finish(current, { status: 'cancelled' });
    return true;
  }

  return Object.freeze({ trigger, cancel, get isBusy() { return Boolean(current); } });
}
