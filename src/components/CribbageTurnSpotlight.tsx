import { useEffect, useState } from 'react';

interface CribbageTurnSpotlightProps {
  /** Player ID whose turn it is */
  currentTurnPlayerId: string | null;
  /** The current user's player ID */
  currentPlayerId: string;
  /** Whether spotlight should be visible */
  isVisible: boolean;
}

/**
 * A simple spotlight for cribbage - points up for opponent's turn,
 * down for current player's turn. Lower z-index to stay behind pegboard and count.
 */
export const CribbageTurnSpotlight = ({
  currentTurnPlayerId,
  currentPlayerId,
  isVisible,
}: CribbageTurnSpotlightProps) => {
  const [opacity, setOpacity] = useState(0);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!isVisible || !currentTurnPlayerId) {
      setOpacity(0);
      return;
    }

    const isMyTurn = currentTurnPlayerId === currentPlayerId;
    
    // Point down (180deg) for my turn, up (-90deg top-left area) for opponent
    setRotation(isMyTurn ? 180 : -45);
    setOpacity(1);
  }, [isVisible, currentTurnPlayerId, currentPlayerId]);

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
