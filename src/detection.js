import { readCodes } from './decoder.js';

const MAX_INPUT_PIXELS = 20_000_000;
const MAX_TRANSFORM_PIXELS = 4_000_000;
const CENTER_FRACTION = 0.76;
const PROFILES = new Set(['fast', 'balanced', 'precision']);
const POSITION_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

function validDimensions(width, height) {
  return Number.isSafeInteger(width) && width > 0 && width <= 16384 &&
    Number.isSafeInteger(height) && height > 0 && height <= 16384 &&
    width * height <= MAX_INPUT_PIXELS;
}

/** The exact camera guide/crop; all returned results use full-frame coordinates. */
export function getScanRegion(width, height, region = 'full') {
  if (!validDimensions(width, height)) throw new TypeError('Dimensions d’image invalides.');
  if (!['full', 'center'].includes(region)) throw new TypeError('Zone de lecture inconnue.');
  if (region === 'full') return { x: 0, y: 0, width, height };
  const cropWidth = Math.max(1, Math.round(width * CENTER_FRACTION));
  const cropHeight = Math.max(1, Math.round(height * CENTER_FRACTION));
  return {
    x: Math.floor((width - cropWidth) / 2),
    y: Math.floor((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}

function validateImage(image) {
  if (!image || !validDimensions(image.width, image.height) ||
      !(image.data instanceof Uint8ClampedArray || image.data instanceof Uint8Array) ||
      image.data.byteLength !== image.width * image.height * 4) {
    throw new TypeError('L’image à analyser doit contenir des pixels RGBA valides (20 mégapixels maximum).');
  }
}

function cropImage(image, rect) {
  if (rect.x === 0 && rect.y === 0 && rect.width === image.width && rect.height === image.height) return image;
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);
  const rowBytes = rect.width * 4;
  for (let y = 0; y < rect.height; y += 1) {
    const source = ((rect.y + y) * image.width + rect.x) * 4;
    data.set(image.data.subarray(source, source + rowBytes), y * rowBytes);
  }
  return { data, width: rect.width, height: rect.height };
}

function luminance(data, index) {
  // Same integer luminance weights as ZXing's RGBA conversion.
  return (306 * data[index] + 601 * data[index + 1] + 117 * data[index + 2] + 512) >> 10;
}

/**
 * Only stretch a useful but limited range. Flat frames are left alone, and
 * original pixels are always tried first. The input buffer is never modified.
 */
function stretchContrast(image) {
  const pixels = image.width * image.height;
  const histogram = new Uint32Array(256);
  const stride = Math.max(1, Math.floor(pixels / 100000));
  let samples = 0;
  for (let pixel = 0; pixel < pixels; pixel += stride) {
    histogram[luminance(image.data, pixel * 4)] += 1;
    samples += 1;
  }
  const tail = Math.max(1, Math.floor(samples * 0.005));
  let low = 0;
  let high = 255;
  let count = 0;
  for (; low < 255; low += 1) {
    count += histogram[low];
    if (count >= tail) break;
  }
  count = 0;
  for (; high > low; high -= 1) {
    count += histogram[high];
    if (count >= tail) break;
  }
  const range = high - low;
  if (range < 8 || (low <= 8 && high >= 247)) return null;
  const data = new Uint8ClampedArray(image.data.length);
  const gain = 255 / range;
  for (let index = 0; index < data.length; index += 4) {
    const value = Math.max(0, Math.min(255, Math.round((luminance(image.data, index) - low) * gain)));
    data[index] = data[index + 1] = data[index + 2] = value;
    data[index + 3] = 255;
  }
  return { data, width: image.width, height: image.height };
}

/**
 * The usual decoder checks 0/90/180/270 degrees. Rotating once by 45 degrees
 * provides the missing directions for long, short-height linear barcodes.
 * The white padding preserves quiet zones; the inverse maps outlines back.
 */
function diagonalPass(image) {
  const cosine = Math.SQRT1_2;
  const sine = Math.SQRT1_2;
  const naturalSize = Math.ceil((image.width + image.height) * cosine);
  const scale = Math.min(1, Math.sqrt(MAX_TRANSFORM_PIXELS / (naturalSize * naturalSize)));
  const width = Math.max(1, Math.floor(naturalSize * scale));
  const height = width;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const sourceX = image.width / 2;
  const sourceY = image.height / 2;
  const centerX = width / 2;
  const centerY = height / 2;
  const map = ({ x, y }) => ({
    x: ((x - centerX) * cosine + (y - centerY) * sine) / scale + sourceX,
    y: (-(x - centerX) * sine + (y - centerY) * cosine) / scale + sourceY,
  });
  for (let y = 0; y < height; y += 1) {
    // Increment source coordinates across a row instead of doing trig per pixel.
    let sampleX = ((0.5 - centerX) * cosine + (y + 0.5 - centerY) * sine) / scale + sourceX;
    let sampleY = (-(0.5 - centerX) * sine + (y + 0.5 - centerY) * cosine) / scale + sourceY;
    for (let x = 0; x < width; x += 1) {
      const sx = Math.floor(sampleX);
      const sy = Math.floor(sampleY);
      if (sx >= 0 && sx < image.width && sy >= 0 && sy < image.height) {
        const source = (sy * image.width + sx) * 4;
        const target = (y * width + x) * 4;
        data[target] = image.data[source];
        data[target + 1] = image.data[source + 1];
        data[target + 2] = image.data[source + 2];
      }
      sampleX += cosine / scale;
      sampleY -= sine / scale;
    }
  }
  return { image: { data, width, height }, map };
}

function enlargedPass(image) {
  // Nearest-neighbour enlargement can help a detector on small symbols without
  // blurring narrow bars. It adds no detail and is never used instead of the
  // original frame. Large images keep their original size.
  if (image.width * image.height * 4 > MAX_TRANSFORM_PIXELS) return null;
  const width = image.width * 2;
  const height = image.height * 2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceRow = Math.floor(y / 2) * image.width;
    for (let x = 0; x < width; x += 1) {
      const source = (sourceRow + Math.floor(x / 2)) * 4;
      const target = (y * width + x) * 4;
      data[target] = image.data[source];
      data[target + 1] = image.data[source + 1];
      data[target + 2] = image.data[source + 2];
      data[target + 3] = 255;
    }
  }
  return { image: { data, width, height }, map: ({ x, y }) => ({ x: x / 2, y: y / 2 }) };
}

function mapResults(results, rect, transform = (point) => point, rotationOffset = 0) {
  return results.map((result) => ({
    ...result,
    ...(rotationOffset ? {
      rotation: ((result.rotation + rotationOffset + 180) % 360 + 360) % 360 - 180,
      orientation: ((result.rotation + rotationOffset + 180) % 360 + 360) % 360 - 180,
    } : {}),
    position: Object.fromEntries(POSITION_KEYS.map((key) => {
      const point = transform(result.position[key]);
      return [key, { x: point.x + rect.x, y: point.y + rect.y }];
    })),
  }));
}

function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException('Lecture interrompue.', 'AbortError');
}

