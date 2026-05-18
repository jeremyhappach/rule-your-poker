/**
 * ChipTransportRuntime — P8.1 shell-owned chip animation runtime.
 *
 * Reads queued intents from `ChipTransportProvider` and renders flying
 * chips into a shell-owned overlay root (provided as `overlayRoot` ref).
 * NOT portaled to document.body — see plan adjustment 1 ("shell-owned
 * overlay root inside PersistentTableShell").
 *
 * P8.1 keeps the runtime intentionally minimal (plan adjustment 3):
 *   - Single motion preset: smooth flat arc with light scale pop.
 *   - Reasons (ante/bet/win/leg/sweep/transfer) all use the same preset
 *     in P8.1. Per-reason curves will be added during actual consumer
 *     migration (Wave B onward), when we have concrete UX requirements.
 *
 * On mount of each intent the runtime resolves endpoints via
 * `resolveChipEndpoint`. If either endpoint is unresolved the intent is
 * dropped through `__markDropped` (loud diagnostic). Otherwise the chip
 * is rendered with a CSS keyframe and `onAnimationEnd` calls
 * `__markSettled`.
 *
 * The runtime never inverts coordinates. Projection invariant is
 * preserved because endpoints come from DOM markers placed by the seat
 * components / shell pot anchor, both of which already honor
 * active=relative / observer=absolute.
 *
 * No existing animator is migrated in P8.1 — the runtime simply waits
 * for intents that won't arrive until Wave B.
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

const DEFAULT_DURATION_MS = 1800;

interface RuntimeChip {
  intent: ActiveChipIntent;
  from: ResolvedEndpoint;
  to: ResolvedEndpoint;
  durationMs: number;
  startedAt: number;
}

export interface ChipTransportRuntimeProps {
  /** Container relative to which endpoint coordinates are computed. */
  containerRef: RefObject<HTMLElement>;
  /** Shell-owned overlay root that hosts the rendered chips. */
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

  // Resolve new intents on layout commit so we measure after reflow.
  useLayoutEffect(() => {
    if (!ctx) return;
    const container = containerRef.current;
    if (!container) {
      for (const intent of active) {
        ctx.__markDropped(intent, 'no-runtime');
      }
      return;
    }

    let mutated = false;
    const seenThisPass = new Set<string>();
    for (const intent of active) {
      seenThisPass.add(intent.id);
      if (resolvedRef.current.has(intent.id)) continue;

      const from = resolveChipEndpoint({
        ref: intent.from,
        container,
        cache: cacheRef.current,
      });
      const to = resolveChipEndpoint({
        ref: intent.to,
        container,
        cache: cacheRef.current,
      });

      if (!from || !to) {
        ctx.__markDropped(intent, 'missing-endpoint');
        continue;
      }

      resolvedRef.current.set(intent.id, {
        intent,
        from,
        to,
        durationMs: intent.durationMs ?? DEFAULT_DURATION_MS,
        startedAt: performance.now(),
      });
      mutated = true;
    }

    // Drop resolved entries whose intent left the active queue.
    for (const id of Array.from(resolvedRef.current.keys())) {
      if (!seenThisPass.has(id)) {
        resolvedRef.current.delete(id);
        mutated = true;
      }
    }

    if (mutated) rerender();
  }, [ctx, containerRef, activeIds, active]);

  // Settlement timers — fire __markSettled when each chip's animation completes.
  useEffect(() => {
    if (!ctx) return;
    const timers: number[] = [];
    for (const [id, chip] of resolvedRef.current.entries()) {
      const elapsed = performance.now() - chip.startedAt;
      const remaining = Math.max(0, chip.durationMs - elapsed);
      const t = window.setTimeout(() => {
        ctx.__markSettled(id, chip.durationMs);
      }, remaining + 16);
      timers.push(t);
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [ctx, activeIds]);

  const overlay = overlayRootRef.current;
  if (!ctx || !overlay) return null;
  if (resolvedRef.current.size === 0) return null;

  const chips: JSX.Element[] = [];
  for (const chip of resolvedRef.current.values()) {
    const dx = chip.to.x - chip.from.x;
    const dy = chip.to.y - chip.from.y;
    const keyframeName = `__chipTransport_${chip.intent.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    chips.push(
      <div
        key={chip.intent.id}
        data-chip-transport-intent={chip.intent.id}
        data-chip-transport-reason={chip.intent.reason}
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
            animation: `${keyframeName} ${chip.durationMs}ms ease-in-out forwards`,
          }}
        >
          ${formatChipValue(chip.intent.amount)}
        </div>
        <style>{`
          @keyframes ${keyframeName} {
            0%   { transform: translate(0px, 0px) scale(1); opacity: 1; }
            12%  { transform: translate(0px, -10px) scale(1.12); opacity: 1; }
            85%  { transform: translate(${dx}px, ${dy}px) scale(1); opacity: 1; }
            100% { transform: translate(${dx}px, ${dy}px) scale(0.4); opacity: 0; }
          }
        `}</style>
      </div>,
    );
  }

  return createPortal(<>{chips}</>, overlay);
}
