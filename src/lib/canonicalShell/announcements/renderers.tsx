/**
 * Announcement renderers — pure presentational components keyed by
 * AnnouncementType. Reads only event payload; no game refs.
 */

import { LifecycleAnnouncement } from '@/components/LifecycleAnnouncement';
import type { AnnouncementEvent } from './types';

interface NamedAmount {
  winnerName?: string;
  recipientName?: string;
  amount?: number | string;
  reason?: string;
}

interface WaitingPayload {
  seated?: number;
  needed?: number;
  playerName?: string;
  context?: string;
}

interface ConfiguringPayload {
  dealerName?: string;
  gameType?: string;
}

export function renderAnnouncement(event: AnnouncementEvent): JSX.Element | null {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  switch (event.type) {
    case 'match_win': {
      const x = p as NamedAmount;
      return (
        <LifecycleAnnouncement
          title={x.winnerName ? `${x.winnerName} wins the match!` : 'Match won!'}
          subtitle={x.amount != null ? `+${x.amount}` : undefined}
        />
      );
    }
    case 'round_win': {
      const x = p as NamedAmount;
      return (
        <LifecycleAnnouncement
          title={x.winnerName ? `${x.winnerName} wins the round` : 'Round complete'}
          subtitle={x.amount != null ? `+${x.amount}` : undefined}
        />
      );
    }
    case 'chip_award': {
      const x = p as NamedAmount;
      return (
        <LifecycleAnnouncement
          title={
            x.recipientName && x.amount != null
              ? `${x.recipientName} +${x.amount}`
              : 'Chips awarded'
          }
          subtitle={x.reason}
        />
      );
    }
    case 'dealer_configuring': {
      const x = p as ConfiguringPayload;
      return (
        <LifecycleAnnouncement
          title={x.gameType ? `Setting up ${x.gameType}…` : 'Dealer configuring next game'}
          subtitle={x.dealerName ? `${x.dealerName} is choosing` : 'Please wait…'}
        />
      );
    }
    case 'dealer_selection_in_progress': {
      return (
        <LifecycleAnnouncement
          title="Selecting next dealer"
          subtitle="Drawing for the cut…"
        />
      );
    }
    case 'waiting_for_players': {
      const x = p as WaitingPayload;
      return (
        <LifecycleAnnouncement
          title="Waiting for players"
          subtitle={
            x.seated != null && x.needed != null
              ? `${x.seated} / ${x.needed} seated`
              : undefined
          }
        />
      );
    }
    case 'waiting_for_player': {
      const x = p as WaitingPayload;
      return (
        <LifecycleAnnouncement
          title={x.playerName ? `Waiting on ${x.playerName}` : 'Waiting on player'}
          subtitle={x.context}
        />
      );
    }
    case 'waiting_for_next_round': {
      const x = p as WaitingPayload;
      return (
        <LifecycleAnnouncement
          title="Next round starting…"
          subtitle={x.context ?? 'Hold tight'}
        />
      );
    }
    default:
      return null;
  }
}
