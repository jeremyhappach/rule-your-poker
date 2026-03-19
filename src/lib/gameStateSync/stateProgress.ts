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
  return JSON.stringify(a) === JSON.stringify(b);
}
