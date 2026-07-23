// FROZEN: chip transport (P8.1). Do NOT add new bespoke chip/pot animators.
// New chip transport must dispatch via useChipTransport() — see
// src/lib/canonicalShell/ChipTransportProvider.tsx. This file is preserved
// as-is until its consumer migrates in a later wave.
//
// -----------------------------------------------------------------------
// CANONICAL WIN-CHIP ARTIFACT PHASE MACHINE (357 / Horses / SCC)
// -----------------------------------------------------------------------
//
//   FLYING → ARRIVAL_HOLD → BOUNCING → COMPLETE
//
// This component owns the full artifact lifecycle. Consumers may unmount
// the wrapping conditional the moment `onAnimationEnd` fires — that is
// therefore only fired AFTER the bounce completes, not at flight end.
//
//   FLYING        — outer wrapper runs the flight keyframe.
//   ARRIVAL_HOLD  — flight animation cleared; outer wrapper frozen at the
//                   landing translate; no bounce yet. Same DOM node, same
//                   key, same z-layer, same opacity, same chip visual.
//   BOUNCING      — bounce transform applied to the INNER child only;
//                   outer wrapper remains frozen at the landing rect.
//   COMPLETE      — artifact unmounts; then onAnimationEnd fires so the
//                   consumer's teardown / phase-transition may proceed.
//
// The parent's onAnimationEnd can drive game-phase teardown (which will
// unmount the wrapping conditional); we intentionally block it until
// BOUNCING → COMPLETE so the artifact cannot be torn down mid-bounce.
// -----------------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatChipValue } from '@/lib/utils';
import { resolveChipEndpoint } from '@/lib/canonicalShell/chipEndpoints';
import { SHELL_Z } from '@/lib/canonicalShell/zLayers';

interface PotToPlayerAnimationProps {
  triggerId: string | null;
  amount: number;
  winnerPosition: number;
  currentPlayerPosition: number | null;
  getClockwiseDistance: (position: number) => number;
  containerRef: React.RefObject<HTMLDivElement>;
  gameType?: string | null; // For position adjustment
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
  /**
   * Optional canonical destination selector. When supplied, this selector
   * is the ONLY source for the winner endpoint — no `data-chip-center`
   * lookup, no `data-seat-chip-position` fallback, no cache, no slot math.
   * Used by 3-5-7 sweep/instant-win to target a uniquely-owned chipstack
   * root marker instead of the ambiguous generic seat-position marker
   * (which can resolve to legs/trophy/shim nodes sharing the seat).
   */
  destinationSelector?: string | null;
  /**
   * OPT-IN canonical destination element. When supplied and mounted,
   * this element is measured (`getBoundingClientRect()`) at animation
   * start and used as the winner endpoint EXCLUSIVELY — no selector
   * query, no `data-chip-center` lookup, no `data-seat-chip-position`
   * fallback, no cache, no slot math.
   *
   * Provided by the shell-owned WinnerChipEndpointRegistry via the
   * table-scoped resolver. If null/undefined, the existing selector +
   * canonical-endpoint + slot-math fallback chain is used unchanged.
   * A stale (detached) element falls through to the existing path
   * rather than aborting flight.
   */
  destinationElement?: HTMLElement | null;
}

type ArtifactPhase = 'flying' | 'arrival_hold' | 'bouncing' | 'complete';

// Timings that make up the canonical arrival envelope. Kept in sync
// with the __chipDestBounce keyframe below.
const ARRIVAL_HOLD_MS = 60;
const BOUNCE_DURATION_MS = 900;
const BOUNCE_TEARDOWN_TAIL_MS = 60;

