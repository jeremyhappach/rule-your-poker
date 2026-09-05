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
  if (!evidence) return {
    evidence: null,
    failure: process.env.PTOWN_E2E_CONTINUOUS_OBSERVER === '1'
      ? new Error('Required continuous observer was not installed; scenario evidence is incomplete.') : null,
  };

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
    progressProblemCount: evidence.actionReceipts.reduce((count, receipt) => count + receipt.progressProblems.length, 0),
    exemptActionCount: evidence.actionReceipts.filter((receipt) => receipt.progressExpectation !== 'both').length,
    coverageProblems: evidence.coverageProblems,
    latency: evidence.latency,
  };
}
