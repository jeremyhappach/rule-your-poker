/**
 * CanonicalChipDisc — Wave 3 / 3A + 3C consolidation.
 *
 * Shell-owned per-seat chip disc. Single source of truth for:
 *   - disc geometry per preset
 *   - chip value typography per preset
 *   - turn-pulse yellow ring overlay
 *   - folded opacity dim
 *   - `data-chip-center` anchor attribute (consumed by chip-fly origins)
 *   - optional status-driven ring class
 *
 * Presets:
 *   - 'gameplay'        : mobile w-12 / tablet w-16 — MGT-resident
 *                         games (Holm/357/Horses/SCC).
 *   - 'gameplay-compact': fixed w-12 — Yahtzee (mobile-only).
 *   - 'cluster'         : mobile w-10 / tablet w-11 — CanonicalOpponentSeat
 *                         identity-pill chip. Sized to fit the 96 px felt
 *                         pill alongside name + dealer pip + score line
 *                         while staying legible (3C.3 consolidation —
 *                         replaces the cluster's hand-rolled 32 px disc).
 *
 * The caller still owns:
 *   - bg color class (resolved via getParticipantChipBgClass / status palette)
 *   - chip value sourcing (lockedChipsRef vs displayedChips vs player.chips)
 *   - sibling overlays (ValueChangeFlash, emoticon overlay) — passed as children
 *   - ring class for non-yellow status rings (passed via ringClass)
 */

import { ReactNode } from 'react';
import { cn, formatChipValue } from '@/lib/utils';
import { useDeviceSize } from '@/hooks/useDeviceSize';

export type CanonicalChipDiscSize = 'gameplay' | 'gameplay-compact' | 'cluster';

interface CanonicalChipDiscProps {
  /** Chip amount displayed inside the disc. Pass `null` to suppress the
   *  value (e.g. emoticon overlay active, or caller renders its own
   *  value via children). */
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
  /** Optional click handler attached to the disc body. */
  onClick?: () => void;
  /** Extra ring class(es) appended to the disc body (e.g. status-driven
   *  colored rings from `getParticipantChipRingClass`). Independent of
   *  `showTurnRing`, which paints a yellow sibling overlay. */
  ringClass?: string;
  /** Position number for the `data-chip-center` anchor attribute consumed by chip-fly origins. */
  positionAnchor?: number;
  /** Disc size preset — see file header. */
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
  onClick,
  ringClass,
  positionAnchor,
  size = 'gameplay',
  forceNegativeColor = false,
  children,
  overlay,
}: CanonicalChipDiscProps) => {
  const { isTablet } = useDeviceSize();

  let discSize: string;
  let valueTextSize: string;
  if (size === 'cluster') {
    discSize = isTablet ? 'w-11 h-11' : 'w-10 h-10';
    valueTextSize = isTablet ? 'text-sm' : 'text-xs';
  } else if (size === 'gameplay' && isTablet) {
    discSize = 'w-16 h-16';
    valueTextSize = 'text-base';
  } else {
    discSize = 'w-12 h-12';
    valueTextSize = 'text-sm';
  }

  const isNegative = forceNegativeColor || (amount !== null && amount < 0);

  return (
    <div className={cn('relative', discSize)} data-chip-center={positionAnchor}>
      {showTurnRing && (
        <div className="absolute inset-0 rounded-full ring-3 ring-yellow-400" />
      )}
      <div
        data-chip-reaction-target={positionAnchor}
        onClick={onClick}
        className={cn(
          'absolute inset-0 rounded-full flex flex-col items-center justify-center border-2 border-slate-600/50',
          discSize,
          bgClass,
          ringClass,
          folded && 'opacity-50',
          pulseDisc && 'animate-turn-pulse',
          clickable && 'active:scale-95',
          onClick && 'cursor-pointer pointer-events-auto',
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
