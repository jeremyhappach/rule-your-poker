/**
 * CardTransportRuntime — owns launch, travel, arrival, destroy.
 *
 *   game emits intent
 *     ↓
 *   resolve from/to via [data-card-anchor]
 *     ↓
 *   mount transient flying card in overlay
 *     ↓
 *   single continuous keyframe: translate(0,0) → translate(dx,dy)
 *     ↓
 *   on arrival: __markSettled(intentId, cardId)
 *     ↓
 *   destroy flying node (destination consumer takes ownership)
 *
 * MOTION CONTRACT
 *   ONE continuous flight. No mid-flight scale bounce. No intermediate
 *   keyframe stops. Linear translate, easing applied by the animation
 *   timing function only. If the dbg panel sees more than one phase of
 *   transform interpolation, that is a bug.
 *
 * CARDBACK CONTRACT
 *   Hidden flights render the canonical cardback (same DOM/styles as
 *   CribbagePlayingCard faceDown) using `cardBackColors` stamped by the
 *   game from useVisualPreferences().getCardBackColors(). No generic
 *   red fallback when colors are absent — falls back to the same
 *   default (#00308F/#001a4a) CribbagePlayingCard uses.
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
import {
  cardTransportDbgUpsert,
  cardTransportDbgSample,
  type CardTransportDbgSample,
} from './cardTransportDbg';

const DEFAULT_DURATION_MS = 110;
const CARD_W = 44;
const CARD_H = 66; // 2:3 aspect, matches CribbagePlayingCard md tokens proportionally

export function isCardTransportInspectMode(): boolean {
  if (typeof window === 'undefined') return true;
  const w = window as unknown as { __CARD_TRANSPORT_INSPECT_MODE?: boolean };
  return w.__CARD_TRANSPORT_INSPECT_MODE !== false;
}
const INSPECT_EASING = 'cubic-bezier(.25,.8,.25,1)';
const NORMAL_EASING = 'ease-out';

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
        handContextId: intent.handContextId ?? null,
        fromEndpointFound: !!from,
        toEndpointFound: !!to,
        resolvedFromAnchor: from?.resolvedAnchor ?? null,
        resolvedToAnchor: to?.resolvedAnchor ?? null,
        fromAnchorRect: from ? { x: from.x, y: from.y, w: from.w, h: from.h } : null,
        toAnchorRect:   to   ? { x: to.x,   y: to.y,   w: to.w,   h: to.h }   : null,
      });
      if (!from || !to) {
        cardTransportDbgUpsert(intent.id, {
          droppedReason: 'missing-endpoint',
          transportMounted: false,
        });
        ctx.__markDropped(intent, 'missing-endpoint');
        continue;
      }

      const delayMs = Math.max(0, intent.launchDelayMs ?? 0);
      const flightMs = intent.durationMs ?? DEFAULT_DURATION_MS;
      resolvedRef.current.set(intent.id, {
        intent,
        from,
        to,
        delayMs,
        flightMs,
        startedAt: performance.now(),
      });
      cardTransportDbgUpsert(intent.id, {
        transportMounted: true,
        transportVisible: true,
        launchDelayMs: delayMs,
        durationMs: flightMs,
        dx: to.x - from.x,
        dy: to.y - from.y,
        portalLayer: 'overlay-root',
      });
      mutated = true;
    }

    for (const id of Array.from(resolvedRef.current.keys())) {
      if (!seen.has(id)) {
        cardTransportDbgUpsert(id, {
          transportDestroyedTime: performance.now(),
          transportVisible: false,
        });
        resolvedRef.current.delete(id);
        mutated = true;
      }
    }
    if (mutated) rerender();
  }, [ctx, containerRef, activeIds, active]);

  useEffect(() => {
    if (!ctx) return;
    const timers: number[] = [];
    const { ownershipClaimDelayMs } = getDealTiming();
    for (const [id, chip] of resolvedRef.current.entries()) {
      const elapsed = performance.now() - chip.startedAt;
      const settleAt = chip.delayMs + chip.flightMs;
      const remaining = Math.max(0, settleAt - elapsed);
      const t = window.setTimeout(() => {
        const now = performance.now();
        cardTransportDbgUpsert(id, {
          settled: true,
          transportVisible: false,
          actualArrivalTime: now,
          ownershipClaimTime: now,
        });
        ctx.__markSettled(id, chip.intent.cardId);
      }, remaining + Math.max(0, ownershipClaimDelayMs));
      timers.push(t);
    }
    return () => { for (const t of timers) window.clearTimeout(t); };
  }, [ctx, activeIds]);

  const overlay = overlayRootRef.current;
  if (!ctx || !overlay) return null;
  if (resolvedRef.current.size === 0) return null;

  const inspect = isCardTransportInspectMode();
  const easing = inspect ? INSPECT_EASING : NORMAL_EASING;

  const nodes: JSX.Element[] = [];
  for (const card of resolvedRef.current.values()) {
    nodes.push(
      <FlyingCard
        key={card.intent.id}
        card={card}
        containerRef={containerRef}
        easing={easing}
      />,
    );
  }

  return createPortal(<>{nodes}</>, overlay);
}

// ---------------------------------------------------------------------------
// FlyingCard — one transient flying node. Captures lifecycle samples
// (launch / midflight / arrival) with full computed-style snapshots so
// the dbg panel can prove the flight is a single continuous animation.
// ---------------------------------------------------------------------------

interface FlyingCardProps {
  card: RuntimeCard;
  containerRef: RefObject<HTMLElement>;
  easing: string;
}

function FlyingCard({ card, containerRef, easing }: FlyingCardProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const dx = card.to.x - card.from.x;
  const dy = card.to.y - card.from.y;
  const kf = `__cardFly_${card.intent.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const isHidden = card.intent.face === 'hidden';
  const cbc = card.intent.cardBackColors;
  const vf = card.intent.visibleFace;
  const bgColor = cbc?.color ?? '#00308F';
  const darkBgColor = cbc?.darkColor ?? '#001a4a';
  const hiddenBg = `linear-gradient(135deg, ${bgColor} 0%, ${darkBgColor} 100%)`;
  const suitChar = vf
    ? (vf.suit === 'hearts' ? '♥' : vf.suit === 'diamonds' ? '♦' : vf.suit === 'clubs' ? '♣' : '♠')
    : '';
  const suitColor = vf && (vf.suit === 'hearts' || vf.suit === 'diamonds') ? '#ef4444' : '#111827';

  useEffect(() => {
    const intentId = card.intent.id;
    const node = elRef.current;
    if (!node) return;

    const snapshot = (phase: CardTransportDbgSample['phase']) => {
      const target = node.firstElementChild as HTMLElement | null;
      const el = target ?? node;
      const cs = window.getComputedStyle(el);
      const container = containerRef.current;
      let rect = null as CardTransportDbgSample['rect'];
      if (container) {
        const r = el.getBoundingClientRect();
        const c = container.getBoundingClientRect();
        rect = { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
      }
      cardTransportDbgSample(intentId, {
        phase,
        t: performance.now(),
        animationName: cs.animationName,
        animationIterationCount: cs.animationIterationCount,
        animationPlayState: cs.animationPlayState,
        animationTimingFunction: cs.animationTimingFunction,
        animationDuration: cs.animationDuration,
        animationDelay: cs.animationDelay,
        transitionProperty: cs.transitionProperty,
        transitionDuration: cs.transitionDuration,
        transform: cs.transform,
        rect,
      });
    };

    // Synchronous snapshot at mount — animation has not yet kicked off
    // (delay phase). Captures the resolved CSS so we can see the
    // SINGLE animation token before any frames render.
    snapshot('launch');

    const startAt = card.delayMs;
    const midAt = card.delayMs + card.flightMs / 2;
    const endAt = card.delayMs + card.flightMs;

    const tLaunch = window.setTimeout(() => snapshot('launch'), Math.max(0, startAt + 16));
    const tMid    = window.setTimeout(() => snapshot('midflight'), midAt);
    const tEnd    = window.setTimeout(() => snapshot('arrival'), Math.max(0, endAt - 8));

    return () => {
      window.clearTimeout(tLaunch);
      window.clearTimeout(tMid);
      window.clearTimeout(tEnd);
      // Destroy snapshot — captured before React unmounts the element.
      try { snapshot('destroy'); } catch { /* */ }
      cardTransportDbgUpsert(intentId, {
        transportDestroyedTime: performance.now(),
      });
    };
  }, [card.intent.id, card.delayMs, card.flightMs, containerRef]);

  return (
    <div
      ref={elRef}
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
          borderRadius: 2,
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 6px 14px rgba(0,0,0,0.45)',
          background: isHidden ? hiddenBg : '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isHidden ? 'center' : 'space-between',
          padding: isHidden ? 0 : '2px 0',
          overflow: 'hidden',
          opacity: 0,
          animation: `${kf} ${card.flightMs}ms ${easing} ${card.delayMs}ms 1 forwards`,
          willChange: 'transform, opacity',
        }}
      >
        {isHidden ? (
          <div
            style={{
              width: '75%',
              height: '75%',
              background: `${bgColor}50`,
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 2,
            }}
          />
        ) : vf ? (
          <>
            <span style={{ fontSize: `${CARD_W * 0.55}px`, fontWeight: 900, lineHeight: 1, color: suitColor }}>{vf.rank}</span>
            <span style={{ fontSize: `${CARD_W * 0.7}px`, lineHeight: 1, color: suitColor }}>{suitChar}</span>
          </>
        ) : null}
      </div>
      <style>{`@keyframes ${kf} {
        from { transform: translate(0, 0); opacity: 1; }
        to   { transform: translate(${dx}px, ${dy}px); opacity: 1; }
      }`}</style>
    </div>
  );
}
