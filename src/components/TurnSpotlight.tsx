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
 * A triangular spotlight beam that emanates from the table center
 * and points toward the current turn player's chip stack.
 */
export const TurnSpotlight: React.FC<TurnSpotlightProps> = ({
  currentTurnPosition,
  currentPlayerPosition,
  isObserver,
  getClockwiseDistance,
  containerRef,
  isVisible,
}) => {
  const [rotation, setRotation] = useState<number>(0);
  const [opacity, setOpacity] = useState<number>(0);

  // Calculate the rotation angle to point at the target player
  useEffect(() => {
    if (!isVisible || currentTurnPosition === null) {
      setOpacity(0);
      return;
    }

    // Determine the slot/angle to point at
    let targetSlot: number;
    
    if (isObserver) {
      // Observer mode: use absolute positions
      targetSlot = currentTurnPosition;
    } else if (currentPlayerPosition === currentTurnPosition) {
      // Current player's turn - point to bottom center (180 degrees)
      targetSlot = -1;
    } else {
      // Seated player mode: calculate relative slot (0-5)
      targetSlot = getClockwiseDistance(currentTurnPosition) - 1;
    }

    // Map slot to rotation angle (degrees from top, clockwise)
    // The spotlight originates from center and points outward
    const getRotationFromSlot = (slot: number): number => {
      if (slot === -1) {
        // Current player at bottom center
        return 180;
      }

      if (isObserver) {
        // Observer absolute positions (1-7)
        const observerAngles: Record<number, number> = {
          1: -45,   // Top-left
          2: -90,   // Left
          3: -135,  // Bottom-left
          4: 180,   // Bottom center
          5: 135,   // Bottom-right
          6: 90,    // Right
          7: 45,    // Top-right
        };
        return observerAngles[slot] ?? 0;
      }

      // Seated player relative slots (0-5, clockwise from bottom-left)
      const slotAngles: Record<number, number> = {
        0: -135,  // Bottom-left (1 seat clockwise)
        1: -90,   // Middle-left (2 seats clockwise)
        2: -45,   // Top-left (3 seats clockwise)
        3: 45,    // Top-right (4 seats clockwise)
        4: 90,    // Middle-right (5 seats clockwise)
        5: 135,   // Bottom-right (6 seats clockwise)
      };
      return slotAngles[slot] ?? 0;
    };

    const newRotation = getRotationFromSlot(targetSlot);
    setRotation(newRotation);
    setOpacity(1);
  }, [isVisible, currentTurnPosition, currentPlayerPosition, isObserver, getClockwiseDistance]);

  if (!isVisible || currentTurnPosition === null) {
    return null;
  }

  return (
    <div 
      className="absolute inset-0 pointer-events-none overflow-hidden z-[3]"
      style={{
        opacity,
        transition: 'opacity 0.4s ease-out',
      }}
    >
      {/* Triangular spotlight beam from center */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          transformOrigin: 'center center',
        }}
      >
        {/* The cone/triangle shape pointing upward (will be rotated to target) */}
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: '50px solid transparent',
            borderRight: '50px solid transparent',
            borderBottom: '180px solid transparent',
            position: 'relative',
          }}
        >
          {/* Gradient overlay for the spotlight effect */}
          <div
            style={{
              position: 'absolute',
              left: '-50px',
              bottom: '-180px',
              width: '100px',
              height: '180px',
              background: `linear-gradient(
                to top,
                hsla(45, 80%, 60%, 0.25) 0%,
                hsla(45, 70%, 55%, 0.18) 30%,
                hsla(45, 60%, 50%, 0.08) 70%,
                transparent 100%
              )`,
              clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
              filter: 'blur(2px)',
            }}
          />
          {/* Brighter inner beam */}
          <div
            style={{
              position: 'absolute',
              left: '-30px',
              bottom: '-180px',
              width: '60px',
              height: '180px',
              background: `linear-gradient(
                to top,
                hsla(45, 90%, 65%, 0.2) 0%,
                hsla(45, 80%, 60%, 0.12) 40%,
                hsla(45, 70%, 55%, 0.04) 80%,
                transparent 100%
              )`,
              clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
              animation: 'spotlightPulse 2.5s ease-in-out infinite',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes spotlightPulse {
          0%, 100% {
            opacity: 0.8;
          }
          50% {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};
