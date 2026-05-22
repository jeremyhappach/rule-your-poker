import { useEffect, useState } from 'react';
import type { CanonicalSlot } from '@/lib/canonicalShell/seatAnchors';

interface CribbageTurnSpotlightProps {
  /** Player ID whose turn it is */
  currentTurnPlayerId: string | null;
  /** Whether spotlight should be visible */
  isVisible: boolean;
  /** Canonical slot the active turn player projects to. Derived from the
   *  same SeatAnchorLayer map that drives chip bubbles, dealer pips,
   *  card backs, and chip-transport endpoints — guaranteeing the
   *  spotlight aims at the SAME location those surfaces render to. */
  currentTurnSlot: CanonicalSlot | null;
}

/**
 * Spotlight angle is derived purely from the canonical slot of the active
 * turn player. ONE seat-anchor truth drives placement; the spotlight
 * cannot drift relative to player count or projection mode.
 */
const SLOT_ANGLE: Record<number, number> = {
  [-1]: 180,  // HOME — bottom-center
  [-2]: 0,    // FACE_TO_FACE — top-center
  0: -135,    // bottom-left
  1: -90,     // middle-left
  2: -45,     // top-left
  3: 45,      // top-right
  4: 90,      // middle-right
  5: 135,     // bottom-right
};

export const CribbageTurnSpotlight = ({
  currentTurnPlayerId,
  isVisible,
  currentTurnSlot,
}: CribbageTurnSpotlightProps) => {
  const [opacity, setOpacity] = useState(0);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!isVisible || !currentTurnPlayerId || currentTurnSlot === null || currentTurnSlot === undefined) {
      setOpacity(0);
      return;
    }
    const angle = SLOT_ANGLE[currentTurnSlot] ?? 180;
    setRotation(angle);
    setOpacity(1);
  }, [isVisible, currentTurnPlayerId, currentTurnSlot]);

  if (!isVisible || !currentTurnPlayerId || currentTurnSlot === null || currentTurnSlot === undefined) {
    return null;
  }

  const beamHalfAngle = 30;

  return (
    <>
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{
          opacity,
          transition: 'opacity 0.4s ease-out',
          clipPath: 'ellipse(50% 50% at 50% 50%)',
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

      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{
          opacity,
          transition: 'opacity 0.4s ease-out',
          clipPath: 'ellipse(50% 50% at 50% 50%)',
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
