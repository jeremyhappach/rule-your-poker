import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CribbageState, CribbageCard } from '@/lib/cribbageTypes';
import { hasPlayableCard, getCardPointValue } from '@/lib/cribbageScoring';
import { toast } from 'sonner';
import { persistSyncDebugEvent } from '@/lib/persistSyncDebugEvent';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import {
  resolveActiveHandLayout,
  useActiveHandLayoutPolicy,
  type ResolvedActiveHandRow,
} from '@/lib/activeHand/activeHandLayoutSettings';
import { ActiveHandFan } from './activeHand/ActiveHandFan';
// (CribbageLayoutStatusPill removed — replaced by CribbageWartimeTruthPill mounted in CribbageMobileGameTable.)
import type { Card as CardType } from '@/lib/cardUtils';
import { recordCribbageHandRenderDecision } from '@/lib/cribbage/handRenderInvariantLedger';
import { isCribbagePostDealPhase, resolveCribbageVisibleHand } from '@/lib/cribbage/cribbageRenderGuards';
import { recordCribbageWartime } from '@/lib/cribbage/cribbageWartimeLedger';

const CRIB_SUIT_TO_SYMBOL: Record<string, CardType['suit']> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};
const toDisplayCard = (c: CribbageCard): CardType => ({
  suit: (CRIB_SUIT_TO_SYMBOL[c.suit as string] ?? (c.suit as unknown as CardType['suit'])),
  rank: c.rank as CardType['rank'],
});

/**
 * Cribbage active-hand card sizing — per-game policy contract.
 *
 * The resolver lives in `@/lib/activeHand/activeHandLayoutSettings` and
 * is driven by the per-game `ActiveHandLayoutPolicy` (preferredOverlap,
 * maxOverlap, minCardWidthPx) edited in Geometry Lab. Sizing runs
 * against the measured `[data-crib-active-hand-stage]` rect and the
 * MAX hand capacity for the phase (6 pre-discard, 4 post-discard), and
 * is locked once per phase boundary.
 */

const CRIB_ACTIVE_HAND_ASPECT = 2 / 3;
type CribActiveHandStageRect = { width: number; height: number };

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot?: boolean;
  profiles?: { username: string };
}

/** Diagnostic context passed from parent for render tracing */
interface RenderTraceContext {
  renderHandKey: string;
  currentHandKey: string;
  dealerGameId: string | null;
  isFrozen: boolean;
  authoritativeHand: CribbageCard[] | null;
  renderSource: string;
  expectedRoundId: string | null;
  sourceRoundId: string | null;
  handNumber: number;
  isGameplayMode: boolean;
  viewStateIsCurrentRound: boolean;
  /** Authoritative gate from parent: when false, the rendered hand is NOT the actionable hand. */
  interactionsAllowed?: boolean;
}

interface CribbageMobileCardsTabProps {
  cribbageState: CribbageState;
  currentPlayerId: string;
  playerCount: number;
  isProcessing: boolean;
  onDiscard: (
    cardIndices: number[],
    sourceRects?: Array<{ x: number; y: number; width: number; height: number } | null>,
  ) => void;
  onPlayCard: (
    cardIndex: number,
    sourceRect?: { x: number; y: number; width: number; height: number } | null,
  ) => void;
  currentPlayer: Player;
  gameId: string;
  isDealer: boolean;
  /** Used to reset selectedCards on hand boundary transitions */
  roundId?: string;
  /** Diagnostic context for render tracing — omit to disable */
  renderTrace?: RenderTraceContext;
  /**
   * Lifted discard selection — owned by the parent
   * (`CribbageMobileGameTable`) so raised/selected cards persist across
   * Cards ↔ Chat tab switches. Mirrors Gin Rummy's lifted selection.
   */
  selectedCards: number[];
  onSelectedCardsChange: (next: number[]) => void;
}


/** Card identity string for tracing */
function cardId(c: CribbageCard): string {
  return `${c.rank}${c.suit[0]}`;
}

