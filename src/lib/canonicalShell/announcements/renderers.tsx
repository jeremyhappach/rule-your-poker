/**
 * Announcement renderers — pure presentational components keyed by
 * AnnouncementType. Reads only event payload; no game refs.
 */

import { LifecycleAnnouncement } from '@/components/LifecycleAnnouncement';
import type { AnnouncementEvent } from './types';

interface MatchWinPayload {
  winnerName?: string;
  amount?: number | string;
}

interface RoundWinPayload {
  winnerName?: string;
  amount?: number | string;
}

interface ChipAwardPayload {
  recipientName?: string;
  amount?: number | string;
  reason?: string;
}

interface WaitingPayload {
  seated?: number;
  needed?: number;
}

interface ConfiguringPayload {
  dealerName?: string;
}

export function renderAnnouncement(event: AnnouncementEvent): JSX.Element | null {
  switch (event.type) {
    case 'match_win': {
      const p = (event.payload ?? {}) as MatchWinPayload;
      return (
        <LifecycleAnnouncement
          title={p.winnerName ? `${p.winnerName} wins the match!` : 'Match won!'}
          subtitle={p.amount != null ? `+${p.amount}` : undefined}
        />
      );
    }
    case 'round_win': {
      const p = (event.payload ?? {}) as RoundWinPayload;
      return (
        <LifecycleAnnouncement
          title={p.winnerName ? `${p.winnerName} wins the round` : 'Round complete'}
          subtitle={p.amount != null ? `+${p.amount}` : undefined}
        />
      );
    }
    case 'chip_award': {
      const p = (event.payload ?? {}) as ChipAwardPayload;
      return (
        <LifecycleAnnouncement
          title={
            p.recipientName && p.amount != null
              ? `${p.recipientName} +${p.amount}`
              : 'Chips awarded'
          }
          subtitle={p.reason}
        />
      );
    }
    case 'dealer_configuring': {
      const p = (event.payload ?? {}) as ConfiguringPayload;
      return (
        <LifecycleAnnouncement
          title="Dealer configuring next game"
          subtitle={p.dealerName ? `${p.dealerName} is choosing…` : undefined}
        />
      );
    }
    case 'waiting_for_players': {
      const p = (event.payload ?? {}) as WaitingPayload;
      return (
        <LifecycleAnnouncement
          title="Waiting for players"
          subtitle={
            p.seated != null && p.needed != null
              ? `${p.seated} / ${p.needed} seated`
              : undefined
          }
        />
      );
    }
    default:
      return null;
  }
}
