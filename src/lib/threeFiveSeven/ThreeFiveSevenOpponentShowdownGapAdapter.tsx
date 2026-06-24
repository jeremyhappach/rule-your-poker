/**
 * 3-5-7 Opponent Showdown — seat-below gap adapter.
 *
 * Narrow adapter that wires Geometry Lab v2
 * `anchor.belowChipGapPx` into the exposed-opponent showdown render
 * path ONLY. CanonicalSeatCluster's `data-canonical-seat-below`
 * wrapper hard-codes a 2 px gap from the chip cell for every game;
 * this adapter layers a vertical offset of
 * `(belowChipGapPx - SEAT_BELOW_STATIC_GAP_PX)` so the EFFECTIVE
 * renderer-consumed gap equals the Lab value.
 *
 * Invariants:
 *   - Default Lab value (2 px) ⇒ 0 px translateY ⇒ visual parity.
 *   - Only mounts inside the 3-5-7 multiplayer showdown opponent
 *     cards branch. Never wraps any other game, self-hand, or
 *     canonical-seat consumer.
 *   - Publishes the effective gap to the renderer-consumed store so
 *     the Geometry Lab parity panel reads the value actually applied
 *     by the renderer, not just the stored config.
 */
import { ReactNode, useEffect } from 'react';
import {
  SEAT_BELOW_STATIC_GAP_PX,
  publishRendererConsumedBelowChipGapPx,
  resolveShowdownRules,
  useIsSmBreakpoint,
  useThreeFiveSevenShowdownConfig,
} from './showdownConfig';

interface Props {
  children: ReactNode;
}

export function ThreeFiveSevenOpponentShowdownGapAdapter({ children }: Props) {
  const cfg = useThreeFiveSevenShowdownConfig();
  const isSm = useIsSmBreakpoint();
  const resolved = resolveShowdownRules(cfg, isSm);
  const labGap = resolved.anchor.belowChipGapPx;
  const deltaPx = labGap - SEAT_BELOW_STATIC_GAP_PX;

  useEffect(() => {
    publishRendererConsumedBelowChipGapPx(labGap);
    return () => {
      // On unmount we leave the last published value in place so the
      // parity panel can still read it briefly; subsequent mounts
      // will overwrite. If nothing is mounted the panel will simply
      // show the most recent renderer-consumed value.
    };
  }, [labGap]);

  return (
    <div
      data-357-showdown-belowchip-adapter=""
      data-357-showdown-belowchip-gap-px={labGap}
      data-357-showdown-belowchip-delta-px={deltaPx}
      style={deltaPx !== 0 ? { transform: `translateY(${deltaPx}px)` } : undefined}
    >
      {children}
    </div>
  );
}
