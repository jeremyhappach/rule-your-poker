import React, { useEffect, useState } from 'react';

interface TurnSpotlightProps {
  /** The position of the player whose turn it is (absolute 1-7) */
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

    let angle: number;

    if (isObserver) {
      // OBSERVER MODE: Use absolute positions (1-7)
      // Map absolute player positions to angles (from center, 0deg = up)
      // Position layout on table:
      //   1 (top-left)        7 (top-right)
      //   2 (left)            6 (right)
      //   3 (bottom-left)  4 (bottom-center)  5 (bottom-right)
      const observerAngles: Record<number, number> = {
        1: -45,   // Top-left: point up-left
        2: -90,   // Left: point left
        3: -135,  // Bottom-left: point down-left
        4: 180,   // Bottom center: point down
        5: 135,   // Bottom-right: point down-right
        6: 90,    // Right: point right
        7: 45,    // Top-right: point up-right
      };
      angle = observerAngles[currentTurnPosition] ?? 0;
      
      console.log('[SPOTLIGHT] Observer mode - absolute pos:', currentTurnPosition, '-> angle:', angle);
    } else {
      // SEATED PLAYER MODE: Use relative slots based on clockwise distance
      // Current player is always at bottom center (position doesn't matter for spotlight)
      
      if (currentPlayerPosition === currentTurnPosition) {
        // Current player's turn - point to bottom center
        angle = 180;
        console.log('[SPOTLIGHT] Seated mode - MY TURN -> angle:', angle);
      } else {
        // Calculate relative slot using clockwise distance from current player
        // getClockwiseDistance returns 1-6 (1 = next seat clockwise, 6 = previous seat)
        const distance = getClockwiseDistance(currentTurnPosition);
        const relativeSlot = distance - 1; // Convert to 0-5 for slot index
        
        // Slot layout for seated players (relative to current player at bottom center):
        //   Slot 2 (top-left)      Slot 3 (top-right)
        //   Slot 1 (left)          Slot 4 (right)
        //   Slot 0 (bottom-left)   [ME]   Slot 5 (bottom-right)
        const slotAngles: Record<number, number> = {
          0: -135,  // Bottom-left (1 seat away clockwise)
          1: -90,   // Left (2 seats away)
          2: -45,   // Top-left (3 seats away)
          3: 45,    // Top-right (4 seats away)
          4: 90,    // Right (5 seats away)
          5: 135,   // Bottom-right (6 seats away)
        };
        angle = slotAngles[relativeSlot] ?? 0;
        
        console.log('[SPOTLIGHT] Seated mode - turnPos:', currentTurnPosition, 
          'myPos:', currentPlayerPosition, 'distance:', distance, 
          'slot:', relativeSlot, '-> angle:', angle);
      }
    }

    setRotation(angle);
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
