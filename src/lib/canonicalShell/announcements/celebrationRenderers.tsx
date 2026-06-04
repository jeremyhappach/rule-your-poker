/**
 * Celebration-tier renderers — keyed by AnnouncementType.
 *
 * Skunk / double-skunk is a shell-owned restoration of the legacy
 * Cribbage full-game overlay contract, not a winner card, rail plate,
 * or dealer-style terminal message.
 */

import { useEffect, useRef, useState } from 'react';
import type { AnnouncementEvent } from './types';
import { recordAnnouncementDebugEvent } from './announcementDebugLog';

interface MatchWinPayload {
  winnerName?: string;
  amount?: number | string;
  score?: { winner?: number; loser?: number };
  /** Cribbage-specific. Other games may set undefined. */
  skunk?: 'single' | 'double';
}

function MatchWinCelebration({ payload, eventId }: { payload: MatchWinPayload; eventId?: string }) {
  const skunkKind = payload.skunk;
  if (!skunkKind) return null;

  return <LegacySkunkOverlay multiplier={skunkKind === 'double' ? 3 : 2} eventId={eventId} />;
}

function LegacySkunkOverlay({ multiplier, eventId }: { multiplier: number; eventId?: string }) {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // [DOUBLE-SKUNK REPLAY INSTRUMENTATION] Gap 3 — overlay mount
    recordAnnouncementDebugEvent('layer-mount', 'LegacySkunkOverlay mount', { multiplier, eventId });
    timersRef.current = [
      setTimeout(() => setPhase('show'), 100),
      setTimeout(() => setPhase('exit'), 3600),
    ];

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      // [DOUBLE-SKUNK REPLAY INSTRUMENTATION] Gap 3 — overlay unmount
      recordAnnouncementDebugEvent('layer-unmount', 'LegacySkunkOverlay unmount', { multiplier, eventId });
    };
  }, [multiplier, eventId]);

  const isDoubleSkunk = multiplier >= 3;
  const title = isDoubleSkunk ? 'DOUBLE SKUNK!' : 'SKUNK!';
  const subtitle = isDoubleSkunk ? '3x Payout!' : '2x Payout!';

  return (
    <div 
      role="status"
      aria-live="polite"
      className={`
        absolute inset-0 z-[100] flex flex-col items-center justify-center
        bg-black/80 backdrop-blur-sm transition-opacity duration-500
        ${phase === 'enter' ? 'opacity-0' : phase === 'exit' ? 'opacity-0' : 'opacity-100'}
      `}
    >
      <div 
        className={`
          flex items-center gap-4 mb-4 transition-all duration-500
          ${phase === 'show' ? 'scale-100 translate-y-0' : 'scale-50 translate-y-8'}
        `}
      >
        <span 
          className="text-7xl animate-bounce" 
          style={{ animationDelay: '0ms', animationDuration: '1s' }}
        >
          🦨
        </span>
        {isDoubleSkunk && (
          <span 
            className="text-7xl animate-bounce" 
            style={{ animationDelay: '150ms', animationDuration: '1s' }}
          >
            🦨
          </span>
        )}
      </div>

      <h2 
        className={`
          text-4xl font-black text-white drop-shadow-lg
          transition-all duration-500
          ${phase === 'show' ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}
        `}
        style={{
          textShadow: '0 0 20px rgba(255, 255, 255, 0.5), 0 0 40px rgba(255, 200, 0, 0.3)',
        }}
      >
        {title}
      </h2>

      <p 
        className={`
          text-xl font-bold text-amber-400 mt-2
          transition-all duration-500 delay-100
          ${phase === 'show' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        `}
      >
        {subtitle}
      </p>
    </div>
  );
}

export function renderCelebration(event: AnnouncementEvent): JSX.Element | null {
  switch (event.type) {
    case 'match_win':
      return <MatchWinCelebration payload={(event.payload ?? {}) as MatchWinPayload} eventId={event.id} />;
    default:
      return null;
  }
}
