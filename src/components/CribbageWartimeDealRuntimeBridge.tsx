/**
 * CribbageWartimeDealRuntimeBridge — mounted inside DealRuntime context.
 *
 * Watches shell-owned DealRuntime state for the current hand and emits
 * DIRECT wartime events on value changes. Also maintains active
 * DealRuntime identity in the wartime ambient identity.
 *
 * Instrumentation only — no gameplay effects.
 */

import { useEffect, useRef } from 'react';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import {
  recordCribbageWartime,
  setCribbageWartimeIdentity,
} from '@/lib/cribbage/cribbageWartimeLedger';

interface Props {
  handContextId: string;
  selfPlayerId: string;
}

export function CribbageWartimeDealRuntimeBridge({ handContextId, selfPlayerId }: Props) {
  const deal = useDealRuntime();
  const lastPhaseRef = useRef<string | null>(null);
  const lastExpectedRef = useRef<number | null>(null);
  const lastSettledCountRef = useRef<number>(-1);
  const lastLocalSettledRef = useRef<number>(-1);
  const lastActiveRef = useRef<number>(-1);
  const lastReadyReleasedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!deal) return;

    // Identity
    setCribbageWartimeIdentity({
      dealRuntimePhase: deal.phase,
      handContextId,
    });

    if (lastPhaseRef.current !== deal.phase) {
      recordCribbageWartime('deal', 'dealruntime_phase_changed', {
        handContextId,
        prevPhase: lastPhaseRef.current,
        phase: deal.phase,
        expectedCount: deal.expectedCount,
        settledCount: deal.settledCardIds.size,
        activeIntents: deal.activeIntentsForHand,
        readyReleased: deal.readyReleased,
      }, {
        producerComponent: 'CribbageWartimeDealRuntimeBridge',
        producerFunction: 'phaseEffect',
        dedupeKey: `phase:${handContextId}:${deal.phase}`,
      });
      lastPhaseRef.current = deal.phase;
    }

    if (lastExpectedRef.current !== deal.expectedCount) {
      recordCribbageWartime('deal', 'dealruntime_expected_changed', {
        handContextId, prev: lastExpectedRef.current, expectedCount: deal.expectedCount,
      }, {
        producerComponent: 'CribbageWartimeDealRuntimeBridge',
        producerFunction: 'expectedEffect',
        dedupeKey: `expected:${handContextId}:${deal.expectedCount}`,
      });
      lastExpectedRef.current = deal.expectedCount;
    }

    const settledCount = deal.settledCardIds.size;
    if (lastSettledCountRef.current !== settledCount) {
      recordCribbageWartime('deal', 'settled_count_changed', {
        handContextId, prev: lastSettledCountRef.current, settledCount,
        expectedCount: deal.expectedCount, phase: deal.phase,
      }, {
        producerComponent: 'CribbageWartimeDealRuntimeBridge',
        producerFunction: 'settledCountEffect',
        dedupeKey: `settledCount:${handContextId}:${settledCount}`,
      });
      lastSettledCountRef.current = settledCount;
    }

    const localSettled = deal.getSettledCountForPlayer(selfPlayerId);
    if (lastLocalSettledRef.current !== localSettled) {
      recordCribbageWartime('deal', 'settled_local_count_changed', {
        handContextId, selfPlayerId,
        prev: lastLocalSettledRef.current, localSettled,
        phase: deal.phase,
      }, {
        producerComponent: 'CribbageWartimeDealRuntimeBridge',
        producerFunction: 'localSettledEffect',
        dedupeKey: `localSettled:${handContextId}:${localSettled}`,
      });
      lastLocalSettledRef.current = localSettled;
    }

    if (lastActiveRef.current !== deal.activeIntentsForHand) {
      recordCribbageWartime('deal', 'dealruntime_active_intents_changed', {
        handContextId, prev: lastActiveRef.current, active: deal.activeIntentsForHand,
      }, {
        producerComponent: 'CribbageWartimeDealRuntimeBridge',
        producerFunction: 'activeIntentsEffect',
        dedupeKey: `activeIntents:${handContextId}:${deal.activeIntentsForHand}`,
      });
      lastActiveRef.current = deal.activeIntentsForHand;
    }

    if (lastReadyReleasedRef.current !== deal.readyReleased) {
      recordCribbageWartime('deal', 'dealruntime_ready_released_changed', {
        handContextId, prev: lastReadyReleasedRef.current, readyReleased: deal.readyReleased,
        phase: deal.phase, releaseEligible: deal.releaseEligible,
        releaseBlockReason: deal.releaseBlockReason,
      }, {
        producerComponent: 'CribbageWartimeDealRuntimeBridge',
        producerFunction: 'readyReleasedEffect',
        dedupeKey: `readyReleased:${handContextId}:${deal.readyReleased}`,
      });
      lastReadyReleasedRef.current = deal.readyReleased;
    }
  });

  return null;
}

export default CribbageWartimeDealRuntimeBridge;
