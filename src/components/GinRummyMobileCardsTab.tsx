// Gin Rummy Mobile Cards Tab - Player's hand display and action buttons
// My cards always live here — never on the felt.
// During knocking/laying_off: show melds + deadwood organized, with lay-off UX.

import { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CARDS_PER_PLAYER as GIN_CARDS_PER_PLAYER, type GinRummyState, type GinRummyCard, type GinRummyPlayerState, type Meld } from '@/lib/ginRummyTypes';
import { canKnock, hasGin, findLayOffOptions, findOptimalMelds } from '@/lib/ginRummyScoring';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { MeasuredActiveHandFan } from './activeHand/MeasuredActiveHandFan';
import { useActiveHandLayoutPolicy } from '@/lib/activeHand/activeHandLayoutSettings';
import type { Card as CanonicalCardType } from '@/lib/cardUtils';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { recordGinPhaseTrace } from '@/lib/ginPhaseTrace';
// (Removed cardArtifactOverlap import — Gin active hand is HUDStack-owned,
// not a felt-artifact overlap value. Prior static margins restored below.)

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot?: boolean;
  profiles?: { username: string };
}

interface GinRummyMobileCardsTabProps {
  ginState: GinRummyState;
  currentPlayerId: string;
  isProcessing: boolean;
  onDrawStock: () => void;
  onDrawDiscard: () => void;
  onDiscard: (index: number) => void;
  onKnock: (index: number) => void;
  onTakeFirstDraw: () => void;
  onPassFirstDraw: () => void;
  onLayOff: (cardIndex: number, meldIndex: number) => void;
  onFinishLayingOff: () => void;
  /** Called whenever the selected card index changes during lay-off */
  onLayOffCardSelected?: (index: number | null) => void;
  currentPlayer: Player;
  gameId: string;
  /** Full current-hand identity from the Gin shell: dealer-game + round + hand. */
  handIdentityKey?: string | null;
  /** Cards to hide from the rendered hand while their self-draw
   *  transport animations are in flight. Each entry is keyed by its
   *  own intent and released independently on its own settle. */
  withheldDrawnCards?: Array<{ rank: string; suit: string }>;
}

const SYMBOL_TO_WORD: Record<string, string> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

const toDisplayCard = (card: GinRummyCard) => ({
  suit: (SYMBOL_TO_WORD[card.suit] || card.suit) as any,
  rank: card.rank,
  value: card.value,
});

const RANK_ORDER: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
};

const SUIT_ORDER: Record<string, number> = {
  '♠': 0, '♥': 1, '♣': 2, '♦': 3,
};

// Determine if we're in a post-knock phase where the active player box shows organized melds
const isPostKnockPhase = (phase: string) =>
  phase === 'knocking' || phase === 'laying_off' || phase === 'scoring' || phase === 'complete';

const isCurrentHandLocalHandPhase = (phase: string) =>
  phase === 'first_draw' || phase === 'playing' || phase === 'knocking' || phase === 'laying_off' || phase === 'scoring';

// Local-hand presentation is a LIVE PROJECTION admitted from the
// authoritative Gin state stream (never a synthesised source of truth).
type CachedLocalHandProjection = {
  identityKey: string;
  playerId: string;
  state: GinRummyPlayerState;
};

type LocalHandBaselineCommit = {
  identityKey: string;
  committed: boolean;
};

const cloneLocalPlayerState = (state: GinRummyPlayerState): GinRummyPlayerState => ({
  ...state,
  hand: [...state.hand],
  melds: state.melds.map((meld) => ({ ...meld, cards: [...meld.cards] })),
  deadwood: [...state.deadwood],
  laidOffCards: [...state.laidOffCards],
});

