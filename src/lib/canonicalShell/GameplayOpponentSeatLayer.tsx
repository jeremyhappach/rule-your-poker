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

import { useEffect, useState, useSyncExternalStore } from 'react';
import { CanonicalSeatCluster } from './CanonicalSeatCluster';
import { useSeatAnchorsOptional } from './SeatAnchorLayer';
import { usePreSessionSeatOwned } from './PreSessionSeatLayer';
import { CanonicalCardBack } from '@/components/canonicalShell/CanonicalCardBack';
import { formatChipBalance } from '@/lib/canonicalShell/chipBalanceFormat';
import type { CanonicalSeatStatusRing } from './participantStatus';
import {
  getShellOpponentCardBacksConfig,
  subscribeShellOpponentCardBacks,
} from './shellOpponentCardBacksConfig';

// Canonical (viewport-stable) card-back sizing per variant. Card size
// and aspect ratio are fixed by contract — the adaptive fan policy
// tightens overlap only, never shrinks cards.
const CANONICAL_CARDBACK_SIZE = {
  cribbage: { widthPx: 16, heightPx: 24 },
  gin: { widthPx: 18, heightPx: 26 },
} as const;

// Preferred (natural) gap between adjacent card centers as a fraction
// of card width. When the fan fits inside the max-span cap this is
// what the row renders; if it overflows, the resolver tightens the
// step down to whatever fraction is needed to satisfy the cap
// (0 = fully stacked). No lower bound.
const PREFERRED_STEP_FRACTION = {
  cribbage: 0.625, // ≈ current `-space-x-1.5` at 16px
  gin: 0.55,       // legibility-first natural spread
} as const;

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
  return formatChipBalance(Number.isFinite(n) ? n : 0);
}

interface ShellOpponentCardBacksProps {
  count: number;
  variant: 'cribbage' | 'gin';
  /** @deprecated Canonicalized — colors now sourced from CanonicalCardBack/useVisualPreferences. */
  color?: string;
  /** @deprecated Canonicalized — colors now sourced from CanonicalCardBack/useVisualPreferences. */
  darkColor?: string;
  /** Seat position — stamped as [data-card-anchor="opp-stack-${position}"]
   *  so canonical card transport can terminate exactly on this stack. */
  position: number;
}

