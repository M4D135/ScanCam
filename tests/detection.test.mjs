import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/full';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let temporary;
let detection;
let originalFetch;
let requests = 0;

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'scanlibre-detection-test-'));
  const bundle = join(temporary, 'detection.mjs');
  await build({
    absWorkingDir: root,
    stdin: {
      contents: "export * from './src/detection.js'; export * from './src/decoder.js';",
      resolveDir: root,
    },
    outfile: bundle,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    loader: { '.wasm': 'base64' },
    logLevel: 'silent',
  });
  await prepareZXingModule({
    overrides: { wasmBinary: await readFile(require.resolve('zxing-wasm/full/zxing_full.wasm')) },
    fireImmediately: true,
  });
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { requests += 1; throw new Error('Le lecteur doit rester hors ligne.'); };
  detection = await import(pathToFileURL(bundle).href);
  await detection.initDecoder();
});

after(async () => {
  if (originalFetch) globalThis.fetch = originalFetch;
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

function canvas(width, height, shade = 255) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  if (shade !== 255) {
    for (let index = 0; index < data.length; index += 4) data[index] = data[index + 1] = data[index + 2] = shade;
  }
  return { data, width, height };
}

async function fixture(format, text, {
  scale = 2, barHeight = 0, black = 0, white = 255, padding = 12,
} = {}) {
  const generated = await writeBarcode(text, { format });
  assert.equal(generated.error, '');
  const symbol = generated.symbol;
  const height = barHeight || symbol.height * scale;
  const image = canvas((symbol.width + padding * 2) * scale, height + padding * 2 * scale, white);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < symbol.width * scale; x += 1) {
      const row = Math.min(symbol.height - 1, Math.floor(y * symbol.height / height));
      const value = symbol.data[row * symbol.width + Math.floor(x / scale)] === 0 ? black : white;
      const target = ((y + padding * scale) * image.width + x + padding * scale) * 4;
      image.data[target] = image.data[target + 1] = image.data[target + 2] = value;
    }
  }
  return image;
}

function place(destination, source, x, y) {
  for (let row = 0; row < source.height; row += 1) {
    destination.data.set(
      source.data.subarray(row * source.width * 4, (row + 1) * source.width * 4),
      ((y + row) * destination.width + x) * 4,
    );
  }
}

function tiltedFixture(source) {
  // Independent fixture construction: sample a larger square on axes x+y and
  // y-x. The production recovery transform is not used to generate its input.
  const side = source.width + source.height;
  const image = canvas(side, side);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const sx = Math.floor((x + y - side) / Math.SQRT2 + source.width / 2);
      const sy = Math.floor((y - x) / Math.SQRT2 + source.height / 2);
      if (sx < 0 || sx >= source.width || sy < 0 || sy >= source.height) continue;
      const from = (sy * source.width + sx) * 4;
      image.data.set(source.data.subarray(from, from + 4), (y * side + x) * 4);
    }
  }
  return image;
}

test('le contraste de secours récupère quatre formats que la lecture simple manque', async () => {
  for (const format of ['Code128', 'EAN13', 'DataMatrix', 'QRCode']) {
    const text = format === 'EAN13' ? '5901234123457' : 'INVENTAIRE-00042';
    const image = await fixture(format, text, { black: 125, white: 137 });
    const original = image.data.slice();
    assert.deepEqual(await detection.readCodes(image), [], `Le cas ${format} doit effectivement mettre en défaut la lecture initiale.`);
    const results = await detection.readFrame(image, { profile: 'balanced', budgetMs: 2000 });
    assert.equal(results.length, 1);
    assert.equal(results[0].text, text);
    assert.equal(results[0].isValid, true);
    assert.deepEqual(image.data, original, 'Le pipeline ne modifie pas les pixels fournis.');
  }
});

test('le profil précision lit des codes 1D fins inclinés à 45 degrés et replace leurs cadres', async () => {
  for (const format of ['Code128', 'Code39', 'EAN13']) {
    const text = format === 'EAN13' ? '5901234123457' : 'SCAN-0042';
    const image = tiltedFixture(await fixture(format, text, { scale: 3, barHeight: 24 }));
    assert.deepEqual(await detection.readCodes(image, { mode: 'linear' }), []);
    const results = await detection.readFrame(image, { mode: 'linear', profile: 'precision', budgetMs: 2500 });
    assert.equal(results.length, 1);
    assert.equal(results[0].text, text);
    assert.equal(results[0].rotation, 45);
    assert.equal(results[0].orientation, 45);
    assert.ok(results[0].lineCount >= 2);
    const points = Object.values(results[0].position);
    const center = points.reduce((value, point) => ({ x: value.x + point.x / 4, y: value.y + point.y / 4 }), { x: 0, y: 0 });
    assert.ok(Math.abs(center.x - image.width / 2) < 5, 'Le cadre doit revenir au centre du code original.');
    assert.ok(Math.abs(center.y - image.height / 2) < 5, 'Le cadre doit revenir au centre du code original.');
    for (const point of points) {
      assert.ok(point.x >= 0 && point.x <= image.width);
      assert.ok(point.y >= 0 && point.y <= image.height);
    }
    const { topLeft, topRight } = results[0].position;
    const angle = Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x) * 180 / Math.PI;
    assert.ok(Math.abs(angle - 45) < 1, 'Le cadre doit conserver l’inclinaison du code.');
  }
});

