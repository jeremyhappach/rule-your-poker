// P8.2b: Migrated to canonical chip endpoint resolution for both
// active-relative and observer-absolute projections. Leg-target
// coordinates now resolve through the shared seat-anchor markers
// (data-chip-center) — no internal slot math.
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SweepTheLegsAnimation } from './SweepTheLegsAnimation';
import { resolveChipEndpoint, type EndpointCache } from '@/lib/canonicalShell/chipEndpoints';
import { SHELL_Z } from '@/lib/canonicalShell/zLayers';
import { emitPresentationLifecycle as __wartimeEmitPresentationLifecycleLTP } from '@/lib/threeFiveSeven/wartime';
import { selectTransferableThreeFiveSevenLegs } from '@/lib/threeFiveSeven/legsToPlayerPresentation';

interface LegChipAnimation {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delay: number;
}

interface LegsToPlayerAnimationProps {
  triggerId: string | null;
  legPositions: { playerId: string; position: number; legCount: number }[]; // All players with legs
  winnerPosition: number;
  currentPlayerPosition: number | null;
  getClockwiseDistance: (position: number) => number;
  containerRef: React.RefObject<HTMLDivElement>;
  legsToWin: number;
  legValue?: number; // Dollar value of each leg
  onAnimationComplete?: () => void;
}

