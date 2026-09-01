import { useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CanonicalCardBack } from './canonicalShell/CanonicalCardBack';
import {
  deriveThreeFiveSevenDecisionRevealFrame,
  revealDealerBubbleOrientation,
  revealStackDepthPx,
  type ThreeFiveSevenDecisionRevealClock,
  type ThreeFiveSevenDecisionRevealFrame,
} from '@/lib/threeFiveSeven/decisionReveal';

export interface ThreeFiveSevenRevealPlayer {
  id: string;
  user_id: string;
  position: number;
  status: string;
  sitting_out?: boolean | null;
  decision_locked?: boolean | null;
  current_decision?: string | null;
}

interface Props {
  clock: ThreeFiveSevenDecisionRevealClock | null;
  players: ThreeFiveSevenRevealPlayer[];
  currentUserId?: string;
  pendingDecision?: 'stay' | 'fold' | null;
  dealerPosition: number | null;
  cardCount: number;
}

interface Placement {
  playerId: string;
  position: number;
  decision: string | null;
  stackX: number;
  stackY: number;
  inwardX: number;
  inwardY: number;
  cardWidth: number;
  cardHeight: number;
}

interface BubblePlacement {
  position: number;
  orientation: 'local' | 'remote';
  x: number;
  y: number;
  tailAngleDeg: number;
}

const BUBBLE_FILL = '#a7f3d0';
const BUBBLE_BORDER = '#047857';

