/**
 * Announcement renderers — pure presentational components keyed by
 * AnnouncementType. Reads only event payload; no game refs.
 */

import { LifecycleAnnouncement } from '@/components/LifecycleAnnouncement';
import type { AnnouncementEvent } from './types';

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

function renderTextWithPotContext(text: string, potText?: string): JSX.Element {
  return potText
    ? <LifecycleAnnouncement title={potText} subtitle={text} />
    : <LifecycleAnnouncement title={text} />;
}

export function renderAnnouncement(event: AnnouncementEvent): JSX.Element | null {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  switch (event.type) {
    case 'match_win': {
      // Winner card renders in the lifecycle rail for both active
      // players and observers. Skunk/double-skunk centered overlays
      // are rendered IN ADDITION by CanonicalCelebrationLayer; this
      // rail plate is the canonical "who won" announcement.
      const x = p as {
        text?: string;
        winnerName?: string;
        amount?: number | string;
        score?: { winner?: number; loser?: number };
        skunk?: 'single' | 'double';
        potText?: string;
      };
      // Free-form `text` payload (used by Holm / 3-5-7 / Horses) takes
      // precedence — those games already build a localized result
      // string we want to render verbatim.
      if (x.text) return renderTextWithPotContext(x.text, x.potText);
      const skunkPrefix =
        x.skunk === 'double' ? 'DOUBLE SKUNK! ' : x.skunk === 'single' ? 'SKUNK! ' : '';
      const title = x.winnerName
        ? `${skunkPrefix}${x.winnerName} wins`
        : `${skunkPrefix}Match won`;
      const scorePart =
        x.score && x.score.winner != null && x.score.loser != null
          ? `${x.score.winner} — ${x.score.loser}`
          : undefined;
      const amountPart = x.amount != null ? `+${x.amount}` : undefined;
      const subtitle = [scorePart, amountPart].filter(Boolean).join(' · ') || undefined;
      return <LifecycleAnnouncement title={title} subtitle={subtitle} />;
    }
    case 'round_win': {
      const x = p as RoundWinPayload & { text?: string; potText?: string };
      // Free-form `text` override for non-Cribbage games (Holm chop,
      // 3-5-7 showdown summary, etc.) — render verbatim.
      if (x.text) return renderTextWithPotContext(x.text, x.potText);
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
    case 'game_paused': {
      const x = p as { hostName?: string };
      return (
        <LifecycleAnnouncement
          title={`Game is paused - only ${x.hostName || 'the session host'} can resume`}
        />
      );
    }
    case 'session_ended': {
      return <LifecycleAnnouncement title="Session Ended" />;
    }
    case 'waiting_for_players': {
      const x = p as WaitingPayload & { text?: string; subtitle?: string };
      return (
        <LifecycleAnnouncement
          title={x.text ?? 'Waiting for Players'}
          subtitle={
            x.subtitle ??
            (x.seated != null && x.needed != null
              ? `${x.seated} / ${x.needed} seated`
              : undefined)
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
    case 'awaiting_ante': {
      const x = p as { context?: string; deadline?: string };
      return (
        <LifecycleAnnouncement
          title="Awaiting ante decisions"
          subtitle={x.context ?? 'Choose to ante or sit out'}
        />
      );
    }
    case 'awaiting_discards': {
      // Progress count is intentionally omitted — the per-actor primary
      // action button ("Send to Crib (n/total)") already surfaces it.
      // The rail plate is the shared phase label only.
      return <LifecycleAnnouncement title="Waiting on Discards" />;
    }
    case 'solo_showdown': {
      const x = p as { potText?: string; text?: string };
      return x.potText
        ? <LifecycleAnnouncement title={x.potText} subtitle={x.text} />
        : x.text
          ? <LifecycleAnnouncement title={x.text} />
          : null;
    }
    case 'cta_prompt': {
      // Actor-only CTA plate. Visibility gating on
      // payload.actorUserId === viewerUserId is the responsibility of
      // the rail layer (added alongside the first game cutover that
      // emits cta_prompt). Observers see the matching `waiting_for_player`
      // ambient instead, emitted by the same game.
      const x = p as { title?: string; subtitle?: string; variant?: string };
      if (!x.title) return null;
      return <LifecycleAnnouncement title={x.title} subtitle={x.subtitle} />;
    }
    case 'peg_notice': {
      // Lightweight non-blocking gameplay notice. MUST NOT carry
      // timing or progression implications. Anything that gates
      // progression is an overlay (Phase 3), not a rail event.
      const x = p as { title?: string; subtitle?: string; variant?: string };
      const title = x.title ?? (x.variant === 'go' ? 'Go' : null);
      if (!title) return null;
      return <LifecycleAnnouncement title={title} subtitle={x.subtitle} />;
    }
    case 'dealing_next_hand': {
      return <LifecycleAnnouncement title="Dealing Next Hand…" />;
    }

    default:
      // Exhaustiveness check — fail loudly in dev if a new
      // AnnouncementType is added without a renderer case.
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.error(
          '[canonical-rail] Missing renderer for AnnouncementType:',
          (event as { type?: string }).type,
        );
      }
      return null;
  }
}
