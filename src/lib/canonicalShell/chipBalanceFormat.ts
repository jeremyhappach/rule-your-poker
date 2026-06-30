/**
 * Shared chip-circle balance formatter.
 *
 * Contract:
 *    0..999      →  $999
 *   -1..-999     → -$999
 *    1,000+      →  $1.3k   (one decimal for 1.0k..9.9k, integer for ≥10k)
 *   -1,000+      → -$1.3k
 *    10,000+     →  $12k
 *   -10,000+     → -$12k
 *
 * Single shared formatter for every chip-circle balance — waiting,
 * interstitial, gameplay, all game families. Per-game formatters that
 * paint inside the chip circle MUST route through this.
 *
 * Non-chip-circle text (hand history, transfer animations, action
 * strips, etc.) keeps using `formatChipValue` from `@/lib/utils`.
 */

export function formatChipBalance(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const rounded = Math.round(n);
  const abs = Math.abs(rounded);
  const sign = rounded < 0 ? '-' : '';
  if (abs < 1000) return `${sign}$${abs}`;
  if (abs < 10000) {
    const k = Math.round(abs / 100) / 10; // 1 decimal
    // Trim trailing .0 only when value rounds to whole-k.
    const str = k % 1 === 0 ? `${k.toFixed(0)}` : `${k.toFixed(1)}`;
    return `${sign}$${str}k`;
  }
  const k = Math.round(abs / 1000);
  return `${sign}$${k}k`;
}
