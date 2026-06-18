/**
 * DealerIndicator — canonical dealer affordance for identity rows.
 *
 * A small "D" pip used to mark the dealer of the CURRENT hand in the
 * local-player identity row (shell HUD). Opponents use the dealer pip
 * baked into CanonicalSeatCluster's name row; this primitive matches
 * that style so the badge reads as the same affordance regardless of
 * whether it is rendered on a seat cluster or in the local row.
 *
 * Semantics: render only when localPlayer.id === current-hand dealerId.
 * Dice families (Yahtzee, Horses, Ship Captain Crew) MUST NOT render
 * any dealer indicator — they have no dealer concept.
 */
import { cn } from '@/lib/utils';

export interface DealerIndicatorProps {
  /** Visual size. `sm` matches inline identity rows. */
  size?: 'sm' | 'md';
  className?: string;
}

export function DealerIndicator({ size = 'sm', className }: DealerIndicatorProps) {
  return (
    <span
      data-canonical-dealer-indicator=""
      aria-label="Dealer"
      title="Dealer"
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-red-600 border border-white text-white font-bold shadow shrink-0',
        size === 'md' ? 'w-5 h-5 text-[10px]' : 'w-4 h-4 text-[9px] leading-none',
        className,
      )}
    >
      D
    </span>
  );
}
