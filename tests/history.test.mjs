import test from 'node:test';
import assert from 'node:assert/strict';
import {
  historyKey, reconcileHistorySelection, selectVisibleHistory, partitionHistorySelection,
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
