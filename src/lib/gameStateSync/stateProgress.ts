/**
 * Progress vector comparison utilities.
 *
 * A progress vector is an array of numbers representing how far
 * a game has advanced. Vectors are compared element by element,
 * left to right (most-significant first).
 */

import type { ProgressVector } from './types';

/**
 * Compare two progress vectors.
 * Returns:
 *   1  if `next` is strictly ahead of `current`
 *   0  if they are equal
 *  -1  if `next` is behind `current` (regressive)
 */
export function compareProgress(
  current: ProgressVector,
  next: ProgressVector,
): 1 | 0 | -1 {
  const len = Math.max(current.length, next.length);
  for (let i = 0; i < len; i++) {
    const c = current[i] ?? 0;
    const n = next[i] ?? 0;
    if (n > c) return 1;
    if (n < c) return -1;
  }
  return 0;
}

/**
 * Returns true if `next` is at least as advanced as `current`.
 */
export function isProgressForwardOrEqual(
  current: ProgressVector,
  next: ProgressVector,
): boolean {
  return compareProgress(current, next) >= 0;
}

/**
 * Returns true if `next` is strictly more advanced than `current`.
 */
export function isProgressStrictlyForward(
  current: ProgressVector,
  next: ProgressVector,
): boolean {
  return compareProgress(current, next) === 1;
}

/**
 * Simple JSON-based equality for state snapshots.
 * Used as default when no custom isEqual is provided.
 */
export function jsonEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => jsonEqual(value, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter(key => left[key] !== undefined).sort();
  const otherKeys = Object.keys(right).filter(key => right[key] !== undefined).sort();
  return keys.length === otherKeys.length && keys.every((key, index) => key === otherKeys[index] && jsonEqual(left[key], right[key]));
}
