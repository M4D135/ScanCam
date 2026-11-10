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
