import type { AnnouncementEvent } from '@/lib/canonicalShell/announcements/types';

type ScoringRail = {
  emit: (event: AnnouncementEvent) => void;
  retireTransientScope: (scope: string) => void;
};

export const cribbageScoringScope = (gameId: string, roundId: string | null) =>
  `cribbage-score:${gameId}:${roundId ?? 'no-round'}`;

/** Replace only this hand's scoring notice, preserving canonical priority. */
export function publishCribbageScoringNotice(rail: ScoringRail, notice: {
  gameId: string; roundId: string | null; id: string; title: string; ttlMs: number;
  onRetired?: (reason: string) => void;
}) {
  const transientScope = cribbageScoringScope(notice.gameId, notice.roundId);
  rail.retireTransientScope(transientScope);
  rail.emit({
    id: notice.id, type: 'peg_notice',
    scope: { dealerGameId: notice.gameId, roundId: notice.roundId },
    transientScope, payload: { title: notice.title }, ttlMs: notice.ttlMs,
    // The provider may retire while resolving a React state update. Deliver
    // completion after that update, never set game component state in its render.
    ...(notice.onRetired ? { onRetired: (_id, reason) => queueMicrotask(() => notice.onRetired?.(reason)) } : {}),
  });
}
