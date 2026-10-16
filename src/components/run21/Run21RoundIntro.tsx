import type {BoardProjection as Projection} from '@/lib/run21/model';
import {roundIntro} from '@/lib/run21/roundIntro';

/** Board-local information only. Persisted authority determines when play is released. */
export function Run21RoundIntro({view, now}: {view: Projection; now: number}) {
  const intro = roundIntro(view, now);
  if (!intro) return null;
  return <div className="run21-round-intro" data-run21-round-intro data-fading={intro.remaining <= 200 && view.pausedAt == null}>
    <div className="run21-round-intro-card" role="status" aria-live="polite" aria-atomic="true">
      <svg className="run21-boxing-bell" viewBox="0 0 100 80" aria-hidden="true">
        <path d="M19 65h62v7H19z" fill="#533a27"/>
        <circle cx="50" cy="35" r="29" fill="#b77d2e" stroke="#f4d38c" strokeWidth="2"/>
        <circle cx="50" cy="35" r="22" fill="#d9a74c" stroke="#ffe5a0"/>
        <path d="M33 24a20 20 0 0 1 24-7" fill="none" stroke="#fff1c4" strokeWidth="3" strokeLinecap="round"/>
        <circle cx="50" cy="35" r="5" fill="#805321"/>
        <path d="m74 49 14 17" stroke="#ab8460" strokeWidth="6" strokeLinecap="round"/>
        <path d="m70 44 8 9" stroke="#ead7a6" strokeWidth="10" strokeLinecap="round"/>
      </svg>
      <strong>ROUND {intro.round}</strong><span>{intro.label}</span>
    </div>
  </div>;
}