export const GinRummyMobileCardsTab = ({
  ginState,
  currentPlayerId,
  isProcessing,
  onDrawStock,
  onDrawDiscard,
  onDiscard,
  onKnock,
  onTakeFirstDraw,
  onPassFirstDraw,
  onLayOff,
  onFinishLayingOff,
  onLayOffCardSelected,
  currentPlayer,
  gameId,
  handIdentityKey,
  withheldDrawnCards,
}: GinRummyMobileCardsTabProps) => {
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  
  const [drawnCard, setDrawnCard] = useState<{ rank: string; suit: string } | null>(null);
  const prevTurnPhaseRef = useRef(ginState.turnPhase);

  // Active-hand policy consumed only by the shared MeasuredActiveHandFan.
  // No local instrumentation pill remains.
  void useActiveHandLayoutPolicy;

  const localHandIdentityKey = `${gameId}|${handIdentityKey ?? `gin-hand:${ginState.handNumber ?? 'unknown'}`}|p:${currentPlayerId}`;
  const localHandProjectionRef = useRef<CachedLocalHandProjection | null>(null);
  const localHandBaselineRef = useRef<LocalHandBaselineCommit | null>(null);
  const rawMyStateAuthoritative = ginState.playerStates[currentPlayerId];
  const rawAuthoritativeHandCount = rawMyStateAuthoritative?.hand?.length ?? 0;

  // ── Current-hand readiness gate ─────────────────────────────────
  // On EVERY new identity (dealerGameId / roundId / handNumber /
  // viewer flip encoded in localHandIdentityKey), the baseline is
  // reset to "not committed". Prior-hand cards are never bridged.
  // Baseline commits the FIRST time this identity's live projection
  // admits a non-empty local hand. Subsequent transient empties for
  // the SAME identity are absorbed by the sticky cache below.
  if (localHandBaselineRef.current?.identityKey !== localHandIdentityKey) {
    localHandBaselineRef.current = { identityKey: localHandIdentityKey, committed: false };
    // Drop any prior-identity cache so no old cards can leak forward.
    if (localHandProjectionRef.current?.identityKey !== localHandIdentityKey) {
      localHandProjectionRef.current = null;
    }
  }
  if (rawAuthoritativeHandCount > 0 && localHandBaselineRef.current) {
    localHandBaselineRef.current.committed = true;
  }
  const currentHandBaselineCommitted = !!localHandBaselineRef.current?.committed;

  const stableMyStateAuthoritative = useMemo(() => {
    if (rawMyStateAuthoritative && rawAuthoritativeHandCount > 0) {
      localHandProjectionRef.current = {
        identityKey: localHandIdentityKey,
        playerId: currentPlayerId,
        state: cloneLocalPlayerState(rawMyStateAuthoritative),
      };
      return rawMyStateAuthoritative;
    }

    // Sticky cache only fires AFTER baseline for the same identity
    // has already committed. Never bridges identities.
    const cached = localHandProjectionRef.current;
    if (
      cached &&
      cached.identityKey === localHandIdentityKey &&
      cached.playerId === currentPlayerId &&
      currentHandBaselineCommitted &&
      isCurrentHandLocalHandPhase(ginState.phase)
    ) {
      return cached.state;
    }

    return rawMyStateAuthoritative;
  }, [rawMyStateAuthoritative, rawAuthoritativeHandCount, localHandIdentityKey, currentPlayerId, ginState.phase, currentHandBaselineCommitted]);

  const deal = useDealRuntime();

  // ── HARD READY RECONCILIATION ────────────────────────────────────
  // Withhold clipping / per-player settle slicing is scoped strictly to
  // the opening-deal wave (DealRuntime `DEALING` for THIS hand's
  // handContextId). Once the wave hits READY / GAMEPLAY, or the deal
  // runtime is not bound to this hand (mid-hand rejoin, recovery, no
  // orchestrator), we render the full admitted local projection. Gin
  // `phase` (first_draw, playing, knocking, ...) is never used as a
  // reveal gate — the server writes `phase: 'first_draw'` the same
  // moment it deals, so gating on it would collapse the card-by-card
  // opening reveal into an all-at-once dump (regression 1).
  const dealBoundToThisHand =
    !!deal && !!deal.handContextId && deal.handContextId === handIdentityKey;
  // Card-by-card opening reveal is gated STRICTLY to the DealRuntime
  // DEALING wave bound to this exact hand identity. Any other state —
  // READY, GAMEPLAY, unbound runtime (mid-hand rejoin / recovery /
  // snapshot catch-up), or a live local hand that has already grown
  // past the opening capacity (self-draw 10→11) — renders the full
  // admitted local projection. ginState.phase is intentionally NOT
  // used as a reveal gate (the server flips to `first_draw` the same
  // moment it deals, which would collapse the card-by-card reveal).
  const dealBoundDealing = dealBoundToThisHand && deal!.phase === 'DEALING';
  const authHandLen = stableMyStateAuthoritative?.hand?.length ?? 0;
  const forceFullProjection =
    !dealBoundDealing || authHandLen > GIN_CARDS_PER_PLAYER;

  const rawMyState = useMemo(() => {
    if (!stableMyStateAuthoritative) return stableMyStateAuthoritative;
    if (forceFullProjection) return stableMyStateAuthoritative;
    if (!withheldDrawnCards || withheldDrawnCards.length === 0) return stableMyStateAuthoritative;
    const clipped = [...stableMyStateAuthoritative.hand];
    for (const w of withheldDrawnCards) {
      const idx = clipped.findIndex(c => c.rank === w.rank && c.suit === w.suit);
      if (idx !== -1) clipped.splice(idx, 1);
    }
    if (clipped.length === stableMyStateAuthoritative.hand.length) return stableMyStateAuthoritative;
    return { ...stableMyStateAuthoritative, hand: clipped };
  }, [stableMyStateAuthoritative, withheldDrawnCards, forceFullProjection]);

  // Opening-deal prefix gate — active ONLY during the DealRuntime
  // DEALING wave bound to THIS hand. Reveals each local card as its
  // own intent settles at the mapped destination slot. Any transition
  // to READY / GAMEPLAY, or hand growth past CARDS_PER_PLAYER (self
  // draw), falls into forceFullProjection above.
  const myState = useMemo(() => {
    if (!rawMyState) return rawMyState;
    if (forceFullProjection) return rawMyState;
    if (!dealBoundToThisHand) return rawMyState;
    if (rawMyState.hand.length > GIN_CARDS_PER_PLAYER) return rawMyState;
    if (deal!.phase === 'PRE_DEAL') return { ...rawMyState, hand: [] };
    const allowed = Math.min(
      deal!.getSettledCountForPlayer(currentPlayerId),
      GIN_CARDS_PER_PLAYER,
    );
    if (allowed >= rawMyState.hand.length) return rawMyState;
    return { ...rawMyState, hand: rawMyState.hand.slice(0, allowed) };
  }, [rawMyState, deal, dealBoundToThisHand, currentPlayerId, forceFullProjection, deal?.phase, deal?.settledCardIds]);

  const lastProjectionTraceRef = useRef<string | null>(null);
  useEffect(() => {
    const renderedCount = myState?.hand?.length ?? 0;
    const authoritativeCount = stableMyStateAuthoritative?.hand?.length ?? 0;
    const projectionMode = forceFullProjection ? 'full-authoritative' : 'canonical-settled-hand';
    const settledForPlayer = dealBoundToThisHand ? deal?.getSettledCountForPlayer(currentPlayerId) ?? 0 : null;
    const sig = JSON.stringify({
      localHandIdentityKey,
      projectionMode,
      renderedCount,
      authoritativeCount,
      dealPhase: deal?.phase ?? null,
      settledForPlayer,
    });
    if (lastProjectionTraceRef.current === sig) return;
    const prev = lastProjectionTraceRef.current ? JSON.parse(lastProjectionTraceRef.current) : null;
    lastProjectionTraceRef.current = sig;
    const boundary = renderedCount >= GIN_CARDS_PER_PLAYER && (!prev || prev.renderedCount < GIN_CARDS_PER_PLAYER)
      ? 'all-cards-visible'
      : null;
    recordGinPhaseTrace({
      kind: 'card-projection',
      summary: `Gin self-card projection ${projectionMode} rendered=${renderedCount}/${authoritativeCount}`,
      sourceFile: 'src/components/GinRummyMobileCardsTab.tsx',
      sourceFunction: 'GinRummyMobileCardsTab.projectionEffect',
      identity: { gameId, handContextId: handIdentityKey ?? null },
      detail: {
        localHandIdentityKey,
        playerId: currentPlayerId,
        projectionMode,
        source: projectionMode === 'canonical-settled-hand' ? 'DealRuntime.getSettledCountForPlayer' : 'authoritative-admitted-local-hand',
        renderedCount,
        authoritativeCount,
        rawAuthoritativeHandCount,
        dealBoundToThisHand,
        dealPhase: deal?.phase ?? null,
        dealExpectedCount: deal?.expectedCount ?? null,
        dealSettledCount: deal?.settledCardIds.size ?? null,
        settledForPlayer,
        forceFullProjection,
        boundary,
        boundaryCause: boundary ? (forceFullProjection ? 'full-authoritative-projection' : 'canonical-settled-hand-reached-full-count') : null,
      },
    });
  }, [myState?.hand?.length, stableMyStateAuthoritative?.hand?.length, rawAuthoritativeHandCount, forceFullProjection, localHandIdentityKey, dealBoundToThisHand, deal?.phase, deal?.expectedCount, deal?.settledCardIds, currentPlayerId, gameId, handIdentityKey]);

  // Single-owner discard contract: Take must be disabled until the
  // opening discard intent for the current hand has settled.
  const discardCardId = deal?.handContextId ? `${deal.handContextId}#discard` : null;
  const discardRevealed = !deal || !discardCardId
    ? true
    : deal.phase === 'GAMEPLAY' || deal.phase === 'READY' || deal.isSettled(discardCardId);

  const isMyTurn = ginState.currentTurnPlayerId === currentPlayerId;

  useEffect(() => {
  }, [ginState.handNumber, ginState.phase, ginState.turnPhase, ginState.actionCount, isMyTurn, isProcessing, rawMyState?.hand?.length, myState?.hand?.length, deal?.handContextId, deal?.phase, deal?.expectedCount, deal?.settledCardIds.size, currentPlayerId]);


  // Track newly drawn card
  useEffect(() => {
    if (prevTurnPhaseRef.current === 'draw' && ginState.turnPhase === 'discard' && isMyTurn) {
      const lastAct = ginState.lastAction;
      if (lastAct && (lastAct.type === 'draw_stock' || lastAct.type === 'draw_discard') && lastAct.card) {
        setDrawnCard({ rank: lastAct.card.rank, suit: lastAct.card.suit });
      }
    }
    prevTurnPhaseRef.current = ginState.turnPhase;
  }, [ginState.turnPhase, ginState.lastAction, isMyTurn]);

  useEffect(() => {
    if (!isMyTurn || ginState.phase !== 'playing') {
      setDrawnCard(null);
    }
  }, [isMyTurn, ginState.phase]);

  // Clear selected card on phase transition
  useEffect(() => {
    setSelectedCardIndex(null);
    onLayOffCardSelected?.(null);
  }, [ginState.phase]);

  // Knock/Gin checks
  const handAfterDiscard = useMemo(() => {
    if (selectedCardIndex === null || !myState) return null;
    const h = [...myState.hand];
    h.splice(selectedCardIndex, 1);
    return h;
  }, [selectedCardIndex, myState]);

  const canKnockNow = isMyTurn && ginState.turnPhase === 'discard' && handAfterDiscard && canKnock(handAfterDiscard);
  const hasGinNow = isMyTurn && ginState.turnPhase === 'discard' && handAfterDiscard && hasGin(handAfterDiscard);

  // Lay-off detection: am I the non-knocker in knocking/laying_off phase?
  const knockerId = useMemo(() => {
    return Object.entries(ginState.playerStates).find(([, ps]) => ps.hasKnocked || ps.hasGin)?.[0];
  }, [ginState.playerStates]);

  const iAmKnocker = knockerId === currentPlayerId;
  const isLayingOff = (ginState.phase === 'knocking' || ginState.phase === 'laying_off') &&
    ginState.currentTurnPlayerId === currentPlayerId && !iAmKnocker;

  const layOffOptions = useMemo(() => {
    if (!isLayingOff || !knockerId || !myState) return [];
    const knockerMelds = ginState.playerStates[knockerId].melds;
    return findLayOffOptions(myState.hand, knockerMelds);
  }, [isLayingOff, knockerId, myState, ginState.playerStates]);

  const selectedLayOffTarget = useMemo(() => {
    if (selectedCardIndex === null || !myState) return null;
    const selectedCard = myState.hand[selectedCardIndex];
    if (!selectedCard) return null;
    return layOffOptions.find(lo => lo.card.rank === selectedCard.rank && lo.card.suit === selectedCard.suit) || null;
  }, [selectedCardIndex, myState, layOffOptions]);

  // Organize hand: deadwood first (rank-sorted), then melds
  const organizedHand = useMemo(() => {
    if (!myState || myState.hand.length === 0) return { meldCards: [], deadwoodCards: [], melds: [] as Meld[] };
    const { melds, deadwood } = findOptimalMelds(myState.hand);

    const meldCards: Array<{ card: GinRummyCard; originalIndex: number; meldGroup: number }> = [];
    melds.forEach((meld, meldIdx) => {
      meld.cards.forEach(card => {
        const originalIndex = myState.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
        if (originalIndex !== -1) meldCards.push({ card, originalIndex, meldGroup: meldIdx });
      });
    });

    const deadwoodCards = [...deadwood]
      .sort((a, b) => (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0))
      .map(card => {
        const originalIndex = myState.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
        return { card, originalIndex, meldGroup: -1 };
      });

    return { meldCards, deadwoodCards, melds };
  }, [myState]);

  // For post-knock phase: use the scored melds/deadwood if available, else computed
  const postKnockMelds: Meld[] = myState?.melds?.length > 0 ? myState.melds : organizedHand.melds;
  const postKnockDeadwoodCards = useMemo(() => {
    if (!myState) return [];
    if (myState.deadwood?.length > 0) {
      return [...myState.deadwood]
        .sort((a, b) => (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0));
    }
    return organizedHand.deadwoodCards.map(d => d.card);
  }, [myState, organizedHand.deadwoodCards]);

  // Laidoff cards for knocker display — tracked on the NON-knocker's state
  const laidOffOnMyMelds: GinRummyCard[] = useMemo(() => {
    if (!iAmKnocker || !knockerId) return [];
    const nonKnockerId = knockerId === ginState.dealerPlayerId ? ginState.nonDealerPlayerId : ginState.dealerPlayerId;
    const nonKnockerState = ginState.playerStates[nonKnockerId];
    return nonKnockerState?.laidOffCards || [];
  }, [iAmKnocker, knockerId, ginState.playerStates, ginState.dealerPlayerId, ginState.nonDealerPlayerId]);

  const handleCardClick = (index: number) => {
    if (!myState) return;
    const canSelect = (ginState.turnPhase === 'discard' && isMyTurn && ginState.phase === 'playing') || isLayingOff;
    if (canSelect) {
      const newIndex = selectedCardIndex === index ? null : index;
      setSelectedCardIndex(newIndex);
      if (isLayingOff) {
        onLayOffCardSelected?.(newIndex);
      }
    }
  };

  const handleDiscard = () => {
    if (selectedCardIndex === null) return;
    onDiscard(selectedCardIndex);
    setSelectedCardIndex(null);
  };

  const handleKnock = () => {
    if (selectedCardIndex === null) return;
    onKnock(selectedCardIndex);
    setSelectedCardIndex(null);
  };

  const handleLayOff = () => {
    if (selectedCardIndex === null || !selectedLayOffTarget) return;
    onLayOff(selectedCardIndex, selectedLayOffTarget.onMeldIndex);
    onLayOffCardSelected?.(null);
    setSelectedCardIndex(null);
  };




  // ── Current-hand readiness gate ─────────────────────────────────
  // Playable presentation (fan, action prompts, "Draw a card", Take,
  // Discard, Knock, Pass, Waiting-for-opponent, etc.) is BLOCKED
  // until this identity's live projection has admitted a non-empty
  // local hand at least once, OR the authoritative rule-state proves
  // the local player legitimately has zero cards for this identity
  // (post-knock scoring / hand-complete resolution paths keep their
  // own downstream branches; they must still see myState populated
  // via the sticky cache for their own melds/deadwood readouts).
  //
  // A remote seated client that joins/recovers mid-hand hits this
  // same gate on every render: the shell shows the non-playable
  // "Dealing…" placeholder until the projection converges, then
  // commits the baseline and reveals the playable UI — no refresh.
  const authoritativeZeroHandLegit =
    !!rawMyStateAuthoritative &&
    rawAuthoritativeHandCount === 0 &&
    (ginState.phase === 'complete' || ginState.phase === 'scoring') &&
    !!ginState.knockResult;
  const presentationReady = currentHandBaselineCommitted || authoritativeZeroHandLegit;

  if (!myState || !presentationReady) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-muted-foreground">Dealing…</span>
      </div>
    );
  }

  const layOffCardIndices = new Set(
    isLayingOff
      ? layOffOptions.map(lo => myState.hand.findIndex(c => c.rank === lo.card.rank && c.suit === lo.card.suit)).filter(i => i !== -1)
      : []
  );

  const inPostKnock = isPostKnockPhase(ginState.phase);
  const flatSortedHand = [...organizedHand.deadwoodCards, ...organizedHand.meldCards]
    .sort((a, b) => {
      const rankDiff = (RANK_ORDER[a.card.rank] || 0) - (RANK_ORDER[b.card.rank] || 0);
      if (rankDiff !== 0) return rankDiff;
      return (SUIT_ORDER[a.card.suit] || 0) - (SUIT_ORDER[b.card.suit] || 0);
    });

  // Static margins — match the prior `-space-x-4` (16px) overlap on lg
  // (48px) cards; md (40px) scaled proportionally. Adaptive fan behavior
  // for this hand will move to the HUDStack contract.
  const ginLgMarginPx = -16;
  const ginMdMarginPx = -13;


  return (
    <div className="relative h-full px-2 flex flex-col">

      {/* ── POST-KNOCK VIEW: Melds left-justified, deadwood right-justified, wraps naturally ── */}
      {inPostKnock ? (
        <div className={cn("flex flex-col w-full", isLayingOff ? "gap-0 py-0" : "gap-1 py-1")}>
          {/* Single flex-wrap row: melds flush-left, deadwood flush-right */}
          <div className={cn("flex items-end flex-wrap w-full px-1", isLayingOff ? "gap-y-0" : "gap-y-1")}>
            {/* Melds */}
            {postKnockMelds.map((meld, meldIdx) => (
              <div key={`my-meld-${meldIdx}`} className={cn("flex", meldIdx > 0 && "ml-3")}>
                {meld.cards.map((card, ci) => {
                  const isLaidOff = iAmKnocker && laidOffOnMyMelds.some(lo => lo.rank === card.rank && lo.suit === card.suit);
                  const m = isLayingOff ? ginMdMarginPx : ginLgMarginPx;
                  return (
                    <div
                      key={`my-meld-${meldIdx}-${ci}`}
                      className={cn(isLaidOff && "rounded ring-[3px] ring-blue-400 shadow-[0_0_8px_2px_rgba(96,165,250,0.7)]")}
                      style={{ zIndex: ci, marginLeft: ci === 0 ? 0 : `${m}px` }}
                    >
              <CribbagePlayingCard card={toDisplayCard(card)} size={isLayingOff ? "md" : "lg"} tier="large" />
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Laid-off cards are already shown within the melds with blue highlight — no separate section needed */}

            {/* Deadwood — pushed to the right on whichever row it lands on */}
            {postKnockDeadwoodCards.length > 0 && (
              <div className="flex ml-auto items-end">
                {postKnockDeadwoodCards.map((card, ci) => {
                  const originalIndex = myState.hand.findIndex(c => c.rank === card.rank && c.suit === card.suit);
                  const isSelected = selectedCardIndex === originalIndex;
                  const m = isLayingOff ? ginMdMarginPx : ginLgMarginPx;
                  return (
                    <button
                      key={`dw-${card.rank}-${card.suit}-${ci}`}
                      onClick={() => originalIndex !== -1 && handleCardClick(originalIndex)}
                      disabled={isProcessing || !isLayingOff}
                      className={cn(
                        "transition-all duration-200 rounded relative",
                        isSelected ? "-translate-y-3 ring-2 ring-poker-gold z-20" : "",
                        isLayingOff && "cursor-pointer"
                      )}
                      style={{ zIndex: isSelected ? 20 : ci, marginLeft: ci === 0 ? 0 : `${m}px` }}
                    >
                      <CribbagePlayingCard card={toDisplayCard(card)} size={isLayingOff ? "md" : "lg"} tier="large" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* DW value — right-aligned */}
          <div className={cn("flex items-center justify-end pr-2", isLayingOff && "py-0")}>
            <span className="text-xs font-mono font-bold text-muted-foreground">
              DW: {postKnockDeadwoodCards.length > 0
                ? (myState.deadwoodValue > 0 ? myState.deadwoodValue : findOptimalMelds(myState.hand).deadwoodValue)
                : 0}
            </span>
          </div>
        </div>
      ) : (
        /* ── NORMAL PLAY VIEW: shared active-hand fan ── */
        <>
          {/*
            Pane-owned composition: the top spacer + fan host fill the
            pane; the DW label now lives inside the lower-zone action
            strip below (right-aligned) so the top of the pane stays
            clear and the portaled fan has full vertical breathing
            room. The active-hand fan is portaled INTO
            `[data-gin-active-pane-content]` by MeasuredActiveHandFan,
            which measures the un-transformed pane rect and every
            `[data-active-hand-lower-zone]` sibling (below), then
            derives:
                stageRect.height = paneH·maxHeightPct
                                     bounded by paneH − reserved − clearance
                reserved  = max(paneH·reservedLowerZonePct,
                                measured lower zone + safe area)
                clearance = paneH · interZoneClearancePctOfPane
            Cards align flex-end inside stageRect, so their bottom edge
            sits exactly `clearance` px above the action zone. Tuning
            `interZoneClearancePctOfPane` now visibly repositions the
            gap — no independent Gin action-zone layout path remains.
          */}
          <div
            data-gin-active-hand-stage-spacer=""
            className="flex-1 min-h-0"
          />

          <MeasuredActiveHandFan
            game="ginRummy"
            cards={flatSortedHand.map(({ card }) => ({
              suit: card.suit as CanonicalCardType['suit'],
              rank: card.rank as CanonicalCardType['rank'],
            }))}
            capacity={GIN_CARDS_PER_PLAYER + 1}
            portalTargetSelector="[data-gin-active-pane-content]"
            phaseLockKey={`gin|id:${localHandIdentityKey}`}
            applyFan
            renderCard={({ index, card_node }) => {
              const item = flatSortedHand[index];
              if (!item) return null;
              const { card, originalIndex, meldGroup } = item;
              const isSelected = selectedCardIndex === originalIndex;
              const canSelect = (isMyTurn && ginState.turnPhase === 'discard' && ginState.phase === 'playing') || isLayingOff;
              const isNewlyDrawn = drawnCard && card.rank === drawnCard.rank && card.suit === drawnCard.suit;
              void meldGroup;
              return (
                <button
                  onClick={() => handleCardClick(originalIndex)}
                  onPointerUp={(e) => e.currentTarget.blur()}
                  disabled={isProcessing || !canSelect}
                  className={cn(
                    "transition-all duration-200 rounded relative pointer-events-auto",
                    isSelected ? "-translate-y-3 ring-2 ring-poker-gold z-20" : "translate-y-0",
                    canSelect && !isSelected && "[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1",
                    isNewlyDrawn && !isSelected && "ring-2 ring-sky-400"
                  )}
                  style={{ zIndex: isSelected ? 20 : index }}
                >
                  {card_node}
                </button>
              );
            }}
          />
        </>
      )}

      {/* ── Action area ──
          Row-4 action placement: the button row is a
          `[data-active-hand-lower-zone]` sibling of the fan and lives
          wholly inside the row-4 active-player pane. It carries its own
          `min-h` + bottom padding so the Discard/Take/Knock/Pass row
          always sits above the row-5 identity boundary with deliberate
          clearance, even on small mobile viewports where the button's
          own height would otherwise consume the entire lower-zone rect.
          The pane resolver reserves `max(authored, measured + safeArea)`
          so this height is fed back into the fan's stage budget — the
          action row is never clipped and never overlaps identity. */}
      <div data-active-hand-lower-zone="" className="relative flex items-center justify-center min-h-[44px] pb-2 gap-2 flex-wrap">
        {/* Deadwood readout — right-aligned inside the action strip so
            it no longer eats vertical room above the fan. Post-knock
            view renders its own DW block above (line ~379). */}
        {!inPostKnock && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-muted-foreground pointer-events-none">
            DW: {myState.hand.length > 0 ? findOptimalMelds(myState.hand).deadwoodValue : '–'}
          </span>
        )}

        {/* First Draw phase — tap discard on felt to take, Pass button to pass */}
        {ginState.phase === 'first_draw' && isMyTurn && (
          <>
            <Button onClick={onTakeFirstDraw} disabled={isProcessing || !discardRevealed} className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-4 disabled:opacity-50" size="sm">
              Take
            </Button>
            <Button onClick={onPassFirstDraw} disabled={isProcessing || !discardRevealed} variant="outline" className="border-white/40 text-foreground px-4 disabled:opacity-50" size="sm">
              Pass
            </Button>
          </>
        )}

        {ginState.phase === 'first_draw' && !isMyTurn && (
          <p className="text-muted-foreground text-sm">Opponent deciding on upcard...</p>
        )}

        {/* Draw phase */}
        {ginState.phase === 'playing' && ginState.turnPhase === 'draw' && isMyTurn && (
          <p className="text-poker-gold text-sm font-medium animate-pulse">Tap stock or discard on felt</p>
        )}

        {/* Discard phase - card selected */}
        {ginState.phase === 'playing' && ginState.turnPhase === 'discard' && isMyTurn && selectedCardIndex !== null && (
          <>
            <Button onClick={handleDiscard} disabled={isProcessing} className="bg-amber-700 hover:bg-amber-600 text-white font-bold px-4" size="sm">
              Discard
            </Button>
            {canKnockNow && !hasGinNow && (
              <Button onClick={handleKnock} disabled={isProcessing} className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-4" size="sm">
                Knock!
              </Button>
            )}
            {hasGinNow && (
              <Button onClick={handleKnock} disabled={isProcessing} className="bg-green-600 hover:bg-green-500 text-white font-bold px-4" size="sm">
                GIN! 🎉
              </Button>
            )}
          </>
        )}

        {/* Discard phase - no card selected */}
        {ginState.phase === 'playing' && ginState.turnPhase === 'discard' && isMyTurn && selectedCardIndex === null && (
          <p className="text-poker-gold text-sm font-medium animate-pulse">Tap a card to select</p>
        )}

        {/* Waiting for opponent during play */}
        {ginState.phase === 'playing' && !isMyTurn && (
          <p className="text-muted-foreground text-sm">Waiting for opponent...</p>
        )}

        {/* Laying off - my turn as non-knocker */}
        {isLayingOff && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <Button onClick={onFinishLayingOff} disabled={isProcessing} className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-4" size="sm">
              Done Laying Off
            </Button>
          </div>
        )}

        {/* Waiting while opponent (the non-knocker) lays off onto my melds */}
        {(ginState.phase === 'knocking' || ginState.phase === 'laying_off') && iAmKnocker && (
          <p className="text-muted-foreground text-sm">Opponent laying off...</p>
        )}

        {/* Scoring */}
        {ginState.phase === 'scoring' && (
          <p className="text-poker-gold text-sm">Resolving hand...</p>
        )}

        {/* Complete */}
        {ginState.phase === 'complete' && (
          <p className="text-muted-foreground text-sm">
            {ginState.winnerPlayerId ? 'Match over!' : ginState.knockResult ? 'Dealing next hand...' : 'Void hand — re-dealing...'}
          </p>
        )}
      </div>
    </div>
  );
};

