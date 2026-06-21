/**
 * GameplayOpponentSeatLayer — shell-owned gameplay opponent seat
 * cluster set for canonical card-family game tables (cribbage, gin
 * rummy, yahtzee).
 *
 * Architectural rule (non-negotiable):
 *   Games emit presentation state. Shell renders artifacts.
 *
 * Games used to mount their own <CanonicalSeatCluster> per opponent
 * during gameplay, with game-supplied children (card-back rows). That
 * meant the shell-ownership boundary was, in practice, still
 * game-owned for the entire gameplay lifecycle, and the ESLint
 * suppressions on CribbageMobileGameTable / GinRummyGameTable /
 * YahtzeeGameTable were permanent exceptions rather than migration
 * markers.
 *
 * This layer closes that gap:
 *
 *   - Shell owns the per-opponent <CanonicalSeatCluster> mount.
 *   - Games pass typed presentation accessors (pure functions of
 *     player) — no ReactNode children, no decorator escape hatches.
 *   - Card-back rows are rendered by the shell-internal
 *     <ShellOpponentCardBacks> component, parameterized by a typed
 *     `variant` field. The 'gin' variant ports the geometric
 *     OpponentCardBackStrip layout; the 'cribbage' variant ports the
 *     simpler static row. Future variants are a shell-side addition
 *     — still no game-supplied JSX.
 *
 * Pre-session ownership: when PreSessionSeatLayer is mounted above
 * (usePreSessionSeatOwned() → true), this layer hard-skips so the
 * one-cluster-per-participant invariant holds across the
 * pre-session ↔ gameplay handoff.
 *
 * Self-suppression for the local viewer is delegated to
 * CanonicalSeatCluster itself (it returns null when
 * viewerPosition === position).
 */

import { useMemo } from 'react';
import { CanonicalSeatCluster } from './CanonicalSeatCluster';
import { useSeatAnchorsOptional } from './SeatAnchorLayer';
import { usePreSessionSeatOwned } from './PreSessionSeatLayer';
import { useGeometryTokensOptional } from './ResponsiveGeometryProvider';
import { useCardRowLayout } from './useCardRowLayout';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import { formatChipValue } from '@/lib/utils';
import type { CanonicalSeatStatusRing } from './participantStatus';

// Width budget for the gin variant card-back strip. Sourced from
// canonical screenWidth (no DOM measurement; cannot self-feed).
const OPPONENT_STRIP_WIDTH_FRACTION = 0.22;
const OPPONENT_STRIP_MIN_WIDTH_PX = 56;
const OPPONENT_STRIP_MAX_WIDTH_PX = 180;

export type SeatStatusRing = CanonicalSeatStatusRing;

export interface GameplayOpponentSeatParticipant {
  /** Player id (db id, used as participantId for invariants). */
  id: string;
  /** Authoritative seat position (1..N). */
  position: number;
  /** Pre-resolved display name (callers use getDisplayName / bot alias). */
  name: string;
  /** Raw chip count — shell formats `$<n>` unless presentation.chipValue overrides. */
  chips: number;
}

export interface CardBacksPresentation {
  count: number;
  visible: boolean;
  variant: 'cribbage' | 'gin';
}

export interface GameplayOpponentSeatPresentation {
  dealerPip?: (p: GameplayOpponentSeatParticipant) => boolean;
  statusRing?: (p: GameplayOpponentSeatParticipant) => SeatStatusRing | undefined;
  /** Override the default `$<chips>` chip-value string. Return '' to render an empty chip bubble. */
  chipValue?: (p: GameplayOpponentSeatParticipant) => string | undefined;
  hideChipBubble?: (p: GameplayOpponentSeatParticipant) => boolean;
  scoreLine?: (p: GameplayOpponentSeatParticipant) => string | undefined;
  cardBacks?: (p: GameplayOpponentSeatParticipant) => CardBacksPresentation | null;
}

export interface GameplayOpponentSeatLayerProps {
  /** Game family used in ownerLabel + diagnostics. */
  family: 'cribbage' | 'gin-rummy' | 'yahtzee';
  /** Opponents to project (caller filters self / observers as needed). */
  participants: GameplayOpponentSeatParticipant[];
  /** Typed presentation accessors. All fields optional. */
  presentation?: GameplayOpponentSeatPresentation;
}

function defaultChipValue(n: number): string {
  return `$${formatChipValue(Number.isFinite(n) ? n : 0)}`;
}

interface ShellOpponentCardBacksProps {
  count: number;
  variant: 'cribbage' | 'gin';
  color: string;
  darkColor: string;
  /** Seat position — stamped as [data-card-anchor="opp-stack-${position}"]
   *  so canonical card transport can terminate exactly on this stack. */
  position: number;
}

