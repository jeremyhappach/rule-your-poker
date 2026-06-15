// Gin Rummy Felt Content - Center area of the circular table
// Shows stock pile, discard pile, match scores, and phase indicators

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { GinRummyPegBoard } from './GinRummyPegBoard';
import type { GinRummyState, GinRummyCard } from '@/lib/ginRummyTypes';
import { getDiscardTop, stockRemaining } from '@/lib/ginRummyGameLogic';
import { STOCK_EXHAUSTION_THRESHOLD } from '@/lib/ginRummyTypes';
import type { CanonicalSlot } from '@/lib/canonicalShell/seatAnchors';
import { useShellFeltFrameElement } from '@/lib/canonicalShell/useShellFeltFrameElement';
import { useSeatAnchorsOptional } from '@/lib/canonicalShell/SeatAnchorLayer';
import { useSeatTargetAngle } from '@/lib/canonicalShell/useSeatTargetAngle';

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
}

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
  [-2]: 0,
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
  getPlayerUsername,
  cardBackColors,
  onDrawStock,
  onDrawDiscard,
  isProcessing,
}: GinRummyFeltContentProps) => {
  const discardTopCard = getDiscardTop(ginState);
  const stockCount = stockRemaining(ginState);
  const isMyTurn = ginState.currentTurnPlayerId === currentPlayerId;
  const stockDanger = stockCount <= STOCK_EXHAUSTION_THRESHOLD + 2;
  const canDraw = isMyTurn && ginState.phase === 'playing' && ginState.turnPhase === 'draw' && !isProcessing;
  const canTakeFirstDraw = ginState.phase === 'first_draw' && ginState.firstDrawOfferedTo === currentPlayerId && !isProcessing;
  const discardClickable = canDraw || canTakeFirstDraw;
  const stockClickable = canDraw;

  // Hide stock/discard when the hand is decided — they're no longer relevant
  const hidePiles = ['knocking', 'laying_off', 'scoring', 'complete'].includes(ginState.phase);

  return (
    <>
      {/* Turn Spotlight */}
      <GinCanonicalTurnSpotlight
        currentTurnSlot={currentTurnSlot}
        isVisible={ginState.phase === 'playing' || ginState.phase === 'first_draw'}
      />


      {/* Match Score Pegboard - Top center */}
      <div className="absolute top-[20%] left-1/2 -translate-x-1/2 z-20 w-[70%]">
        <GinRummyPegBoard
          ginState={ginState}
          currentPlayerId={currentPlayerId}
          opponentId={opponentId}
          getPlayerUsername={getPlayerUsername}
        />
      </div>

      {/* Stock & Discard Piles — hidden after knock/gin */}
      {!hidePiles && (
        <div className="absolute top-[46%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-4">
          {/* Stock Pile */}
          <div className="flex flex-col items-center gap-0.5">
            <button
              onClick={stockClickable ? onDrawStock : undefined}
              disabled={!stockClickable}
              className={`w-12 h-[68px] rounded-md border flex items-center justify-center shadow-lg transition-all ${
                stockDanger ? 'border-red-500/60' : 'border-white/30'
              } ${stockClickable ? 'ring-2 ring-poker-gold/70 animate-pulse cursor-pointer active:scale-95' : ''}`}
              style={{
                background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
              }}
            >
              <span className={`text-[10px] font-bold ${stockDanger ? 'text-red-300' : 'text-white/80'}`}>
                {stockCount}
              </span>
            </button>
            <span className={`text-[8px] ${stockDanger ? 'text-red-400/80' : 'text-white/50'}`}>
              {stockDanger ? 'Low!' : 'Stock'}
            </span>
          </div>

          {/* Discard Pile */}
          <div className="flex flex-col items-center gap-0.5">
            {discardTopCard ? (
              <button
                onClick={discardClickable ? onDrawDiscard : undefined}
                disabled={!discardClickable}
                className={`rounded-md transition-all ${discardClickable ? 'ring-2 ring-poker-gold/70 animate-pulse cursor-pointer active:scale-95' : ''}`}
              >
                <CribbagePlayingCard card={toDisplayCard(discardTopCard)} size="lg" />
              </button>
            ) : (
              <div className="w-12 h-[68px] rounded-md border border-dashed border-white/20 flex items-center justify-center">
                <span className="text-white/20 text-[8px]">Empty</span>
              </div>
            )}
            <span className="text-[8px] text-white/50">Discard</span>
          </div>
        </div>
      )}

      {/* Phase / Turn Indicator — only shown during active play, not end-of-hand phases */}
      {!hidePiles && (
        <div className="absolute top-[72%] left-1/2 -translate-x-1/2 z-20 w-[80%]">
          {ginState.phase === 'playing' && (
            <p className="text-[10px] text-white/80 text-center">
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
            <div className="text-center">
              <p className="text-[11px] text-poker-gold font-bold animate-pulse">
                {ginState.firstDrawPassed.length === 0
                  ? 'Take the upcard or pass?'
                  : 'Opponent passed — take or pass?'}
              </p>
            </div>
          )}

          {ginState.phase === 'first_draw' && ginState.firstDrawOfferedTo !== currentPlayerId && (
            <p className="text-[10px] text-white/60 text-center">
              {getPlayerUsername(ginState.currentTurnPlayerId)} deciding on upcard...
            </p>
          )}

        </div>
      )}
    </>
  );
};
