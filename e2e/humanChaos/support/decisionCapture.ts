import type { ChaosClient, HumanChaosContinuousObserver } from './continuousObserver';
import type { MutationProgressTarget } from './mutationProgress';

type DecisionTarget = Extract<MutationProgressTarget, { field: 'decisionLocks' | 'roundStatus' }>;
type Scope = { gameId: string; dealerGameId: string; roundId: string };
export const DECISION_CAPTURE_BUDGET_MS = 6_000;

/** Read captured DOM evidence only; never issues a game request or seals the observer. */
export async function waitForDecisionCapture(
  observer: Pick<HumanChaosContinuousObserver, 'latestSnapshot'>,
  scope: Scope,
  target: DecisionTarget,
  clickedAt: number,
) {
  if (!Number.isFinite(clickedAt) || target.roundId !== scope.roundId) {
    throw new Error('Invalid decision capture identity or click clock');
  }
  const deadline = clickedAt + DECISION_CAPTURE_BUDGET_MS;
  const captured: Partial<Record<ChaosClient, { observedAt: number; progressMs: number }>> = {};
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`Decision ${target.field} capture did not complete on both clients within six seconds of the click`);
    }
    for (const client of ['host', 'peer'] as const) {
      if (captured[client]) continue;
      const snapshot = observer.latestSnapshot(client);
      if (!snapshot || snapshot.gameId !== scope.gameId || snapshot.dealerGameId !== scope.dealerGameId
        || snapshot.roundId !== scope.roundId || snapshot.wallTime < clickedAt || snapshot.wallTime > deadline) continue;
      const reached = target.field === 'decisionLocks'
        ? snapshot.decisionLocks?.includes(target.value) === true
        : snapshot.roundStatus === target.value;
      if (reached) captured[client] = { observedAt: snapshot.wallTime, progressMs: snapshot.wallTime - clickedAt };
    }
    if (captured.host && captured.peer) {
      return { ...scope, target, clickedAt, deadline, host: captured.host, peer: captured.peer };
    }
    // Bounded sampling of the existing observer, not a delay added to the product.
    await new Promise(resolve => setTimeout(resolve, Math.min(25, remaining)));
  }
}