function ShellOpponentCardBacks({ count, variant, color, darkColor, position }: ShellOpponentCardBacksProps) {
  // Hooks must run unconditionally — both branches read geometry tokens
  // even though only the gin branch consumes the layout.
  const geo = useGeometryTokensOptional();
  const screenWidth = geo?.screenWidth ?? 0;
  const rawBudget = screenWidth * OPPONENT_STRIP_WIDTH_FRACTION;
  const availableWidth = screenWidth > 0
    ? Math.max(OPPONENT_STRIP_MIN_WIDTH_PX, Math.min(OPPONENT_STRIP_MAX_WIDTH_PX, rawBudget))
    : 0;
  const layout = useCardRowLayout({
    availableWidth,
    count,
    minCardWidth: 10,
    maxCardWidth: 18,
    preferredOverlapRatio: 0.45,
    maxOverlapRatio: 0.7,
  });

  // Always render the anchor wrapper — card transport endpoints must
  // resolve even before the first card has settled (count=0).
  const anchorProps = {
    'data-card-anchor': `opp-stack-${position}`,
  } as const;

  if (variant === 'cribbage') {
    return (
      <div {...anchorProps} className="flex -space-x-1.5 mt-1 justify-center min-w-[1rem] min-h-[1.5rem]">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="w-4 h-6 rounded-sm border border-white/20"
            style={{
              background: `linear-gradient(135deg, ${color} 0%, ${darkColor} 100%)`,
            }}
          />
        ))}
      </div>
    );
  }

  // gin variant
  if (!layout) {
    return (
      <div {...anchorProps} className="flex -space-x-3 mt-1 min-w-[0.875rem] min-h-[1.25rem]">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="w-3.5 h-5 rounded-sm border border-white/20"
            style={{ background: `linear-gradient(135deg, ${color} 0%, ${darkColor} 100%)` }}
          />
        ))}
      </div>
    );
  }
  return (
    <div {...anchorProps} className="flex mt-1" style={{ width: layout.totalWidth, minHeight: layout.cardHeight }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-sm border border-white/20 shrink-0"
          style={{
            width: layout.cardWidth,
            height: layout.cardHeight,
            marginLeft: i === 0 ? 0 : -layout.overlapPx,
            background: `linear-gradient(135deg, ${color} 0%, ${darkColor} 100%)`,
          }}
        />
      ))}
    </div>
  );
}

export function GameplayOpponentSeatLayer({
  family,
  participants,
  presentation,
}: GameplayOpponentSeatLayerProps) {
  const ambient = useSeatAnchorsOptional();
  const preSessionOwned = usePreSessionSeatOwned();
  const { getCardBackColors } = useVisualPreferences();
  const cardBackColors = useMemo(() => getCardBackColors(), [getCardBackColors]);

  if (!ambient) return null;
  // While PreSessionSeatLayer owns the cluster set, hard-skip to keep
  // mountedCount==1 per participantId during the pre-session ↔ gameplay
  // handoff window.
  if (preSessionOwned) return null;

  const { byPosition } = ambient;

  return (
    <div
      data-canonical-shell-gameplay-opponent-seat-layer={family}
      className="absolute inset-0 z-50 pointer-events-none"
    >
      {participants.map((p) => {
        const anchor = byPosition.get(p.position);
        const slot = anchor?.slot ?? null;

        const dealerPip = presentation?.dealerPip?.(p) ?? false;
        const statusRing = presentation?.statusRing?.(p);
        const chipValueOverride = presentation?.chipValue?.(p);
        const chipValue =
          chipValueOverride !== undefined
            ? chipValueOverride
            : defaultChipValue(p.chips);
        const hideChipBubble = presentation?.hideChipBubble?.(p) ?? false;
        const scoreLine = presentation?.scoreLine?.(p);
        const cardBacks = presentation?.cardBacks?.(p) ?? null;
        const renderCardBacks =
          !!cardBacks && cardBacks.visible && cardBacks.count > 0;

        return (
          <CanonicalSeatCluster
            key={p.id}
            slot={slot}
            position={p.position}
            name={p.name}
            isDealer={dealerPip}
            chipValue={chipValue}
            hideChipBubble={hideChipBubble}
            statusRing={statusRing}
            scoreLine={scoreLine ?? null}
            ownerLabel={`Shell:GameplayOpponentSeatLayer[${family}]`}
            playerId={p.id}
          >
            {renderCardBacks && cardBacks ? (
              <ShellOpponentCardBacks
                count={cardBacks.count}
                variant={cardBacks.variant}
                color={cardBackColors.color}
                darkColor={cardBackColors.darkColor}
              />
            ) : null}
          </CanonicalSeatCluster>
        );
      })}
    </div>
  );
}
