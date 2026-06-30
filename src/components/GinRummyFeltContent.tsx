// Gin Rummy Felt Content - Center area of the circular table
// Shows stock pile, discard pile, match scores, and phase indicators

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { CanonicalCardBack } from './canonicalShell/CanonicalCardBack';
// Score rail is owned by GinRummyGameTable (persistent across hand
// identity boundaries). Do not re-mount it here.
import { GinAnchoredSlot } from './GinAnchoredSlot';
import type { GinRummyState, GinRummyCard } from '@/lib/ginRummyTypes';
import { getDiscardTop, stockRemaining } from '@/lib/ginRummyGameLogic';
import { STOCK_EXHAUSTION_THRESHOLD } from '@/lib/ginRummyTypes';
import type { CanonicalSlot } from '@/lib/canonicalShell/seatAnchors';
import { useShellFeltFrameElement } from '@/lib/canonicalShell/useShellFeltFrameElement';
import { useSeatAnchorsOptional } from '@/lib/canonicalShell/SeatAnchorLayer';
import { useSeatTargetAngle } from '@/lib/canonicalShell/useSeatTargetAngle';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { recordGinRunbackTrace } from '@/lib/ginRunbackTrace';
import {
  buildGinPileContext,
  describeGinPileEvent,
  getGinPileButtonDiagnostics,
  recordGinPileTrace,
  resolveGinPileFromEvent,
  setLatestGinPileTraceContext,
  type GinPileTraceContextSnapshot,
  type GinPileTracePile,
} from '@/lib/ginPileTrace';

interface GinRummyFeltContentProps {
  ginState: GinRummyState;
  currentPlayerId: string | undefined;
  opponentId: string;
  currentTurnSlot?: CanonicalSlot | null;
  /** Authoritative seat position (1..7) of the current turn player.
   *  When provided, drives the spotlight via chip-center geometry. */
  currentTurnPosition?: number | null;
  getPlayerUsername: (playerId: string) => string;
  cardBackColors: { color: string; darkColor: string };
  onDrawStock?: () => void;
  onDrawDiscard?: () => void;
  isProcessing?: boolean;
  isPlayable?: boolean;
  /** Canonical hand identity — used to gate the discard upcard reveal
   *  on the deal-runtime settle event (`${handContextId}#discard`). */
  handContextId?: string | null;
}

// Single authoritative resolved rect for Gin pile artifacts.
// Wrapper, button (inset-0), and decorative card child all derive
// width / aspect from these constants. Geometry-Lab driven sizing
// can later replace these values; no per-artifact size constants
// are duplicated in CSS or JSX below.
const PILE_CARD_WIDTH_PX = 48;
const PILE_CARD_ASPECT = 2 / 3; // width / height — matches CribbagePlayingCard 'lg' (48x72)
const PILE_CARD_HEIGHT_PX = PILE_CARD_WIDTH_PX / PILE_CARD_ASPECT;

const SYMBOL_TO_WORD: Record<string, string> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

const toDisplayCard = (card: GinRummyCard) => ({
  suit: (SYMBOL_TO_WORD[card.suit] || card.suit) as any,
  rank: card.rank,
  value: card.value,
});

// Spotlight angle derived from the canonical slot identity. The slot
// identity comes from the shell's SeatAnchorLayer (single source of
// truth for seat geometry) — this is just the local visual rotation
// applied to the spotlight cone.
const SLOT_TO_SPOTLIGHT_ANGLE: Record<CanonicalSlot, number> = {
  [-3]: 180, // BOTTOM_RAIL (observer-only) — same as HOME
  [-1]: 180,
  0: -135,
  1: -90,
  2: -45,
  3: 45,
  4: 90,
  5: 135,
};