const now = () => globalThis.performance?.now() ?? Date.now();
const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Analyse a full RGBA frame or its central guide and return normal decoder
 * results. All positions remain relative to the supplied, unmodified frame.
 *
 * Fast: one pass. Balanced: original then contrast recovery on failure.
 * Precision: at most four passes, adding a diagonal search and an alternative
 * threshold / small-image enlargement. Stop at the first successful pass.
 *
 * budgetMs is a soft time budget between synchronous WASM calls, not a promise
 * that an individual decoder call can be interrupted. Yielding between passes
 * lets Stop/camera-change requests run; signal is checked before and after each.
 */
export async function readFrame(image, {
  mode = 'all',
  tryHarder = true,
  profile = 'balanced',
  region = 'full',
  budgetMs = profile === 'precision' ? 700 : 350,
  signal,
} = {}) {
  validateImage(image);
  if (!PROFILES.has(profile)) throw new TypeError('Profil de lecture inconnu.');
  if (!Number.isFinite(budgetMs) || budgetMs < 0 || budgetMs > 10000) {
    throw new TypeError('Durée de recherche invalide.');
  }
  abortIfNeeded(signal);
  const rect = getScanRegion(image.width, image.height, region);
  const source = cropImage(image, rect);
  const started = now();
  const hard = Boolean(tryHarder) && profile !== 'fast';
  const baseOptions = { mode, tryHarder: hard, downscaleFactor: hard ? 2 : 3 };
  const attempt = async (input, options = {}, transform, rotationOffset = 0) => {
    abortIfNeeded(signal);
    const results = await readCodes(input, { ...baseOptions, ...options });
    abortIfNeeded(signal);
    return mapResults(results, rect, transform, rotationOffset);
  };
  const canContinue = async () => {
    await yieldToUi();
    abortIfNeeded(signal);
    return now() - started < budgetMs;
  };

  let results = await attempt(source);
  if (results.length || !hard || profile === 'fast' || !(await canContinue())) return results;

  const enhanced = stretchContrast(source);
  if (enhanced && now() - started < budgetMs) {
    results = await attempt(enhanced, { tryDenoise: profile === 'precision' });
    if (results.length) return results;
  }
  if (profile !== 'precision' || !(await canContinue())) return [];

  const recoverySource = enhanced || source;
  if (mode === 'all' || mode === 'linear') {
    const rotated = diagonalPass(recoverySource);
    if (now() - started < budgetMs) {
      results = await attempt(rotated.image, {}, rotated.map, -45);
      if (results.length) return results;
    }
    if (!(await canContinue())) return [];
  }

  const enlarged = enlargedPass(recoverySource);
  if (now() - started >= budgetMs) return [];
  return attempt(enlarged?.image || recoverySource, {
    binarizer: mode === 'linear' ? 'FixedThreshold' : 'GlobalHistogram',
    tryDenoise: mode !== 'linear',
  }, enlarged?.map);
}
