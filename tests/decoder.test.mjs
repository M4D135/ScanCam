import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { prepareZXingModule, writeBarcode } from "zxing-wasm/full";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let tempDir;
let decoder;
let originalFetch;
let attemptedRequests = 0;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "scanlibre-decoder-test-"));
  const bundledPath = join(tempDir, "decoder.mjs");
  await build({
    absWorkingDir: root,
    entryPoints: ["src/decoder.js"],
    outfile: bundledPath,
    bundle: true,
    platform: "browser",
    format: "esm",
    loader: { ".wasm": "base64" },
    logLevel: "silent",
  });

  // Synthetic test codes are generated with the independent writer binary;
  // the app only ships the smaller reader binary.
  await prepareZXingModule({
    overrides: {
      wasmBinary: await readFile(require.resolve("zxing-wasm/full/zxing_full.wasm")),
    },
    fireImmediately: true,
  });

  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    attemptedRequests += 1;
    throw new Error("Le test interdit tout chargement réseau.");
  };
  decoder = await import(pathToFileURL(bundledPath).href);
});

after(async () => {
  if (originalFetch) globalThis.fetch = originalFetch;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function barcode(text, format, options = {}) {
  const result = await writeBarcode(text, {
    format,
    scale: 6,
    addQuietZones: true,
    ...options,
  });
  assert.equal(result.error, "", "Le générateur de fixture doit réussir.");
  assert.ok(result.image?.size > 0);
  return result.image;
}

test("le moteur démarre hors ligne avec plusieurs appels simultanés", async () => {
  const [first, second] = await Promise.all([decoder.initDecoder(), decoder.initDecoder()]);
  assert.equal(first.version, "3.1.6");
  assert.strictEqual(first, second);
  assert.equal(attemptedRequests, 0);
});

test("un Data Matrix de type inventaire est lu exactement depuis un fichier image", async () => {
  const payload = "DEMO000123,DEMO123#ABF";
  const results = await decoder.readCodes(await barcode(payload, "DataMatrix"), { mode: "DataMatrix" });
  assert.equal(results.length, 1);
  assert.equal(results[0].format, "DataMatrix");
  assert.equal(results[0].formatLabel, "Data Matrix");
  assert.equal(results[0].text, payload);
  assert.equal(results[0].isValid, true);
  assert.ok(Number.isFinite(results[0].position.topLeft.x));
  assert.ok(Number.isFinite(results[0].position.bottomRight.y));
});

test("le mode QR ignore un Data Matrix, le mode automatique le reconnaît", async () => {
  const image = await barcode("SCANLIBRE-DATA-MATRIX", "DataMatrix");
  assert.deepEqual(await decoder.readCodes(image, { mode: "QRCode" }), []);
  const results = await decoder.readCodes(image);
  assert.equal(results[0].symbology, "DataMatrix");
  assert.equal(results[0].text, "SCANLIBRE-DATA-MATRIX");
});

test("un Data Matrix tourné et inversé reste lisible", async () => {
  const payload = "ROTATION-INVERSION-42";
  const image = await barcode(payload, "DataMatrix", { rotate: 90, invert: true });
  const results = await decoder.readCodes(image, { mode: "DataMatrix" });
  assert.equal(results[0]?.text, payload);
  assert.equal(results[0]?.isInverted, true);
});

test("le QR conserve Unicode, espaces, tabulation et retours à la ligne", async () => {
  const payload = "  réunion-équipe\nLigne 2\tfin  ";
  const results = await decoder.readCodes(await barcode(payload, "QRCode"), { mode: "QRCode" });
  assert.equal(results.length, 1);
  assert.equal(results[0].symbology, "QRCode");
  assert.equal(results[0].text, payload);
});

test("le mode codes-barres lit Code 128 et exclut les codes 2D", async () => {
  const code128 = await barcode("INVENTAIRE-00042", "Code128");
  const results = await decoder.readCodes(code128, { mode: "linear" });
  assert.equal(results[0]?.text, "INVENTAIRE-00042");
  assert.equal(results[0]?.symbology, "Code128");
  assert.deepEqual(await decoder.readCodes(code128, { mode: "DataMatrix" }), []);
  const qr = await barcode("SCANLIBRE-QR", "QRCode");
  assert.deepEqual(await decoder.readCodes(qr, { mode: "linear" }), []);
});

test("une image vide ne produit pas de faux résultat", async () => {
  const width = 160;
  const height = 120;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  assert.deepEqual(await decoder.readCodes({ data, width, height }), []);
});

test("une photo locale peut être validée sans être ajoutée au dépôt", {
  skip: !process.env.SCANLIBRE_TEST_IMAGE,
}, async () => {
  const results = await decoder.readCodes(new Uint8Array(await readFile(process.env.SCANLIBRE_TEST_IMAGE)), {
    mode: "DataMatrix",
  });
  assert.ok(results.some((result) => result.format === "DataMatrix"));
  if (process.env.SCANLIBRE_TEST_EXPECTED) {
    assert.ok(results.some((result) => result.text === process.env.SCANLIBRE_TEST_EXPECTED));
  }
});

test("aucune lecture ne nécessite de requête réseau", () => {
  assert.equal(attemptedRequests, 0);
});
