import { useEffect, useState } from 'react';

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
  opponentIds: string[];
}

/**
 * A spotlight for cribbage that points toward the active player.
 * Dynamically calculates angle based on player count and position.
 * - 2 player: opponent at upper-left (-45°), self at bottom (180°)
 * - 3 player: opponents at upper-left (-45°) and upper-right (45°), self at bottom (180°)
 * - 4 player: opponents at upper-left (-45°), upper-right (45°), lower-right (135°), self at bottom (180°)
 */
export const CribbageTurnSpotlight = ({
  currentTurnPlayerId,
  currentPlayerId,
  isVisible,
  totalPlayers,
  opponentIds,
}: CribbageTurnSpotlightProps) => {
  const [opacity, setOpacity] = useState(0);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!isVisible || !currentTurnPlayerId) {
      setOpacity(0);
      return;
    }

    const isMyTurn = currentTurnPlayerId === currentPlayerId;
    
    let angle: number;
    
    if (isMyTurn) {
      // Current player is always at bottom
      angle = 180;
    } else {
      // Find which opponent index this is
      const opponentIndex = opponentIds.indexOf(currentTurnPlayerId);
      
      if (totalPlayers === 2) {
        // 2 player: single opponent at upper-left
        angle = -45;
      } else if (totalPlayers === 3) {
        // 3 player: opponents at upper-left (index 0) and upper-right (index 1)
        angle = opponentIndex === 0 ? -45 : 45;
      } else {
        // 4 player: opponents at upper-left (0), upper-right (1), lower-right (2)
        if (opponentIndex === 0) {
          angle = -45;  // upper-left
        } else if (opponentIndex === 1) {
          angle = 45;   // upper-right
        } else {
          angle = 135;  // lower-right
        }
      }
    }
    
    setRotation(angle);
    setOpacity(1);
  }, [isVisible, currentTurnPlayerId, currentPlayerId, totalPlayers, opponentIds]);

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
      
      {/* Dim overlay with spotlight cutout */}
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