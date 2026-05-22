/**
 * CanonicalAnnouncementDebugTrigger — temporary shell-owned debug
 * surface for validating the canonical announcement pipeline without
 * relying on console emit injection.
 *
 * Visibility: gated by localStorage `ptp_announcement_debug=1` or URL
 * `?announcement_debug=1`. Off by default. Pointer-events on.
 *
 * Remove (or keep behind the flag) once Cribbage canonical migration
 * exercises the pipeline organically.
 */

import { useAnnouncements } from './CanonicalAnnouncementProvider';
import type { AnnouncementType } from './types';

function debugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage?.getItem('ptp_announcement_debug') === '1') return true;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('announcement_debug') === '1') return true;
  } catch {
    /* noop */
  }
  return false;
}

const TYPES: AnnouncementType[] = [
  'match_win',
  'round_win',
  'chip_award',
  'dealer_configuring',
  'waiting_for_players',
];

interface Props {
  dealerGameId?: string | null;
  roundId?: string | null;
}

export function CanonicalAnnouncementDebugTrigger({ dealerGameId = null, roundId = null }: Props) {
  const { emit } = useAnnouncements();
  if (!debugEnabled()) return null;

  const fire = (type: AnnouncementType) => {
    emit({
      id: `debug:${type}:${Date.now()}`,
      type,
      scope: { dealerGameId, roundId },
      payload: {
        winnerName: 'Debug',
        recipientName: 'Debug',
        amount: 42,
        reason: 'debug trigger',
        dealerName: 'Debug',
        seated: 2,
        needed: 4,
      },
    });
  };

  return (
    <div
      data-canonical-announcement-debug-trigger=""
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        zIndex: 9998,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 6,
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid #10b981',
        borderRadius: 6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      <div style={{ color: '#10b981', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em' }}>
        ANNOUNCE DEBUG
      </div>
      {TYPES.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => fire(t)}
          style={{
            fontSize: 10,
            padding: '2px 6px',
            background: '#0f3460',
            color: '#fff',
            border: '1px solid #1e3a5f',
            borderRadius: 3,
            cursor: 'pointer',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
