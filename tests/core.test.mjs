import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLabel, parseLabelFields, safeHttpUrl, toCsv } from '../src/core.js';

// Synthetic identifiers only. Never put photographed device identifiers here.
const syntheticPair = 'AB01234567,ZZ123AA#ABF';
const timestamp = '2025-01-02T03:04:05.678Z';

test('Structured fields come from a complete, unambiguous serial/product pair', () => {
  assert.deepEqual(parseLabelFields(syntheticPair), {
    serial: 'AB01234567',
    product: 'ZZ123AA#ABF',
  });
  for (const value of [
    `prefix ${syntheticPair}`,
    `${syntheticPair},extra`,
    `${syntheticPair}\n`,
    `${syntheticPair}\r\n`,
    ` ${syntheticPair}`,
    `${syntheticPair} `,
    syntheticPair.toLowerCase(),
    'AB0123456,ZZ123AA#ABF',
    'AB012345678,ZZ123AA#ABF',
    'AB01234567,ZZ123AA',
    'AB01234567,ZZ123AAA#ABF',
    'AB01234567;ZZ123AA#ABF',
    'https://example.test/AB01234567,ZZ123AA#ABF',
    '', null, undefined, 123,
  ]) {
    assert.equal(parseLabelFields(value), null, `Must reject ${JSON.stringify(value)}`);
  }
});

test('named fields work across label layouts without a manufacturer assumption', () => {
  assert.deepEqual(parseLabelFields('S/N: ABC-123; P/N: PART-42'), {serial:'ABC-123', product:'PART-42'});
  assert.deepEqual(parseLabelFields('serial_number=ABC-123\npart_number=PART-42\nmodel=Demo'), {serial:'ABC-123', product:'PART-42'});
  assert.deepEqual(parseLabelFields('Numéro de série : XYZ-99 | Référence produit : REF-12'), {serial:'XYZ-99', product:'REF-12'});
  assert.deepEqual(parseLabelFields('{"serial":"DEMO-42","product":"ITEM-A","manufacturer":"Example"}'), {serial:'DEMO-42', product:'ITEM-A'});
  assert.deepEqual(parseLabelFields('SN: ONLY-ONE'), {serial:'ONLY-ONE'});
  assert.equal(parseLabelFields('0123456789012'), null, 'EAN digits are not automatically treated as a serial');
  assert.equal(parseLabelFields('SN: ONE; Serial: TWO'), null, 'conflicting fields are ambiguous');
  assert.equal(parseLabelFields('{"serial":42}'), null, 'numeric JSON must not lose leading zeros');
  assert.equal(parseLabelFields('{"serial":{"value":"ABC"}}'), null);
  assert.equal(parseLabelFields('SN: x\u0000y'), null);
  assert.equal(parseLabelFields('https://example.test/SN:ABC'), null);
});

test('only complete, explicit HTTP(S) links are accepted', () => {
  assert.equal(safeHttpUrl('https://example.test'), 'https://example.test/');
  assert.equal(safeHttpUrl('HTTP://intranet/asset/42?view=detail#code'),
    'http://intranet/asset/42?view=detail#code');
  assert.equal(safeHttpUrl('https://exemple.test/été'),
    'https://exemple.test/%C3%A9t%C3%A9');
  assert.equal(safeHttpUrl('http://[::1]:8080/'), 'http://[::1]:8080/');
  assert.equal(safeHttpUrl('https://example.test/?q=javascript%3Atext'),
    'https://example.test/?q=javascript%3Atext');
});

test('links cannot hide credentials, unsafe schemes or control characters', () => {
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///C:/Windows/system.ini',
    'ftp://example.test/',
    'blob:https://example.test/id',
    '//example.test/',
    '/relative/path',
    'www.example.test',
    'https://',
    'https:///example.test',
    'https://user:secret@example.test/',
    'https://user@example.test/',
    'https://@example.test/',
    'https://:secret@example.test/',
    'https://user%40name@example.test/',
    'https:\\example.test/',
    'https://example.test/\\other.test',
    ' https://example.test/',
    'https://example.test/ ',
    'https://example.test/a b',
    'https://exam\nple.test/',
    'https://example.test/\n',
    'https://example.test/\t',
    'https://example.test/\u0000',
    'https://example.test/\u0085',
    'https://example.test/\u202Eabc',
    'https://example.test/\u200Babc',
    'https://[::1',
    '', null, undefined, 123,
  ]) {
    assert.equal(safeHttpUrl(value), null, `Must reject ${JSON.stringify(value)}`);
  }
});

