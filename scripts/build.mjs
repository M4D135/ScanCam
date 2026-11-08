import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const [template, styles, notices] = await Promise.all([
  readFile(join(root, "src/index.html"), "utf8"),
  readFile(join(root, "src/styles.css"), "utf8"),
  readFile(join(root, "THIRD_PARTY_NOTICES.txt"), "utf8"),
]);

function replaceOnce(source, marker, replacement) {
  if (source.split(marker).length !== 2) {
    throw new Error(`Le modèle HTML doit contenir exactement une fois ${marker}.`);
  }
  return source.replace(marker, () => replacement);
}

// A single IIFE works from file:/// without module loading, fetch, a local
// server, a service worker, or an installation on the end user's computer.
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/app.js"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["chrome109", "edge109"],
  loader: { ".wasm": "base64" },
  minify: true,
  legalComments: "inline",
  charset: "utf8",
  define: { __SCANLIBRE_VERSION__: JSON.stringify(pkg.version) },
  logLevel: "warning",
});

const escapeScript = (text) => text.replace(/<\/script/gi, "<\\/script");
const script = escapeScript(result.outputFiles[0].text);
let html = replaceOnce(template, "/*__STYLES__*/", styles);
html = replaceOnce(html, "/*__APP__*/", script);

// The distributable contains the complete third-party terms, even when it is
// copied on its own. This inert block is also available to the About dialog.
const licenseBlock = `<script type="text/plain" id="third-party-notices">${escapeScript(notices)}</script>`;
if (!html.includes("</body>")) throw new Error("Le modèle HTML doit contenir </body>.");
html = html.replace("</body>", () => `${licenseBlock}\n</body>`);

if (/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']\s*https?:/i.test(html)) {
  throw new Error("Le fichier autonome ne doit pas charger de script ou de style distant.");
}

const outDir = join(root, "dist");
const outPath = join(outDir, "ScanLibre.html");
await mkdir(outDir, { recursive: true });
await writeFile(outPath, html, "utf8");
const sha = createHash("sha256").update(html, "utf8").digest("hex");
console.log(`ScanLibre ${pkg.version} : dist/ScanLibre.html (${Buffer.byteLength(html)} octets)`);
console.log(`SHA-256 : ${sha}`);
