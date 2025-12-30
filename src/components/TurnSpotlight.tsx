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
 * Also dims the rest of the table to draw attention to the active player.
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
    // Must have valid turn position and visibility
    if (!isVisible || currentTurnPosition === null || currentTurnPosition === undefined) {
      console.log('[SPOTLIGHT] Hidden - isVisible:', isVisible, 'turnPos:', currentTurnPosition);
      setOpacity(0);
      return;
    }

    let angle: number;

    console.log('[SPOTLIGHT] Calculating angle - isObserver:', isObserver, 
      'turnPos:', currentTurnPosition, 'myPos:', currentPlayerPosition);

    if (isObserver) {
      // OBSERVER MODE: Use absolute positions (1-7)
      const observerAngles: Record<number, number> = {
        1: -45,   // Top-left
        2: -90,   // Left
        3: -135,  // Bottom-left
        4: 180,   // Bottom center
        5: 135,   // Bottom-right
        6: 90,    // Right
        7: 45,    // Top-right
      };
      angle = observerAngles[currentTurnPosition] ?? 0;
      console.log('[SPOTLIGHT] Observer mode - pos:', currentTurnPosition, '-> angle:', angle);
    } else {
      // SEATED PLAYER MODE: Use relative slots based on clockwise distance
      // Require valid currentPlayerPosition for seated mode
      if (currentPlayerPosition === null || currentPlayerPosition === undefined) {
        console.log('[SPOTLIGHT] Seated mode but no player position, hiding');
        setOpacity(0);
        return;
      }

      // Check if it's the current player's turn (comparing absolute positions)
      const isMyTurn = currentPlayerPosition === currentTurnPosition;
      
      if (isMyTurn) {
        // Current player's turn - point to bottom center
        angle = 180;
        console.log('[SPOTLIGHT] Seated mode - MY TURN (pos', currentPlayerPosition, ') -> angle:', angle);
      } else {
        // Calculate relative slot using clockwise distance from current player
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
    <>
      {/* Dim overlay with spotlight cutout using CSS mask */}
      <div 
        className="absolute inset-0 pointer-events-none z-[3]"
        style={{
          opacity,
          transition: 'opacity 0.4s ease-out',
        }}
      >
        {/* Dark overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: 'rgba(0, 0, 0, 0.5)',
            maskImage: `conic-gradient(from ${rotation - 25}deg at 50% 50%, transparent 0deg, transparent 50deg, black 50deg, black 360deg)`,
            WebkitMaskImage: `conic-gradient(from ${rotation - 25}deg at 50% 50%, transparent 0deg, transparent 50deg, black 50deg, black 360deg)`,
            transition: 'mask-image 0.5s cubic-bezier(0.4, 0, 0.2, 1), -webkit-mask-image 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
        
        {/* Solid spotlight beam */}
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            transformOrigin: 'center center',
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              position: 'relative',
            }}
          >
            {/* Solid beam - no gradient */}
            <div
              style={{
                position: 'absolute',
                left: '-60px',
                bottom: '0px',
                width: '120px',
                height: '200px',
                background: 'hsla(45, 80%, 55%, 0.25)',
                clipPath: 'polygon(50% 100%, 10% 0%, 90% 0%)',
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
};