const GinCanonicalTurnSpotlight = ({
  currentTurnSlot,
  currentTurnPosition,
  isVisible,
}: {
  currentTurnSlot: CanonicalSlot | null | undefined;
  currentTurnPosition: number | null | undefined;
  isVisible: boolean;
}) => {
  const [opacity, setOpacity] = useState(0);
  const [rotation, setRotation] = useState(0);
  const enabled = isVisible && currentTurnSlot !== null && currentTurnSlot !== undefined;
  const shellFrame = useShellFeltFrameElement(enabled);
  const anchors = useSeatAnchorsOptional();
  const isObserverProjection =
    anchors?.projectionMode === 'observer-absolute' || anchors?.viewerPosition == null;

  // Single geometry contract — derive apex angle from the canonical
  // chip cluster's actual DOM rect. No slot-to-angle table.
  const isMyTurn =
    !isObserverProjection &&
    anchors?.viewerPosition != null &&
    currentTurnPosition === anchors.viewerPosition;
  const measuredAngle = useSeatTargetAngle(
    shellFrame,
    !isMyTurn ? currentTurnPosition ?? null : null,
    enabled,
  );

  useEffect(() => {
    if (!enabled) {
      setOpacity(0);
      return;
    }
    if (isMyTurn) {
      setRotation(180);
      setOpacity(1);
      return;
    }
    if (measuredAngle !== null) {
      setRotation(measuredAngle);
      setOpacity(1);
      return;
    }
    // Geometry not ready — fall back to slot map so the cone is at
    // least pointed roughly while measurement settles.
    const slot = currentTurnSlot as CanonicalSlot;
    let angle = SLOT_TO_SPOTLIGHT_ANGLE[slot] ?? 180;
    if (slot === -1 && isObserverProjection) {
      angle = -135;
    }
    setRotation(angle);
    setOpacity(1);
  }, [enabled, isMyTurn, measuredAngle, currentTurnSlot, isObserverProjection]);

  if (!enabled || !shellFrame) return null;

  const beamHalfAngle = 25;
  // Portaled into the canonical felt SURFACE node which enforces the
  // exact canonical ellipse via overflow:hidden + rounded-[50%/45%].
  // No local clipPath — that produced a visibly-offset second ellipse
  // because ellipse(50% 50%) doesn't match the canonical 50%/45% radius.
  const overlay = (
    <>
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{ opacity, transition: 'opacity 0.4s ease-out' }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: 'hsla(45, 70%, 50%, 0.15)',
            maskImage: `conic-gradient(from ${rotation - beamHalfAngle}deg at 50% 50%, white 0deg, white ${beamHalfAngle * 2}deg, transparent ${beamHalfAngle * 2}deg, transparent 360deg)`,
            WebkitMaskImage: `conic-gradient(from ${rotation - beamHalfAngle}deg at 50% 50%, white 0deg, white ${beamHalfAngle * 2}deg, transparent ${beamHalfAngle * 2}deg, transparent 360deg)`,
            transition: 'mask-image 0.5s cubic-bezier(0.4, 0, 0.2, 1), -webkit-mask-image 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{ opacity, transition: 'opacity 0.4s ease-out' }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: 'rgba(0, 0, 0, 0.35)',
            maskImage: `conic-gradient(from ${rotation - beamHalfAngle}deg at 50% 50%, transparent 0deg, transparent ${beamHalfAngle * 2}deg, black ${beamHalfAngle * 2}deg, black 360deg)`,
            WebkitMaskImage: `conic-gradient(from ${rotation - beamHalfAngle}deg at 50% 50%, transparent 0deg, transparent ${beamHalfAngle * 2}deg, black ${beamHalfAngle * 2}deg, black 360deg)`,
            transition: 'mask-image 0.5s cubic-bezier(0.4, 0, 0.2, 1), -webkit-mask-image 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
    </>
  );

  return createPortal(overlay, shellFrame);
};

