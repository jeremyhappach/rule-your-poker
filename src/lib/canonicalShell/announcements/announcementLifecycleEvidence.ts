import { recordShellEvent } from '../diagnostics';
import type { AnnouncementEvent } from './types';

type FinancialAnnouncementKind = 'pussy_tax' | 'reante';
type FinancialAnnouncementStage = 'disposition' | 'painted' | 'retired';

/**
 * Debug-gated, exact-identity evidence for 3-5-7 financial narration.
 * This is observability only: it never gates the rail, transport, or gameplay.
 */
export function recordFinancialAnnouncementEvidence(
  event: AnnouncementEvent,
  stage: FinancialAnnouncementStage,
  detail: Record<string, unknown> = {},
): void {
  const payload = event.payload;
  const kind = payload?.kind;
  if (kind !== 'pussy_tax' && kind !== 'reante') return;

  const gameId = event.scope.dealerGameId;
  if (!gameId) return;
  const handNumber = typeof payload?.handNumber === 'number' ? payload.handNumber : 0;
  const transferCursor = typeof payload?.transferCursor === 'number'
    ? payload.transferCursor
    : null;
  const financialKind: FinancialAnnouncementKind = kind;

  recordShellEvent('announcement-lifecycle', {
    gameId,
    gameType: '3-5-7',
    handNumber,
    detail: {
      stage,
      eventId: event.id,
      transientScope: event.transientScope ?? null,
      financialKind,
      transferCursor,
      ...detail,
    },
    dedupKey: [
      '357-financial-announcement',
      gameId,
      event.id,
      stage,
      String(detail.disposition ?? detail.reason ?? ''),
    ].join(':'),
  });
}
