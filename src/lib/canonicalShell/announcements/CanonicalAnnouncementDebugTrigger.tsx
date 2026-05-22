/**
 * CanonicalAnnouncementDebugTrigger — shell-owned debug surface for
 * validating both transient and ambient announcement tracks.
 *
 * Visibility: localStorage `ptp_announcement_debug=1` or
 * URL `?announcement_debug=1`. Off by default.
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

const TRANSIENT: AnnouncementType[] = ['match_win', 'round_win', 'chip_award'];
const AMBIENT: AnnouncementType[] = [
  'dealer_configuring',
  'dealer_selection_in_progress',
  'waiting_for_players',
  'waiting_for_player',
  'waiting_for_next_round',
];

interface Props {
  dealerGameId?: string | null;
  roundId?: string | null;
}

export function CanonicalAnnouncementDebugTrigger({ dealerGameId = null, roundId = null }: Props) {
  const { emit, clearAmbient } = useAnnouncements();
  if (!debugEnabled()) return null;

  const fire = (type: AnnouncementType) => {
    emit({
      id: `debug:${type}:${Date.now()}`,
      type,
      scope: { dealerGameId, roundId },
      payload: {
        winnerName: 'Debug',
        recipientName: 'Debug',
        playerName: 'Debug',
        amount: 42,
        reason: 'debug trigger',
        dealerName: 'Debug',
        gameType: 'cribbage',
        seated: 2,
        needed: 4,
        context: 'debug context',
      },
    });
  };

  const btn = (label: string, onClick: () => void, color = '#0f3460') => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      style={{
        fontSize: 10,
        padding: '2px 6px',
        background: color,
        color: '#fff',
        border: '1px solid #1e3a5f',
        borderRadius: 3,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      {label}
    </button>
  );

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
        background: 'rgba(0,0,0,0.75)',
        border: '1px solid #10b981',
        borderRadius: 6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        maxWidth: 220,
      }}
    >
      <div style={{ color: '#10b981', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em' }}>
        ANNOUNCE · TRANSIENT
      </div>
      {TRANSIENT.map((t) => btn(t, () => fire(t)))}
      <div style={{ color: '#fbbf24', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', marginTop: 4 }}>
        ANNOUNCE · AMBIENT
      </div>
      {AMBIENT.map((t) => btn(t, () => fire(t), '#3a2f0f'))}
      {btn('clear ambient', () => clearAmbient(), '#5c1f1f')}
    </div>
  );
}
