import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShellFeltFrameElement } from '@/lib/canonicalShell/useShellFeltFrameElement';
import { useSeatTargetAngle } from '@/lib/canonicalShell/useSeatTargetAngle';
import { isHolmTraceActive, recordHolmTrace } from '@/lib/holm/holmTrace';

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
   * aligns with the actual canonical ellipse. In shell mode the apex
   * angle is also DERIVED from the live CanonicalOpponentSeat chip
   * geometry (`[data-chip-center="<position>"]`) so seat placement is
   * the single geometry source of truth — no slot-to-angle map.
   */
  shellOwned?: boolean;
}

/**
 * A triangular spotlight beam that emanates from the table center
 * and points toward the current turn player's chip stack.
 *
 * Geometry contract (shell-owned mode):
 *   - The apex angle is computed from CanonicalOpponentSeat's actual
 *     chip-center DOM rect (via `useSeatTargetAngle`).
 *   - There is NO slot-to-angle table, NO legacy chip coordinate,
 *     and NO game-specific special casing.
 *   - When CanonicalOpponentSeat moves, the spotlight follows
 *     automatically with zero changes here.
 *
 * Self-turn fallback: the local viewer's chip cluster is canonically
 * self-suppressed, so when it's the viewer's own turn we anchor at
 * 180° (south / HOME bottom-center).
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

  const shellFrame = useShellFeltFrameElement(shellOwned && isVisible && !disabled);

  // Self-turn detection — drives the HOME fallback for shell mode
  // (the local viewer's cluster is canonically suppressed, so no chip
  // element exists to measure).
  const isMyTurn =
    !isObserver &&
    currentPlayerPosition !== null &&
    currentPlayerPosition !== undefined &&
    currentTurnPosition === currentPlayerPosition;

  const measuredAngle = useSeatTargetAngle(
    shellOwned ? shellFrame : null,
    shellOwned && !isMyTurn ? currentTurnPosition ?? null : null,
    shellOwned && isVisible && !disabled,
  );

  // Legacy (non-shell) angle fallback retained for the standalone
  // poker-table path that hasn't migrated to the canonical shell.
  useEffect(() => {
    if (shellOwned) return; // shell mode uses measuredAngle effect below
    if (!isVisible || currentTurnPosition === null || currentTurnPosition === undefined) {
      setOpacity(0);
      return;
    }

    let angle: number;

    if (isObserver) {
      const observerAngles: Record<number, number> = {
        1: -45, 2: -90, 3: -135, 4: 180, 5: 135, 6: 90, 7: 45,
      };
      angle = observerAngles[currentTurnPosition] ?? 0;
    } else {
      if (currentPlayerPosition === null || currentPlayerPosition === undefined) {
        setOpacity(0);
        return;
      }
      if (currentPlayerPosition === currentTurnPosition) {
        angle = 180;
      } else {
        const distance = getClockwiseDistance(currentTurnPosition);
        const relativeSlot = distance - 1;
        const slotAngles: Record<number, number> = {
          0: -135, 1: -90, 2: -45, 3: 45, 4: 90, 5: 135,
        };
        angle = slotAngles[relativeSlot] ?? 0;
      }
    }

    setRotation(angle);
    setOpacity(1);
  }, [shellOwned, isVisible, currentTurnPosition, currentPlayerPosition, isObserver, getClockwiseDistance]);

  // Shell-mode angle: derive from CanonicalOpponentSeat geometry.
  useEffect(() => {
    if (!shellOwned) return;
    if (!isVisible || currentTurnPosition === null || currentTurnPosition === undefined) {
      setOpacity(0);
      return;
    }
    if (isMyTurn) {
      setRotation(180);
      setOpacity(1);
      return;
    }
    if (measuredAngle === null) {
      // Seat hasn't laid out yet — keep current opacity so a stale
      // angle doesn't flash; the next measurement will rotate in.
      return;
    }
    setRotation(measuredAngle);
    setOpacity(1);
  }, [shellOwned, isVisible, currentTurnPosition, isMyTurn, measuredAngle]);

  // Holm trace — emit when authoritative turn / consumed pos / angle change.
  useEffect(() => {
    if (!isHolmTraceActive()) return;
    if (!shellOwned) return;
    recordHolmTrace('TURN_SPOTLIGHT', `turn=${currentTurnPosition ?? 'null'} angle=${rotation.toFixed(1)}°`, {
      currentTurnPosition,
      consumedTurnPosition: currentTurnPosition,
      currentPlayerPosition,
      isObserver,
      isMyTurn,
      measuredAngle,
      angle: rotation,
      opacity,
      shellFrameToken: shellFrame ? (shellFrame.getAttribute('data-canonical-felt-surface') || 'frame') : 'null',
      isVisible,
    });
  }, [shellOwned, currentTurnPosition, currentPlayerPosition, isObserver, isMyTurn, measuredAngle, rotation, opacity, shellFrame, isVisible]);

  if (!isVisible || currentTurnPosition === null || disabled) {
    return null;
  }

  // Narrow cone — the apex is now centered on the canonical seat, so
  // the original 25° half-angle is wide enough to wash over the chip
  // cluster without needing the temporary 32° widening.
  const beamHalfAngle = 25;

  const clipStyle = shellOwned
    ? undefined
    : useFullCoverage
      ? undefined
      : 'ellipse(50% 50% at 50% 50%)';

  const overlay = (
    <>
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


  if (shellOwned) {
    if (!shellFrame) return null;
    return createPortal(overlay, shellFrame);
  }

  return overlay;
};