export const PotToPlayerAnimation: React.FC<PotToPlayerAnimationProps> = ({
  triggerId,
  amount,
  winnerPosition,
  currentPlayerPosition,
  getClockwiseDistance,
  containerRef,
  gameType,
  onAnimationStart,
  onAnimationEnd,
  destinationSelector,
  destinationElement,
}) => {
  const [animation, setAnimation] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  const [phase, setPhase] = useState<ArtifactPhase>('flying');
  const lockedAmountRef = useRef<number>(amount);
  const lastTriggerIdRef = useRef<string | null>(null);
  const phaseTimersRef = useRef<number[]>([]);
  const chipCenterCacheRef = useRef<Record<number, { xPct: number; yPct: number }>>({});

  // IMPORTANT: parent often passes inline callbacks which change identity on re-render.
  // If we include callbacks in the animation effect deps, React will run cleanup on re-render
  // and cancel our timers. Use refs so the timers stay stable.
  const onStartRef = useRef<(() => void) | undefined>(onAnimationStart);
  const onEndRef = useRef<(() => void) | undefined>(onAnimationEnd);

  useEffect(() => { onStartRef.current = onAnimationStart; }, [onAnimationStart]);
  useEffect(() => { onEndRef.current = onAnimationEnd; }, [onAnimationEnd]);

  const animationName = useMemo(() => {
    const safe = (triggerId ?? 'no_trigger').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `potToPlayer_${safe}`;
  }, [triggerId]);

  const clearPhaseTimers = () => {
    for (const id of phaseTimersRef.current) window.clearTimeout(id);
    phaseTimersRef.current = [];
  };

  // ---------------------------------------------------------------------
  // Position mapping helpers (unchanged from prior implementation).
  // ---------------------------------------------------------------------
  const getSlotPercent = (slotIndex: number): { top: number; left: number } => {
    if (slotIndex === -1) return { top: 92, left: 50 };
    const slots: Record<number, { top: number; left: number }> = {
      0: { top: 92, left: 10 }, 1: { top: 50, left: 2 }, 2: { top: 2, left: 10 },
      3: { top: 2, left: 90 }, 4: { top: 50, left: 98 }, 5: { top: 92, left: 90 },
    };
    return slots[slotIndex] || { top: 50, left: 50 };
  };

  const getCachedChipCenter = (position: number, rect: DOMRect): { x: number; y: number } | null => {
    const cached = chipCenterCacheRef.current[position];
    if (!cached) return null;
    return { x: cached.xPct * rect.width, y: cached.yPct * rect.height };
  };

  const getChipCenterFromDom = (position: number): { x: number; y: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    let el = container.querySelector(`[data-chip-center="${position}"]`) as HTMLElement | null;
    if (!el) el = container.querySelector(`[data-seat-chip-position="${position}"]`) as HTMLElement | null;
    if (!el) return null;
    const containerRect = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const coords = {
      x: r.left - containerRect.left + r.width / 2,
      y: r.top - containerRect.top + r.height / 2,
    };
    if (containerRect.width > 0 && containerRect.height > 0) {
      chipCenterCacheRef.current[position] = {
        xPct: coords.x / containerRect.width,
        yPct: coords.y / containerRect.height,
      };
    }
    return coords;
  };

  // Store position-related props in refs so the effect doesn't re-run when they change
  const winnerPositionRef = useRef(winnerPosition);
  const currentPlayerPositionRef = useRef(currentPlayerPosition);
  const getClockwiseDistanceRef = useRef(getClockwiseDistance);
  const containerRefRef = useRef(containerRef);
  const gameTypeRef = useRef(gameType);
  const amountRef = useRef(amount);
  const destinationSelectorRef = useRef(destinationSelector);
  const destinationElementRef = useRef<HTMLElement | null>(destinationElement ?? null);

  useEffect(() => {
    winnerPositionRef.current = winnerPosition;
    currentPlayerPositionRef.current = currentPlayerPosition;
    getClockwiseDistanceRef.current = getClockwiseDistance;
    containerRefRef.current = containerRef;
    gameTypeRef.current = gameType;
    amountRef.current = amount;
    destinationSelectorRef.current = destinationSelector;
    destinationElementRef.current = destinationElement ?? null;
  });

  useEffect(() => {
    if (!triggerId || triggerId === lastTriggerIdRef.current) return;

    const container = containerRefRef.current?.current;
    if (!container) return;

    clearPhaseTimers();
    lastTriggerIdRef.current = triggerId;
    lockedAmountRef.current = amountRef.current;

    const capturedTriggerId = triggerId;
    requestAnimationFrame(() => {
      if (lastTriggerIdRef.current !== capturedTriggerId) return;
      const freshContainer = containerRefRef.current?.current;
      if (!freshContainer) return;

      const rect = freshContainer.getBoundingClientRect();

      // P8.2b: prefer canonical pot endpoint.
      const canonicalPot = resolveChipEndpoint({
        ref: { kind: 'pot' },
        container: freshContainer,
        debugLabel: `pot-to-player:${gameTypeRef.current ?? 'unknown'}`,
      });
      const yPercent = gameTypeRef.current === 'holm-game' ? 0.38 : 0.5;
      const potCoords = canonicalPot ?? { x: rect.width * 0.5, y: rect.height * yPercent };

      // Winner target.
      //
      // When `destinationSelector` is supplied the caller has asserted a
      // uniquely-owned canonical marker (e.g. 3-5-7 sweep/instant-win
      // winner chipstack root). Use it exclusively — no data-chip-center
      // lookup, no cache, no slot math — to eliminate the historical
      // ambiguity where the generic per-position marker resolves to a
      // legs/trophy/shim node that happens to share the seat.
      let winnerCoords: { x: number; y: number } | null = null;
      let explicitMatchedElements: HTMLElement[] | null = null;
      let explicitChosenElement: HTMLElement | null = null;

      // Opt-in canonical destination element (registry-provided).
      // Measured at animation start. If the element is detached or has
      // zero geometry we fall through to the existing selector /
      // canonical-endpoint / slot-math chain rather than aborting.
      const explicitElement = destinationElementRef.current;
      if (explicitElement && freshContainer.contains(explicitElement)) {
        const containerRect = freshContainer.getBoundingClientRect();
        const r = explicitElement.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          winnerCoords = {
            x: r.left - containerRect.left + r.width / 2,
            y: r.top - containerRect.top + r.height / 2,
          };
          explicitChosenElement = explicitElement;
        }
      }

      const explicitSelector = winnerCoords ? null : destinationSelectorRef.current;
      if (explicitSelector) {
        explicitMatchedElements = Array.from(freshContainer.querySelectorAll<HTMLElement>(explicitSelector));
        const isVisibleReactionTarget = (el: HTMLElement): boolean => {
          const r = el.getBoundingClientRect();
          const s = window.getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || '1') > 0;
        };
        const canonicalClusterSelector = `[data-canonical-seat-cluster][data-seat-position="${winnerPositionRef.current}"]`;
        explicitChosenElement =
          explicitMatchedElements.find((el) => !!el.closest(canonicalClusterSelector) && isVisibleReactionTarget(el)) ??
          explicitMatchedElements.find((el) => !!el.closest('[data-canonical-shell-viewer-chip-endpoint]') && isVisibleReactionTarget(el)) ??
          explicitMatchedElements.find(isVisibleReactionTarget) ??
          null;
        if (explicitChosenElement) {
          const containerRect = freshContainer.getBoundingClientRect();
          const r = explicitChosenElement.getBoundingClientRect();
          winnerCoords = {
            x: r.left - containerRect.left + r.width / 2,
            y: r.top - containerRect.top + r.height / 2,
          };
        } else {
          // eslint-disable-next-line no-console
          console.warn(
            `[PotToPlayerAnimation] destinationSelector "${explicitSelector}" did not resolve; aborting flight to avoid ambiguous fallback.`,
          );
          // Fire start+end callbacks so consumer lifecycle still advances.
          onStartRef.current?.();
          onEndRef.current?.();
          return;
        }
      } else if (!winnerCoords) {
        const canonicalWinner = resolveChipEndpoint({
          ref: { kind: 'seat', position: winnerPositionRef.current },
          container: freshContainer,
          debugLabel: `pot-to-player-winner:${gameTypeRef.current ?? 'unknown'}`,
        });
        if (canonicalWinner) {
          winnerCoords = canonicalWinner;
        } else {
          const domWinner = getChipCenterFromDom(winnerPositionRef.current);
          if (domWinner) {
            winnerCoords = domWinner;
          } else {
            const cachedWinner = getCachedChipCenter(winnerPositionRef.current, rect);
            if (cachedWinner) {
              winnerCoords = cachedWinner;
            } else {
              const isObserver = currentPlayerPositionRef.current === null;
              let slot: { top: number; left: number };
              if (isObserver) {
                const positions: Record<number, { top: number; left: number }> = {
                  1: { top: 2, left: 10 }, 2: { top: 50, left: 2 }, 3: { top: 92, left: 10 },
                  4: { top: 92, left: 50 }, 5: { top: 92, left: 90 }, 6: { top: 50, left: 98 }, 7: { top: 2, left: 90 },
                };
                slot = positions[winnerPositionRef.current] || { top: 50, left: 50 };
              } else {
                const isCurrentPlayer = currentPlayerPositionRef.current === winnerPositionRef.current;
                const slotIndex = isCurrentPlayer ? -1 : getClockwiseDistanceRef.current(winnerPositionRef.current) - 1;
                slot = getSlotPercent(slotIndex);
              }
              winnerCoords = { x: (slot.left / 100) * rect.width, y: (slot.top / 100) * rect.height };
            }
          }
        }
      }
      // C. Pot destination resolution diagnostic — enriched (fire-and-forget).
      try {
        const explicit = destinationSelectorRef.current;
        const nodeList = explicit ? (explicitMatchedElements ?? Array.from(freshContainer.querySelectorAll<HTMLElement>(explicit))) : null;
        const matchedElementCount = nodeList ? nodeList.length : 0;
        const matchedElements = nodeList
          ? nodeList.slice(0, 8).map((n) => {
              const el = n as HTMLElement;
              const r = el.getBoundingClientRect();
              return {
                tag: el.tagName,
                id: el.id || null,
                dataAttrs: Array.from(el.attributes)
                  .filter((a) => a.name.startsWith('data-'))
                  .map((a) => `${a.name}=${a.value}`),
                rect: { x: r.x, y: r.y, w: r.width, h: r.height },
                viewportRect: {
                  top: r.top, left: r.left, bottom: r.bottom, right: r.right,
                },
              };
            })
          : null;
        const chosenEl = explicitChosenElement ?? ((nodeList && nodeList[0]) as HTMLElement | null);
        const chosenRect = chosenEl ? chosenEl.getBoundingClientRect() : null;
        const containerRect = freshContainer.getBoundingClientRect();
        void import('@/lib/threeFiveSeven/runtimeDiag').then(({ emit357RuntimeDiag }) => {
          emit357RuntimeDiag('pot_destination_resolution', {
            viewerPlayerId: null,
          }, {
            gameType: gameTypeRef.current ?? null,
            winnerPosition: winnerPositionRef.current,
            destinationSelector: explicit ?? null,
            destinationSelectorResolved: !!chosenEl,
            matchedElementCount,
            matchedElements,
            chosenElementRect: chosenRect
              ? { x: chosenRect.x, y: chosenRect.y, w: chosenRect.width, h: chosenRect.height }
              : null,
            chosenElementViewportOffset: chosenRect
              ? { top: chosenRect.top, left: chosenRect.left }
              : null,
            containerRect: {
              x: containerRect.x, y: containerRect.y,
              w: containerRect.width, h: containerRect.height,
              top: containerRect.top, left: containerRect.left,
            },
            resolvedElementTag: chosenEl?.tagName ?? null,
            resolvedElementId: chosenEl?.id ?? null,
            resolvedElementDataAttrs: chosenEl
              ? Array.from(chosenEl.attributes)
                  .filter((a) => a.name.startsWith('data-'))
                  .map((a) => `${a.name}=${a.value}`)
              : null,
            resolvedPathToStart: winnerCoords,
            potCoords,
            containerSize: { w: rect.width, h: rect.height },
            fallbackUsed: !explicit || !chosenEl,
            fallbackReason: !explicit
              ? 'no-selector-provided'
              : !chosenEl
                ? 'selector-matched-zero-elements'
                : null,
          });
        }).catch(() => {});
      } catch { /* diagnostic-only */ }


      // Notify start - pot should show 0 now
      onStartRef.current?.();


      setAnimation({
        fromX: rect.left + potCoords.x,
        fromY: rect.top + potCoords.y,
        toX: rect.left + winnerCoords.x,
        toY: rect.top + winnerCoords.y,
      });
      setPhase('flying');

      const isDiceGame = gameTypeRef.current === 'horses' || gameTypeRef.current === 'ship-captain-crew';
      const animDuration = isDiceGame ? 1600 : 3300;

      // Phase transitions — chained timers, all cancelable if a new
      // triggerId arrives.
      const flightEnd = window.setTimeout(() => {
        if (lastTriggerIdRef.current !== capturedTriggerId) return;
        setPhase('arrival_hold');

        const bounceStart = window.setTimeout(() => {
          if (lastTriggerIdRef.current !== capturedTriggerId) return;
          setPhase('bouncing');

          const bounceEnd = window.setTimeout(() => {
            if (lastTriggerIdRef.current !== capturedTriggerId) return;
            // COMPLETE: unmount artifact first, THEN allow consumer
            // teardown. onAnimationEnd is intentionally fired only
            // here — never at flight completion.
            setPhase('complete');
            setAnimation(null);
            onEndRef.current?.();
          }, BOUNCE_DURATION_MS + BOUNCE_TEARDOWN_TAIL_MS);
          phaseTimersRef.current.push(bounceEnd);
        }, ARRIVAL_HOLD_MS);
        phaseTimersRef.current.push(bounceStart);
      }, animDuration);
      phaseTimersRef.current.push(flightEnd);
    });
  }, [triggerId]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => { clearPhaseTimers(); };
  }, []);

  if (!animation) return null;
  if (typeof document === 'undefined') return null;

  const isDiceGame = gameType === 'horses' || gameType === 'ship-captain-crew';
  const animDurationCss = isDiceGame ? '1.6s' : '3.2s';
  const timingFn = isDiceGame ? 'linear' : 'ease-in-out';

  const CHIP_SIZE = 32;

  // Landing translate — used to freeze the outer wrapper once flight ends.
  const landingDx = animation.toX - animation.fromX;
  const landingDy = animation.toY - animation.fromY;

  // Outer style depends on phase:
  //   FLYING       — flight keyframe drives the transform.
  //   ARRIVAL_HOLD — flight animation cleared; frozen at landing translate.
  //   BOUNCING     — same frozen translate; inner owns the bounce.
  const outerStyle: React.CSSProperties = {
    left: animation.fromX - CHIP_SIZE / 2,
    top: animation.fromY - CHIP_SIZE / 2,
    zIndex: SHELL_Z.CELEBRATION,
  };
  if (phase === 'flying') {
    outerStyle.animation = `${animationName} ${animDurationCss} ${timingFn} forwards`;
  } else {
    outerStyle.animation = 'none';
    outerStyle.transform = `translate(${landingDx}px, ${landingDy}px)`;
  }

  const innerStyle: React.CSSProperties =
    phase === 'bouncing'
      ? {
          animation: `__chipDestBounce ${BOUNCE_DURATION_MS}ms cubic-bezier(.34,1.56,.64,1) forwards`,
          transformOrigin: '50% 50%',
        }
      : {};

  const chip = (
    <div
      className="fixed pointer-events-none"
      style={outerStyle}
    >
      <div
        className="w-8 h-8 rounded-full bg-amber-400 border-2 border-white shadow-lg flex items-center justify-center"
        style={innerStyle}
      >
        <span className="text-black text-[10px] font-bold">${formatChipValue(lockedAmountRef.current)}</span>
      </div>
      <style>{`
        @keyframes ${animationName} {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          ${isDiceGame ? `
          100% {
            transform: translate(${landingDx}px, ${landingDy}px) scale(1);
            opacity: 1;
          }
          ` : `
          15% {
            transform: translate(0, -8px) scale(1.1);
            opacity: 1;
          }
          100% {
            transform: translate(${landingDx}px, ${landingDy}px) scale(1);
            opacity: 1;
          }
          `}
        }
        @keyframes __chipDestBounce {
          0%   { transform: translateY(0)    scale(1); }
          18%  { transform: translateY(-14px) scale(1.22); }
          34%  { transform: translateY(0)    scale(1.00); }
          48%  { transform: translateY(-9px) scale(1.14); }
          62%  { transform: translateY(0)    scale(0.96); }
          78%  { transform: translateY(-3px) scale(1.04); }
          100% { transform: translateY(0)    scale(1); }
        }
      `}</style>
    </div>
  );

  return createPortal(chip, document.body);
};

export default PotToPlayerAnimation;
