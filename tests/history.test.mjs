import test from 'node:test';
import assert from 'node:assert/strict';
import {
  historyKey, reconcileHistorySelection, selectVisibleHistory, partitionHistorySelection, paginateHistory,
} from '../src/history.js';

// Synthetic entries only. Freezing also catches unintended record mutations.
const first = Object.freeze({ format: 'QRCode', text: 'STOCK-DEMO-A', timestamp: '2026-11-10T08:01:02.003Z', count: 3 });
const second = Object.freeze({ format: 'DataMatrix', text: 'STOCK-DEMO-B', timestamp: '2026-11-10T08:04:05.006Z', count: 7 });
const third = Object.freeze({ format: 'Code128', text: 'STOCK-DEMO-C', timestamp: '2026-11-10T08:07:08.009Z', count: 1 });
const records = Object.freeze([first, second, third]);
const key = historyKey;

test('history identity keeps format and raw text unambiguous, including NUL characters', () => {
  const left = { format: 'QR\0Code', text: 'DEMO' };
  const right = { format: 'QR', text: 'Code\0DEMO' };
  assert.notEqual(key(left), key(right), 'a separator inside either component cannot collide');
  assert.deepEqual(JSON.parse(key(left)), [left.format, left.text]);
  assert.notEqual(key({ format: 'QRCode', text: '00123' }), key({ format: 'Code128', text: '00123' }));
  assert.notEqual(key({ format: 'QRCode', text: '00123' }), key({ format: 'QRCode', text: '123' }));
  assert.notEqual(key({ format: 'QRCode', text: 'DEMO ' }), key({ format: 'QRCode', text: 'DEMO' }));
  assert.equal(key(first), key({ ...first, timestamp: '2026-11-10T09:00:00.000Z', count: 99 }));
});

test('reconciliation removes selections invalidated by deletion or history eviction', () => {
  const selected = new Set([key(first), key(second), key(third), 'outdated-key']);
  const before = [...selected];
  const afterDeletion = reconcileHistorySelection([first, third], selected);
  assert.deepEqual([...afterDeletion], [key(first), key(third)]);
  const afterLimit = reconcileHistorySelection([third], afterDeletion);
  assert.deepEqual([...afterLimit], [key(third)]);
  assert.deepEqual([...selected], before);
  assert.notStrictEqual(afterDeletion, selected);
  assert.equal(reconcileHistorySelection([], selected).size, 0);
});

test('reconciliation preserves selection when a new reading updates count and timestamp', () => {
  const updated = Object.freeze({ ...first, count: 4, timestamp: '2026-11-10T09:10:11.012Z' });
  assert.deepEqual([...reconcileHistorySelection([updated], new Set([key(first)]))], [key(first)]);
});

test('selecting and deselecting filtered rows preserves selected hidden rows', () => {
  const selected = new Set([key(first), key(second)]);
  const before = [...selected];
  const clearedVisible = selectVisibleHistory(records, selected, [second, third], false);
  assert.deepEqual([...clearedVisible], [key(first)], 'hidden first entry stays selected');
  const checkedVisible = selectVisibleHistory(records, clearedVisible, [second, third], true);
  assert.deepEqual([...checkedVisible], [key(first), key(second), key(third)]);
  assert.deepEqual([...selected], before);
  assert.deepEqual([...clearedVisible], [key(first)]);
});

test('visible selection ignores stale rows and handles an empty filter without clearing hidden selections', () => {
  const stale = { format: 'QRCode', text: 'NO-LONGER-IN-HISTORY' };
  const selected = new Set([key(first), key(stale)]);
  assert.deepEqual([...selectVisibleHistory(records, selected, [second, stale], true)], [key(first), key(second)]);
  assert.deepEqual([...selectVisibleHistory(records, selected, [], false)], [key(first)]);
  assert.deepEqual([...selectVisibleHistory(records, selected, [], true)], [key(first)]);
  assert.deepEqual([...selected], [key(first), key(stale)]);
});

