import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CanonicalSlot } from '@/lib/canonicalShell/seatAnchors';
import { useShellFeltFrameElement } from '@/lib/canonicalShell/useShellFeltFrameElement';
import { useSeatTargetAngle } from '@/lib/canonicalShell/useSeatTargetAngle';

interface CribbageTurnSpotlightProps {
  /** Player ID whose turn it is */
  currentTurnPlayerId: string | null;
  /** The current user's player ID */
  currentPlayerId: string;
  /** Whether spotlight should be visible */
  isVisible: boolean;
  /** Total number of players in the game */
  totalPlayers: number;
  /** Ordered list of opponent player IDs (in turn order, excluding current player) */
  opponentIds?: string[];
  /** Authoritative seat position (1..7) for the current turn player. When
   *  provided and `shellOwned`, the spotlight derives its apex angle
   *  directly from the CanonicalOpponentSeat chip geometry. */
  currentTurnPosition?: number | null;
  /** Position of the local viewer (for self-turn fallback). */
  currentPlayerPosition?: number | null;
  /** Legacy slot-based fallback — used only when geometry measurement
   *  is unavailable. */
  currentTurnSlot?: CanonicalSlot | null;
  /** Geometry mask for the spotlight overlay (non-shell-owned only). */
  clipPath?: string;
  /** Portal into the canonical shell felt frame when true. */
  shellOwned?: boolean;
}

const SLOT_TO_ANGLE: Record<number, number> = {
  [-2]: 0,
  [-1]: 180,
  0: -135,
  1: -90,
  2: -45,
  3: 45,
  4: 90,
  5: 135,
};

/**
 * Cribbage turn spotlight. In shell-owned mode the apex angle is
 * derived from CanonicalOpponentSeat geometry (single source of
 * truth). Slot-based fallback retained for safety only.
 */
export const CribbageTurnSpotlight = ({
  currentTurnPlayerId,
  currentPlayerId,
  isVisible,
  totalPlayers,
  opponentIds = [],
  currentTurnPosition,
  currentPlayerPosition,
  currentTurnSlot,
  clipPath: clipPathProp = 'ellipse(50% 50% at 50% 50%)',
  shellOwned = false,
}: CribbageTurnSpotlightProps) => {
  const clipPath = shellOwned ? undefined : clipPathProp;
  const [opacity, setOpacity] = useState(0);
  const [rotation, setRotation] = useState(0);
  const shellFrame = useShellFeltFrameElement(shellOwned && isVisible);

  const isMyTurn = currentTurnPlayerId === currentPlayerId;

  const measuredAngle = useSeatTargetAngle(
    shellOwned ? shellFrame : null,
    shellOwned && !isMyTurn ? currentTurnPosition ?? null : null,
    shellOwned && isVisible && !!currentTurnPlayerId,
  );

  useEffect(() => {
    if (!isVisible || !currentTurnPlayerId) {
      setOpacity(0);
      return;
    }

    // Shell-owned: derive from CanonicalOpponentSeat geometry.
    if (shellOwned) {
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
      // Fall through to slot-map fallback if we have one — better than
      // a missing apex while the seat lays out.
    }

    let angle: number;
    if (currentTurnSlot !== undefined && currentTurnSlot !== null) {
      angle = SLOT_TO_ANGLE[currentTurnSlot] ?? 180;
    } else {
      if (isMyTurn) {
        angle = 180;
      } else {
        const opponentIndex = opponentIds.indexOf(currentTurnPlayerId);
        if (totalPlayers === 2) angle = -45;
        else if (totalPlayers === 3) angle = opponentIndex === 0 ? -45 : 45;
        else {
          if (opponentIndex === 0) angle = -45;
          else if (opponentIndex === 1) angle = 45;
          else angle = 135;
        }
      }
    }

    setRotation(angle);
    setOpacity(1);
  }, [
    isVisible,
    currentTurnPlayerId,
    currentPlayerId,
    totalPlayers,
    opponentIds,
    currentTurnSlot,
    shellOwned,
    isMyTurn,
    measuredAngle,
  ]);

  // currentPlayerPosition is accepted for API parity with TurnSpotlight
  // but no longer needed for legacy fallback math.
  void currentPlayerPosition;

  if (!isVisible || !currentTurnPlayerId) {
    return null;
  }

  // Narrow cone — apex now centered on canonical seat geometry.
  const beamHalfAngle = 25;

  const overlay = (
    <>
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{ opacity, transition: 'opacity 0.4s ease-out', clipPath }}
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
        style={{ opacity, transition: 'opacity 0.4s ease-out', clipPath }}
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

  if (shellOwned) {
    if (!shellFrame) return null;
    return createPortal(overlay, shellFrame);
  }

  return overlay;
};
