import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShellFeltFrameElement } from '@/lib/canonicalShell/useShellFeltFrameElement';

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
  /** Use full rectangular coverage instead of ellipse clip (for dice games) */
  useFullCoverage?: boolean;
  /** Disable the spotlight entirely (for dice games) */
  disabled?: boolean;
  /**
   * Shell-aware mode. When true, the spotlight portals itself into the
   * canonical shell felt frame so its `absolute inset-0` + ellipse clip
   * aligns with the actual canonical ellipse instead of leaking against
   * the much larger parent box (which produced the legacy giant gray
   * backing artifact under the poker shell cutover).
   */
  shellOwned?: boolean;
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
  useFullCoverage = false,
  disabled = false,
  shellOwned = false,
}) => {
  const [rotation, setRotation] = useState<number>(0);
  const [opacity, setOpacity] = useState<number>(0);

  // Calculate the rotation angle to point at the target player
  useEffect(() => {
    // Must have valid turn position and visibility
    if (!isVisible || currentTurnPosition === null || currentTurnPosition === undefined) {
      setOpacity(0);
      return;
    }

    let angle: number;

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
    } else {
      // SEATED PLAYER MODE: Use relative slots based on clockwise distance
      // Require valid currentPlayerPosition for seated mode
      if (currentPlayerPosition === null || currentPlayerPosition === undefined) {
        setOpacity(0);
        return;
      }

      // Check if it's the current player's turn (comparing absolute positions)
      const isMyTurn = currentPlayerPosition === currentTurnPosition;
      
      if (isMyTurn) {
        // Current player's turn - point to bottom center
        angle = 180;
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
      }
    }

    setRotation(angle);
    setOpacity(1);
  }, [isVisible, currentTurnPosition, currentPlayerPosition, isObserver, getClockwiseDistance]);

  const shellFrame = useShellFeltFrameElement(shellOwned && isVisible && !disabled);

  if (!isVisible || currentTurnPosition === null || disabled) {
    return null;
  }

  // Wave 3C.3f — widened to align with canonical opponent seat centers,
  // which sit on the outer rail rather than the historical inner chip
  // anchor. 32° half-angle covers the seat envelope without bleeding.
  const beamHalfAngle = 32;

  // Clip path. In shell-owned mode the spotlight is portaled INTO the
  // canonical felt SURFACE node, which already enforces the exact
  // canonical ellipse via `overflow: hidden` + `rounded-[50%/45%]`.
  // We therefore drop the approximated `ellipse(50% 50%)` clip — it
  // doesn't match the canonical 50%/45% radius and visibly produced a
  // second offset oval. Outside shell-owned mode we keep the legacy
  // ellipse clip for the standalone poker table; dice games use full
  // coverage with no clip.
  const clipStyle = shellOwned
    ? undefined
    : useFullCoverage
      ? undefined
      : 'ellipse(50% 50% at 50% 50%)';

  const overlay = (
    <>
      {/* Golden glow in spotlight area */}
      <div
        className="absolute inset-0 pointer-events-none z-[100]"
        style={{
          opacity,
          transition: 'opacity 0.4s ease-out',
          clipPath: clipStyle,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: 'hsla(45, 70%, 50%, 0.18)',
            maskImage: `conic-gradient(from ${rotation - beamHalfAngle}deg at 50% 50%, white 0deg, white ${beamHalfAngle * 2}deg, transparent ${beamHalfAngle * 2}deg, transparent 360deg)`,
            WebkitMaskImage: `conic-gradient(from ${rotation - beamHalfAngle}deg at 50% 50%, white 0deg, white ${beamHalfAngle * 2}deg, transparent ${beamHalfAngle * 2}deg, transparent 360deg)`,
            transition: 'mask-image 0.5s cubic-bezier(0.4, 0, 0.2, 1), -webkit-mask-image 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>

      {/* Dim overlay with spotlight cutout */}
      <div
        className="absolute inset-0 pointer-events-none z-[100]"
        style={{
          opacity,
          transition: 'opacity 0.4s ease-out',
          clipPath: clipStyle,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: 'rgba(0, 0, 0, 0.5)',
            maskImage: `conic-gradient(from ${rotation - beamHalfAngle}deg at 50% 50%, transparent 0deg, transparent ${beamHalfAngle * 2}deg, black ${beamHalfAngle * 2}deg, black 360deg)`,
            WebkitMaskImage: `conic-gradient(from ${rotation - beamHalfAngle}deg at 50% 50%, transparent 0deg, transparent ${beamHalfAngle * 2}deg, black ${beamHalfAngle * 2}deg, black 360deg)`,
            transition: 'mask-image 0.5s cubic-bezier(0.4, 0, 0.2, 1), -webkit-mask-image 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
    </>
  );

  // Shell-aware mode: portal into the canonical felt frame so the
  // ellipse clip uses the true canonical geometry. If the frame
  // hasn't mounted yet, render nothing this frame (prevents the
  // legacy giant-circle backing artifact from leaking against the
  // larger parent box).
  if (shellOwned) {
    if (!shellFrame) return null;
    return createPortal(overlay, shellFrame);
  }

  return overlay;
};

