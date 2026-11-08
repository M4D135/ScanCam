import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareZXingModule, readBarcodes, writeBarcode } from "zxing-wasm/full";

// Development-only generator. The distributed reader bundles zxing-wasm/reader
// and never imports this script or its barcode-writing WebAssembly binary.
const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, "examples");

await prepareZXingModule({
  overrides: {
    wasmBinary: await readFile(require.resolve("zxing-wasm/full/zxing_full.wasm")),
  },
  fireImmediately: true,
});
await mkdir(destination, { recursive: true });

const examples = [
  {
    file: "datamatrix-demo.png",
    format: "DataMatrix",
    text: "DEMO000001,AB123CD#ABF",
    options: "forceSquare",
  },
  {
    file: "qr-demo.png",
    format: "QRCode",
    text: "ScanLibre — essai gratuit et hors ligne",
    options: "",
  },
];

for (const example of examples) {
  const result = await writeBarcode(example.text, {
    format: example.format,
    options: example.options,
    scale: 8,
    addQuietZones: true,
  });
  if (result.error || !result.image) {
    throw new Error(`Génération impossible : ${example.file} (${result.error || "image absente"}).`);
  }

  // Verify the generated asset before replacing the tracked example.
  const decoded = await readBarcodes(result.image, {
    formats: [example.format],
    textMode: "Plain",
  });
  if (!decoded.some((code) => code.isValid && code.text === example.text)) {
    throw new Error(`Le contrôle du contenu a échoué pour ${example.file}.`);
  }

  const bytes = new Uint8Array(await result.image.arrayBuffer());
  await writeFile(join(destination, example.file), bytes);
  console.log(`examples/${example.file} — ${bytes.length} octets — contenu vérifié`);
}
