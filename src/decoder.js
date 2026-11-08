import {
  formatToLabel,
  prepareZXingModule,
  readBarcodes,
  ZXING_CPP_COMMIT,
  ZXING_WASM_VERSION,
} from "zxing-wasm/reader";
import readerWasmBase64 from "zxing-wasm/reader/zxing_reader.wasm";

// esbuild embeds the actual decoder binary into the JavaScript bundle. The
// application never has to fetch a .wasm file or contact a CDN at runtime.
const modes = Object.freeze({
  all: ["AllReadable"],
  DataMatrix: ["DataMatrix"],
  QRCode: ["QRCode"],
  linear: ["AllLinear"],
});

let initialization;

export const decoderInfo = Object.freeze({
  name: "ZXing-C++ / zxing-wasm",
  version: ZXING_WASM_VERSION,
  sourceCommit: ZXING_CPP_COMMIT,
});

/** Initialize the embedded decoder once, including concurrent callers. */
export function initDecoder() {
  if (!initialization) {
    initialization = Promise.resolve().then(async () => {
      const bytes = Uint8Array.from(atob(readerWasmBase64), (c) => c.charCodeAt(0));
      await prepareZXingModule({
        overrides: {
          wasmBinary: bytes,
          // An inline fallback also keeps this self-contained if the loader
          // asks for the binary location while initializing the module.
          locateFile: () => `data:application/wasm;base64,${readerWasmBase64}`,
        },
        fireImmediately: true,
      });
      return decoderInfo;
    }).catch((cause) => {
      initialization = undefined;
      throw new Error(
        "Impossible de charger le moteur de lecture intégré. Ouvrez le fichier complet dans une version récente d’Edge ou Chrome.",
        { cause },
      );
    });
  }
  return initialization;
}

/**
 * Decode a browser ImageData, an image Blob/File, or encoded image bytes.
 * No transformation is applied to the decoded text; control characters and
 * leading/trailing spaces are retained for copying and exporting.
 *
 * @param {ImageData|Blob|ArrayBuffer|Uint8Array} image
 * The optional binarizer/denoise choices are used by the bounded recovery
 * pipeline. They do not relax barcode validation or change the decoded text.
 *
 * @param {{mode?: 'all'|'DataMatrix'|'QRCode'|'linear', tryHarder?: boolean,
 *   binarizer?: 'LocalAverage'|'GlobalHistogram'|'FixedThreshold',
 *   tryDenoise?: boolean, downscaleFactor?: 2|3|4}} options
 */
export async function readCodes(image, {
  mode = "all",
  tryHarder = true,
  binarizer = "LocalAverage",
  tryDenoise = false,
  downscaleFactor = 3,
} = {}) {
  if (!Object.hasOwn(modes, mode)) {
    throw new TypeError("Format de lecture inconnu.");
  }
  if (!image) {
    throw new TypeError("Aucune image à analyser.");
  }
  if (!["LocalAverage", "GlobalHistogram", "FixedThreshold"].includes(binarizer)) {
    throw new TypeError("Méthode d’analyse inconnue.");
  }
  if (![2, 3, 4].includes(downscaleFactor)) {
    throw new TypeError("Échelle de recherche invalide.");
  }

  await initDecoder();
  const results = await readBarcodes(image, {
    formats: modes[mode],
    tryHarder: Boolean(tryHarder),
    tryRotate: true,
    tryInvert: true,
    tryDownscale: true,
    downscaleFactor,
    tryDenoise: Boolean(tryDenoise),
    binarizer,
    // Keep the normal two-line agreement for linear codes, including recovery
    // passes. Returning more guesses is not an improvement in detection.
    minLineCount: 2,
    maxNumberOfSymbols: 32,
    returnErrors: false,
    textMode: "Plain",
  });

  return results.filter((result) => result.isValid).map((result) => ({
    ...result,
    formatLabel: formatToLabel(result.format) || result.format,
  }));
}
