/**
 * Pure helpers for selecting history entries. Records remain the application's
 * validated { format, text, timestamp, count } objects; selection stores keys.
 */

/** Keep format and raw text separate, even when either contains a NUL. */
export function historyKey(record) {
  return JSON.stringify([record.format, record.text]);
}

/** Return a fresh selection containing only records still in the history. */
export function reconcileHistorySelection(records, selected) {
  const present = new Set(records.map(historyKey));
  return new Set([...selected].filter((key) => present.has(key)));
}

/**
 * Toggle the supplied visible records without deselecting filtered-out entries.
 * Stale selections and visible entries no longer in records are ignored.
 */
export function selectVisibleHistory(records, selected, visible, checked) {
  const present = new Set(records.map(historyKey));
  const next = new Set([...selected].filter((key) => present.has(key)));
  for (const record of visible) {
    const key = historyKey(record);
    if (!present.has(key)) continue;
    if (checked) next.add(key);
    else next.delete(key);
  }
  return next;
}

/** Preserve entry objects, their metadata and their order in both partitions. */
export function partitionHistorySelection(records, selected) {
  const kept = [];
  const removed = [];
  for (const record of records) {
    (selected.has(historyKey(record)) ? removed : kept).push(record);
  }
  return { kept, removed };
}

/** Slice one page without changing records. start is inclusive, end exclusive. */
export function paginateHistory(records, page, pageSize) {
  const list = Array.isArray(records) ? records : [];
  const integer = (value, fallback) => {
    if (typeof value !== 'number' && typeof value !== 'string') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
  };
  const size = Math.max(1, Math.min(500, integer(pageSize, 1)));
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.max(0, Math.min(pageCount - 1, integer(page, 0)));
  const start = current * size;
  const end = Math.min(start + size, total);
  return { rows: list.slice(start, end), page: current, pageCount, start, end, total };
}
