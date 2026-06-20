/**
 * ChipTransportRuntime — shell-owned chip animation runtime.
 *
 * Economy Wave 1:
 *   - Flight `variant` and destination reaction are ORTHOGONAL.
 *   - `cribbageBounce` now owns flight motion only (lift, arc, arrival,
 *     fade). The legacy landing bounce moved to `destinationReaction:
 *     { bounce: true }` and is applied to the resolved `to` endpoint
 *     DOM node by this runtime.
 *   - Every intent is mirrored to CHIP TRANSPORT DBG with full
 *     lifecycle: endpoint resolution, mount, settle/drop, destination
 *     reaction outcome.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useChipTransportInternal, type ActiveChipIntent } from './ChipTransportProvider';
import { resolveChipEndpoint, type EndpointCache, type ResolvedEndpoint } from './chipEndpoints';
import { formatChipValue } from '@/lib/utils';
import type { ChipTransportVariant, ChipEndpointRef } from './GameplaySlotContract';
import { chipTransportDbgUpsert } from './chipTransportDbg';
import { captureWinnerChipEndpoint } from './winnerChipEndpointDbg';
import { destReactionDbgUpsert, snapshotTargetElement } from './destReactionDbg';

interface MotionPreset {
  durationMs: number;
  staggerMs: number;
  keyframes: (dx: number, dy: number) => string;
  discStyle: React.CSSProperties;
  prefix?: string;
}

const PRESETS: Record<ChipTransportVariant, MotionPreset> = {
  default: {
    durationMs: 1800,
    staggerMs: 0,
    keyframes: (dx, dy) => `
      0%   { transform: translate(0px, 0px) scale(1); opacity: 1; }
      12%  { transform: translate(0px, -10px) scale(1.12); opacity: 1; }
      85%  { transform: translate(${dx}px, ${dy}px) scale(1); opacity: 1; }
      100% { transform: translate(${dx}px, ${dy}px) scale(0.4); opacity: 0; }
    `,
    discStyle: {
      width: 28,
      height: 28,
      borderRadius: 9999,
      background: 'linear-gradient(135deg, hsl(45 95% 60%), hsl(38 90% 45%))',
      border: '2px solid hsl(0 0% 100%)',
      boxShadow: '0 4px 12px hsla(0,0%,0%,0.35)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'hsl(30 50% 12%)',
      fontSize: 10,
      fontWeight: 700,
    },
    prefix: '$',
  },
  /**
   * Cribbage flight: lift, arc, arrive at destination, hold briefly,
   * fade out. NO landing bounce — destination reaction owns that.
   */
  cribbageBounce: {
    durationMs: 2200,
    staggerMs: 300,
    keyframes: (dx, dy) => `
      0%   { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; filter: brightness(1); }
      6%   { transform: translate(0, -25px) scale(1.3) rotate(-5deg); opacity: 1; filter: brightness(1.2); }
      20%  { transform: translate(${dx * 0.2}px, ${dy * 0.1 - 40}px) scale(1.2) rotate(5deg); opacity: 1; filter: brightness(1.3); }
      55%  { transform: translate(${dx * 0.7}px, ${dy * 0.5 - 30}px) scale(1.1) rotate(-3deg); opacity: 1; filter: brightness(1.1); }
      80%  { transform: translate(${dx}px, ${dy}px) scale(1.05) rotate(2deg); opacity: 1; filter: brightness(1); }
      90%  { transform: translate(${dx}px, ${dy}px) scale(1) rotate(0deg); opacity: 1; }
      100% { transform: translate(${dx}px, ${dy}px) scale(0.4); opacity: 0; }
    `,
    discStyle: {
      width: 40,
      height: 40,
      borderRadius: 9999,
      background: 'linear-gradient(135deg, hsl(45 90% 65%), hsl(45 90% 55%) 50%, hsl(38 80% 42%))',
      border: '3px solid hsl(0 0% 100%)',
      boxShadow: '0 0 20px rgba(245, 158, 11, 0.6), 0 4px 15px rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'hsl(40 70% 12%)',
      fontSize: 11,
      fontWeight: 900,
    },
    prefix: '$',
  },
};

interface RuntimeChip {
  intent: ActiveChipIntent;
  from: ResolvedEndpoint;
  to: ResolvedEndpoint;
  preset: MotionPreset;
  delayMs: number;
  totalMs: number;
  startedAt: number;
}

