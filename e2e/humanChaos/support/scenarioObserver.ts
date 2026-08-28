import type { TestInfo } from '@playwright/test';

import type { TwoClientSession } from '../../liveness/support/twoClientSession';
import { persistScenarioEvidence } from '../../liveness/support/scenarioArtifacts';
import {
  continuousObserverFailure,
  type ContinuousObserverEvidence,
} from './continuousObserver';

export async function finalizeScenarioObserver(
  session: TwoClientSession,
  info: TestInfo,
): Promise<{ evidence: ContinuousObserverEvidence | null; failure: Error | null }> {
  const evidence = session.chaosObserver?.finish() ?? null;
  if (!evidence) return { evidence: null, failure: null };

  await persistScenarioEvidence(info, 'human-chaos-continuous-observer.json', evidence);
  return { evidence, failure: continuousObserverFailure(evidence) };
}

export function observerEvidenceSummary(evidence: ContinuousObserverEvidence | null): Record<string, unknown> | null {
  if (!evidence) return null;
  return {
    version: evidence.version,
    eventCount: evidence.eventCount,
    snapshotCount: evidence.snapshotCount,
    networkRequestCount: evidence.networkRequestCount,
    violationCount: evidence.violations.length,
    identityTransitionCount: evidence.identityTransitions.length,
    actionReceiptCount: evidence.actionReceipts.length,
    latency: evidence.latency,
  };
}