test('format labels stay stable across QR variants and do not inherit object keys', () => {
  assert.equal(formatLabel('DataMatrix'), 'Data Matrix');
  assert.equal(formatLabel('QRCodeModel1'), 'QR code');
  assert.equal(formatLabel('QRCodeModel2'), 'QR code');
  assert.equal(formatLabel('Code128'), 'Code 128');
  assert.equal(formatLabel('EAN13'), 'EAN-13');
  assert.equal(formatLabel('unknown-format'), 'unknown-format');
  assert.equal(formatLabel('__proto__'), '__proto__');
  assert.equal(formatLabel('constructor'), 'constructor');
  assert.equal(formatLabel(null), 'Inconnu');
});

// Independent CSV reader: verifies the export has genuine cell/row boundaries.
function parseCsv(source) {
  const content = source.replace(/^\uFEFF/u, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (char === '"') {
      if (quoted && content[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (!quoted && char === ';') {
      row.push(field); field = '';
    } else if (!quoted && char === '\r' && content[i + 1] === '\n') {
      row.push(field); rows.push(row); row = []; field = ''; i += 1;
    } else field += char;
  }
  assert.equal(quoted, false, 'CSV must close every quoted cell');
  assert.deepEqual(row, [], 'CSV must finish on a row boundary');
  assert.equal(field, '');
  return rows;
}

test('CSV preserves Unicode, delimiters, quotes, multiline data and ISO timestamps', () => {
  const text = 'Étiquette ; "pièce A"\nDeuxième ligne\r\n最後の行 🔎';
  const csv = toCsv([
    { timestamp, format: 'QRCodeModel2', text },
    { timestamp, format: 'DataMatrix', text: syntheticPair },
  ]);
  assert.equal(csv.charCodeAt(0), 0xFEFF, 'Excel UTF-8 BOM is present');
  assert.deepEqual(parseCsv(csv), [
    ['Date', 'Format', 'Contenu', 'Numéro de série', 'Référence produit'],
    [timestamp, 'QR code', text, '', ''],
    [timestamp, 'Data Matrix', syntheticPair, 'AB01234567', 'ZZ123AA#ABF'],
  ]);
});

test('CSV neutralizes formulas even behind spaces or invisible characters', () => {
  const payloads = [
    '=1+1',
    '+SUM(1,2)',
    '-42',
    '@SUM(A1:A2)',
    '   =HYPERLINK("https://example.test";"ouvrir")',
    '\t+1',
    '\r\n-1',
    '\uFEFF=1',
    '\u200B@SUM(1,2)',
    '\u0000=1',
  ];
  const exported = parseCsv(toCsv(payloads.map((text) => ({
    timestamp, format: 'QRCode', text,
  })))).slice(1);
  assert.equal(exported.length, payloads.length);
  exported.forEach((row, i) => {
    assert.equal(row.length, 5);
    assert.equal(row[2], `'${payloads[i]}`);
  });
});

test('CSV also protects metadata columns and leaves ordinary text untouched', () => {
  const entries = [
    { timestamp: '=NOW()', format: '\t+1', text: 'user@example.test' },
    { timestamp, format: 'Code128', text: 'A-42+7' },
    { timestamp, format: 'QRCode', text: "'already literal" },
  ];
  const exported = parseCsv(toCsv(entries)).slice(1);
  assert.deepEqual(exported[0], ["'=NOW()", "'+1", 'user@example.test', '', '']);
  assert.equal(exported[1][2], 'A-42+7');
  assert.equal(exported[2][2], "'already literal");
});

test('empty CSV is still valid and unrecognised content is exported intact', () => {
  assert.equal(parseCsv(toCsv([])).length, 1);
  const text = `${syntheticPair},unexpected`;
  const [, row] = parseCsv(toCsv([{ timestamp, format: 'DataMatrix', text }]));
  assert.deepEqual(row, [timestamp, 'Data Matrix', text, '', '']);
  assert.throws(() => toCsv('not an array'), TypeError);
});
