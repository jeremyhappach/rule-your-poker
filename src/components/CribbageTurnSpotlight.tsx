import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CanonicalSlot } from '@/lib/canonicalShell/seatAnchors';
import { useShellFeltFrameElement } from '@/lib/canonicalShell/useShellFeltFrameElement';

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
  /**
   * Canonical seat slot of the player whose turn it is, derived from the
   * shell-owned SeatAnchorLayer. When provided this is the authoritative
   * angle source for BOTH active and observer projections (so observers
   * rebind as turn ownership changes instead of being pinned at -45°).
   * When null/undefined, falls back to the legacy player-count math.
   */
  currentTurnSlot?: CanonicalSlot | null;
  /**
   * Geometry mask for the spotlight overlay. Defaults to the legacy
   * Cribbage circular frame; shell-owned felt passes the shared ellipse
   * so the spotlight cannot visually recreate the old circular felt.
   */
  clipPath?: string;
  /**
   * Shell-aware mode. When true, the spotlight portals itself into the
   * canonical shell felt frame so the ellipse clip aligns with the
   * actual canonical ellipse geometry instead of the larger parent box.
   */
  shellOwned?: boolean;
}

const SLOT_TO_ANGLE: Record<number, number> = {
  [-2]: 0,      // FACE_TO_FACE — top center
  [-1]: 180,    // HOME — bottom center
  0: -135,      // bottom-left
  1: -90,       // mid-left
  2: -45,       // top-left
  3: 45,        // top-right
  4: 90,        // mid-right
  5: 135,       // bottom-right
};

/**
 * A spotlight for cribbage that points toward the active player.
 * Prefers the canonical seat anchor slot when supplied (single source of
 * truth shared with chip clusters), otherwise falls back to legacy
 * relative math for safety.
 */
export const CribbageTurnSpotlight = ({
  currentTurnPlayerId,
  currentPlayerId,
  isVisible,
  totalPlayers,
  opponentIds = [],
  currentTurnSlot,
  clipPath = 'ellipse(50% 50% at 50% 50%)',
}: CribbageTurnSpotlightProps) => {
  const [opacity, setOpacity] = useState(0);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!isVisible || !currentTurnPlayerId) {
      setOpacity(0);
      return;
    }

    let angle: number;

    // Preferred path: derive from canonical slot so observer + active
    // share one geometry truth and observer rebinds with turn ownership.
    if (currentTurnSlot !== undefined && currentTurnSlot !== null) {
      angle = SLOT_TO_ANGLE[currentTurnSlot] ?? 180;
    } else {
      const isMyTurn = currentTurnPlayerId === currentPlayerId;
      if (isMyTurn) {
        angle = 180;
      } else {
        const opponentIndex = opponentIds.indexOf(currentTurnPlayerId);
        if (totalPlayers === 2) {
          angle = -45;
        } else if (totalPlayers === 3) {
          angle = opponentIndex === 0 ? -45 : 45;
        } else {
          if (opponentIndex === 0) angle = -45;
          else if (opponentIndex === 1) angle = 45;
          else angle = 135;
        }
      }
    }

    setRotation(angle);
    setOpacity(1);
  }, [isVisible, currentTurnPlayerId, currentPlayerId, totalPlayers, opponentIds, currentTurnSlot]);


  if (!isVisible || !currentTurnPlayerId) {
    return null;
  }

  const beamHalfAngle = 30;

  return (
    <>
      {/* Golden glow in spotlight area - z-5 to stay behind pegboard (z-10) and count (z-20) */}
      <div 
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{
          opacity,
          transition: 'opacity 0.4s ease-out',
          clipPath,
        }}
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
      
      {/* Dim overlay with spotlight cutout */}
      <div 
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{
          opacity,
          transition: 'opacity 0.4s ease-out',
          clipPath,
        }}
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
};