export const LegsToPlayerAnimation: React.FC<LegsToPlayerAnimationProps> = ({
  triggerId,
  legPositions,
  winnerPosition,
  currentPlayerPosition,
  getClockwiseDistance,
  containerRef,
  legsToWin,
  legValue = 0,
  onAnimationComplete,
}) => {
  const [animations, setAnimations] = useState<LegChipAnimation[]>([]);
  const [showSweepOverlay, setShowSweepOverlay] = useState(false);
  const lastTriggerIdRef = useRef<string | null>(null);
  const completedRef = useRef(false); // Guard against double completion
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endpointCacheRef = useRef<EndpointCache>({});

  // IMPORTANT: Store callback in ref to prevent effect re-runs when parent re-renders
  const onCompleteRef = useRef<(() => void) | undefined>(onAnimationComplete);
  useEffect(() => {
    onCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  // Store position-related props in refs to prevent effect re-runs
  const legPositionsRef = useRef(legPositions);
  const winnerPositionRef = useRef(winnerPosition);
  const currentPlayerPositionRef = useRef(currentPlayerPosition);
  const getClockwiseDistanceRef = useRef(getClockwiseDistance);
  const containerRefRef = useRef(containerRef);
  const legsToWinRef = useRef(legsToWin);

  useEffect(() => {
    legPositionsRef.current = legPositions;
    winnerPositionRef.current = winnerPosition;
    currentPlayerPositionRef.current = currentPlayerPosition;
    getClockwiseDistanceRef.current = getClockwiseDistance;
    containerRefRef.current = containerRef;
    legsToWinRef.current = legsToWin;
  });

  // ── Presentation lifecycle (targeted profile) ──────────────
  useEffect(() => {
    __wartimeEmitPresentationLifecycleLTP('legs_to_player', 'mount', {});
    return () => { __wartimeEmitPresentationLifecycleLTP('legs_to_player', 'unmount', {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Main animation effect - ONLY depends on triggerId to prevent multi-fire
  useEffect(() => {
    if (!triggerId || triggerId === lastTriggerIdRef.current) {
      return;
    }

    const container = containerRefRef.current?.current;
    if (!container) {
      return;
    }

    // Clear any existing timeout from previous animation
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }

    lastTriggerIdRef.current = triggerId;
    completedRef.current = false; // Reset for new animation

    const positions = legPositionsRef.current;
    const winner = winnerPositionRef.current;
    const maxLegs = legsToWinRef.current;
    const transferablePositions = selectTransferableThreeFiveSevenLegs(
      positions,
      winner,
      maxLegs,
    );

    // The winner's own legs never move. If the winner is the only player in
    // the cached roster, there is no visible transfer work and no reason to
    // hold the terminal sequence behind the 3.5-second sweep timer.
    if (transferablePositions.length === 0) {
      console.log('[LEGS TO PLAYER] No legs to sweep, skipping animation');
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }

    const rect = container.getBoundingClientRect();
    
    // Use refs for position calculations
    const currentPos = currentPlayerPositionRef.current;
    const getDistance = getClockwiseDistanceRef.current;

    // Canonical seat resolver — works identically for active (relative)
    // and observer (absolute) projections because both project through
    // the same data-chip-center anchors.
    const endpointCache: EndpointCache = endpointCacheRef.current;
    // Viewport-absolute coords so we can portal to document.body and escape
    // any transformed felt ancestor stacking context.
    const getChipCoords = (position: number): { x: number; y: number } => {
      const resolved = resolveChipEndpoint({
        ref: { kind: 'seat', position },
        container,
        cache: endpointCache,
        debugLabel: '357-legs-to-player',
      });
      if (resolved) return { x: rect.left + resolved.x, y: rect.top + resolved.y };
      // Last-resort fallback (should be rare — anchors are mounted by
      // SeatAnchorLayer for every seated player + observer projection).
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };

    const getLegCoords = (position: number): { x: number; y: number } => {
      const chipCoords = getChipCoords(position);
      // Side derived from canonical chip x — legs render inboard of chip.
      const isRightSide = chipCoords.x > rect.left + rect.width / 2;
      const offsetX = isRightSide ? -30 : 30;
      return { x: chipCoords.x + offsetX, y: chipCoords.y };
    };

    const winnerCoords = getChipCoords(winner);

    // Create animations for each leg from each player (excluding winner - their legs stay in place)
    const newAnimations: LegChipAnimation[] = [];
    let animIndex = 0;

    transferablePositions.forEach((playerLeg) => {
      const legCoords = getLegCoords(playerLeg.position);
      const legCount = playerLeg.legCount;
      
      for (let i = 0; i < legCount; i++) {
        newAnimations.push({
          id: `${playerLeg.playerId}-leg-${i}`,
          fromX: legCoords.x,
          fromY: legCoords.y,
          toX: winnerCoords.x,
          toY: winnerCoords.y,
          delay: animIndex * 100,
        });
        animIndex++;
      }
    });

    setAnimations(newAnimations);
    setShowSweepOverlay(true);
    __wartimeEmitPresentationLifecycleLTP('legs_to_player', 'begin', {
      identity: { triggerId: triggerId ?? null },
      payload: { animationCount: newAnimations.length },
    });
    console.log('[LEGS TO PLAYER] Animating', newAnimations.length, 'legs to winner');

    // Animation duration: 3.5s + stagger delays + buffer
    const totalDuration = 3500 + (newAnimations.length * 100);
    
    completionTimeoutRef.current = setTimeout(() => {
      setAnimations([]);
      __wartimeEmitPresentationLifecycleLTP('legs_to_player', 'complete', {
        identity: { triggerId: triggerId ?? null },
      });
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
    }, totalDuration);
  }, [triggerId]); // ONLY triggerId - other values accessed via refs

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
    };
  }, []);

  // Format leg value for display
  const displayValue = legValue > 0 ? `$${legValue}` : 'L';

  if (animations.length === 0 && !showSweepOverlay) return null;
  if (typeof document === 'undefined') return null;

  const node = (
    <>
      {/* "Sweep the Legs" overlay - non-blocking, runs in parallel */}
      <SweepTheLegsAnimation 
        show={showSweepOverlay} 
        onComplete={() => setShowSweepOverlay(false)} 
      />
      
      {animations.map((anim) => {
        const deltaX = anim.toX - anim.fromX;
        const deltaY = anim.toY - anim.fromY;
        const uniqueKeyframeName = `legToPlayer-${anim.id.replace(/[^a-zA-Z0-9]/g, '')}`;
        
        return (
          <div
            key={anim.id}
            className="fixed pointer-events-none"
            style={{
              left: anim.fromX,
              top: anim.fromY,
              transform: 'translate(-50%, -50%)',
              zIndex: SHELL_Z.CELEBRATION,
            }}
          >
            <div
              className={`rounded-full bg-white border-2 border-amber-500 shadow-lg flex items-center justify-center ${
                legValue > 0 ? 'w-8 h-8' : 'w-6 h-6'
              }`}
              style={{
                animation: `${uniqueKeyframeName} 3.2s ease-in-out ${anim.delay}ms forwards`,
              }}
            >
              <span className={`text-slate-800 font-bold ${legValue > 0 ? 'text-[8px]' : 'text-[10px]'}`}>
                {displayValue}
              </span>
            </div>
            <style>{`
              @keyframes ${uniqueKeyframeName} {
                0% {
                  transform: translate(0, 0) scale(1);
                  opacity: 1;
                }
                15% {
                  transform: translate(0, -5px) scale(1.1);
                  opacity: 1;
                }
                85% {
                  transform: translate(${deltaX}px, ${deltaY}px) scale(1);
                  opacity: 1;
                }
                100% {
                  transform: translate(${deltaX}px, ${deltaY}px) scale(0);
                  opacity: 0;
                }
              }
            `}</style>
          </div>
        );
      })}
    </>
  );

  return createPortal(node, document.body);
};

export default LegsToPlayerAnimation;
