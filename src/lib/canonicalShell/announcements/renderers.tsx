/**
 * Announcement renderers — pure presentational components keyed by
 * AnnouncementType. Reads only event payload; no game refs.
 */

import { LifecycleAnnouncement } from '@/components/LifecycleAnnouncement';
import type { AnnouncementEvent } from './types';

interface MatchWinPayload {
  winnerName?: string;
  amount?: number | string;
  score?: { winner?: number; loser?: number };
  /** Cribbage-specific. Other games may set undefined. */
  skunk?: 'single' | 'double';
}

interface RoundWinPayload {
  winnerName?: string;
  amount?: number | string;
  /** Cribbage: 'hand' | 'crib'. Other games may set undefined. */
  kind?: 'hand' | 'crib' | string;
  counts?: {
    fifteens?: number;
    pairs?: number;
    runs?: number;
    flush?: number;
    his_nobs?: number;
  };
}

interface ChipAwardPayload {
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

interface DealerSelectedPayload {
  dealerName?: string;
  /** Optional: the high card the new dealer drew. */
  cardLabel?: string;
}

function formatCounts(counts?: RoundWinPayload['counts']): string | undefined {
  if (!counts) return undefined;
  const parts: string[] = [];
  if (counts.fifteens) parts.push(`15s ${counts.fifteens}`);
  if (counts.pairs) parts.push(`pairs ${counts.pairs}`);
  if (counts.runs) parts.push(`runs ${counts.runs}`);
  if (counts.flush) parts.push(`flush ${counts.flush}`);
  if (counts.his_nobs) parts.push(`nobs ${counts.his_nobs}`);
  return parts.length ? parts.join(' · ') : undefined;
}

export function renderAnnouncement(event: AnnouncementEvent): JSX.Element | null {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  switch (event.type) {
    case 'match_win': {
      const x = p as MatchWinPayload;
      const skunkLabel =
        x.skunk === 'double'
          ? 'DOUBLE SKUNK!'
          : x.skunk === 'single'
            ? 'SKUNK!'
            : null;
      const baseTitle = x.winnerName ? `${x.winnerName} wins the match!` : 'Match won!';
      const title = skunkLabel ? `${skunkLabel} ${baseTitle}` : baseTitle;
      const scoreLine =
        x.score && x.score.winner != null && x.score.loser != null
          ? `${x.score.winner} – ${x.score.loser}`
          : x.amount != null
            ? `+${x.amount}`
            : undefined;
      return <LifecycleAnnouncement title={title} subtitle={scoreLine} />;
    }
    case 'round_win': {
      const x = p as RoundWinPayload;
      const kindLabel =
        x.kind === 'crib'
          ? 'Crib counts'
          : x.kind === 'hand'
            ? 'Hand counts'
            : null;
      const title = x.winnerName
        ? kindLabel
          ? `${kindLabel}: ${x.winnerName}`
          : `${x.winnerName} wins the round`
        : 'Round complete';
      const subtitle =
        formatCounts(x.counts) ?? (x.amount != null ? `+${x.amount}` : undefined);
      return <LifecycleAnnouncement title={title} subtitle={subtitle} />;
    }
    case 'chip_award': {
      const x = p as ChipAwardPayload;
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
    case 'dealer_selected': {
      const x = p as DealerSelectedPayload;
      return (
        <LifecycleAnnouncement
          title={x.dealerName ? `${x.dealerName} deals` : 'Dealer selected'}
          subtitle={x.cardLabel ? `High card: ${x.cardLabel}` : undefined}
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
      const x = p as { cohort?: number; tie?: boolean };
      return (
        <LifecycleAnnouncement
          title={x.tie ? 'Tie — redrawing for dealer' : 'Selecting next dealer'}
          subtitle={
            x.cohort != null && x.cohort > 0
              ? `Redraw ${x.cohort}`
              : 'Drawing for high card…'
          }
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
