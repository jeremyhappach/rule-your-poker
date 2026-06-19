/**
 * SessionLifecycleAnnouncer — session-level passive lifecycle ambient
 * ownership for the canonical announcement rail.
 *
 * Phase 2, Step 4 (Transient UX Platform — rail migration):
 *
 * Scope:
 *   - Passive / non-blocking lifecycle messaging owned at the
 *     session level by `Game.tsx` (NOT game-specific surfaces).
 *   - Strictly rail-only. No CTAs, no overlays, no celebration
 *     semantics, no gameplay-timing coupling.
 *
 * Surfaces migrated:
 *   - "Dealer configuring next game"
 *       previously: MobileGameTable `dealerSetupMessage` gold banner
 *   - "Awaiting ante decisions"
 *       previously: MobileGameTable ante_decision gold banner
 *   - "Selecting next dealer" / "Drawing for high card…"
 *       previously: MobileGameTable `dealerSelectionAnnouncement` banner
 *   - "Dealer selected" transient announcement
 *       previously: trailing in the same dealer-selection banner
 *
 * Explicitly OUT of scope (owned elsewhere or deferred):
 *   - Cribbage (`game.game_type === 'cribbage'`) — Cribbage owns its
 *     own dealer-selection / ante-bootstrap rail emissions inside
 *     `CribbageMobileGameTable`. This component MUST be a no-op for
 *     Cribbage to avoid double-ownership.
 *   - In-progress waiting-for-opponent rail messaging
 *     (per-game gameplay surfaces own that).
 *   - CTA prompts / pegging notices / overlays.
 *
 * Ownership discipline:
 *   - This component uses a single `lastAmbientIdRef` to track the
 *     ambient it last emitted. Teardown only clears ambient if the
 *     active ambient id matches what we emitted — never clobbers
 *     ambient owned by another writer (game-specific tables).
 *
 * Mount: rendered once inside `PersistentTableShell` (so it has the
 *        `useAnnouncements` context).
 */

import { useEffect, useRef } from 'react';
import { useAnnouncements, useAnnouncementContext } from './CanonicalAnnouncementProvider';
import { getBotAlias } from '@/lib/botAlias';

interface Player {
  id: string;
  user_id: string;
  position: number;
  is_bot?: boolean;
  sitting_out?: boolean | null;
  ante_decision?: string | null;
  status?: string | null;
  profiles?: { username?: string | null } | null;
}


interface DealerSelectionCardLite {
  position: number;
  card: { rank: string; suit: string };
  isDimmed?: boolean;
  isWinner?: boolean;
  roundNumber?: number;
}

export interface SessionLifecycleAnnouncerProps {
  gameId: string | null | undefined;
  gameType: string | null | undefined;
  gameStatus: string | null | undefined;
  /** `(game as any).config_complete` — dealer-config-complete latch. */
  configComplete: boolean | null | undefined;
  /** Viewer is the current dealer for the dealer-config phase. */
  isViewerDealer: boolean;
  /** Whether bots are allowed to deal (suppresses bot-dealer config plate). */
  allowBotDealers: boolean;
  /** Current dealer player row (for name + bot status). */
  dealerPlayer: Player | null | undefined;
  /** All players (for bot-alias resolution and winner name lookup). */
  players: Player[];
  /** Session-level dealer-selection cards (high-card draw state). */
  dealerSelectionCards: DealerSelectionCardLite[];
  /** Session-level dealer-selection resolved winner position. */
  dealerSelectionWinnerPosition: number | null;
}

function resolveDisplayName(players: Player[], p: Player | null | undefined, fallback: string): string {
  if (!p) return fallback;
  if (p.is_bot) return getBotAlias(players as any, p.user_id) || fallback;
  return p.profiles?.username || fallback;
}