export const GinRummyFeltContent = ({
  ginState,
  currentPlayerId,
  opponentId,
  currentTurnSlot,
  currentTurnPosition,
  getPlayerUsername,
  cardBackColors,
  onDrawStock,
  onDrawDiscard,
  isProcessing,
  isPlayable,
  handContextId,
}: GinRummyFeltContentProps) => {
  const stockButtonRef = useRef<HTMLButtonElement | null>(null);
  const discardButtonRef = useRef<HTMLButtonElement | null>(null);
  const stockVisibleChildRef = useRef<HTMLDivElement | null>(null);
  const discardVisibleChildRef = useRef<HTMLDivElement | null>(null);
  const discardTopCard = getDiscardTop(ginState);
  const stockCount = stockRemaining(ginState);
  const isMyTurn = ginState.currentTurnPlayerId === currentPlayerId;
  const stockDanger = stockCount <= STOCK_EXHAUSTION_THRESHOLD + 2;
  // canTakeFirstDraw is computed AFTER discardRevealed below so the
  // presentation-layer predicate is gated on the opening discard
  // intent having settled. See single-owner contract comment.
  const canDraw = isMyTurn && ginState.phase === 'playing' && ginState.turnPhase === 'draw' && !isProcessing;
  // Stock click target is unaffected by discard reveal.
  const stockClickable = canDraw;

  // Hide stock/discard when the hand is decided — they're no longer relevant
  const hidePiles = ['knocking', 'laying_off', 'scoring', 'complete'].includes(ginState.phase);

  // Wave 2 canonical deal — gate the discard upcard reveal on the
  // discard intent settling. Stock card-back is shown immediately; it's
  // a structural placeholder ("the pile"). The first upcard, like
  // opponent stack cards, becomes visible only when its transport has
  // arrived. No DealRuntime → legacy instant reveal.
  const deal = useDealRuntime();
  const discardCardId = handContextId ? `${handContextId}#discard` : null;
  const stockCardId = handContextId ? `${handContextId}#stock` : null;
  const discardRevealed = !deal || !discardCardId
    ? true
    : deal.phase === 'GAMEPLAY' || deal.phase === 'READY' || deal.isSettled(discardCardId);
  const stockRevealed = !deal || !stockCardId
    ? true
    : deal.phase === 'GAMEPLAY' || deal.phase === 'READY' || deal.isSettled(stockCardId);

  // Single-owner contract: while the opening discard intent is not
  // settled (discardRevealed === false), no upcard click target may
  // render and the Take CTA's underlying predicate must be false. The
  // authoritative first-draw offer remains true in state — it is only
  // GATED at the presentation layer until the transport settles.
  const canTakeFirstDraw =
    ginState.phase === 'first_draw' &&
    ginState.firstDrawOfferedTo === currentPlayerId &&
    !isProcessing &&
    discardRevealed;
  const discardClickable = (canDraw || canTakeFirstDraw) && discardRevealed;

  const pileTraceContext: GinPileTraceContextSnapshot = buildGinPileContext({
    ginState,
    currentPlayerId,
    handContextId,
    isPlayable: isPlayable ?? null,
    dealPhase: deal?.phase ?? null,
    dealSettled: deal?.dealSettled ?? null,
    readyReleased: deal?.readyReleased ?? null,
    stockClickable,
    discardClickable,
    canDraw,
    canTakeFirstDraw,
    discardRevealed,
    stockRevealed,
  });

  const getButtonForPile = (pile: GinPileTracePile) =>
    pile === 'stock' ? stockButtonRef.current : pile === 'discard' ? discardButtonRef.current : null;

  const getVisibleChildForPile = (pile: GinPileTracePile) =>
    pile === 'stock' ? stockVisibleChildRef.current : pile === 'discard' ? discardVisibleChildRef.current : null;

  const recordPileDomEvent = (
    eventName: 'PILE_EVENT_CAPTURE' | 'PILE_EVENT_BUBBLE',
    layer: string,
    event: PointerEvent<HTMLElement> | MouseEvent<HTMLElement>,
    explicitPile?: GinPileTracePile,
  ) => {
    const pile = explicitPile ?? resolveGinPileFromEvent(event);
    recordGinPileTrace(eventName, {
      ...pileTraceContext,
      pile,
      layer,
      ...describeGinPileEvent(event),
      buttonDiagnostics: getGinPileButtonDiagnostics(getButtonForPile(pile)),
      visibleChildDiagnostics: getGinPileButtonDiagnostics(getVisibleChildForPile(pile)),
      source: 'GinRummyFeltContent',
    });
  };

  const makeCapture = (layer: string, pile?: GinPileTracePile) =>
    (event: PointerEvent<HTMLElement> | MouseEvent<HTMLElement>) =>
      recordPileDomEvent('PILE_EVENT_CAPTURE', layer, event, pile);

  const makeBubble = (layer: string, pile?: GinPileTracePile) =>
    (event: PointerEvent<HTMLElement> | MouseEvent<HTMLElement>) =>
      recordPileDomEvent('PILE_EVENT_BUBBLE', layer, event, pile);

  const recordButtonRenderDiagnostics = (pile: Exclude<GinPileTracePile, 'unknown' | null>) => {
    recordGinPileTrace('PILE_BUTTON_RENDER_DIAGNOSTICS', {
      ...pileTraceContext,
      pile,
      layer: `${pile}-button`,
      buttonDiagnostics: getGinPileButtonDiagnostics(getButtonForPile(pile)),
      visibleChildDiagnostics: getGinPileButtonDiagnostics(getVisibleChildForPile(pile)),
      handlerSelected: pile === 'stock'
        ? (stockClickable ? 'onDrawStock' : null)
        : (discardClickable ? (ginState.phase === 'first_draw' ? 'onTakeFirstDraw' : 'onDrawDiscard') : null),
      source: 'GinRummyFeltContent render',
    });
  };

  const handleStockButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    recordGinPileTrace('PILE_BUTTON_ONCLICK', {
      ...pileTraceContext,
      pile: 'stock',
      layer: 'stock-button',
      handlerName: 'stock button onClick',
      handlerSelected: stockClickable ? 'onDrawStock' : null,
      handlerInvoked: Boolean(stockClickable && onDrawStock),
      ...describeGinPileEvent(event),
      buttonDiagnostics: getGinPileButtonDiagnostics(stockButtonRef.current),
      visibleChildDiagnostics: getGinPileButtonDiagnostics(stockVisibleChildRef.current),
      source: 'GinRummyFeltContent',
    });
    if (!stockClickable || !onDrawStock) {
      recordGinPileTrace('ACTION_REJECTED', {
        ...pileTraceContext,
        pile: 'stock',
        layer: 'stock-button',
        handlerName: 'stock button onClick',
        guardName: !stockClickable ? 'stockClickable' : 'onDrawStock',
        guardValues: { stockClickable, onDrawStockPresent: !!onDrawStock },
        ...describeGinPileEvent(event),
        buttonDiagnostics: getGinPileButtonDiagnostics(stockButtonRef.current),
        visibleChildDiagnostics: getGinPileButtonDiagnostics(stockVisibleChildRef.current),
        source: 'GinRummyFeltContent',
      });
      return;
    }
    onDrawStock();
  };

  const handleDiscardButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    const selected = ginState.phase === 'first_draw' ? 'onTakeFirstDraw' : 'onDrawDiscard';
    recordGinPileTrace('PILE_BUTTON_ONCLICK', {
      ...pileTraceContext,
      pile: 'discard',
      layer: 'discard-button',
      handlerName: 'discard button onClick',
      handlerSelected: discardClickable ? selected : null,
      handlerInvoked: Boolean(discardClickable && onDrawDiscard),
      ...describeGinPileEvent(event),
      buttonDiagnostics: getGinPileButtonDiagnostics(discardButtonRef.current),
      visibleChildDiagnostics: getGinPileButtonDiagnostics(discardVisibleChildRef.current),
      source: 'GinRummyFeltContent',
    });
    if (!discardClickable || !onDrawDiscard) {
      recordGinPileTrace('ACTION_REJECTED', {
        ...pileTraceContext,
        pile: 'discard',
        layer: 'discard-button',
        handlerName: 'discard button onClick',
        guardName: !discardClickable ? 'discardClickable' : 'onDrawDiscard',
        guardValues: { discardClickable, onDrawDiscardPresent: !!onDrawDiscard },
        ...describeGinPileEvent(event),
        buttonDiagnostics: getGinPileButtonDiagnostics(discardButtonRef.current),
        visibleChildDiagnostics: getGinPileButtonDiagnostics(discardVisibleChildRef.current),
        source: 'GinRummyFeltContent',
      });
      return;
    }
    onDrawDiscard();
  };


  useEffect(() => {
    setLatestGinPileTraceContext(pileTraceContext);
    if (!hidePiles) {
      recordButtonRenderDiagnostics('stock');
      recordButtonRenderDiagnostics('discard');
    }
    recordGinRunbackTrace('upcard/stock/rail render gate', {
      payloadHandNumber: ginState.handNumber ?? null,
      payloadPhase: ginState.phase,
      ginState: {
        handNumber: ginState.handNumber ?? null,
        phase: ginState.phase,
        turnPhase: ginState.turnPhase,
        actionCount: ginState.actionCount ?? null,
      },
      dealRuntime: deal ? {
        handContextId: deal.handContextId,
        phase: deal.phase,
        expectedCount: deal.expectedCount,
        settledCount: deal.settledCardIds.size,
        discardCardId,
        stockCardId,
        discardRevealed,
        stockRevealed,
      } : null,
      overlayPredicateInputs: {
        hidePiles,
        discardTopPresent: !!discardTopCard,
        canDraw,
        canTakeFirstDraw,
        discardClickable,
        stockClickable,
      },
    });
  }, [ginState.handNumber, ginState.phase, ginState.turnPhase, ginState.actionCount, deal?.handContextId, deal?.phase, deal?.expectedCount, deal?.settledCardIds.size, deal?.dealSettled, deal?.readyReleased, discardCardId, stockCardId, discardRevealed, stockRevealed, hidePiles, !!discardTopCard, canDraw, canTakeFirstDraw, discardClickable, stockClickable, isPlayable]);


  return (
    <div
      data-gin-felt-content-parent=""
      style={{ display: 'contents' }}
      onPointerDownCapture={makeCapture('felt-content-parent')}
      onPointerDown={makeBubble('felt-content-parent')}
      onClickCapture={makeCapture('felt-content-parent')}
      onClick={makeBubble('felt-content-parent')}
    >
      {/* Turn Spotlight */}
      <GinCanonicalTurnSpotlight
        currentTurnSlot={currentTurnSlot}
        currentTurnPosition={currentTurnPosition}
        isVisible={ginState.phase === 'playing' || ginState.phase === 'first_draw'}
      />


      {/* Score rail (gin.pegboard) is mounted by GinRummyGameTable so
          it remains visually stable across PRE_DEAL / DEALING / READY /
          GAMEPLAY / first_draw / playing / scoring and across the
          identity-boundary null pass between hands within a dealer
          game. Do not re-mount here. */}

      {/* Wave 5D — gin.stockDiscardGroup (anchored). Stock + discard
          are siblings inside the group rect; their pixel sizes are
          preserved (size="lg") and the group rect was sized to fit. */}
      {!hidePiles && (
        <GinAnchoredSlot
          artifactId="gin.stockDiscardGroup"
          zIndex={40}
          innerStyle={{ gap: '1rem', pointerEvents: 'auto' }}
          onPointerDownCapture={makeCapture('gin-anchored-slot-root')}
          onPointerDown={makeBubble('gin-anchored-slot-root')}
          onClickCapture={makeCapture('gin-anchored-slot-root')}
          onClick={makeBubble('gin-anchored-slot-root')}
        >
          {/* Stock Pile — interactive wrapper is the single click owner.
              Card-back / count span are pointer-events:none decorations. */}
          <div
            data-gin-pile="stock"
            data-gin-pile-layer="wrapper"
            className="flex flex-col items-center gap-0.5"
            style={{ pointerEvents: 'auto' }}
            onPointerDownCapture={makeCapture('stock-pile-wrapper', 'stock')}
            onPointerDown={makeBubble('stock-pile-wrapper', 'stock')}
            onClickCapture={makeCapture('stock-pile-wrapper', 'stock')}
            onClick={makeBubble('stock-pile-wrapper', 'stock')}
          >
            <div
              data-gin-pile="stock"
              data-gin-pile-layer="card-rect-wrapper"
              style={{
                position: 'relative',
                width: PILE_CARD_WIDTH_PX,
                aspectRatio: `${PILE_CARD_WIDTH_PX} / ${PILE_CARD_HEIGHT_PX}`,
              }}
            >
              <button
                ref={stockButtonRef}
                type="button"
                onPointerDownCapture={makeCapture('stock-button', 'stock')}
                onPointerDown={makeBubble('stock-button', 'stock')}
                onClickCapture={makeCapture('stock-button', 'stock')}
                onClick={handleStockButtonClick}
                aria-disabled={!stockClickable}
                data-card-anchor="stock"
                data-gin-pile="stock"
                data-gin-pile-layer="button"
                className={`absolute inset-0 rounded-md transition-all block ${
                  stockClickable ? 'ring-2 ring-poker-gold/70 animate-pulse cursor-pointer active:scale-95' : ''
                }`}
                style={{
                  pointerEvents: 'auto',
                  zIndex: 30,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                }}
              >
                {stockRevealed ? (
                  <div
                    ref={stockVisibleChildRef}
                    data-gin-pile="stock"
                    data-gin-pile-layer="visible-cardback-child"
                    style={{ pointerEvents: 'none', position: 'absolute', inset: 0 }}
                  >
                    <CanonicalCardBack
                      widthPx={PILE_CARD_WIDTH_PX}
                      heightPx={PILE_CARD_HEIGHT_PX}
                      variant="raised"
                      radiusPx={6}
                      style={{ width: '100%', height: '100%', borderColor: stockDanger ? 'rgba(239,68,68,0.6)' : undefined }}
                    />
                    <span
                      className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${stockDanger ? 'text-red-300' : 'text-white/90'}`}
                      style={{ textShadow: '0 0 4px rgba(0,0,0,0.8)', pointerEvents: 'none' }}
                    >
                      {stockCount}
                    </span>
                  </div>
                ) : null}
              </button>
            </div>
            <span className={`text-[8px] ${stockDanger ? 'text-red-400/80' : 'text-white/50'}`} style={{ pointerEvents: 'none' }}>
              {stockDanger ? 'Low!' : 'Stock'}
            </span>
          </div>

          {/* Discard Pile — single always-mounted button owns the visible
              card rect. Face vs empty-placeholder is a child swap inside
              the button so the hit-test target rect stays stable. */}
          <div
            data-gin-pile="discard"
            data-gin-pile-layer="wrapper"
            className="flex flex-col items-center gap-0.5"
            style={{ pointerEvents: 'auto' }}
            onPointerDownCapture={makeCapture('discard-pile-wrapper', 'discard')}
            onPointerDown={makeBubble('discard-pile-wrapper', 'discard')}
            onClickCapture={makeCapture('discard-pile-wrapper', 'discard')}
            onClick={makeBubble('discard-pile-wrapper', 'discard')}
          >
            <div
              data-gin-pile="discard"
              data-gin-pile-layer="card-rect-wrapper"
              style={{
                position: 'relative',
                width: PILE_CARD_WIDTH_PX,
                aspectRatio: `${PILE_CARD_WIDTH_PX} / ${PILE_CARD_HEIGHT_PX}`,
              }}
            >
              <button
                ref={discardButtonRef}
                type="button"
                onPointerDownCapture={makeCapture('discard-button', 'discard')}
                onPointerDown={makeBubble('discard-button', 'discard')}
                onClickCapture={makeCapture('discard-button', 'discard')}
                onClick={handleDiscardButtonClick}
                aria-disabled={!discardClickable}
                data-card-anchor="discard"
                data-gin-pile="discard"
                data-gin-pile-layer="button"
                className={`absolute inset-0 rounded-md transition-all block ${discardClickable ? 'ring-2 ring-poker-gold/70 animate-pulse cursor-pointer active:scale-95' : ''}`}
                style={{
                  pointerEvents: 'auto',
                  zIndex: 30,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                }}
              >
                {discardTopCard && discardRevealed ? (
                  <div
                    ref={discardVisibleChildRef}
                    data-gin-pile="discard"
                    data-gin-pile-layer="visible-card-child"
                    style={{ pointerEvents: 'none', position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <CribbagePlayingCard card={toDisplayCard(discardTopCard)} size="lg" widthPx={PILE_CARD_WIDTH_PX} />
                  </div>
                ) : (
                  <div
                    data-gin-pile="discard"
                    data-gin-pile-layer="empty-placeholder-child"
                    className="rounded-md border border-dashed border-white/20 flex items-center justify-center"
                    style={{ pointerEvents: 'none', position: 'absolute', inset: 0 }}
                  >
                    <span className="text-white/20 text-[8px]">Empty</span>
                  </div>
                )}
              </button>
            </div>
            <span className="text-[8px] text-white/50" style={{ pointerEvents: 'none' }}>Discard</span>
          </div>

        </GinAnchoredSlot>
      )}

      {/* Wave 5D — gin.turnIndicator (anchored). */}
      {!hidePiles && (
        <GinAnchoredSlot artifactId="gin.turnIndicator">
          <div className="w-full text-center">
            {ginState.phase === 'playing' && (
              <p className="text-[10px] text-white/80">
                {isMyTurn ? (
                  <span className="text-poker-gold font-bold animate-pulse">
                    {ginState.turnPhase === 'draw' ? 'Draw a card!' : 'Select a card to discard'}
                  </span>
                ) : (
                  <span>Waiting for {getPlayerUsername(ginState.currentTurnPlayerId)}</span>
                )}
              </p>
            )}

            {ginState.phase === 'first_draw' && ginState.firstDrawOfferedTo === currentPlayerId && (
              <p className="text-[11px] text-poker-gold font-bold animate-pulse">
                {ginState.firstDrawPassed.length === 0
                  ? 'Take the upcard or pass?'
                  : 'Opponent passed — take or pass?'}
              </p>
            )}

            {ginState.phase === 'first_draw' && ginState.firstDrawOfferedTo !== currentPlayerId && (
              <p className="text-[10px] text-white/60">
                {getPlayerUsername(ginState.currentTurnPlayerId)} deciding on upcard...
              </p>
            )}
          </div>
        </GinAnchoredSlot>
      )}
    </div>
  );
};