/**
 * DOM selector for the destination reaction target — the VISIBLE chip
 * disc/stack body. Distinct from the endpoint marker (`[data-chip-center]`)
 * which is a 0x0 geometry anchor and must NOT be animated.
 */
function destinationReactionSelector(ref: ChipEndpointRef): string {
  if (ref.kind === 'pot') {
    return '[data-pot-reaction-target], [data-pot-anchor], [data-canonical-shell-pot-anchor]';
  }
  return `[data-chip-reaction-target="${ref.position}"]`;
}

/** Endpoint geometry selector (mirrors chipEndpoints — may be 0x0). */
function endpointSelector(ref: ChipEndpointRef): string {
  if (ref.kind === 'pot') return '[data-pot-anchor], [data-canonical-shell-pot-anchor]';
  return `[data-chip-center="${ref.position}"]`;
}

const DEST_REACTION_STYLE_ID = '__chip-dest-reaction-keyframes';
const DEST_REACTION_DURATION_MS = 650;

function ensureDestReactionStylesheet() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(DEST_REACTION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = DEST_REACTION_STYLE_ID;
  style.textContent = `
    @keyframes __chipDestBounce {
      0%   { transform: scale(1); }
      25%  { transform: scale(1.35); }
      55%  { transform: scale(0.92); }
      80%  { transform: scale(1.08); }
      100% { transform: scale(1); }
    }
    @keyframes __chipDestPulse {
      0%   { box-shadow: 0 0 0 0 rgba(255, 215, 100, 0.7); }
      70%  { box-shadow: 0 0 0 18px rgba(255, 215, 100, 0); }
      100% { box-shadow: 0 0 0 0 rgba(255, 215, 100, 0); }
    }
    @keyframes __chipDestScale {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(var(--chip-dest-scale, 1.25)); }
    }
  `;
  document.head.appendChild(style);
}

function applyDestinationReaction(
  intentId: string,
  el: HTMLElement,
  reaction: NonNullable<ActiveChipIntent['destinationReaction']>,
): void {
  ensureDestReactionStylesheet();
  const animations: string[] = [];
  if (reaction.bounce) animations.push(`__chipDestBounce ${DEST_REACTION_DURATION_MS}ms cubic-bezier(.34,1.56,.64,1)`);
  if (reaction.pulse)  animations.push(`__chipDestPulse ${DEST_REACTION_DURATION_MS}ms ease-out`);
  if (!reaction.bounce && reaction.scale != null) {
    el.style.setProperty('--chip-dest-scale', String(reaction.scale));
    animations.push(`__chipDestScale ${DEST_REACTION_DURATION_MS}ms ease-out`);
  }
  if (animations.length === 0) {
    destReactionDbgUpsert(intentId, {
      reactionMounted: false,
      note: 'no-animations-for-reaction',
    });
    return;
  }

  // DEST REACTION DBG — element + transformBefore snapshot.
  let transformBefore = '?';
  try { transformBefore = window.getComputedStyle(el).transform; } catch { /* */ }
  destReactionDbgUpsert(intentId, {
    targetElement: snapshotTargetElement(el),
    computedTransformBefore: transformBefore,
  });

  // Stash & restore prior animation so we don't clobber static styles.
  const prevAnimation = el.style.animation;
  const prevTransformOrigin = el.style.transformOrigin;
  el.style.transformOrigin = '50% 50%';
  el.style.animation = animations.join(', ');
  el.setAttribute('data-chip-dest-reaction', Object.entries(reaction).filter(([, v]) => v).map(([k]) => k).join('+'));

  // Capture computed animation values one frame later (after style flush).
  let computedAnimationName = '?';
  let computedAnimationDuration = '?';
  let assignedAnimation = el.style.animation;
  requestAnimationFrame(() => {
    try {
      const cs = window.getComputedStyle(el);
      computedAnimationName = cs.animationName;
      computedAnimationDuration = cs.animationDuration;
    } catch { /* */ }
    destReactionDbgUpsert(intentId, {
      reactionMounted: true,
      computedAnimationName,
      computedAnimationDuration,
      note: `assignedAnimation=${assignedAnimation.slice(0, 60)}`,
    });
  });

  const onStart = () => {
    let tfDuring = '?';
    try { tfDuring = window.getComputedStyle(el).transform; } catch { /* */ }
    destReactionDbgUpsert(intentId, {
      reactionStarted: true,
      computedTransformDuring: tfDuring,
    });
  };
  const onEnd = () => {
    let tfAfter = '?';
    try { tfAfter = window.getComputedStyle(el).transform; } catch { /* */ }
    destReactionDbgUpsert(intentId, {
      reactionFinished: true,
      computedTransformAfter: tfAfter,
    });
  };
  el.addEventListener('animationstart', onStart, { once: true });
  el.addEventListener('animationend', onEnd, { once: true });

  // Mid-animation transform sample + override detection: re-check the
  // inline animation property; if some other writer has clobbered it,
  // flag overriddenDuringReaction=true.
  const midMs = Math.floor(DEST_REACTION_DURATION_MS / 2);
  const tMid = window.setTimeout(() => {
    let tfMid = '?';
    try { tfMid = window.getComputedStyle(el).transform; } catch { /* */ }
    const overridden = el.style.animation !== assignedAnimation;
    destReactionDbgUpsert(intentId, {
      computedTransformDuring: tfMid,
      overriddenDuringReaction: overridden,
    });
  }, midMs);

  const clear = () => {
    el.style.animation = prevAnimation;
    el.style.transformOrigin = prevTransformOrigin;
    el.removeAttribute('data-chip-dest-reaction');
    el.removeEventListener('animationstart', onStart);
    el.removeEventListener('animationend', onEnd);
    window.clearTimeout(tMid);
    // Final after-clear transform capture.
    let tfFinal = '?';
    try { tfFinal = window.getComputedStyle(el).transform; } catch { /* */ }
    destReactionDbgUpsert(intentId, { computedTransformAfter: tfFinal });
  };
  window.setTimeout(clear, DEST_REACTION_DURATION_MS + 80);
  chipTransportDbgUpsert(intentId, {
    destinationReactionApplied: true,
  });
}

