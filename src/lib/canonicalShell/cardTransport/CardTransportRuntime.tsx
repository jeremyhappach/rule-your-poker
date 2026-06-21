/**
 * CardTransportRuntime — owns launch, travel, arrival, destroy.
 *
 *   game emits intent
 *     ↓
 *   resolve from/to via [data-card-anchor]
 *     ↓
 *   mount transient flying card in overlay
 *     ↓
 *   keyframe: translate(0,0) → translate(dx,dy) over durationMs
 *     ↓
 *   on arrival: __markSettled(intentId, cardId)
 *     ↓
 *   destroy flying node (destination consumer takes ownership)
 *
 * The transport never becomes the real card. The destination renders
 * the real card as soon as its cardId is in DealRuntime's settledCardIds.
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
import { useCardTransportInternal, type ActiveCardIntent } from './CardTransportProvider';
import { resolveCardEndpoint, type ResolvedCardEndpoint } from './cardEndpoints';
import { cardTransportDbgUpsert } from './cardTransportDbg';

const DEFAULT_DURATION_MS = 110;
const CARD_W = 44;
const CARD_H = 62;

interface RuntimeCard {
  intent: ActiveCardIntent;
  from: ResolvedCardEndpoint;
  to: ResolvedCardEndpoint;
  delayMs: number;
  flightMs: number;
  startedAt: number;
}

export interface CardTransportRuntimeProps {
  containerRef: RefObject<HTMLElement>;
  overlayRootRef: RefObject<HTMLElement>;
}

export function CardTransportRuntime({
  containerRef,
  overlayRootRef,
}: CardTransportRuntimeProps) {
  const ctx = useCardTransportInternal();
  const resolvedRef = useRef<Map<string, RuntimeCard>>(new Map());
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  const active = ctx?.__activeIntents ?? [];
  const activeIds = useMemo(() => active.map((i) => i.id).join('|'), [active]);

  useLayoutEffect(() => {
    if (!ctx) return;
    const container = containerRef.current;
    if (!container) {
      for (const intent of active) {
        cardTransportDbgUpsert(intent.id, {
          cardId: intent.cardId,
          face: intent.face,
          from: intent.from,
          to: intent.to,
          droppedReason: 'no-runtime-container',
          transportMounted: false,
        });
        ctx.__markDropped(intent, 'no-runtime-container');
      }
      return;
    }

    let mutated = false;
    const seen = new Set<string>();
    for (const intent of active) {
      seen.add(intent.id);
      if (resolvedRef.current.has(intent.id)) continue;

      const from = resolveCardEndpoint(intent.from, container);
      const to = resolveCardEndpoint(intent.to, container);
      cardTransportDbgUpsert(intent.id, {
        cardId: intent.cardId,
        face: intent.face,
        from: intent.from,
        to: intent.to,
        fromEndpointFound: !!from,
        toEndpointFound: !!to,
      });
      if (!from || !to) {
        cardTransportDbgUpsert(intent.id, {
          droppedReason: 'missing-endpoint',
          transportMounted: false,
        });
        ctx.__markDropped(intent, 'missing-endpoint');
        continue;
      }

      resolvedRef.current.set(intent.id, {
        intent,
        from,
        to,
        delayMs: Math.max(0, intent.launchDelayMs ?? 0),
        flightMs: intent.durationMs ?? DEFAULT_DURATION_MS,
        startedAt: performance.now(),
      });
      cardTransportDbgUpsert(intent.id, { transportMounted: true, transportVisible: true });
      mutated = true;
    }

    for (const id of Array.from(resolvedRef.current.keys())) {
      if (!seen.has(id)) {
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
      const settleAt = chip.delayMs + chip.flightMs;
      const remaining = Math.max(0, settleAt - elapsed);
      const t = window.setTimeout(() => {
        cardTransportDbgUpsert(id, { settled: true, transportVisible: false });
        ctx.__markSettled(id, chip.intent.cardId);
      }, remaining + 8);
      timers.push(t);
    }
    return () => { for (const t of timers) window.clearTimeout(t); };
  }, [ctx, activeIds]);

  const overlay = overlayRootRef.current;
  if (!ctx || !overlay) return null;
  if (resolvedRef.current.size === 0) return null;

  const nodes: JSX.Element[] = [];
  for (const card of resolvedRef.current.values()) {
    const dx = card.to.x - card.from.x;
    const dy = card.to.y - card.from.y;
    const kf = `__cardFly_${card.intent.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const isHidden = card.intent.face === 'hidden';
    nodes.push(
      <div
        key={card.intent.id}
        data-card-transport-intent={card.intent.id}
        data-card-transport-card-id={card.intent.cardId}
        data-card-transport-face={card.intent.face}
        style={{
          position: 'absolute',
          left: card.from.x,
          top: card.from.y,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 82,
        }}
      >
        <div
          style={{
            width: CARD_W,
            height: CARD_H,
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.85)',
            boxShadow: '0 6px 14px rgba(0,0,0,0.45)',
            background: isHidden
              ? 'linear-gradient(135deg, hsl(220 70% 28%), hsl(220 70% 18%))'
              : 'linear-gradient(180deg, #ffffff, #f1f1f1)',
            color: isHidden ? 'rgba(255,255,255,0.4)' : 'hsl(220 30% 20%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 10,
            animation: `${kf} ${card.flightMs}ms ease-out ${card.delayMs}ms forwards`,
            willChange: 'transform',
          }}
        >
          {isHidden ? '' : '\u2660'}
        </div>
        <style>{`@keyframes ${kf} {
          0%   { transform: translate(0, 0) scale(0.92); opacity: 0.95; }
          40%  { transform: translate(${dx * 0.4}px, ${dy * 0.4 - 6}px) scale(1.02); opacity: 1; }
          100% { transform: translate(${dx}px, ${dy}px) scale(1); opacity: 1; }
        }`}</style>
      </div>,
    );
  }

  return createPortal(<>{nodes}</>, overlay);
}