function ShellOpponentCardBacks({ count, variant, position }: ShellOpponentCardBacksProps) {
  // Subscribe to the global Shell / Opponent Card Backs config
  // (Geometry Lab → Seat Cluster → Opponent Card Backs). The authored
  // maxFanSpanPct is the source of truth; runtime pixels are derived
  // from the canonical chip-bubble width at layout time.
  const cfg = useSyncExternalStore(
    subscribeShellOpponentCardBacks,
    getShellOpponentCardBacksConfig,
    getShellOpponentCardBacksConfig,
  );

  // Live-measure the canonical chip bubble
  // ([data-chip-center="${position}"]) — the sole basis for the
  // maxFanSpan pixel resolution. Falls back to 40px (baseline chip
  // diameter) until the first measurement lands so the initial render
  // is never blank.
  const [chipBubbleWidthPx, setChipBubbleWidthPx] = useState<number>(40);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const measure = () => {
      const chip = document.querySelector(
        `[data-chip-center="${position}"]`,
      ) as HTMLElement | null;
      if (!chip) return;
      const r = chip.getBoundingClientRect();
      if (r.width > 0) {
        setChipBubbleWidthPx((prev) =>
          Math.abs(prev - r.width) > 0.5 ? r.width : prev,
        );
      }
    };
    measure();
    if (typeof window === 'undefined') return;
    let ro: ResizeObserver | null = null;
    const chip = document.querySelector(
      `[data-chip-center="${position}"]`,
    ) as HTMLElement | null;
    if (chip && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(chip);
    }
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [position]);

  // Canonical (fixed) size — variant-owned. No shrink-to-fit.
  const { widthPx: cardWidth, heightPx: cardHeight } =
    CANONICAL_CARDBACK_SIZE[variant];
  const preferredStepFrac = PREFERRED_STEP_FRACTION[variant];

  // Adaptive fan span policy:
  //   maxFanSpanPx = chipBubbleWidthPx × (maxFanSpanPct / 100)
  //   naturalStep  = cardWidth × preferredStepFrac
  //   naturalSpan  = cardWidth + (count-1) × naturalStep
  // If naturalSpan ≤ maxFanSpanPx → keep the natural spread.
  // Otherwise, tighten step just enough to satisfy the cap. Step
  // may fall to 0 (fully stacked); no lower bound is enforced.
  const maxFanSpanPx =
    chipBubbleWidthPx * (cfg.maxFanSpanPct / 100);
  const naturalStep = cardWidth * preferredStepFrac;
  const naturalSpan =
    count > 0 ? cardWidth + (count - 1) * naturalStep : 0;
  const step =
    count > 1 && naturalSpan > maxFanSpanPx
      ? Math.max(0, (maxFanSpanPx - cardWidth) / (count - 1))
      : naturalStep;
  const totalWidth =
    count > 0 ? cardWidth + (count - 1) * step : 0;
  // step < cardWidth → overlap; overlapPx applied as negative marginLeft
  // to every non-leading card (identical accounting to the prior
  // useCardRowLayout output).
  const overlapPx = cardWidth - step;

  // Always render the anchor wrapper — card transport endpoints must
  // resolve even before the first card has settled (count=0). Center
  // the fan on the existing opponent-card anchor via mx-auto.
  const anchorProps = {
    'data-card-anchor': `opp-stack-${position}`,
  } as const;

  return (
    <div
      {...anchorProps}
      className="flex mt-1 mx-auto"
      style={{
        width: totalWidth || cardWidth,
        minHeight: cardHeight,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <CanonicalCardBack
          key={i}
          widthPx={cardWidth}
          heightPx={cardHeight}
          className="shrink-0"
          style={{ marginLeft: i === 0 ? 0 : -overlapPx }}
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
  // Card-back colors now sourced inside CanonicalCardBack — no per-layer
  // prop drilling needed.

  if (!ambient) return null;
  // While PreSessionSeatLayer owns the cluster set, hard-skip to keep
  // mountedCount==1 per participantId during the pre-session ↔ gameplay
  // handoff window.
  if (preSessionOwned) return null;

  const { byPosition } = ambient;

  return (
    <div
      data-canonical-shell-gameplay-opponent-seat-layer={family}
      data-canonical-seat-frame="shell-felt-frame"
      className="z-50 pointer-events-none"
      style={{
        // COORDINATE-FRAME CONTRACT: opponent seat placement
        // percentages must resolve against the full shell-children
        // column width in every phase/family. The prior
        // `width: var(--shell-felt-w); left:50%; translateX(-50%)`
        // clamp duplicated the felt paint frame onto the seat
        // coordinate frame and pulled seats inward vs. the
        // MobileGameTable canonical clusters. --shell-felt-w stays
        // owned by ShellOwnedFeltHost for the ellipse paint only.
        position: 'fixed',
        top: 'calc(var(--shell-header-h, 0px) + var(--play-top-safe-area, 0px))',
        left: 0,
        right: 0,
        width: 'auto',
        height: 'var(--shell-felt-h)',
        overflow: 'visible',

      }}
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
                position={p.position}
              />
            ) : (
              // Anchor-only placeholder so card transport endpoints
              // resolve even before any opponent card has settled.
              <div
                data-card-anchor={`opp-stack-${p.position}`}
                className="mt-1 w-4 h-6 pointer-events-none"
                style={{ opacity: 0 }}
                aria-hidden="true"
              />
            )}
          </CanonicalSeatCluster>
        );
      })}
    </div>
  );
}
