import { useEffect, useRef, useState } from 'react';
import type { Card as CardType } from '@/lib/cardUtils';
import { isCardFaceResolved } from '@/lib/cardGames/resolvedCardFace';
import { PlayingCard } from './PlayingCard';
import { CanonicalCardBack } from './canonicalShell/CanonicalCardBack';

export const HOLM_CHUCKY_FLIP_MS = 600;

type HolmChuckyFlipState = 'hidden' | 'flipping' | 'revealed';

interface HolmChuckyRevealCardProps {
  card: CardType;
  presentationKey: string;
  revealed: boolean;
  faceFillPx?: number;
  dimmed?: boolean;
  onRevealComplete?: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Presentation-only Chucky card flip.
 *
 * The parent-owned reveal scheduler decides when `revealed` advances. This
 * component only animates that admitted edge and reports when the visible flip
 * has finished. A card that first mounts already revealed (rejoin/historical
 * state) reconciles face-up immediately instead of replaying an old reveal.
 */
export function HolmChuckyRevealCard({
  card,
  presentationKey,
  revealed,
  faceFillPx,
  dimmed = false,
  onRevealComplete,
}: HolmChuckyRevealCardProps) {
  const faceResolved = isCardFaceResolved(card);
  const revealReady = revealed && faceResolved;
  const [flipState, setFlipState] = useState<HolmChuckyFlipState>(
    revealReady ? 'revealed' : 'hidden',
  );
  const mountedRef = useRef(false);
  const presentationKeyRef = useRef(presentationKey);
  const revealedRef = useRef(revealReady);
  const completedKeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRevealCompleteRef = useRef(onRevealComplete);

  useEffect(() => {
    onRevealCompleteRef.current = onRevealComplete;
  }, [onRevealComplete]);

  useEffect(() => {
    const clearFlipTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const completeReveal = () => {
      if (completedKeyRef.current === presentationKey) return;
      completedKeyRef.current = presentationKey;
      onRevealCompleteRef.current?.();
    };

    if (!mountedRef.current) {
      mountedRef.current = true;
      presentationKeyRef.current = presentationKey;
      revealedRef.current = revealReady;
      if (revealReady) completeReveal();
      return;
    }

    if (presentationKeyRef.current !== presentationKey) {
      clearFlipTimer();
      presentationKeyRef.current = presentationKey;
      revealedRef.current = revealReady;
      completedKeyRef.current = null;
      setFlipState(revealReady ? 'revealed' : 'hidden');
      if (revealReady) completeReveal();
      return;
    }

    // Reveal is monotonic within one exact hand/card identity. Regressive
    // presentation props cannot turn a completed Chucky card face-down.
    if (!faceResolved) {
      clearFlipTimer();
      revealedRef.current = false;
      setFlipState('hidden');
      return;
    }
    if (!revealReady || revealedRef.current) return;
    revealedRef.current = true;

    if (prefersReducedMotion()) {
      setFlipState('revealed');
      completeReveal();
      return;
    }

    setFlipState('flipping');
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setFlipState('revealed');
      completeReveal();
    }, HOLM_CHUCKY_FLIP_MS);
  }, [presentationKey, revealReady, faceResolved]);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  // Render a new identity from its incoming truth immediately; the passive
  // reset below must never permit one paint of the previous hand's face.
  const renderedFlipState = presentationKeyRef.current === presentationKey
    ? flipState
    : revealReady
      ? 'revealed'
      : 'hidden';
  const faceUp = faceResolved && renderedFlipState !== 'hidden';
  const transition = renderedFlipState === 'flipping'
    ? `transform ${HOLM_CHUCKY_FLIP_MS}ms ease-in-out`
    : 'none';

  return (
    <div
      data-holm-chucky-flip-card=""
      data-holm-chucky-flip-state={renderedFlipState}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        perspective: '600px',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transition,
          transform: faceUp ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        <div
          aria-hidden={faceUp}
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          <CanonicalCardBack
            widthPx={40}
            heightPx={60}
            variant="raised"
            radiusPx={4}
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        <div
          aria-hidden={!faceUp}
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {faceResolved && <PlayingCard
            card={card}
            size="lg"
            tier="medium"
            borderColor="border-red-500"
            isDimmed={dimmed}
            style={{ width: '100%', height: '100%' }}
            faceFillPx={faceFillPx}
          />}
        </div>
      </div>
    </div>
  );
}