export const CribbageMobileCardsTab = ({
  cribbageState,
  currentPlayerId,
  playerCount,
  isProcessing,
  onDiscard,
  onPlayCard,
  currentPlayer,
  gameId,
  isDealer,
  roundId,
  renderTrace,
  selectedCards,
  onSelectedCardsChange,
}: CribbageMobileCardsTabProps) => {

  const setSelectedCards = onSelectedCardsChange;



  // Opening-deal visibility follows DealRuntime lifecycle exclusively.
  // No wall-clock grace / stall fuse here — canonical transport recovery
  // (endpoint retry → __markDropped → settled → READY) is the only path.


  const myPlayerState = cribbageState.playerStates[currentPlayerId];
  const clientId = currentPlayer.user_id.slice(0, 8);
  const sourceHand = myPlayerState?.hand ?? [];
  const expectedRoundId = renderTrace?.expectedRoundId ?? roundId ?? null;
  const sourceRoundId = renderTrace?.sourceRoundId ?? null;
  const roundIdentityMismatch = !!(renderTrace && expectedRoundId && sourceRoundId && expectedRoundId !== sourceRoundId);
  const handIdentityMismatch = !!(
    renderTrace &&
    renderTrace.renderHandKey &&
    renderTrace.currentHandKey &&
    renderTrace.renderHandKey !== renderTrace.currentHandKey
  );
  const parentSuppressed = !!renderTrace && renderTrace.interactionsAllowed === false;
  const activeHandBlocked = !!renderTrace && (roundIdentityMismatch || handIdentityMismatch || parentSuppressed);
  // Wave 1 deal-runtime gating: during DEALING, clip the self hand to
  // the per-recipient settled count so cards appear one at a time as
  // each transport arrives. PRE_DEAL → 0. READY/GAMEPLAY / no runtime
  // → full hand (legacy path).
  const deal = useDealRuntime();
  const authoritativeHand = renderTrace?.authoritativeHand ?? null;
  const isPostDealPhase = isCribbagePostDealPhase(cribbageState.phase);
  const clippedHand = (() => {
    // DEALING branch: canonical transport ownership. DealRuntime is
    // host-keyed by handContextId (mounted above the orchestrator with
    // key={handContextId}), so getSettledCountForPlayer inherently
    // counts current-hand settles only. The parent's `interactionsAllowed`
    // gate is action-legality (may the user click?), NOT render-legality
    // — during opening deal it can transiently be false while presentation
    // catches up to authoritative identity, causing every settled card
    // to be masked and then batch-revealed. We therefore ignore
    // `activeHandBlocked` inside DEALING and clip from authoritativeHand
    // (which is drawn from the same authoritative state that produced
    // the current handContextId), falling back to sourceHand when no
    // authoritative snapshot is threaded through.
    if (!deal) return activeHandBlocked ? ([] as CribbageCard[]) : sourceHand;
    if (deal.phase === 'GAMEPLAY' || deal.phase === 'READY') {
      return activeHandBlocked ? ([] as CribbageCard[]) : sourceHand;
    }
    if (deal.phase === 'PRE_DEAL') return [] as CribbageCard[];
    const allowed = deal.getSettledCountForPlayer(currentPlayerId);
    const clipSource: CribbageCard[] = (authoritativeHand && authoritativeHand.length > 0)
      ? (authoritativeHand as CribbageCard[])
      : sourceHand;
    return clipSource.slice(0, allowed);
  })();
  // P0 SELF-HEAL: Run every rendered Cribbage self-hand through the shared
  // invariant helper. Presentation may animate card-by-card only while the
  // transport is actively in flight or within the bounded opening-deal
  // grace; once authoritative post-deal cards exist and transport is
  // empty/stale/blocked past grace, authoritative cards win.
  const visibleHandDecision = resolveCribbageVisibleHand({
    authoritativeHand,
    presentationHand: clippedHand,
    phase: cribbageState.phase,
    parentSuppressed: activeHandBlocked,
    dealPhase: deal?.phase ?? null,
    dealExpectedCount: deal?.expectedCount ?? 0,
    dealActiveIntentCount: deal?.activeIntentsForHand ?? 0,
    
  });

  const shouldSelfHeal = visibleHandDecision.decision === 'render-authoritative-self-heal';
  const dealClippedSourceHand: CribbageCard[] = visibleHandDecision.hand as CribbageCard[];
  const renderedHand = dealClippedSourceHand;
  const sourceCardIds = sourceHand.map(cardId);
  const renderedCardIds = renderedHand.map(cardId);
  const sourceFingerprint = sourceCardIds.join(',');
  const renderedFingerprint = renderedCardIds.join(',');
  const activeHandSourceName = shouldSelfHeal
    ? 'renderTrace.authoritativeHand (self-heal)'
    : 'cribbageState.playerStates[currentPlayerId].hand';

  // Compute derived counts / decision kind for the P0 invariant ledger.
  // Actual record call is fired from a useEffect below, keyed by fingerprint
  // to avoid unbounded writes on every render.
  const authCount = authoritativeHand?.length ?? 0;
  const presentationCount = sourceHand.length;
  const renderedCount = renderedHand.length;
  const settledCount = deal?.getSettledCountForPlayer(currentPlayerId) ?? 0;
  const decisionKind: 'render-authoritative' | 'render-presentation' | 'render-clipped-partial' | 'render-empty-pre-deal' | 'render-empty-blocked' | 'self-heal-fallback-to-authoritative' = (() => {
    if (shouldSelfHeal) return 'self-heal-fallback-to-authoritative';
    if (activeHandBlocked) return 'render-empty-blocked';
    if (deal?.phase === 'PRE_DEAL' && renderedCount === 0) return 'render-empty-pre-deal';
    if (clippedHand.length > 0 && clippedHand.length < sourceHand.length) return 'render-clipped-partial';
    if (renderedCount > 0) return 'render-presentation';
    return 'render-empty-blocked';
  })();
  const invariantDecisionFingerprint = `${decisionKind}|a=${authCount}|p=${presentationCount}|r=${renderedCount}|b=${activeHandBlocked ? 1 : 0}|dp=${deal?.phase ?? 'none'}|ph=${cribbageState.phase}`;
  const prevInvariantFingerprintRef = useRef<string>('');
  useEffect(() => {
    if (invariantDecisionFingerprint === prevInvariantFingerprintRef.current) return;
    prevInvariantFingerprintRef.current = invariantDecisionFingerprint;
    recordCribbageHandRenderDecision({
      clientId,
      gameId,
      handNumber: renderTrace?.handNumber ?? null,
      phase: cribbageState.phase,
      decision: decisionKind,
      authoritativeHandCount: authCount,
      presentationHandCount: presentationCount,
      renderedHandCount: renderedCount,
      activeHandBlocked,
      dealPhase: deal?.phase ?? null,
      identityMismatch: roundIdentityMismatch || handIdentityMismatch,
      reason: shouldSelfHeal
        ? visibleHandDecision.reason
        : decisionKind,
    });
  }, [invariantDecisionFingerprint, clientId, gameId, renderTrace?.handNumber, cribbageState.phase, decisionKind, authCount, presentationCount, renderedCount, activeHandBlocked, deal?.phase, roundIdentityMismatch, handIdentityMismatch, shouldSelfHeal, visibleHandDecision.reason]);

  // Wartime direct emission — coalesced by value change, one entry per
  // decision transition. Emits sourceHandCount, clippedHandCount,
  // presentationHandCount, renderedHandCount, activeHandBlocked,
  // resolver rule, DealRuntime phase, settled local count.
  useEffect(() => {
    recordCribbageWartime('deal', 'resolver_rule_changed', {
      decisionKind,
      sourceHandCount: sourceHand.length,
      clippedHandCount: clippedHand.length,
      presentationHandCount: presentationCount,
      renderedHandCount: renderedCount,
      authoritativeHandCount: authCount,
      activeHandBlocked,
      blockedSubreasons: {
        roundIdentityMismatch,
        handIdentityMismatch,
        parentSuppressed: activeHandBlocked,
      },
      dealPhase: deal?.phase ?? null,
      cribbagePhase: cribbageState.phase,
      shouldSelfHeal,
      resolveReason: visibleHandDecision.reason,
    }, {
      producerComponent: 'CribbageMobileCardsTab',
      producerFunction: 'resolverFingerprintEffect',
      dedupeKey: `resolver:${invariantDecisionFingerprint}`,
      contradictions: (renderedCount === 0 && authCount > 0 && !activeHandBlocked)
        ? ['renderedZeroWithAuthoritativePresent'] : [],
    });
  }, [invariantDecisionFingerprint, decisionKind, sourceHand.length, clippedHand.length, presentationCount, renderedCount, authCount, activeHandBlocked, roundIdentityMismatch, handIdentityMismatch, deal?.phase, cribbageState.phase, shouldSelfHeal, visibleHandDecision.reason]);

  // Wartime — value-change emissions for individual counts and props.
  const lastRenderedRef = useRef<number | null>(null);
  useEffect(() => {
    if (lastRenderedRef.current !== renderedCount) {
      const prev = lastRenderedRef.current;
      lastRenderedRef.current = renderedCount;
      recordCribbageWartime('deal', 'rendered_hand_count_changed', {
        prev, renderedCount, presentationCount, authCount, activeHandBlocked,
        dealPhase: deal?.phase ?? null,
      }, {
        producerComponent: 'CribbageMobileCardsTab',
        producerFunction: 'renderedCountEffect',
        dedupeKey: `rendered:${renderedCount}`,
      });
      if (prev === 0 && renderedCount >= 1) {
        recordCribbageWartime('deal', 'first_local_card_visible', {
          renderedCount, dealPhase: deal?.phase ?? null,
        }, {
          producerComponent: 'CribbageMobileCardsTab',
          producerFunction: 'firstCardVisible',
          dedupeKey: `firstCard:${renderedCount}`,
        });
      }
      if (renderedCount >= 6 && (prev ?? 0) < 6) {
        recordCribbageWartime('deal', 'full_local_hand_visible', {
          renderedCount, dealPhase: deal?.phase ?? null,
        }, {
          producerComponent: 'CribbageMobileCardsTab',
          producerFunction: 'fullHandVisible',
          dedupeKey: `fullHand:${renderedCount}`,
        });
      }
    }
  }, [renderedCount, presentationCount, authCount, activeHandBlocked, deal?.phase]);

  // ActiveHandFan DOM card-node count observer (coalesced).
  useEffect(() => {
    const stage = document.querySelector('[data-crib-active-hand-stage]') as HTMLElement | null;
    if (!stage) return;
    let lastDomCount = -1;
    const measure = () => {
      const count = stage.querySelectorAll('[data-cribbage-hand-card-key]').length;
      if (count === lastDomCount) return;
      const prev = lastDomCount;
      lastDomCount = count;
      recordCribbageWartime('deal', 'active_hand_dom_count_changed', {
        prev, count, renderedProp: renderedCount, dealPhase: deal?.phase ?? null,
      }, {
        producerComponent: 'CribbageMobileCardsTab',
        producerFunction: 'domObserver',
        dedupeKey: `dom:${count}`,
      });
    };
    measure();
    const mo = new MutationObserver(() => measure());
    mo.observe(stage, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [renderedCount, deal?.phase]);



  const prevRenderSourceFingerprintRef = useRef<string>('');
  const prevBlockedFingerprintRef = useRef<string>('');
  const prevHydratedFingerprintRef = useRef<string>('');
  useEffect(() => {
    if (!myPlayerState || !renderTrace) return;

    const authIds = renderTrace.authoritativeHand?.map(cardId) ?? null;
    const renderFingerprint = JSON.stringify({
      expectedRoundId,
      sourceRoundId,
      renderHandKey: renderTrace.renderHandKey,
      currentHandKey: renderTrace.currentHandKey,
      sourceFingerprint,
      renderedFingerprint,
      activeHandBlocked,
    });

    if (renderFingerprint !== prevRenderSourceFingerprintRef.current) {
      persistSyncDebugEvent({
        gameId,
        gameType: 'cribbage',
        handNumber: renderTrace.handNumber,
        roundId: expectedRoundId ?? null,
        eventType: 'transition',
        severity: 'info',
        eventName: 'crib-active-hand-render-source',
        payload: {
          clientId,
          currentRoundId: expectedRoundId?.slice(0, 8) ?? null,
          sourceRoundId: sourceRoundId?.slice(0, 8) ?? null,
          currentHandKey: renderTrace.currentHandKey?.slice(0, 30) ?? null,
          renderHandKey: renderTrace.renderHandKey?.slice(0, 30) ?? null,
          sourceName: activeHandSourceName,
          sourceCardIds,
          sourceCardCount: sourceCardIds.length,
          renderedCardIds,
          renderedCardCount: renderedCardIds.length,
          sourceIdentity: sourceRoundId
            ? `${sourceRoundId.slice(0, 8)}:${renderTrace.renderHandKey?.slice(0, 30) ?? ''}`
            : null,
          isGameplayMode: renderTrace.isGameplayMode,
          viewStateIsCurrentRound: renderTrace.viewStateIsCurrentRound,
          renderSource: renderTrace.renderSource,
          usedPresentationState: renderTrace.renderSource === 'sync-presentation',
          usedLocalFallback: false,
          phase: cribbageState.phase,
          isFrozen: renderTrace.isFrozen,
          authoritativeHandIds: authIds,
        },
      });
      prevRenderSourceFingerprintRef.current = renderFingerprint;
    }

    if (activeHandBlocked && sourceCardIds.length > 0) {
      const blockedFingerprint = `${expectedRoundId}:${sourceRoundId}:${renderTrace.renderHandKey}:${renderTrace.currentHandKey}:${sourceFingerprint}`;
      if (blockedFingerprint !== prevBlockedFingerprintRef.current) {
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: renderTrace.handNumber,
          roundId: expectedRoundId ?? null,
          eventType: 'invariant',
          severity: 'warn',
          eventName: 'crib-stale-active-hand-blocked',
          payload: {
            clientId,
            currentRoundId: expectedRoundId?.slice(0, 8) ?? null,
            sourceRoundId: sourceRoundId?.slice(0, 8) ?? null,
            currentHandKey: renderTrace.currentHandKey?.slice(0, 30) ?? null,
            renderHandKey: renderTrace.renderHandKey?.slice(0, 30) ?? null,
            blockedSourceName: activeHandSourceName,
            sourceCardIds,
            sourceCardCount: sourceCardIds.length,
            isGameplayMode: renderTrace.isGameplayMode,
            viewStateIsCurrentRound: renderTrace.viewStateIsCurrentRound,
          },
        });
        prevBlockedFingerprintRef.current = blockedFingerprint;
      }
    }

    if (!activeHandBlocked && renderedCardIds.length > 0) {
      const hydratedFingerprint = `${expectedRoundId}:${renderTrace.currentHandKey}:${renderedFingerprint}`;
      if (hydratedFingerprint !== prevHydratedFingerprintRef.current) {
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: renderTrace.handNumber,
          roundId: expectedRoundId ?? null,
          eventType: 'transition',
          severity: 'info',
          eventName: 'crib-active-hand-hydrated',
          payload: {
            clientId,
            roundId: expectedRoundId?.slice(0, 8) ?? null,
            handKey: renderTrace.currentHandKey?.slice(0, 30) ?? null,
            source: activeHandSourceName,
            cardIds: renderedCardIds,
            cardCount: renderedCardIds.length,
          },
        });
        prevHydratedFingerprintRef.current = hydratedFingerprint;
      }
    }

    if (
      authIds &&
      !activeHandBlocked &&
      (cribbageState.phase === 'discarding' || cribbageState.phase === 'pegging') &&
      renderTrace.renderHandKey === renderTrace.currentHandKey
    ) {
      const authFingerprint = [...authIds].sort().join(',');
      const renderedSorted = [...renderedCardIds].sort().join(',');
      if (authFingerprint !== renderedSorted) {
        persistSyncDebugEvent({
          gameId,
          gameType: 'cribbage',
          handNumber: renderTrace.handNumber,
          roundId: expectedRoundId ?? null,
          eventType: 'invariant',
          severity: 'error',
          eventName: 'CRIBBAGE_RENDER_SOURCE_MISMATCH',
          payload: {
            renderedCardIds,
            authoritativeCardIds: authIds,
            renderHandKey: renderTrace.renderHandKey?.slice(0, 30),
            currentHandKey: renderTrace.currentHandKey?.slice(0, 30),
            renderSource: renderTrace.renderSource,
            phase: cribbageState.phase,
            isFrozen: renderTrace.isFrozen,
          },
        });
      }
    }
  }, [
    activeHandBlocked,
    activeHandSourceName,
    clientId,
    cribbageState.phase,
    expectedRoundId,
    gameId,
    myPlayerState,
    renderTrace,
    renderedCardIds,
    renderedFingerprint,
    sourceCardIds,
    sourceFingerprint,
    sourceRoundId,
  ]);
  const isMyTurn = cribbageState.pegging.currentTurnPlayerId === currentPlayerId;
  const canPlayAnyCard = myPlayerState && hasPlayableCard(renderedHand, cribbageState.pegging.currentCount);
  const haveDiscarded = myPlayerState?.discardedToCrib.length > 0;
  const expectedDiscard = playerCount === 2 ? 2 : 1;

  // D-group instrumentation — emit whenever the play-button-eligible
  // conditions transition. Coalesces on the full signature so identity
  // reallocation does not create noise.
  const playButtonEnabled = Boolean(
    cribbageState.phase === 'pegging' && isMyTurn && canPlayAnyCard,
  );
  const playButtonSigRef = useRef<string | null>(null);
  useEffect(() => {
    const sig = [
      cribbageState.phase,
      isMyTurn ? '1' : '0',
      canPlayAnyCard ? '1' : '0',
      renderedHand.length,
      cribbageState.pegging.currentCount,
    ].join('|');
    if (playButtonSigRef.current === sig) return;
    const prev = playButtonSigRef.current;
    playButtonSigRef.current = sig;
    recordCribbageWartime('boundary', 'play_button_enabled_changed', {
      enabled: playButtonEnabled,
      phase: cribbageState.phase,
      isMyTurn,
      canPlayAnyCard: Boolean(canPlayAnyCard),
      currentCount: cribbageState.pegging.currentCount,
      renderedHandLength: renderedHand.length,
      currentTurnPlayerId: cribbageState.pegging.currentTurnPlayerId ?? null,
      selfPlayerId: currentPlayerId,
    }, {
      producerComponent: 'CribbageMobileCardsTab',
      producerFunction: 'playButtonEligibilityEffect',
      dedupeKey: `play_btn:${sig}`,
      eventReason: prev == null ? 'first eligibility observed' : 'eligibility inputs changed',
    });
  }, [
    playButtonEnabled,
    cribbageState.phase,
    isMyTurn,
    canPlayAnyCard,
    renderedHand.length,
    cribbageState.pegging.currentCount,
    cribbageState.pegging.currentTurnPlayerId,
    currentPlayerId,
  ]);
  
  // Pre-discard: show 6 cards compactly; post-discard: show 4 cards relaxed
  const isPreDiscard = cribbageState.phase === 'discarding' && !haveDiscarded;
  const cardCount = renderedHand.length;

  // ────────────────────────────────────────────────────────────────
  // Wave 2C — geometry-resolver consumer for the viewer hand row.
  //
  // Budget owner: the explicit shell-owned hand stage marked by
  // [data-crib-active-hand-stage]. The stage is the only measured rect:
  // below the active tab rail, above action/instruction/identity content,
  // and inset horizontally by the active-pane safe padding.
  //
  // The resolved width is applied directly to CribbagePlayingCard.
  // Overlap is applied as inline `marginLeft` on cards after the first,
  // but only as a last resort when a straight zero-overlap capacity row
  // cannot meet the minimum readable width.
  // ────────────────────────────────────────────────────────────────
  // Ref-callback based measurement. Fixes the P0 root cause where the
  // ref-bearing hand-stage <div> mounts AFTER the initial render (because
  // the `activeHandBlocked && !shouldSelfHeal` early-return branch is
  // rendered first), so a `useLayoutEffect(..., [])` bound to the ref
  // would fire before the ref was attached and never re-run.
  //
  // The callback runs every time React attaches (node) or detaches
  // (null) the ref-bearing node, guaranteeing exactly one active
  // ResizeObserver per mounted stage node.
  const handStageNodeRef = useRef<HTMLDivElement | null>(null);
  const handStageResizeObserverRef = useRef<ResizeObserver | null>(null);
  const handStageMeasureRef = useRef<() => void>(() => {});
  const [handStageRectPx, setHandStageRectPx] = useState<CribActiveHandStageRect | null>(null);

  // Minimal diagnostic state for the layout-status pill.
  const resizeObserverFireCountRef = useRef(0);
  const [resizeObserverFireCount, setResizeObserverFireCount] = useState(0);
  const [resizeObserverAttached, setResizeObserverAttached] = useState(false);
  const [stageRefAttachedState, setStageRefAttachedState] = useState(false);
  const [lastGetBoundingClientRect, setLastGetBoundingClientRect] =
    useState<{ width: number; height: number } | null>(null);

  // Stable measure function reads the current node from the mutable ref.
  const measureHandStage = useMemo(() => {
    const fn = () => {
      const stage = handStageNodeRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      setLastGetBoundingClientRect({ width: w, height: h });
      resizeObserverFireCountRef.current += 1;
      setResizeObserverFireCount(resizeObserverFireCountRef.current);
      setHandStageRectPx(prev => (
        prev !== null &&
        Math.abs(prev.width - w) < 0.5 &&
        Math.abs(prev.height - h) < 0.5
          ? prev
          : { width: w, height: h }
      ));
    };
    return fn;
  }, []);
  handStageMeasureRef.current = measureHandStage;

  const handStageRefCallback = useMemo(() => (node: HTMLDivElement | null) => {
    // Detach any previous observer cleanly.
    if (handStageResizeObserverRef.current) {
      handStageResizeObserverRef.current.disconnect();
      handStageResizeObserverRef.current = null;
    }
    handStageNodeRef.current = node;
    if (!node) {
      setStageRefAttachedState(false);
      setResizeObserverAttached(false);
      return;
    }
    setStageRefAttachedState(true);
    // Measure synchronously on attach.
    measureHandStage();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => measureHandStage());
      ro.observe(node);
      handStageResizeObserverRef.current = ro;
      setResizeObserverAttached(true);
    }
  }, [measureHandStage]);

  // Reactive remeasure triggers: fires when cards arrive, when the deal
  // phase transitions, and when the local cribbage phase transitions.
  // The ref-callback already handles mount/unmount; this covers content
  // changes that may reflow the stage without resizing its own box (e.g.
  // sibling action-strip content growing/shrinking).
  useLayoutEffect(() => {
    if (handStageNodeRef.current) handStageMeasureRef.current();
  }, [cardCount, deal?.phase, cribbageState.phase]);





  // Phase-capacity sizing contract:
  //   - Pre-discard: 6 cards in hand (max the phase will ever hold).
  //   - Post-discard (pegging / counting / etc.): 4 — the full
  //     post-discard capacity, NOT the current rendered count. Sizing
  //     against current count would re-expand cards as they are played
  //     (4 → 3 → 2 → 1), violating the locked-size contract.
  // Card width is resolved against this capacity and locked once per
  // phase boundary. The measured hand-stage already excludes the tab
  // rail, action/instruction row, identity row, and horizontal safe inset.
  const phaseCapacity = isPreDiscard ? 6 : 4;
  const activeHandPolicy = useActiveHandLayoutPolicy('cribbage');
  const handLayout = useMemo(
    () =>
      resolveActiveHandLayout(
        handStageRectPx,
        phaseCapacity,
        activeHandPolicy,
        CRIB_ACTIVE_HAND_ASPECT,
      ),
    [handStageRectPx, phaseCapacity, activeHandPolicy],
  );
  const phaseLayoutKey = `${roundId ?? expectedRoundId ?? 'unknown-round'}:${isPreDiscard ? 'pre-discard' : 'post-discard'}`;
  const [lockedHandLayout, setLockedHandLayout] = useState<{ key: string; layout: ResolvedActiveHandRow } | null>(null);
  useEffect(() => {
    if (!handLayout) return;
    setLockedHandLayout(prev => (prev?.key === phaseLayoutKey ? prev : { key: phaseLayoutKey, layout: handLayout }));
  }, [handLayout, phaseLayoutKey]);
  const activeHandLayout = lockedHandLayout?.key === phaseLayoutKey ? lockedHandLayout.layout : handLayout;
  const resolvedCardWidthPx = activeHandLayout ? activeHandLayout.cardWidth : 40;
  const overlapPx = activeHandLayout ? activeHandLayout.overlapPx : 0;

  // ── Layout status diagnostics (minimal pill) ─────────────────────
  const didRemeasureAfterCardsArrivedRef = useRef(false);
  const [didRemeasureAfterCardsArrived, setDidRemeasureAfterCardsArrived] = useState(false);
  const didRemeasureAfterDealReadyRef = useRef(false);
  const [didRemeasureAfterDealReady, setDidRemeasureAfterDealReady] = useState(false);
  const prevCardCountRef = useRef(0);
  const prevDealPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (cardCount > 0 && prevCardCountRef.current === 0) {
      // First frame with cards present — expect a follow-up measure.
      didRemeasureAfterCardsArrivedRef.current = false;
      setDidRemeasureAfterCardsArrived(false);
    } else if (cardCount > 0 && !didRemeasureAfterCardsArrivedRef.current && resizeObserverFireCount > 0) {
      didRemeasureAfterCardsArrivedRef.current = true;
      setDidRemeasureAfterCardsArrived(true);
    }
    prevCardCountRef.current = cardCount;
  }, [cardCount, resizeObserverFireCount]);
  useEffect(() => {
    const phase = deal?.phase ?? null;
    if (phase === 'READY' && prevDealPhaseRef.current !== 'READY') {
      didRemeasureAfterDealReadyRef.current = false;
      setDidRemeasureAfterDealReady(false);
    } else if (phase === 'READY' && !didRemeasureAfterDealReadyRef.current && resizeObserverFireCount > 0) {
      didRemeasureAfterDealReadyRef.current = true;
      setDidRemeasureAfterDealReady(true);
    }
    prevDealPhaseRef.current = phase;
  }, [deal?.phase, resizeObserverFireCount]);

  const layoutWasFallback = handLayout == null;
  const layoutFallbackReason: string | null = !layoutWasFallback
    ? null
    : !handStageRectPx
      ? 'no-stage-rect'
      : (handStageRectPx.width <= 0 || handStageRectPx.height <= 0)
        ? 'zero-stage-rect'
        : 'resolver-null';
  const resolveActiveHandLayoutReturnReason =
    handLayout != null ? 'ok' : (layoutFallbackReason ?? 'unknown');

  // Replicate ActiveHandFan hotfix fallback synthesis for reporting only.
  const fallbackSynth = useMemo(() => {
    if (!layoutWasFallback) return { w: null as number | null, h: null as number | null, ratio: null as number | null };
    const N0 = Math.max(1, cardCount);
    const sw = handStageRectPx?.width ?? 0;
    const sh = handStageRectPx?.height ?? 0;
    const TARGET = 76;
    const MIN = 56;
    const ratio = N0 > 4 ? 0.3 : 0.15;
    const denomN = N0 - (N0 - 1) * ratio;
    let cw = TARGET;
    if (sw > 0 && denomN > 0) {
      const fromStage = sw / denomN;
      if (fromStage < TARGET) cw = Math.max(MIN, fromStage);
    }
    if (sh > 0) {
      const fromH = sh * CRIB_ACTIVE_HAND_ASPECT;
      if (fromH > 0 && fromH < cw) cw = Math.max(MIN, fromH);
    }
    cw = Math.max(MIN, Math.min(96, Math.round(cw)));
    const ch = Math.round(cw / CRIB_ACTIVE_HAND_ASPECT);
    return { w: cw, h: ch, ratio };
  }, [layoutWasFallback, cardCount, handStageRectPx?.width, handStageRectPx?.height]);

  const [visibleDomCardNodeCount, setVisibleDomCardNodeCount] = useState(0);
  useEffect(() => {
    const stage = handStageNodeRef.current;
    if (!stage) return;
    const count = stage.querySelectorAll('[data-playing-card-root]').length;
    setVisibleDomCardNodeCount(count);
  }, [cardCount, resizeObserverFireCount, layoutWasFallback]);

  // Layout status fields previously fed the removed CribbageLayoutStatusPill.
  // Left as no-op references to preserve the surrounding hook order; the
  // wartime pill consumes the same underlying state via its own bridges.
  void layoutWasFallback;
  void layoutFallbackReason;
  void resolveActiveHandLayoutReturnReason;
  void stageRefAttachedState;
  void lastGetBoundingClientRect;
  void handStageRectPx;
  void resizeObserverAttached;
  void resizeObserverFireCount;
  void didRemeasureAfterCardsArrived;
  void didRemeasureAfterDealReady;
  void fallbackSynth;
  void visibleDomCardNodeCount;



  const handleCardClick = (index: number) => {
    if (!myPlayerState) return;

    if (cribbageState.phase === 'discarding') {
      if (selectedCards.includes(index)) {
        setSelectedCards(selectedCards.filter(i => i !== index));
      } else if (selectedCards.length < expectedDiscard) {
        setSelectedCards([...selectedCards, index]);
      }
    } else if (cribbageState.phase === 'pegging') {
      if (isMyTurn) {
        const card = renderedHand[index];
        if (card && getCardPointValue(card) + cribbageState.pegging.currentCount <= 31) {
          // Task C2 — synchronously capture selected hand card rect BEFORE
          // authoritative play mutates state. Overlay animation will fly
          // from this rect to the pegging row center.
          let sourceRect: { x: number; y: number; width: number; height: number } | null = null;
          try {
            const key = `${card.rank}${card.suit[0]}-${index}`;
            const el = document.querySelector(
              `[data-cribbage-hand-card-key="${key}"]`,
            ) as HTMLElement | null;
            if (el) {
              const r = el.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) {
                sourceRect = { x: r.left, y: r.top, width: r.width, height: r.height };
              }
            }
          } catch { /* best-effort */ }
          onPlayCard(index, sourceRect);
        } else {
          toast.error('Card would exceed 31');
        }
      }
    }
  };

  const handleDiscard = () => {
    if (selectedCards.length !== expectedDiscard) {
      toast.error(`Select ${expectedDiscard} card(s) to discard`);
      return;
    }
    // Task C1 — synchronously capture per-card source rects BEFORE the
    // authoritative discard state mutates. Uses the stable
    // `data-cribbage-hand-card-key` marker attached to each hand button.
    const sourceRects = selectedCards.map((idx) => {
      const card = renderedHand[idx];
      if (!card) return null;
      const key = `${card.rank}${card.suit[0]}-${idx}`;
      const el = document.querySelector(
        `[data-cribbage-hand-card-key="${key}"]`,
      ) as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    onDiscard(selectedCards, sourceRects);
    setSelectedCards([]);
  };




  if (!myPlayerState) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  // Identity row (name / chips / emoticon / "Your Crib") is now
  // shell-owned: rendered by CribbageMobileGameTable in ShellHudGrid's
  // `identity` slot so it persists across all tabs, matching Yahtzee.

  // Parent suppression (identity mismatch / interactionsAllowed=false) is
  // honored only if the P0 self-heal did NOT recover authoritative cards.
  // When self-heal is active, authoritative cards must render even though
  // interactions remain disabled — buttons are guarded by `isProcessing`
  // and phase gates below.
  // DEALING partial-reveal exception: during the opening-deal window the
  // resolver returns `render-presentation` (not self-heal), so a purely
  // gate-based early-return would unmount ActiveHandFan and mask every
  // settled transport until identity converges, then batch-reveal them
  // together. Mirror Turn 1's clip/resolver exceptions at the subtree-
  // mount boundary. Action-legality remains gated separately below.
  const dealingPartialReveal =
    deal?.phase === 'DEALING' && renderedHand.length > 0;
  if (activeHandBlocked && !shouldSelfHeal && !dealingPartialReveal) {
    return (
      <div className="h-full px-2 grid grid-rows-[minmax(0,1fr)_max-content] overflow-hidden">
        <div data-crib-active-hand-stage="" className="overflow-hidden" />
        <div className="flex items-center justify-center min-h-[28px] overflow-hidden" />
      </div>
    );
  }


  return (
    <div className="relative h-full px-2 grid grid-rows-[minmax(0,1fr)_max-content] overflow-hidden">
      {/* CribbageLayoutStatusPill removed — see CribbageWartimeTruthPill. */}
      {/* Cards display — Wave 2C geometry consumer.
          Width/height budget = hand stage ([data-crib-active-hand-stage]).
          Card size = stage-contained straight-row-first resolver.
          Overlap = inline marginLeft on cards after the first. */}
      <div
        ref={handStageRefCallback}
        data-crib-active-hand-stage=""
        className="flex items-center justify-center overflow-hidden"
      >
        <ActiveHandFan
          game="cribbage"
          cards={renderedHand.map(toDisplayCard)}
          capacity={phaseCapacity}
          stageRect={activeHandLayout?.stageRect ?? handStageRectPx}
          applyFan
          renderCard={({ index, card_node }) => {
            const card = renderedHand[index];
            if (!card) return null;

            const isSelected = selectedCards.includes(index);
            const isPlayable = cribbageState.phase === 'pegging' &&
              isMyTurn &&
              getCardPointValue(card) + cribbageState.pegging.currentCount <= 31;

            return (
              <button
                onClick={() => handleCardClick(index)}
                data-cribbage-hand-card-key={`${card.rank}${card.suit[0]}-${index}`}

                onPointerUp={(e) => e.currentTarget.blur()}
                disabled={isProcessing}
                className={cn(
                  "transition-all duration-200 rounded relative",
                  isSelected
                    ? "-translate-y-3 ring-2 ring-poker-gold z-10"
                    : "translate-y-0",
                  isMyTurn && isPlayable && !isSelected &&
                    "[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-1 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-poker-gold/50",
                  cribbageState.phase === 'discarding' && !haveDiscarded && !isSelected &&
                    "[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-2 [@media(hover:hover)_and_(pointer:fine)]:hover:z-10"
                )}
                style={{ zIndex: isSelected ? 10 : index }}
              >
                {card_node}
              </button>
            );
          }}
        />
      </div>


      {/* Action area - tighter to cards */}
      <div data-active-hand-lower-zone="" className="flex items-center justify-center min-h-[28px] overflow-hidden">
        {cribbageState.phase === 'discarding' && !haveDiscarded && (
          <Button
            onClick={handleDiscard}
            disabled={isProcessing || selectedCards.length !== expectedDiscard}
            className="bg-poker-gold text-black font-bold hover:bg-poker-gold/80 px-6"
          >
            Send to Crib ({selectedCards.length}/{expectedDiscard})
          </Button>
        )}
        
        {cribbageState.phase === 'discarding' && haveDiscarded && (
          <p className="text-muted-foreground text-sm">Waiting for other players...</p>
        )}

        {cribbageState.phase === 'pegging' && isMyTurn && !canPlayAnyCard && (
          <p className="text-amber-400 text-sm animate-pulse">Auto-calling Go...</p>
        )}

        {cribbageState.phase === 'pegging' && isMyTurn && canPlayAnyCard && (
          <p className="text-poker-gold text-sm font-medium animate-pulse">Tap a card to play!</p>
        )}

        {cribbageState.phase === 'pegging' && !isMyTurn && (
          <p className="text-muted-foreground text-sm">Waiting for opponent...</p>
        )}

        {cribbageState.phase === 'counting' && (
          <p className="text-poker-gold text-sm">Counting hands...</p>
        )}
      </div>

      {/* Identity row is rendered by ShellHudGrid (shell-owned row 5). */}

      {/* Crib is shown on the felt during counting - no duplicate display here */}
    </div>
  );
};