export interface ChipTransportRuntimeProps {
  containerRef: RefObject<HTMLElement>;
  overlayRootRef: RefObject<HTMLElement>;
}

export function ChipTransportRuntime({
  containerRef,
  overlayRootRef,
}: ChipTransportRuntimeProps) {
  const ctx = useChipTransportInternal();
  const cacheRef = useRef<EndpointCache>({});
  const resolvedRef = useRef<Map<string, RuntimeChip>>(new Map());
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const active = ctx?.__activeIntents ?? [];
  const activeIds = useMemo(() => active.map((i) => i.id).join('|'), [active]);

  useLayoutEffect(() => {
    if (!ctx) return;
    const container = containerRef.current;
    if (!container) {
      for (const intent of active) {
        chipTransportDbgUpsert(intent.id, {
          variant: intent.variant ?? 'default',
          reason: intent.reason,
          from: intent.from,
          to: intent.to,
          amount: intent.amount,
          destinationReaction: intent.destinationReaction ?? null,
          droppedReason: 'no-runtime',
          transportMounted: false,
        });
        ctx.__markDropped(intent, 'no-runtime');
      }
      return;
    }

    let mutated = false;
    const seenThisPass = new Set<string>();
    const variantCounters = new Map<ChipTransportVariant, number>();

    for (const intent of active) {
      seenThisPass.add(intent.id);
      if (resolvedRef.current.has(intent.id)) {
        const v = intent.variant ?? 'default';
        variantCounters.set(v, (variantCounters.get(v) ?? 0) + 1);
        continue;
      }

      const from = resolveChipEndpoint({
        ref: intent.from,
        container,
        cache: cacheRef.current,
        debugLabel: `chip-transport:${intent.id}`,
      });
      const to = resolveChipEndpoint({
        ref: intent.to,
        container,
        cache: cacheRef.current,
      });

      chipTransportDbgUpsert(intent.id, {
        variant: intent.variant ?? 'default',
        reason: intent.reason,
        from: intent.from,
        to: intent.to,
        amount: intent.amount,
        destinationReaction: intent.destinationReaction ?? null,
        fromEndpointFound: !!from,
        toEndpointFound: !!to,
      });

      if (!from || !to) {
        chipTransportDbgUpsert(intent.id, {
          droppedReason: 'missing-endpoint',
          transportMounted: false,
        });
        // WINNER CHIP ENDPOINT DBG — exact moment of asymmetric drop.
        captureWinnerChipEndpoint({
          site: 'runtime:missing-endpoint',
          winnerSeat: intent.to.kind === 'seat' ? intent.to.position : null,
          loserSeats: intent.from.kind === 'seat' ? [intent.from.position] : [],
          note: `intent=${intent.id} fromFound=${!!from} toFound=${!!to}`,
        });
        ctx.__markDropped(intent, 'missing-endpoint');
        continue;
      }

      const variant = intent.variant ?? 'default';
      const preset = PRESETS[variant] ?? PRESETS.default;
      const idx = variantCounters.get(variant) ?? 0;
      variantCounters.set(variant, idx + 1);
      const delayMs = preset.staggerMs * idx;
      const totalMs = (intent.durationMs ?? preset.durationMs) + delayMs;

      resolvedRef.current.set(intent.id, {
        intent,
        from,
        to,
        preset,
        delayMs,
        totalMs,
        startedAt: performance.now(),
      });
      chipTransportDbgUpsert(intent.id, {
        transportMounted: true,
        transportVisible: true,
      });
      mutated = true;
    }

    for (const id of Array.from(resolvedRef.current.keys())) {
      if (!seenThisPass.has(id)) {
        resolvedRef.current.delete(id);
        mutated = true;
      }
    }

    if (mutated) rerender();
  }, [ctx, containerRef, activeIds, active]);

  useEffect(() => {
    if (!ctx) return;
    const container = containerRef.current;
    const timers: number[] = [];
    for (const [id, chip] of resolvedRef.current.entries()) {
      const elapsed = performance.now() - chip.startedAt;
      // Schedule destination reaction at arrival (~90% of flight), so
      // the winner bounces as the chip lands rather than after fade.
      const arrivalRatio = 0.9;
      const flightMs = chip.intent.durationMs ?? chip.preset.durationMs;
      const arrivalMs = chip.delayMs + flightMs * arrivalRatio;
      const remainingToArrival = Math.max(0, arrivalMs - elapsed);
      const remainingToSettle = Math.max(0, chip.totalMs - elapsed);

      if (chip.intent.destinationReaction) {
        const reaction = chip.intent.destinationReaction;
        const sel = destinationTargetSelector(chip.intent.to);
        destReactionDbgUpsert(id, {
          to: chip.intent.to,
          destinationReaction: reaction,
          targetSelector: sel,
        });
        const t1 = window.setTimeout(() => {
          if (!container) {
            chipTransportDbgUpsert(id, {
              destinationReactionTargetFound: false,
              destinationReactionApplied: false,
            });
            destReactionDbgUpsert(id, {
              destinationReactionTargetFound: false,
              note: 'no-container-at-arrival',
            });
            return;
          }
          const el = container.querySelector(sel) as HTMLElement | null;
          chipTransportDbgUpsert(id, {
            destinationReactionTargetFound: !!el,
          });
          destReactionDbgUpsert(id, {
            destinationReactionTargetFound: !!el,
            ...(el ? { targetElement: snapshotTargetElement(el) } : {}),
          });
          if (el) {
            applyDestinationReaction(id, el, reaction);
          } else {
            chipTransportDbgUpsert(id, { destinationReactionApplied: false });
            destReactionDbgUpsert(id, { reactionMounted: false, note: 'target-not-found' });
          }
        }, remainingToArrival);
        timers.push(t1);
      }

      const t2 = window.setTimeout(() => {
        chipTransportDbgUpsert(id, { settled: true, transportVisible: false });
        ctx.__markSettled(id, chip.totalMs);
      }, remainingToSettle + 16);
      timers.push(t2);
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [ctx, activeIds, containerRef]);

  const overlay = overlayRootRef.current;
  if (!ctx || !overlay) return null;
  if (resolvedRef.current.size === 0) return null;

  const chips: JSX.Element[] = [];
  for (const chip of resolvedRef.current.values()) {
    const dx = chip.to.x - chip.from.x;
    const dy = chip.to.y - chip.from.y;
    const keyframeName = `__chipTransport_${chip.intent.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const flightMs = chip.intent.durationMs ?? chip.preset.durationMs;
    chips.push(
      <div
        key={chip.intent.id}
        data-chip-transport-intent={chip.intent.id}
        data-chip-transport-reason={chip.intent.reason}
        data-chip-transport-variant={chip.intent.variant ?? 'default'}
        style={{
          position: 'absolute',
          left: chip.from.x,
          top: chip.from.y,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 80,
        }}
      >
        <div
          style={{
            ...chip.preset.discStyle,
            animation: `${keyframeName} ${flightMs}ms ease-in-out ${chip.delayMs}ms forwards`,
          }}
        >
          {(chip.preset.prefix ?? '')}{formatChipValue(chip.intent.amount)}
        </div>
        <style>{`@keyframes ${keyframeName} {${chip.preset.keyframes(dx, dy)}}`}</style>
      </div>,
    );
  }

  return createPortal(<>{chips}</>, overlay);
}