test('partition removes only selected entries while preserving order, counts, timestamps and object identity', () => {
  const selected = new Set([key(first), key(third), 'outdated-key']);
  const before = JSON.stringify(records);
  const { kept, removed } = partitionHistorySelection(records, selected);
  assert.deepEqual(kept, [second]);
  assert.deepEqual(removed, [first, third]);
  assert.strictEqual(kept[0], second);
  assert.strictEqual(removed[0], first);
  assert.strictEqual(removed[1], third);
  assert.equal(removed[0].count, 3);
  assert.equal(kept[0].timestamp, '2026-11-10T08:04:05.006Z');
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual([...selected], [key(first), key(third), 'outdated-key']);
});

test('partition keeps matching text in other formats and keeps both partitions ordered', () => {
  const otherFormat = Object.freeze({ ...first, format: 'DataMatrix' });
  const mixed = Object.freeze([first, otherFormat, second, third]);
  const result = partitionHistorySelection(mixed, new Set([key(first), key(second)]));
  assert.deepEqual(result.removed, [first, second]);
  assert.deepEqual(result.kept, [otherFormat, third]);
});

test('empty or entirely stale selections remove nothing, and selecting all removes only the supplied records', () => {
  for (const selected of [new Set(), new Set(['outdated-key'])]) {
    const result = partitionHistorySelection(records, selected);
    assert.deepEqual(result.kept, records);
    assert.notStrictEqual(result.kept, records);
    assert.deepEqual(result.removed, []);
  }
  assert.deepEqual(partitionHistorySelection(records, new Set(records.map(key))), { kept: [], removed: [...records] });
  assert.deepEqual(partitionHistorySelection([], new Set([key(first)])), { kept: [], removed: [] });
});

test('pagination clamps the current page after deletions remove its former rows', () => {
  const lastPage = paginateHistory(records, 2, 1);
  assert.deepEqual(lastPage, { rows: [third], page: 2, pageCount: 3, start: 2, end: 3, total: 3 });
  const remaining = partitionHistorySelection(records, new Set([key(second), key(third)])).kept;
  assert.deepEqual(paginateHistory(remaining, lastPage.page, 1),
    { rows: [first], page: 0, pageCount: 1, start: 0, end: 1, total: 1 });
  assert.deepEqual(paginateHistory(records, 900, 2),
    { rows: [third], page: 1, pageCount: 2, start: 2, end: 3, total: 3 });
});

test('an empty filtered history remains on the first of one page', () => {
  const empty = Object.freeze(records.filter((record) => record.text === 'NO-MATCH'));
  assert.deepEqual(paginateHistory(empty, 25, 10),
    { rows: [], page: 0, pageCount: 1, start: 0, end: 0, total: 0 });
  assert.notStrictEqual(paginateHistory(empty, 0, 10).rows, empty);
});

test('pagination keeps row identity, metadata and input order without mutating the list', () => {
  const before = JSON.stringify(records);
  const page = paginateHistory(records, 0, 2);
  assert.deepEqual(page.rows, [first, second]);
  assert.strictEqual(page.rows[0], first);
  assert.strictEqual(page.rows[1], second);
  assert.equal(page.rows[1].count, 7);
  assert.equal(page.rows[0].timestamp, first.timestamp);
  page.rows.pop();
  assert.equal(records.length, 3);
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual(paginateHistory(records, 1, 2).rows, [third]);
});

test('pagination normalizes numeric controls and bounds invalid page and size inputs', () => {
  assert.equal(paginateHistory(records, -10, 1).page, 0);
  assert.equal(paginateHistory(records, '1.8', '1.9').page, 1);
  assert.deepEqual(paginateHistory(records, '1.8', '1.9').rows, [second]);
  for (const invalid of [undefined, null, NaN, Infinity, -Infinity, 'invalid', {}, [], Symbol('page')]) {
    assert.equal(paginateHistory(records, invalid, 1).page, 0);
    assert.equal(paginateHistory(records, 0, invalid).rows.length, 1);
  }
  assert.equal(paginateHistory(records, 0, 0).rows.length, 1);
  assert.equal(paginateHistory(records, 0, -100).rows.length, 1);
  const many = Object.freeze(Array.from({ length: 501 }, (_, index) => Object.freeze({ index })));
  assert.deepEqual(paginateHistory(many, 0, 900).rows, many.slice(0, 500));
  assert.deepEqual(paginateHistory(many, 1, 900).rows, [many[500]]);
  assert.deepEqual(paginateHistory(null, 8, 10),
    { rows: [], page: 0, pageCount: 1, start: 0, end: 0, total: 0 });
});
