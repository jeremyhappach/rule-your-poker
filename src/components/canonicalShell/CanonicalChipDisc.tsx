/**
 * CanonicalChipDisc — Wave 3 / 3A.
 *
 * Shell-owned per-seat chip disc. Single source of truth for:
 *   - disc geometry (mobile w-12/h-12, tablet w-16/h-16)
 *   - chip value typography (mobile text-sm, tablet text-base)
 *   - turn-pulse yellow ring overlay
 *   - folded opacity dim
 *   - `data-chip-center` anchor attribute (consumed by chip-fly origins)
 *
 * Scope (3A consumers): Holm, 3-5-7, Horses, SCC, Yahtzee.
 * Skipped (per Wave 3 inventory): Gin, Cribbage — bespoke seat anchors.
 *
 * Explicitly out of scope for 3A:
 *   - pot disc, dealer button, chip transport, settlement math.
 *
 * The caller still owns:
 *   - bg color class (resolved via getParticipantChipBgClass / status palette)
 *   - chip value sourcing (lockedChipsRef vs displayedChips vs player.chips)
 *   - sibling overlays (ValueChangeFlash, emoticon overlay) — passed as children
 */

import { ReactNode } from 'react';
import { cn, formatChipValue } from '@/lib/utils';
import { useDeviceSize } from '@/hooks/useDeviceSize';

export type CanonicalChipDiscSize = 'gameplay' | 'gameplay-compact';

interface CanonicalChipDiscProps {
  /** Chip amount displayed inside the disc. Pass `null` to suppress the value (e.g. emoticon overlay active). */
  amount: number | null;
  /** Tailwind bg class for the disc fill — resolved by caller via status palette. Defaults to `bg-slate-300`. */
  bgClass?: string;
  /** Render the yellow turn-pulse ring as a sibling overlay. */
  showTurnRing?: boolean;
  /** Apply the `animate-turn-pulse` class to the disc body. Decoupled from `showTurnRing` because Holm suppresses the pulse on `stay`. */
  pulseDisc?: boolean;
  /** Dim the disc (folded players). */
  folded?: boolean;
  /** Adds `active:scale-95` for host click affordance. */
  clickable?: boolean;
  /** Position number for the `data-chip-center` anchor attribute consumed by chip-fly origins. */
  positionAnchor?: number;
  /**
   * 'gameplay' = mobile w-12 / tablet w-16 (MGT-resident games: Holm/357/Horses/SCC).
   * 'gameplay-compact' = fixed w-12 (Yahtzee — mobile-only surface).
   */
  size?: CanonicalChipDiscSize;
  /** Force value text to red even when amount >= 0 (caller may have richer color rules). */
  forceNegativeColor?: boolean;
  /** Sibling overlays rendered INSIDE the disc body (ValueChangeFlash etc.). */
  children?: ReactNode;
  /** Sibling overlays rendered ALONGSIDE the disc body inside the same relative wrapper (emoticon overlay etc.). */
  overlay?: ReactNode;
}

export const CanonicalChipDisc = ({
  amount,
  bgClass = 'bg-slate-300',
  showTurnRing = false,
  pulseDisc = false,
  folded = false,
  clickable = false,
  positionAnchor,
  size = 'gameplay',
  forceNegativeColor = false,
  children,
  overlay,
}: CanonicalChipDiscProps) => {
  const { isTablet } = useDeviceSize();

  // Tablet sizing applies ONLY to the gameplay preset. The compact preset
  // (Yahtzee) is mobile-only and intentionally fixed at w-12.
  const tabletScale = size === 'gameplay' && isTablet;
  const discSize = tabletScale ? 'w-16 h-16' : 'w-12 h-12';
  const valueTextSize = tabletScale ? 'text-base' : 'text-sm';

  const isNegative = forceNegativeColor || (amount !== null && amount < 0);

  return (
    <div className={cn('relative', discSize)} data-chip-center={positionAnchor}>
      {showTurnRing && (
        <div className="absolute inset-0 rounded-full ring-3 ring-yellow-400" />
      )}
      <div
        className={cn(
          'absolute inset-0 rounded-full flex flex-col items-center justify-center border-2 border-slate-600/50',
          discSize,
          bgClass,
          folded && 'opacity-50',
          pulseDisc && 'animate-turn-pulse',
          clickable && 'active:scale-95',
        )}
      >
        {amount !== null && (
          <span
            className={cn(
              'font-bold leading-none',
              valueTextSize,
              isNegative ? 'text-red-600' : 'text-slate-800',
            )}
          >
            ${formatChipValue(Math.round(amount))}
          </span>
        )}
        {children}
      </div>
      {overlay}
    </div>
  );
};
