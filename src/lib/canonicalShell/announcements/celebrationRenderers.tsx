/**
 * Celebration-tier renderers — keyed by AnnouncementType, returns a
 * centered overlay component (NOT the 36px lifecycle plate).
 *
 * These render inside CanonicalCelebrationLayer's absolute-inset
 * overlay. Pure presentational; reads only event payload.
 */

import type { AnnouncementEvent } from './types';

interface MatchWinPayload {
  winnerName?: string;
  amount?: number | string;
  score?: { winner?: number; loser?: number };
  /** Cribbage-specific. Other games may set undefined. */
  skunk?: 'single' | 'double';
}

function MatchWinCelebration({ payload }: { payload: MatchWinPayload }) {
  const skunkKind = payload.skunk;
  const skunkBanner =
    skunkKind === 'double' ? 'DOUBLE SKUNK!' : skunkKind === 'single' ? 'SKUNK!' : null;
  const baseTitle = payload.winnerName
    ? `${payload.winnerName} wins!`
    : 'Match won!';
  const score =
    payload.score && payload.score.winner != null && payload.score.loser != null
      ? `${payload.score.winner} — ${payload.score.loser}`
      : null;
  const amount = payload.amount != null ? `+${payload.amount}` : null;

  const accentClass = skunkKind === 'double'
    ? 'from-rose-500 via-amber-400 to-rose-500'
    : skunkKind === 'single'
      ? 'from-amber-400 via-yellow-300 to-amber-400'
      : 'from-poker-gold via-amber-300 to-poker-gold';

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none select-none animate-scale-in"
      style={{
        maxWidth: 'min(92vw, 460px)',
        textAlign: 'center',
      }}
    >
      {skunkBanner && (
        <div
          className={`mx-auto mb-2 inline-block rounded-md px-4 py-1 text-sm font-black tracking-[0.25em] text-amber-950 shadow-2xl border-2 border-amber-900 bg-gradient-to-r ${accentClass}`}
          style={{ textShadow: '0 1px 0 rgba(255,255,255,0.4)' }}
        >
          {skunkBanner}
        </div>
      )}
      <div
        className="rounded-2xl border-2 border-amber-900/80 bg-gradient-to-b from-amber-50 to-amber-100 px-6 py-5 shadow-2xl"
        style={{
          boxShadow:
            '0 20px 60px -10px rgba(0,0,0,0.6), 0 0 0 4px rgba(180,140,40,0.25), 0 0 40px rgba(255,200,80,0.35)',
        }}
      >
        <p className="text-xl font-extrabold leading-tight text-amber-950">
          {baseTitle}
        </p>
        {score && (
          <p className="mt-1 text-base font-bold text-amber-900/90 tabular-nums">
            {score}
          </p>
        )}
        {amount && (
          <p className="mt-2 inline-block rounded-full bg-amber-900 px-3 py-0.5 text-xs font-bold tracking-wider text-amber-100">
            {amount}
          </p>
        )}
      </div>
    </div>
  );
}

export function renderCelebration(event: AnnouncementEvent): JSX.Element | null {
  switch (event.type) {
    case 'match_win':
      return <MatchWinCelebration payload={(event.payload ?? {}) as MatchWinPayload} />;
    default:
      return null;
  }
}