export function SessionLifecycleAnnouncer({
  gameId,
  gameType,
  gameStatus,
  configComplete,
  isViewerDealer,
  allowBotDealers,
  dealerPlayer,
  players,
  dealerSelectionCards,
  dealerSelectionWinnerPosition,
}: SessionLifecycleAnnouncerProps) {
  const announcements = useAnnouncements();
  const ctx = useAnnouncementContext();
  const lastAmbientIdRef = useRef<string | null>(null);
  const lastDealerSelectedTransientRef = useRef<string | null>(null);

  // Cribbage owns its own passive lifecycle rail (see CribbageMobileGameTable).
  // Hard-skip to prevent double-emission / ownership ambiguity.
  const isCribbage = gameType === 'cribbage';

  // Compute the cohort/round-number for dealer-selection (for stable id).
  const dsCohort = (() => {
    if (!dealerSelectionCards || dealerSelectionCards.length === 0) return 0;
    let max = 0;
    for (const c of dealerSelectionCards) {
      const r = c.roundNumber ?? 1;
      if (r > max) max = r;
    }
    return max;
  })();

  const dsHasCards = dealerSelectionCards && dealerSelectionCards.length > 0;
  const dsTie =
    dealerSelectionWinnerPosition === null && dsHasCards && dsCohort > 1;

  // -- Ambient orchestration --
  useEffect(() => {
    if (!gameId) return;

    // Classify which ambient (if any) we should own this frame.
    type AmbientPlan =
      | { kind: 'dealer_selection_in_progress'; id: string; cohort: number; tie: boolean }
      | { kind: 'dealer_configuring'; id: string; dealerName?: string }
      | { kind: 'awaiting_ante'; id: string }
      | null;

    let plan: AmbientPlan = null;

    // Dealer-configuring: SHELL-OWNED for every family (Cribbage included).
    // CribbageMobileGameTable does not emit dealer_configuring, and the
    // between-games rollover window often still reports game_type='cribbage'
    // (or null) while the next dealer picks the new game. Skipping the
    // announcer for cribbage here left observers with no "is setting up
    // the next game" plate during Cribbage→Gin rollover. Dealer-configuring
    // is shell-level lifecycle messaging, not gameplay messaging — emit it
    // regardless of current game_type so the rail contract is uniform
    // across first-session-setup and between-games-rollover.
    if (
      (gameStatus === 'game_selection' ||
        gameStatus === 'configuring' ||
        ((gameStatus === 'game_over' || gameStatus === 'session_ended') && !configComplete)) &&
      !isViewerDealer &&
      dealerPlayer &&
      !(dealerPlayer.is_bot && allowBotDealers)
    ) {
      const dealerName = resolveDisplayName(players, dealerPlayer, 'Dealer');
      plan = {
        kind: 'dealer_configuring',
        id: `${gameId}:session-config:${dealerPlayer.id}`,
        dealerName,
      };
    } else if (!isCribbage && gameStatus === 'dealer_selection' && dealerSelectionWinnerPosition === null) {
      plan = {
        kind: 'dealer_selection_in_progress',
        id: `${gameId}:session-ds:${dsCohort}`,
        cohort: dsCohort,
        tie: !!dsTie,
      };
    } else if (!isCribbage && gameStatus === 'ante_decision') {
      plan = {
        kind: 'awaiting_ante',
        id: `${gameId}:session-ante`,
      };
    }

    if (plan) {
      // Refresh / emit the planned ambient.
      lastAmbientIdRef.current = plan.id;
      if (plan.kind === 'dealer_selection_in_progress') {
        announcements.emit({
          id: plan.id,
          type: 'dealer_selection_in_progress',
          scope: { dealerGameId: gameId },
          payload: { cohort: plan.cohort, tie: plan.tie },
        });
      } else if (plan.kind === 'dealer_configuring') {
        announcements.emit({
          id: plan.id,
          type: 'dealer_configuring',
          scope: { dealerGameId: gameId },
          payload: { dealerName: plan.dealerName },
        });
      } else if (plan.kind === 'awaiting_ante') {
        announcements.emit({
          id: plan.id,
          type: 'awaiting_ante',
          scope: { dealerGameId: gameId },
        });
      }
      return;
    }

    // No ambient should be owned by us this frame. Teardown ONLY if the
    // currently-active ambient is one we emitted (don't clobber).
    if (
      lastAmbientIdRef.current &&
      ctx?.ambient?.id === lastAmbientIdRef.current
    ) {
      announcements.clearAmbient();
    }
    lastAmbientIdRef.current = null;
  }, [
    gameId,
    isCribbage,
    gameStatus,
    configComplete,
    isViewerDealer,
    allowBotDealers,
    dealerPlayer?.id,
    dealerPlayer?.is_bot,
    dealerSelectionWinnerPosition,
    dsCohort,
    dsTie,
    players,
    announcements,
    ctx?.ambient?.id,
  ]);

  // -- Transient: dealer_selected (non-cribbage) --
  useEffect(() => {
    if (!gameId || isCribbage) return;
    if (gameStatus !== 'dealer_selection') return;
    if (dealerSelectionWinnerPosition == null) return;

    const winner = players.find((p) => p.position === dealerSelectionWinnerPosition);
    if (!winner) return;

    const id = `${gameId}:session-dealer-selected:${dsCohort}:${dealerSelectionWinnerPosition}`;
    if (lastDealerSelectedTransientRef.current === id) return;
    lastDealerSelectedTransientRef.current = id;

    // Clear our own dealer_selection_in_progress ambient first so the
    // transient cleanly supersedes the "Selecting next dealer" plate.
    if (
      lastAmbientIdRef.current &&
      ctx?.ambient?.id === lastAmbientIdRef.current
    ) {
      announcements.clearAmbient();
      lastAmbientIdRef.current = null;
    }

    const winnerCard = dealerSelectionCards
      .filter((c) => c.position === dealerSelectionWinnerPosition && !c.isDimmed)
      .slice(-1)[0];
    const cardLabel = winnerCard ? `${winnerCard.card.rank}${winnerCard.card.suit}` : '';

    announcements.emit({
      id,
      type: 'dealer_selected',
      scope: { dealerGameId: gameId },
      payload: {
        dealerName: resolveDisplayName(players, winner, `Seat ${dealerSelectionWinnerPosition}`),
        cardLabel,
      },
    });
    // Tracer: dealer-selection lifecycle — announcement was published.
    // Lazy import so the announcer module stays pure.
    import('@/lib/dealerSelectionDiag').then(({ recordDealerSelectionDiag }) => {
      recordDealerSelectionDiag('dealer_selection_announcement_published', {
        sessionId: gameId,
        dealerSelectionId: `${gameId}:host`,
        winnerPosition: dealerSelectionWinnerPosition,
        cardCount: dealerSelectionCards.length,
        scope: 'session',
        extra: { announcementId: id, cardLabel },
      });
    });
  }, [
    gameId,
    isCribbage,
    gameStatus,
    dealerSelectionWinnerPosition,
    dsCohort,
    dealerSelectionCards,
    players,
    announcements,
    ctx?.ambient?.id,
  ]);

  // Reset dealer-selected transient latch when leaving dealer_selection.
  useEffect(() => {
    if (gameStatus !== 'dealer_selection') {
      lastDealerSelectedTransientRef.current = null;
    }
  }, [gameStatus]);

  return null;
}
