/**
 * Small, browser-independent helpers shared by ScanLibre's UI and exports.
 * Scanned contents are data: none of these functions evaluates them.
 */

/**
 * Extract explicitly named inventory fields without assuming a manufacturer.
 * Plain code contents are always kept intact elsewhere. Unknown/ambiguous
 * layouts return null, rather than guessing that any barcode is a serial.
 */
export function parseLabelFields(text) {
  if (typeof text !== 'string' || !text || text.length > 10000) return null;
  // Also recognise this complete serial/reference pair used on some labels.
  // The exact structure is required; this is not a manufacturer lookup.
  const match = /^([A-Z0-9]{10}),([A-Z0-9]{7}#[A-Z0-9]{3})$/u.exec(text);
  if (match && match[0] === text) return { serial: match[1], product: match[2] };

  let entries;
  if (text.trimStart().startsWith('{')) {
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      entries = Object.entries(data);
    } catch { return null; }
  } else {
    entries = [];
    for (const part of text.split(/[;,|\r\n]+/u)) {
      if (!part.trim()) continue;
      const field = /^\s*([^:=]{1,40})\s*[:=]\s*(.*?)\s*$/u.exec(part);
      if (!field) return null;
      entries.push([field[1], field[2]]);
    }
  }
  const fields = {};
  for (const [rawKey, value] of entries) {
    const key = rawKey.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\s_\-/#.]/gu, '');
    const field = ['sn', 'serial', 'serialnumber', 'numerodeserie', 'nserie'].includes(key) ? 'serial'
      : ['pn', 'product', 'productnumber', 'partnumber', 'referenceproduit', 'reference', 'ref'].includes(key) ? 'product' : null;
    if (!field) continue;
    if (typeof value !== 'string' || !value.trim() || value.length > 160 || /[\p{Cc}\p{Cf}]/u.test(value)) return null;
    if (fields[field] && fields[field] !== value.trim()) return null;
    fields[field] = value.trim();
  }
  return Object.keys(fields).length ? fields : null;
}

/**
 * Return a canonical absolute HTTP(S) URL suitable for an explicit open action.
 * Do not silently repair whitespace, backslashes or hidden control characters.
 */
export function safeHttpUrl(text) {
  if (typeof text !== 'string' || !/^https?:\/\//iu.test(text)) return null;
  if (/[\s\\\p{Cc}\p{Cf}]/u.test(text)) return null;

  const authority = text.slice(text.indexOf('://') + 3).split(/[/?#]/u, 1)[0];
  if (!authority || authority.includes('@')) return null;

  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

const FORMAT_LABELS = Object.freeze({
  DataMatrix: 'Data Matrix',
  DataMatrixECC200: 'Data Matrix',
  QRCode: 'QR code',
  QRCodeModel1: 'QR code',
  QRCodeModel2: 'QR code',
  MicroQRCode: 'Micro QR',
  RMQRCode: 'rMQR',
  Aztec: 'Aztec',
  AztecCode: 'Aztec',
  PDF417: 'PDF417',
  MicroPDF417: 'Micro PDF417',
  MaxiCode: 'MaxiCode',
  Code11: 'Code 11',
  Code32: 'Code 32',
  Code39: 'Code 39',
  Code93: 'Code 93',
  Code128: 'Code 128',
  Codabar: 'Codabar',
  EAN8: 'EAN-8',
  EAN13: 'EAN-13',
  UPCA: 'UPC-A',
  UPCE: 'UPC-E',
  ITF: 'ITF',
  ITF14: 'ITF-14',
  DataBar: 'GS1 DataBar',
  DataBarExpanded: 'GS1 DataBar étendu',
  DataBarLimited: 'GS1 DataBar limité',
});

export function formatLabel(format) {
  if (typeof format !== 'string' || !format.trim()) return 'Inconnu';
  const name = format.trim();
  return Object.hasOwn(FORMAT_LABELS, name) ? FORMAT_LABELS[name] : name;
}

/**
 * Quoting alone does not stop spreadsheet formulas. Prefix risky values with
 * an apostrophe, including formulas hidden behind whitespace/control marks.
 * The original value is otherwise preserved, including quotes and line breaks.
 */
function csvCell(value) {
  const original = value == null ? '' : String(value);
  const neutralized = /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(original)
    ? `'${original}`
    : original;
  return `"${neutralized.replaceAll('"', '""')}"`;
}

/**
 * UTF-8 BOM + semicolon-separated CSV for Excel in French environments.
 * Timestamps remain the supplied ISO strings; no locale/timezone conversion.
 */
export function toCsv(rows = []) {
  if (!Array.isArray(rows)) throw new TypeError('Le journal doit être un tableau.');
  const header = 'Date;Format;Contenu;Numéro de série;Référence produit';
  const lines = rows.map((row) => {
    const entry = row && typeof row === 'object' ? row : {};
    const text = entry.text == null ? '' : String(entry.text);
    const fields = parseLabelFields(text);
    return [
      entry.timestamp,
      formatLabel(entry.format),
      text,
      fields?.serial ?? '',
      fields?.product ?? '',
    ].map(csvCell).join(';');
  });
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}