test('la zone centrale exclut les étiquettes extérieures et conserve les coordonnées du cadre complet', async () => {
  const image = canvas(800, 600);
  const central = await fixture('Code128', 'CENTER42', { scale: 2, barHeight: 40, padding: 6 });
  const outside = await fixture('DataMatrix', 'OUTSIDE42', { scale: 2, padding: 2 });
  place(image, central, 300, 280);
  place(image, outside, 8, 8);
  const all = await detection.readFrame(image);
  assert.deepEqual(all.map((result) => result.text).sort(), ['CENTER42', 'OUTSIDE42']);
  const selected = await detection.readFrame(image, { region: 'center' });
  assert.deepEqual(selected.map((result) => result.text), ['CENTER42']);
  const rect = detection.getScanRegion(image.width, image.height, 'center');
  assert.deepEqual(rect, { x: 96, y: 72, width: 608, height: 456 });
  for (const point of Object.values(selected[0].position)) {
    assert.ok(point.x >= 310 && point.x <= 300 + central.width - 10);
    assert.ok(point.y >= 290 && point.y <= 280 + central.height - 10);
  }
});

test('les passes de secours respectent le filtre de format', async () => {
  const image = await fixture('DataMatrix', 'FILTER-42', { black: 125, white: 137 });
  assert.deepEqual(await detection.readFrame(image, { mode: 'linear', profile: 'precision', budgetMs: 2000 }), []);
  const results = await detection.readFrame(image, { mode: 'DataMatrix', profile: 'precision', budgetMs: 2000 });
  assert.equal(results[0]?.text, 'FILTER-42');
});

test('rapide, recherche renforcée désactivée et budget nul restent à une seule passe', async () => {
  const image = await fixture('Code128', 'ONE-PASS-42', { black: 125, white: 137 });
  assert.deepEqual(await detection.readFrame(image, { profile: 'fast' }), []);
  assert.deepEqual(await detection.readFrame(image, { profile: 'precision', tryHarder: false }), []);
  assert.deepEqual(await detection.readFrame(image, { profile: 'precision', budgetMs: 0 }), []);
  assert.equal((await detection.readFrame(image, { profile: 'balanced', budgetMs: 2000 }))[0]?.text, 'ONE-PASS-42');
});

test('une interruption avant ou entre les passes ne publie pas de lecture tardive', async () => {
  const image = await fixture('Code128', 'CANCEL-42', { black: 125, white: 137 });
  const alreadyStopped = new AbortController();
  alreadyStopped.abort();
  await assert.rejects(detection.readFrame(image, { signal: alreadyStopped.signal }), { name: 'AbortError' });
  const stoppedBetweenPasses = new AbortController();
  const reading = detection.readFrame(image, { signal: stoppedBetweenPasses.signal, profile: 'precision', budgetMs: 2000 });
  setTimeout(() => stoppedBetweenPasses.abort(), 0);
  await assert.rejects(reading, { name: 'AbortError' });
});

test('les transformations ne créent pas de résultat sur une image uniforme', async () => {
  for (const shade of [0, 127, 255]) {
    assert.deepEqual(await detection.readFrame(canvas(120, 100, shade), { profile: 'precision', budgetMs: 2000 }), []);
  }
});

test('les pixels incomplets et dimensions dangereuses sont refusés avant le moteur WASM', async () => {
  await assert.rejects(detection.readFrame({ width: 120, height: 100, data: new Uint8Array(12) }), /pixels RGBA/);
  await assert.rejects(detection.readFrame({ width: 10000, height: 10000, data: new Uint8Array(4) }), /pixels RGBA/);
  await assert.rejects(detection.readFrame(canvas(10, 10), { profile: 'unknown' }), /Profil/);
  await assert.rejects(detection.readFrame(canvas(10, 10), { region: 'unknown' }), /Zone/);
  await assert.rejects(detection.readFrame(canvas(10, 10), { budgetMs: NaN }), /Durée/);
});

test('les profils supplémentaires ne font aucune requête réseau', () => {
  assert.equal(requests, 0);
});