export function ThreeFiveSevenDecisionReveal({
  clock,
  players,
  currentUserId,
  pendingDecision,
  dealerPosition,
  cardCount,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [bubble, setBubble] = useState<BubblePlacement | null>(null);

  const eligiblePlayers = useMemo(() => players.filter((player) => (
    !player.sitting_out
    && player.status !== 'left'
    && player.status !== 'observer'
  )).map((player) => ({
    ...player,
    current_decision: player.current_decision
      ?? (player.user_id === currentUserId ? pendingDecision : null),
  })), [currentUserId, pendingDecision, players]);
  const signature = eligiblePlayers
    .map((player) => `${player.id}:${player.position}:${player.current_decision ?? ''}`)
    .join('|');

  useLayoutEffect(() => {
    if (!clock) return;
    let raf = 0;
    const tick = () => {
      setNowMs(Date.now());
      if (Date.now() + clock.serverOffsetMs < clock.window.endsAtMs) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clock]);

  useLayoutEffect(() => {
    if (!clock || eligiblePlayers.length === 0 || typeof document === 'undefined') {
      setPlacements([]);
      setBubble(null);
      return;
    }
    let raf = 0;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const felt = document.querySelector<HTMLElement>('[data-canonical-felt-surface]');
      const feltRect = felt?.getBoundingClientRect() ?? null;
      if (!feltRect || feltRect.width <= 0 || feltRect.height <= 0) {
        raf = requestAnimationFrame(measure);
        return;
      }
      const feltX = feltRect.left + feltRect.width / 2;
      const feltY = feltRect.top + feltRect.height / 2;
      // Dedicated theatrical geometry: about 1.7× the 44px primary hidden
      // card, constrained only by the live felt on narrow phones.
      const width = Math.round(Math.max(58, Math.min(76, feltRect.width * 0.19, feltRect.height * 0.3)));
      const height = Math.round(width * 1.5);
      const next: Placement[] = [];
      let dealerBubble: BubblePlacement | null = null;
      let missing = false;

      for (const player of eligiblePlayers) {
        const anchor = document.querySelector<HTMLElement>(`[data-chip-center="${player.position}"]`);
        if (!anchor) {
          missing = true;
          continue;
        }
        const rect = anchor.getBoundingClientRect();
        const anchorX = rect.left + rect.width / 2;
        const anchorY = rect.top + rect.height / 2;
        const distance = Math.hypot(feltX - anchorX, feltY - anchorY) || 1;
        const inwardX = (feltX - anchorX) / distance;
        const inwardY = (feltY - anchorY) / distance;
        const chipRadius = Math.max(rect.width, rect.height) / 2;
        // HOME is already seated at the local rail endpoint. Its theatrical
        // stack needs only enough inward travel to clear the chip, while
        // remote seats retain the deeper felt placement.
        const isLocalPlayer = player.user_id === currentUserId;
        const stackOffset = chipRadius + (isLocalPlayer
          ? Math.min(44, width * 0.48)
          : Math.min(82, width * 0.88));
        next.push({
          playerId: player.id,
          position: player.position,
          decision: player.current_decision ?? null,
          stackX: anchorX + inwardX * stackOffset,
          stackY: anchorY + inwardY * stackOffset,
          inwardX,
          inwardY,
          cardWidth: width,
          cardHeight: height,
        });
        if (player.position === dealerPosition) {
          const orientation = revealDealerBubbleOrientation(player.user_id, currentUserId);
          const bubbleOffset = chipRadius + 20;
          const tangentX = -inwardY;
          const tangentY = inwardX;
          // Local HOME uses the left side of its transfer endpoint, keeping
          // the bubble clear of the right-side legs UI. The stack remains on
          // the direct inward axis.
          const tangentOffset = orientation === 'local' ? -34 : 34;
          const bubbleX = anchorX + inwardX * bubbleOffset + tangentX * tangentOffset;
          const bubbleY = anchorY + inwardY * bubbleOffset + tangentY * tangentOffset;
          dealerBubble = {
            position: player.position,
            orientation,
            x: bubbleX,
            y: bubbleY,
            tailAngleDeg: (Math.atan2(anchorY - bubbleY, anchorX - bubbleX) * 180) / Math.PI,
          };
        }
      }

      setPlacements(next);
      setBubble(dealerBubble);
      if (missing) raf = requestAnimationFrame(measure);
    };

    raf = requestAnimationFrame(measure);
    const remeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
    };
  }, [clock, currentUserId, dealerPosition, eligiblePlayers, signature]);

  if (!clock || typeof document === 'undefined') return null;
  const frame = deriveThreeFiveSevenDecisionRevealFrame(clock, nowMs);
  if (!frame.active || placements.length === 0) return null;
  const stackDepth = revealStackDepthPx(cardCount);
  const bubbleText = frame.beat === 'hold' || frame.beat === 'locked' ? null : frame.beat;

  return createPortal(
    <div
      data-357-decision-reveal={clock.window.id}
      data-357-reveal-beat={frame.beat}
      className="pointer-events-none fixed inset-0 z-50"
      aria-live="polite"
    >
      {placements.map((placement) => (
        <RevealStack
          key={placement.playerId}
          placement={placement}
          cardCount={cardCount}
          stackDepth={stackDepth}
          frame={frame}
        />
      ))}
      {bubble && bubbleText ? (
        <div
          data-357-dealer-bubble={bubble.position}
          data-357-dealer-bubble-anchor={bubble.orientation}
          className="fixed flex items-center justify-center font-extrabold uppercase tracking-wide"
          style={{
            left: bubble.x,
            top: bubble.y,
            transform: 'translate(-50%, -50%)',
            width: 62,
            height: 38,
            borderRadius: 13,
            color: '#000',
            background: BUBBLE_FILL,
            border: `2px solid ${BUBBLE_BORDER}`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
            fontSize: bubbleText === 'DROP' ? 13 : 18,
          }}
        >
          <svg
            aria-hidden
            viewBox="0 0 16 14"
            className="absolute left-1/2 top-1/2"
            style={{
              width: 16,
              height: 14,
              overflow: 'visible',
              transform: `translate(-50%, -50%) rotate(${bubble.tailAngleDeg}deg) translate(36px, 0)`,
              transformOrigin: 'center',
              zIndex: -1,
            }}
          >
            <path
              d="M 1 1 L 15 7 L 1 13 Z"
              fill={BUBBLE_FILL}
              stroke={BUBBLE_BORDER}
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {bubbleText}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

function RevealStack({
  placement,
  cardCount,
  stackDepth,
  frame,
}: {
  placement: Placement;
  cardCount: number;
  stackDepth: number;
  frame: ThreeFiveSevenDecisionRevealFrame;
}) {
  const drops = frame.secrecyOpen && placement.decision === 'fold';
  const travel = drops ? frame.dropProgress * 20 : 0;
  const scale = drops ? 1 - frame.dropProgress * 0.12 : 1;
  const opacity = drops ? 1 - frame.dropProgress : 1;

  return (
    <div
      data-357-reveal-stack={placement.playerId}
      data-card-count={cardCount}
      data-stack-depth-px={stackDepth}
      data-decision-visible={frame.secrecyOpen ? (placement.decision ?? '') : 'locked'}
      className="fixed"
      style={{
        left: placement.stackX,
        top: placement.stackY,
        width: placement.cardWidth + stackDepth,
        height: placement.cardHeight + stackDepth,
        opacity,
        transform: `translate(-50%, -50%) translate(${placement.inwardX * travel}px, ${placement.inwardY * travel}px) scale(${scale})`,
        transformOrigin: 'center',
      }}
    >
      {Array.from({ length: cardCount }, (_, index) => {
        const edge = Math.min(stackDepth, cardCount - index - 1);
        return (
          <CanonicalCardBack
            key={index}
            widthPx={placement.cardWidth}
            heightPx={placement.cardHeight}
            variant="raised"
            dataAttrs={{ 'data-357-reveal-card': String(index) }}
            style={{
              position: 'absolute',
              left: edge,
              top: edge,
              zIndex: index + 1,
            }}
          />
        );
      })}
    </div>
  );
}
