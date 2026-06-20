/**
 * ChipTransportRuntime — shell-owned chip animation runtime.
 *
 * Reads queued intents from `ChipTransportProvider` and renders flying
 * chips into a shell-owned overlay root (provided as `overlayRoot` ref).
 *
 * Motion presets (Wave 3B):
 *   - 'default'        : smooth flat arc with light scale pop (P8.1).
 *   - 'cribbageBounce' : exact port of legacy CribbageChipTransferAnimation
 *                        — 3.5s flight, bounce-on-landing, terminal fade.
 *                        Staggered 300ms per intent within an active batch
 *                        to match the legacy multi-loser flight pattern.
 *
 * On mount of each intent the runtime resolves endpoints via
 * `resolveChipEndpoint`. If either endpoint is unresolved the intent is
 * dropped through `__markDropped` (loud diagnostic). Otherwise the chip
 * is rendered with a CSS keyframe and `onAnimationEnd` calls
 * `__markSettled`.
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
import type { ChipTransportVariant } from './GameplaySlotContract';

interface MotionPreset {
  /** Flight time exclusive of stagger. */
  durationMs: number;
  /** Stagger between sibling intents in the same batch. */
  staggerMs: number;
  /** Builds the @keyframes body for given dx/dy. */
  keyframes: (dx: number, dy: number) => string;
  /** Inline style for the chip body (size, gradient, shadow, font). */
  discStyle: React.CSSProperties;
  /** Optional currency prefix. */
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
  // Exact port of legacy CribbageChipTransferAnimation — 40x40 amber disc,
  // 3500ms ease-in-out, bounce on landing, terminal scale(0)+opacity 0.
  cribbageBounce: {
    durationMs: 3500,
    staggerMs: 300,
    keyframes: (dx, dy) => `
      0%   { transform: translate(0, 0) scale(1) rotate(0deg); opacity: 1; filter: brightness(1); }
      5%   { transform: translate(0, -25px) scale(1.3) rotate(-5deg); opacity: 1; filter: brightness(1.2); }
      15%  { transform: translate(${dx * 0.15}px, ${dy * 0.1 - 40}px) scale(1.2) rotate(5deg); opacity: 1; filter: brightness(1.3); }
      50%  { transform: translate(${dx * 0.7}px, ${dy * 0.5 - 30}px) scale(1.1) rotate(-3deg); opacity: 1; filter: brightness(1.1); }
      70%  { transform: translate(${dx}px, ${dy}px) scale(1.05) rotate(2deg); opacity: 1; filter: brightness(1); }
      78%  { transform: translate(${dx}px, ${dy - 25}px) scale(1.15) rotate(-2deg); opacity: 1; filter: brightness(1.2); }
      86%  { transform: translate(${dx}px, ${dy}px) scale(1) rotate(0deg); opacity: 1; }
      91%  { transform: translate(${dx}px, ${dy - 10}px) scale(1.05); opacity: 1; }
      96%  { transform: translate(${dx}px, ${dy}px) scale(1); opacity: 1; }
      100% { transform: translate(${dx}px, ${dy}px) scale(0); opacity: 0; }
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
        ctx.__markDropped(intent, 'no-runtime');
      }
      return;
    }

    let mutated = false;
    const seenThisPass = new Set<string>();

    // Group intents by variant to derive a stable per-batch stagger
    // index. Intents that are already resolved keep their delay.
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
        debugLabel: `cribbage-bounce:${intent.id}`,
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
    const timers: number[] = [];
    for (const [id, chip] of resolvedRef.current.entries()) {
      const elapsed = performance.now() - chip.startedAt;
      const remaining = Math.max(0, chip.totalMs - elapsed);
      const t = window.setTimeout(() => {
        ctx.__markSettled(id, chip.totalMs);
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
