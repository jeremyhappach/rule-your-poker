/**
 * CanonicalChipstack — Wave 3 / 3B (Option B: thin shell wrapper).
 *
 * Owns:
 *   - the per-seat stack-root <div> (relative positioning context)
 *   - stack-root identity attributes (`data-chipstack-root`,
 *     `data-chipstack-position`) so future chip-transport / pot wiring
 *     has a single, queryable handle per seat (additive to the existing
 *     `data-chip-center` attribute owned by CanonicalChipBadge)
 *   - the click affordance contract (host clickable + active:scale-95)
 *   - the shared composition pattern:
 *         <CanonicalChipstack position={player.position}>
 *           <CanonicalChipBadge ... />
 *         </CanonicalChipstack>
 *
 * Explicitly does NOT own (per Wave 3B charter):
 *   - placement relative to seat anchor (caller still mounts the
 *     stack inside its seat-cluster JSX / Yahtzee panel)
 *   - showdown replacement disc (MGT L4883 parallel path)
 *   - emoticon overlay replacement (still passed via badge `overlay` slot)
 *   - waiting-table chip (CanonicalSeatCluster internal badge)
 *   - pot, dealer button, transport animations, settlement math, FeltLayout
 *   - any new z-order system
 *
 * Visual contract: this wrapper renders nothing of its own — no padding,
 * no background, no border, no z-index. It is purely a structural /
 * identity element. Visuals come from the CanonicalChipBadge child.
 */

import type { ReactNode, MouseEventHandler } from 'react';
import { cn } from '@/lib/utils';

interface CanonicalChipstackProps {
  /** Seat position the stack belongs to. Mirrored onto `data-chipstack-position`. */
  position: number;
  /** Host click affordance — adds `cursor-pointer` to the stack root. */
  clickable?: boolean;
  /** Click handler (only invoked when `clickable` is true). */
  onClick?: MouseEventHandler<HTMLDivElement>;
  /** The CanonicalChipBadge (and any sibling adornments the caller wants inside the stack root). */
  children: ReactNode;
}

export const CanonicalChipstack = ({
  position,
  clickable = false,
  onClick,
  children,
}: CanonicalChipstackProps) => {
  return (
    <div
      data-chipstack-root=""
      data-chipstack-position={position}
      className={cn('relative', clickable && 'cursor-pointer')}
      onClick={clickable ? onClick : undefined}
    >
      {children}
    </div>
  );
};
