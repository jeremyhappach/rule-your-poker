/**
 * CanonicalChipBalanceLabel — shell-owned chip-circle balance text
 * primitive. Single home for typography rules applied to every
 * chip-circle balance: waiting, interstitial, gameplay, all game
 * families.
 *
 * The primitive is parameterized by the **measured chip-circle
 * diameter in CSS px**. All sizes (max usable width, preferred font
 * size, minimum font size) derive from that diameter via the global
 * `shell_chip_balance` config (Geometry Lab → Shell → Seat Cluster →
 * Chip Balance).
 *
 * Adaptive typography contract (per call site, per render):
 *
 *   availableWidthPx = diameterPx * maxWidthPct
 *
 *   fontSizePx =
 *     largest size in [minPx, prefPx] where the formatted text fits
 *     availableWidthPx.
 *
 *   No wrapping. No ellipsis. No horizontal scaling. Small values do
 *   NOT shrink because another player has a larger balance — fit is
 *   computed against the actual formatted string for THIS label.
 *
 * The caller owns the `text` content. Use `formatChipBalance(amount)`
 * from `@/lib/canonicalShell/chipBalanceFormat` for the shared
 * compaction contract.
 */

import { CSSProperties, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import {
  getShellChipBalanceConfig,
  subscribeShellChipBalance,
} from '@/lib/canonicalShell/shellChipBalanceConfig';

interface CanonicalChipBalanceLabelProps {
  /**
   * Pre-formatted balance string (the formatter is per-call-site so
   * the primitive doesn't need to know whether to suppress for
   * emoticon overlays, etc.). Use `formatChipBalance(amount)`.
   * Empty string renders nothing (so emoticon overlays still hide
   * the value).
   */
  text: string;
  /** Measured chip-circle diameter in CSS px. */
  diameterPx: number;
  /** Optional className for color (negative=red, etc.). */
  className?: string;
  style?: CSSProperties;
}

export function CanonicalChipBalanceLabel({
  text,
  diameterPx,
  className,
  style,
}: CanonicalChipBalanceLabelProps) {
  const cfg = useSyncExternalStore(
    subscribeShellChipBalance,
    getShellChipBalanceConfig,
    getShellChipBalanceConfig,
  );

  const prefPx = Math.max(1, diameterPx * cfg.prefSizePct);
  const minPx = Math.max(1, diameterPx * cfg.minSizePct);
  const availPx = Math.max(1, diameterPx * cfg.maxWidthPct);

  const spanRef = useRef<HTMLSpanElement | null>(null);
  const [fontSizePx, setFontSizePx] = useState<number>(prefPx);

  useLayoutEffect(() => {
    const el = spanRef.current;
    if (!el || !text) {
      setFontSizePx(prefPx);
      return;
    }
    // Measure at preferred size; scale down to fit only if needed.
    el.style.fontSize = `${prefPx}px`;
    const measured = el.scrollWidth;
    let next = prefPx;
    if (measured > availPx && measured > 0) {
      next = Math.max(minPx, prefPx * (availPx / measured));
    }
    if (next !== fontSizePx) setFontSizePx(next);
    // fontSizePx intentionally omitted — measurement drives state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, prefPx, minPx, availPx]);

  if (!text) return null;

  return (
    <span
      ref={spanRef}
      data-canonical-chip-balance-label=""
      className={cn(
        'font-bold leading-none tabular-nums whitespace-nowrap',
        className,
      )}
      style={{
        fontSize: `${fontSizePx}px`,
        maxWidth: `${availPx}px`,
        ...style,
      }}
    >
      {text}
    </span>
  );
}
