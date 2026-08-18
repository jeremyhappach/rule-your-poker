import { useCallback, useEffect, useMemo, useRef } from 'react';
import type {
  ChipPresentationBatchSettled,
  ChipPresentationBatchStarted,
} from '@/lib/canonicalShell/ChipPresentationLedger';
import type { AnnouncementEvent } from '@/lib/canonicalShell/announcements/types';
import type { ThreeFiveSevenAllFoldPresentation } from './allFoldPresentation';
import {
  getThreeFiveSevenBatchStartAnnouncement,
  getThreeFiveSevenPussyTaxAnnouncement,
  getThreeFiveSevenReAnteAnnouncement,
  type ThreeFiveSevenCursorAnnouncement,
} from './announcementPresentation';
import type { ThreeFiveSevenRolloverPresentation } from './rolloverPresentation';

export const THREE_FIVE_SEVEN_FINANCIAL_NOTICE_TTL_MS = 2_500;

interface ThreeFiveSevenFinancialAnnouncementOwnerArgs {
  enabled: boolean;
  /** CanonicalAnnouncementProvider is scoped to the table session id. */
  announcementGameId: string | null | undefined;
  dealerGameId: string | null | undefined;
  pussyTax: ThreeFiveSevenAllFoldPresentation | null | undefined;
  reAnte: ThreeFiveSevenRolloverPresentation | null | undefined;
  emit: (event: AnnouncementEvent) => void;
  retireTransientScope: (scope: string) => void;
}

interface ThreeFiveSevenFinancialAnnouncementOwner {
  onBatchStarted: ChipPresentationBatchStarted;
  onBatchSettled: ChipPresentationBatchSettled;
}

function toCanonicalAnnouncementEvent(
  event: ThreeFiveSevenCursorAnnouncement,
  announcementGameId: string,
  onRetired: () => void,
): AnnouncementEvent {
  const common = {
    id: event.id,
    scope: { dealerGameId: announcementGameId, roundId: null },
    ttlMs: THREE_FIVE_SEVEN_FINANCIAL_NOTICE_TTL_MS,
    transientScope: event.scope,
    onRetired,
  } as const;

  if (event.kind === 'pussy_tax') {
    return {
      ...common,
      type: 'round_win',
      payload: {
        text: event.text,
        kind: event.kind,
        handNumber: event.handNumber,
        transferCursor: event.transferCursor,
      },
    };
  }

  return {
    ...common,
    type: 'peg_notice',
    payload: {
      title: event.text,
      kind: event.kind,
      handNumber: event.handNumber,
      transferCursor: event.transferCursor,
    },
  };
}

/**
 * Owns 3-5-7 financial narration from exact committed cursor identities.
 *
 * Realtime/transport is deliberately not the trigger. Every live client that
 * observes the committed tax or later-hand Round 1 identity publishes the
 * same semantic event exactly once. An animated batch may retire that event
 * at its real settlement edge; a reconciled/no-flight client receives the
 * same non-blocking notice until its short TTL expires.
 */
export function useThreeFiveSevenFinancialAnnouncementOwner({
  enabled,
  announcementGameId,
  dealerGameId,
  pussyTax,
  reAnte,
  emit,
  retireTransientScope,
}: ThreeFiveSevenFinancialAnnouncementOwnerArgs): ThreeFiveSevenFinancialAnnouncementOwner {
  const pussyTaxRef = useRef(pussyTax);
  const reAnteRef = useRef(reAnte);
  pussyTaxRef.current = pussyTax;
  reAnteRef.current = reAnte;

  const publishedIdsRef = useRef(new Set<string>());
  const activeEventsRef = useRef(new Map<string, ThreeFiveSevenCursorAnnouncement>());
  const startedBatchesRef = useRef(new Map<string, ThreeFiveSevenCursorAnnouncement>());
  const retireTransientScopeRef = useRef(retireTransientScope);
  retireTransientScopeRef.current = retireTransientScope;

  const pussyTaxEvent = getThreeFiveSevenPussyTaxAnnouncement(pussyTax);
  const reAnteEvent = getThreeFiveSevenReAnteAnnouncement(reAnte);

  const publish = useCallback((event: ThreeFiveSevenCursorAnnouncement | null) => {
    if (!enabled || !announcementGameId || !event) return;
    if (publishedIdsRef.current.has(event.id)) return;

    // Shared player/pot endpoints serialize tax before re-ante. Retire any
    // remaining tax plate synchronously before its successor is submitted so
    // the two exact semantic events never compete in the canonical rail.
    if (event.kind === 'reante') {
      for (const active of activeEventsRef.current.values()) {
        if (active.kind === 'pussy_tax') {
          retireTransientScope(active.scope);
        }
      }
    }

    publishedIdsRef.current.add(event.id);
    activeEventsRef.current.set(event.id, event);
    emit(toCanonicalAnnouncementEvent(event, announcementGameId, () => {
      activeEventsRef.current.delete(event.id);
    }));
  }, [announcementGameId, emit, enabled, retireTransientScope]);

  useEffect(() => {
    publish(pussyTaxEvent);
    publish(reAnteEvent);
  }, [publish, pussyTaxEvent, reAnteEvent]);

  const onBatchStarted = useCallback<ChipPresentationBatchStarted>((batch) => {
    if (!enabled || startedBatchesRef.current.has(batch.id)) return;
    const event = getThreeFiveSevenBatchStartAnnouncement(
      batch,
      pussyTaxRef.current,
      reAnteRef.current,
    );
    if (event) startedBatchesRef.current.set(batch.id, event);
  }, [enabled]);

  const onBatchSettled = useCallback<ChipPresentationBatchSettled>((batch) => {
    const event = startedBatchesRef.current.get(batch.id) ?? null;
    if (!event) return;
    startedBatchesRef.current.delete(batch.id);
    retireTransientScopeRef.current(event.scope);
    activeEventsRef.current.delete(event.id);
  }, []);

  const boundary = enabled
    ? `${announcementGameId ?? 'no-game'}:${dealerGameId ?? 'no-dealer-game'}`
    : 'disabled';
  useEffect(() => () => {
    for (const active of activeEventsRef.current.values()) {
      retireTransientScopeRef.current(active.scope);
    }
    activeEventsRef.current.clear();
    startedBatchesRef.current.clear();
    publishedIdsRef.current.clear();
  }, [boundary]);

  return useMemo(() => ({ onBatchStarted, onBatchSettled }), [onBatchSettled, onBatchStarted]);
}
