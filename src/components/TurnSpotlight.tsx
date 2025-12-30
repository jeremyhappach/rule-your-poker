import React, { useEffect, useState, useRef } from 'react';

interface TurnSpotlightProps {
  /** The position of the player whose turn it is */
  currentTurnPosition: number | null;
  /** The position of the current user (for relative slot calculation) */
  currentPlayerPosition: number | null;
  /** Whether the current user is an observer (no seat) */
  isObserver: boolean;
  /** Function to calculate clockwise distance between positions */
  getClockwiseDistance: (targetPosition: number) => number;
  /** Reference to the table container for positioning */
  containerRef: React.RefObject<HTMLElement>;
  /** Whether to show the spotlight (hide during showdowns, between hands, etc.) */
  isVisible: boolean;
}

/**
 * A subtle animated spotlight effect that highlights whose turn it is in Holm games.
 * Draws attention from the pot to the current player's chip stack.
 */
export const TurnSpotlight: React.FC<TurnSpotlightProps> = ({
  currentTurnPosition,
  currentPlayerPosition,
  isObserver,
  getClockwiseDistance,
  containerRef,
  isVisible,
}) => {
  const [spotlightStyle, setSpotlightStyle] = useState<React.CSSProperties>({});
  const animationRef = useRef<number | null>(null);

  // Calculate the position for the spotlight based on who has the turn
  useEffect(() => {
    if (!isVisible || currentTurnPosition === null || !containerRef.current) {
      setSpotlightStyle({ opacity: 0 });
      return;
    }

    // Determine the slot/position to highlight
    let targetSlot: number;
    
    if (isObserver) {
      // Observer mode: use absolute positions
      targetSlot = currentTurnPosition;
    } else if (currentPlayerPosition === currentTurnPosition) {
      // Current player's turn - highlight bottom center
      targetSlot = -1; // Special value for current player
    } else {
      // Seated player mode: calculate relative slot
      targetSlot = getClockwiseDistance(currentTurnPosition) - 1;
    }

    // Map slot to CSS positioning
    const getPositionFromSlot = (slot: number): React.CSSProperties => {
      if (slot === -1) {
        // Current player - bottom center
        return {
          bottom: '8px',
          left: '50%',
          transform: 'translateX(-50%)',
        };
      }

      if (isObserver) {
        // Observer absolute positions
        const observerPositions: Record<number, React.CSSProperties> = {
          1: { top: '24px', left: '60px' },
          2: { top: '45%', left: '20px' },
          3: { bottom: '24px', left: '60px' },
          4: { bottom: '8px', left: '50%', transform: 'translateX(-50%)' },
          5: { bottom: '24px', right: '60px' },
          6: { top: '45%', right: '20px' },
          7: { top: '24px', right: '60px' },
        };
        return observerPositions[slot] || observerPositions[1];
      }

      // Seated player relative slots
      const slotPositions: Record<number, React.CSSProperties> = {
        0: { bottom: '24px', left: '60px' },      // Bottom-left
        1: { top: '45%', left: '20px' },          // Middle-left
        2: { top: '24px', left: '60px' },         // Top-left
        3: { top: '24px', right: '60px' },        // Top-right
        4: { top: '45%', right: '20px' },         // Middle-right
        5: { bottom: '24px', right: '60px' },     // Bottom-right
      };
      return slotPositions[slot] || slotPositions[0];
    };

    const position = getPositionFromSlot(targetSlot);
    
    setSpotlightStyle({
      ...position,
      opacity: 1,
    });

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isVisible, currentTurnPosition, currentPlayerPosition, isObserver, getClockwiseDistance, containerRef]);

  if (!isVisible || currentTurnPosition === null) {
    return null;
  }

  return (
    <>
      {/* Pulsing glow effect at the turn player's position */}
      <div
        className="absolute z-[5] pointer-events-none transition-all duration-500 ease-out"
        style={spotlightStyle}
      >
        {/* Outer glow ring */}
        <div 
          className="absolute w-20 h-20 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: 'radial-gradient(circle, hsla(45, 100%, 50%, 0.25) 0%, hsla(45, 100%, 50%, 0.1) 40%, transparent 70%)',
            animation: 'turnSpotlightPulse 2s ease-in-out infinite',
          }}
        />
        {/* Inner bright ring */}
        <div 
          className="absolute w-14 h-14 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: 'radial-gradient(circle, hsla(45, 100%, 60%, 0.3) 0%, hsla(45, 100%, 50%, 0.15) 50%, transparent 70%)',
            animation: 'turnSpotlightPulse 2s ease-in-out infinite 0.5s',
          }}
        />
      </div>

      {/* Animated beam from pot to player */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-[4]"
        style={{ opacity: isVisible ? 1 : 0, transition: 'opacity 0.5s ease-out' }}
      >
        <defs>
          <linearGradient id="spotlightBeam" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsla(45, 100%, 50%, 0)" />
            <stop offset="30%" stopColor="hsla(45, 100%, 50%, 0.3)">
              <animate
                attributeName="offset"
                values="0%;70%;0%"
                dur="2s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="60%" stopColor="hsla(45, 100%, 50%, 0.15)">
              <animate
                attributeName="offset"
                values="30%;100%;30%"
                dur="2s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="100%" stopColor="hsla(45, 100%, 50%, 0)" />
          </linearGradient>
        </defs>
      </svg>

      <style>{`
        @keyframes turnSpotlightPulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.6;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.15);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
};
