/**
 * Fractional indexing.
 *
 * Items are ordered by a double. Inserting between 1000 and 2000 assigns 1500,
 * so a single drag writes exactly one row instead of renumbering its siblings.
 * Doubles run out of precision after ~50 consecutive splits in the same gap,
 * so callers check `needsNormalization` and rewrite the list when it gets tight.
 */

export const POSITION_STEP = 1000;

/** Smallest gap we tolerate before renumbering a list. */
const MIN_GAP = 1e-4;

export function positionBetween(
  before: number | null | undefined,
  after: number | null | undefined,
): number {
  if (before == null && after == null) return POSITION_STEP;
  if (before == null) return after! - POSITION_STEP;
  if (after == null) return before + POSITION_STEP;
  return (before + after) / 2;
}

/** Position for appending to the end of an ordered list. */
export function positionAtEnd(items: { position: number }[]): number {
  if (items.length === 0) return POSITION_STEP;
  return Math.max(...items.map((i) => i.position)) + POSITION_STEP;
}

/** Position for prepending to an ordered list. */
export function positionAtStart(items: { position: number }[]): number {
  if (items.length === 0) return POSITION_STEP;
  return Math.min(...items.map((i) => i.position)) - POSITION_STEP;
}

/**
 * Position that places an item at `index` within an already-sorted list that
 * does *not* contain the item being moved.
 */
export function positionForIndex(
  sorted: { position: number }[],
  index: number,
): number {
  const before = index > 0 ? sorted[index - 1]?.position : null;
  const after = index < sorted.length ? sorted[index]?.position : null;
  return positionBetween(before ?? null, after ?? null);
}

/**
 * `count` evenly-spaced positions between two neighbours, for dropping a
 * multi-selection into one slot.
 */
export function spreadBetween(
  before: number | null,
  after: number | null,
  count: number,
): number[] {
  if (count <= 0) return [];
  if (before == null && after == null) {
    return Array.from({ length: count }, (_, i) => (i + 1) * POSITION_STEP);
  }
  if (before == null) {
    const start = after! - count * POSITION_STEP;
    return Array.from({ length: count }, (_, i) => start + i * POSITION_STEP);
  }
  if (after == null) {
    return Array.from({ length: count }, (_, i) => before + (i + 1) * POSITION_STEP);
  }
  const step = (after - before) / (count + 1);
  return Array.from({ length: count }, (_, i) => before + step * (i + 1));
}

export function needsNormalization(sorted: { position: number }[]): boolean {
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].position - sorted[i - 1].position;
    if (!Number.isFinite(gap) || gap < MIN_GAP) return true;
  }
  return false;
}

/** Evenly-spaced positions for a list, preserving its current order. */
export function normalizedPositions<T extends { id: string }>(
  sorted: T[],
): Map<string, number> {
  const out = new Map<string, number>();
  sorted.forEach((item, i) => out.set(item.id, (i + 1) * POSITION_STEP));
  return out;
}

export function byPosition<T extends { position: number; id: string }>(
  a: T,
  b: T,
): number {
  if (a.position !== b.position) return a.position - b.position;
  // Stable tiebreak so two devices assigning the same position still agree.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
