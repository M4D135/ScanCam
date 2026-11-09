import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

const require = createRequire(import.meta.url);
const ErrorCorrection = require('@zxing/library/cjs/core/datamatrix/encoder/ErrorCorrection.js').default;
const DefaultPlacement = require('@zxing/library/cjs/core/datamatrix/encoder/DefaultPlacement.js').default;
const SymbolInfo = require('@zxing/library/cjs/core/datamatrix/encoder/SymbolInfo.js').default;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let temporary;
let recover;

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'scanlibre-datamatrix-compat-'));
  const bundle = join(temporary, 'compat.mjs');
  await build({
    absWorkingDir: root,
    entryPoints: ['src/datamatrix-compat.js'],
    outfile: bundle,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    logLevel: 'silent',
  });
  ({ recoverDataMatrixPadding: recover } = await import(pathToFileURL(bundle).href));
  await prepareZXingModule({
    overrides: { wasmBinary: await readFile(require.resolve('zxing-wasm/reader/zxing_reader.wasm')) },
    fireImmediately: true,
  });
});

after(async () => {
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

function c40Prefix(text) {
  assert.equal(text.length % 3, 0);
  const values = [...text].map((character) => {
    if (/[A-Z]/u.test(character)) return character.charCodeAt(0) - 65 + 14;
    if (/[0-9]/u.test(character)) return character.charCodeAt(0) - 48 + 4;
    throw new Error('Le préfixe fictif utilise seulement A-Z et 0-9.');
  });
  const words = [230];
  for (let index = 0; index < values.length; index += 3) {
    const value = 1600 * values[index] + 40 * values[index + 1] + values[index + 2] + 1;
    words.push(value >> 8, value & 255);
  }
  return [...words, 254];
}

function fixture({ capacity = 44, terminal = 254, badPadding = false, invalidPrefix = false, corruptEcc = false } = {}) {
  // The writer and module placement are independent of the production reader.
  // Valid ECC protects deliberately malformed terminal padding, as observed on
  // some physical labels. No user photo or inventory value belongs in Git.
  const text = 'DEMO12345678y';
  const info = SymbolInfo.lookup(capacity, 1);
  const data = [...(invalidPrefix ? [242] : []), ...c40Prefix('DEMO12345678'), 122];
  if (terminal !== null) data.push(terminal);
  data.push(129);
  while (data.length < info.getDataCapacity()) {
    const value = 129 + ((149 * (data.length + 1)) % 253) + 1;
    data.push(value > 254 ? value - 254 : value);
  }
  if (badPadding) data[data.length - 1] ^= 7;
  let codewords = ErrorCorrection.encodeECC200(String.fromCharCode(...data), info);
  if (corruptEcc) {
    codewords = [...codewords].map((word, index) => String.fromCharCode(
      index < 22 ? (word.charCodeAt(0) + 97 * (index + 1)) & 255 : word.charCodeAt(0),
    )).join('');
  }
  const placement = new DefaultPlacement(codewords, info.getSymbolDataWidth(), info.getSymbolDataHeight());
  placement.place();
  const width = info.getSymbolWidth();
  const height = info.getSymbolHeight();
  // Both test sizes contain one data region.
  assert.equal(info.getHorizontalDataRegions(), 1);
  const symbol = { width, height, data: new Uint8ClampedArray(width * height).fill(255) };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const black = y === 0 ? x % 2 === 0 : y === height - 1 || x === 0 ? true
        : x === width - 1 ? y % 2 === 1 : placement.getBit(x - 1, y - 1);
      if (black) symbol.data[y * width + x] = 0;
    }
  }
  const scale = 4;
  const margin = 12;
  const frameWidth = width * scale + margin * 2;
  const frameHeight = height * scale + margin * 2;
  const image = { width: frameWidth, height: frameHeight, data: new Uint8ClampedArray(frameWidth * frameHeight * 4).fill(255) };
  for (let y = 0; y < height * scale; y += 1) {
    for (let x = 0; x < width * scale; x += 1) {
      const value = symbol.data[Math.floor(y / scale) * width + Math.floor(x / scale)];
      const index = ((y + margin) * frameWidth + x + margin) * 4;
      image.data[index] = image.data[index + 1] = image.data[index + 2] = value;
    }
  }
  return { text, symbol, image };
}

async function candidate(options) {
  const input = fixture(options);
  const results = await readBarcodes(input.image, { formats: ['DataMatrix'], returnErrors: true, textMode: 'Plain' });
  assert.equal(results.length, 1, 'La fixture doit être détectée par le moteur habituel.');
  return { ...input, result: results[0] };
}

test('seul le terminateur ASCII redondant est récupéré après une vérification ECC indépendante', async () => {
  for (const capacity of [22, 44]) {
    const { result, text } = await candidate({ capacity });
    assert.equal(result.isValid, false);
    assert.match(result.error, /invalid code word/u);
    const original = structuredClone(result);
    const recovered = recover(result);
    assert.equal(recovered?.text, text);
    assert.equal(recovered.isValid, true);
    assert.equal(recovered.compatibility, 'datamatrix-terminal-unlatch');
    assert.deepEqual(recovered.bytes, result.bytes);
    assert.deepEqual(result, original, 'Le candidat et ses pixels ne sont jamais modifiés.');
  }
});

test('les codes conformes restent dans le décodeur standard', async () => {
  const { result, text } = await candidate({ terminal: null });
  assert.equal(result.isValid, true);
  assert.equal(result.text, text);
  assert.equal(recover(result), null);
});

test('les autres erreurs de format et les octets de remplissage invalides restent refusés', async () => {
  for (const options of [{ terminal: 255 }, { invalidPrefix: true }, { badPadding: true }]) {
    const { result } = await candidate(options);
    assert.equal(result.isValid, false);
    assert.equal(recover(result), null);
  }
});

test('une matrice dont les blocs ECC sont irrécupérables ne peut pas être acceptée', async () => {
  const { result } = await candidate();
  const damaged = fixture({ corruptEcc: true });
  assert.equal(recover({ ...result, symbol: damaged.symbol }), null);
  assert.equal(recover({ ...result, error: 'ChecksumError @ DMDecoder.cpp:425' }), null);
});

test('le texte et les octets doivent correspondre à la matrice vérifiée', async () => {
  const { result } = await candidate();
  assert.equal(recover({ ...result, text: `${result.text}!` }), null);
  const otherText = result.text.replace('D', 'X');
  assert.equal(recover({ ...result, text: otherText, bytes: new TextEncoder().encode(otherText) }), null);
  assert.equal(recover({ ...result, bytes: new Uint8Array(result.bytes.length) }), null);
  assert.equal(recover({ ...result, hasECI: true }), null);
  assert.equal(recover({ ...result, sequenceSize: 2 }), null);
});

test('les symboles incomplets ou hors limites et les autres formats sont refusés', async () => {
  const { result } = await candidate();
  assert.equal(recover(null), null);
  assert.equal(recover({ ...result, format: 'QRCode' }), null);
  assert.equal(recover({ ...result, symbol: { width: 10000, height: 10000, data: new Uint8Array(1) } }), null);
  assert.equal(recover({ ...result, symbol: { ...result.symbol, data: new Uint8Array(12) } }), null);
  const nonBinary = result.symbol.data.slice();
  nonBinary[50] = 127;
  assert.equal(recover({ ...result, symbol: { ...result.symbol, data: nonBinary } }), null);
});
