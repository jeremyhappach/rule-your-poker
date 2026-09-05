import type { BrowserContext, Page, Request } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mutationProgressTarget, tracksMutationProgress, type MutationProgressTarget } from './mutationProgress';

export type ChaosClient = 'host' | 'peer';

export type ChaosDomSnapshot = {
  kind: 'snapshot';
  client: ChaosClient;
  wallTime: number;
  performanceTime: number;
  url: string;
  gameId: string | null;
  gameStatus: string | null;
  gameType: string | null;
  dealerGameId: string | null;
  roundId: string | null;
  roundStatus: string | null;
  holmTurnSequence?: number | null;
  ginActionCount?: number | null;
  decisionLocks?: string[] | null;
  shellCount: number;
  feltCount: number;
  nestedShellCount: number;
  actionSurfaces: string[];
  visibleTimerCount: number;
  visibleFaceCardIds: string[];
  opponentCardBackCounts: string[];
  visibleDice: string[];
  maskedVisibleFaceCardIds: string[];
  staleArtifactKeys: string[];
  announcement: string | null;
  setupStep: string | null;
  setupZ: number | null;
  tabRailZ: number | null;
  sweepZ: number | null;
  flyingCardCount: number;
  highCardCount: number;
  progressSignature: string;
  snapshotSignature: string;
};

export type ChaosActionClick = {
  kind: 'action-click';
  client: ChaosClient;
  wallTime: number;
  performanceTime: number;
  url: string;
  actionId: string;
  actionSurface: string;
  buttonText: string;
  expectedPeerDelayReason: string | null;
  baselineProgressSignature: string | null;
  gameId: string | null;
  dealerGameId: string | null;
  roundId: string | null;
  /** Harness-declared action contract; authoritative surfaces default to both. */
  progressExpectation?: 'both' | 'actor' | 'none';
  progressExemptionReason?: string | null;
  expectedPeerDelayMs?: number | null;
  expectedIdentity?: { gameId: string; dealerGameId?: string; roundId?: string };
};

export type ChaosViolation = {
  kind: 'violation';
  client: ChaosClient;
  wallTime: number;
  performanceTime: number;
  url: string;
  code: string;
  message: string;
  durationMs: number;
  details: Record<string, unknown>;
};

export type ChaosPageLifecycle = {
  kind: 'page-lifecycle';
  client: ChaosClient;
  wallTime: number;
  performanceTime: number;
  url: string;
  event: 'observer-started' | 'dom-content-loaded' | 'page-hide';
};

export type ChaosObserverEvent =
  | ChaosDomSnapshot
  | ChaosActionClick
  | ChaosViolation
  | ChaosPageLifecycle;

export type ChaosNetworkReceipt = {
  requestId: string;
  client: ChaosClient;
  method: string;
  endpoint: string;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  outcome: 'finished' | 'failed' | 'pending';
  failure: string | null;
  mutationKey?: string;
  mutationTarget?: MutationProgressTarget | null;
  httpStatus?: number;
};

export type ChaosActionReceipt = {
  actionId: string;
  actor: ChaosClient;
  actionSurface: string;
  buttonText: string;
  expectedPeerDelayReason: string | null;
  clickedAt: number;
  gameId: string | null;
  dealerGameId: string | null;
  roundId: string | null;
  rpcEndpoint: string | null;
  rpcStartedAt: number | null;
  rpcFinishedAt: number | null;
  rpcDurationMs: number | null;
  rpcOutcome: ChaosNetworkReceipt['outcome'] | null;
  actorProgressAt: number | null;
  actorProgressMs: number | null;
  peerProgressAt: number | null;
  peerProgressMs: number | null;
  progressExpectation: 'both' | 'actor' | 'none';
  progressExemptionReason: string | null;
  progressProblems: string[];
  mutationTarget?: MutationProgressTarget | null;
};

type DurationSummary = {
  count: number;
  minMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

export type ChaosIdentityTransition = {
  client: ChaosClient;
  at: number;
  fromDealerGameId: string | null;
  toDealerGameId: string | null;
  fromRoundId: string | null;
  toRoundId: string | null;
  gameType: string | null;
};

export type ContinuousObserverEvidence = {
  version: 2;
  startedAt: number;
  finishedAt: number;
  eventCount: number;
  snapshotCount: number;
  networkRequestCount: number;
  violations: ChaosViolation[];
  identityTransitions: ChaosIdentityTransition[];
  actionReceipts: ChaosActionReceipt[];
  latency: {
    rpc: DurationSummary;
    actorProgress: DurationSummary;
    peerProgress: DurationSummary;
    peerBudgetMs: number | null;
    expectedPeerDelayActionIds: string[];
    peerBudgetBreaches: string[];
  };
  finalSnapshots: Partial<Record<ChaosClient, ChaosDomSnapshot>>;
  events: ChaosObserverEvent[];
  networkRequests: ChaosNetworkReceipt[];
  coverageProblems: string[];
};

type EvidenceOptions = {
  startedAt?: number;
  finishedAt?: number;
  peerBudgetMs?: number | null;
  captureProblems?: string[];
};

// The campaign plan's existing freeze ceiling; a label never disables it.
export const DEFAULT_PROGRESS_BUDGET_MS = 15_000;

const BINDING_NAME = '__ptownHumanChaosObserverEmit';
const MAX_EVENTS = 12_000;
const MAX_NETWORK_RECEIPTS = 12_000;

function percentile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function summarizeDurations(values: Array<number | null>): DurationSummary {
  const sorted = values
    .filter((value): value is number => Number.isFinite(value))
    .map((value) => Math.round(value))
    .sort((a, b) => a - b);
  return {
    count: sorted.length,
    minMs: sorted[0] ?? null,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1) ?? null,
  };
}

function latestSnapshotBefore(
  snapshots: ChaosDomSnapshot[],
  client: ChaosClient,
  wallTime: number,
): ChaosDomSnapshot | null {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index];
    if (snapshot.client === client && snapshot.wallTime <= wallTime) return snapshot;
  }
  return null;
}

function gameplaySignature(snapshot: ChaosDomSnapshot): string {
  // The acting Horses/SCC seat can render its dice without data-die nodes.
  // Its canonical roll ordinal still changes with gameplay. Ignore button
  // availability, other labels and unrelated surfaces; those are cosmetic.
  const diceRollSteps = ['horses', 'ship-captain-crew'].includes(snapshot.gameType ?? '')
    ? snapshot.actionSurfaces.filter((surface) => surface.startsWith('horses-scc-turn['))
      .flatMap((surface) => Array.from(surface.matchAll(/(?:\[|\|)Roll ([123]):(?:enabled|disabled)(?=\||\])/g), (match) => Number(match[1])))
    : [];
  return JSON.stringify({
    gameStatus: snapshot.gameStatus, gameType: snapshot.gameType,
    dealerGameId: snapshot.dealerGameId, roundId: snapshot.roundId,
    roundStatus: snapshot.roundStatus, setupStep: snapshot.setupStep,
    cards: snapshot.visibleFaceCardIds, opponentBacks: snapshot.opponentCardBackCounts,
    // Row/animation phase changes do not establish a new dice outcome.
    dice: snapshot.visibleDice.map((die) => die.split(':').slice(0, 3).join(':')),
    diceRollSteps,
  });
}

function firstProgressAfter(
  snapshots: ChaosDomSnapshot[],
  client: ChaosClient,
  action: ChaosActionClick,
  baseline: ChaosDomSnapshot | null,
  observationEnd: number,
): ChaosDomSnapshot | null {
  if (!matchesActionBaseline(baseline, action)) return null;
  const identity = action.expectedIdentity;
  return snapshots.find((snapshot) => snapshot.client === client
    && snapshot.wallTime >= action.wallTime && snapshot.wallTime < observationEnd
    && snapshot.gameId === action.gameId
    && (!identity || (snapshot.gameId === identity.gameId
      && (!identity.dealerGameId || snapshot.dealerGameId === identity.dealerGameId)
      && (!identity.roundId || snapshot.roundId === identity.roundId)))
    && gameplaySignature(snapshot) !== gameplaySignature(baseline)) ?? null;
}

function matchesActionBaseline(snapshot: ChaosDomSnapshot | null, action: ChaosActionClick): snapshot is ChaosDomSnapshot {
  return !!snapshot && !!action.gameId && snapshot.gameId === action.gameId
    && (!action.dealerGameId || snapshot.dealerGameId === action.dealerGameId)
    && (!action.roundId || snapshot.roundId === action.roundId);
}

function hasMutationProjection(snapshot: ChaosDomSnapshot, target: MutationProgressTarget): boolean {
  return target.field === 'decisionLocks' ? Array.isArray(snapshot.decisionLocks)
    : Number.isSafeInteger(snapshot[target.field]);
}

function mutationReached(snapshot: ChaosDomSnapshot, target: MutationProgressTarget): boolean {
  return target.field === 'decisionLocks' ? snapshot.decisionLocks?.includes(target.value) === true
    : typeof snapshot[target.field] === 'number' && snapshot[target.field]! >= target.value;
}

function buildIdentityTransitions(snapshots: ChaosDomSnapshot[]): ChaosIdentityTransition[] {
  const previous = new Map<ChaosClient, ChaosDomSnapshot>();
  const transitions: ChaosIdentityTransition[] = [];
  for (const snapshot of snapshots) {
    const prior = previous.get(snapshot.client);
    if (prior && (
      prior.dealerGameId !== snapshot.dealerGameId
      || prior.roundId !== snapshot.roundId
    )) {
      transitions.push({
        client: snapshot.client,
        at: snapshot.wallTime,
        fromDealerGameId: prior.dealerGameId,
        toDealerGameId: snapshot.dealerGameId,
        fromRoundId: prior.roundId,
        toRoundId: snapshot.roundId,
        gameType: snapshot.gameType,
      });
    }
    previous.set(snapshot.client, snapshot);
  }
  return transitions;
}

export function buildContinuousObserverEvidence(
  events: ChaosObserverEvent[],
  networkRequests: ChaosNetworkReceipt[],
  options: EvidenceOptions = {},
): ContinuousObserverEvidence {
  const finishedAt = options.finishedAt ?? Date.now();
  const peerBudgetMs = Number.isFinite(options.peerBudgetMs) && options.peerBudgetMs! > 0
    ? options.peerBudgetMs! : DEFAULT_PROGRESS_BUDGET_MS;
  const snapshots = events
    .filter((event): event is ChaosDomSnapshot => event.kind === 'snapshot')
    .sort((a, b) => a.wallTime - b.wallTime);
  const actions = events
    .filter((event): event is ChaosActionClick => event.kind === 'action-click')
    .sort((a, b) => a.wallTime - b.wallTime);
  const violations = events
    .filter((event): event is ChaosViolation => event.kind === 'violation')
    .sort((a, b) => a.wallTime - b.wallTime);

  const actionReceipts = actions.map((action, actionIndex): ChaosActionReceipt => {
    const peer: ChaosClient = action.client === 'host' ? 'peer' : 'host';
    const actorBaseline = latestSnapshotBefore(snapshots, action.client, action.wallTime);
    const peerBaseline = latestSnapshotBefore(snapshots, peer, action.wallTime);
    // Later actions must not retroactively make an earlier stuck action pass.
    const nextAction = actions.slice(actionIndex + 1).find((candidate) => candidate.client === action.client
      && candidate.progressExpectation !== 'none');
    const legacyObservationEnd = Math.min(finishedAt + 1, nextAction?.wallTime ?? Infinity);
    const rpcCandidates = networkRequests.filter((request) => request.client === action.client
      && request.method === 'POST'
      && request.endpoint.includes('/rest/v1/rpc/')
      && request.startedAt >= action.wallTime - 50
      && request.startedAt <= action.wallTime + 4_000);
    const ginMutation = action.actionSurface.startsWith('gin-')
      ? rpcCandidates.find((request) => request.endpoint.endsWith('/gin_rummy_apply_action'))
      : null;
    const decisionMutation = action.actionSurface === 'holm-357-decision'
      ? rpcCandidates.find(request => /\/(holm_submit_decision|three_five_seven_submit_decision)$/.test(request.endpoint)) : null;
    const firstRpc = ginMutation ?? decisionMutation ?? rpcCandidates[0] ?? null;
    // A lost response can replay the same immutable request. A separate later
    // click must not donate its commit to this action.
    const attempts = firstRpc?.mutationKey ? networkRequests.filter(request =>
      request.client === action.client && request.mutationKey === firstRpc.mutationKey
      && request.startedAt >= firstRpc.startedAt && request.startedAt < legacyObservationEnd) : [];
    const committedRpc = attempts.find(request => request.mutationTarget && request.outcome === 'finished');
    const rpc = committedRpc ?? firstRpc;
    const target = committedRpc?.mutationTarget ?? null;
    const projectionAvailable = action.actionSurface.startsWith('gin-') ? Number.isSafeInteger(actorBaseline?.ginActionCount)
      : action.actionSurface === 'holm-357-decision'
        && (Number.isSafeInteger(actorBaseline?.holmTurnSequence) || Array.isArray(actorBaseline?.decisionLocks));
    const boundMutation = Boolean(firstRpc?.mutationKey) || projectionAvailable;
    // Exact committed sequence/participant evidence remains attributable even
    // when a newer action starts before a lagging peer has rendered the commit.
    const observationEnd = target ? finishedAt + 1 : legacyObservationEnd;
    const matchingIdentity = (snapshot: ChaosDomSnapshot) => snapshot.gameId === action.gameId
      && snapshot.dealerGameId === action.dealerGameId && snapshot.roundId === action.roundId
      && snapshot.roundId === target?.roundId
      && (!action.expectedIdentity || (snapshot.gameId === action.expectedIdentity.gameId
        && (!action.expectedIdentity.dealerGameId || snapshot.dealerGameId === action.expectedIdentity.dealerGameId)
        && (!action.expectedIdentity.roundId || snapshot.roundId === action.expectedIdentity.roundId)));
    const progressFor = (client: ChaosClient, baseline: ChaosDomSnapshot | null) => {
      if (!target) return firstProgressAfter(snapshots, client, action, baseline, observationEnd);
      if (!baseline || baseline.gameId !== action.gameId) return null;
      return snapshots.find(snapshot => snapshot.client === client && matchingIdentity(snapshot)
        && snapshot.wallTime >= action.wallTime && snapshot.wallTime < observationEnd
        && mutationReached(snapshot, target)) ?? null;
    };
    const actorProgress = progressFor(action.client, actorBaseline);
    const peerProgress = progressFor(peer, peerBaseline);
    // An optimistic actor paint cannot predate its proven server acknowledgement.
    const actorProgressAt = actorProgress ? Math.max(actorProgress.wallTime,
      target ? committedRpc?.finishedAt ?? actorProgress.wallTime : actorProgress.wallTime) : null;
    const progressExpectation = action.progressExpectation ?? 'both';
    const progressProblems: string[] = [];
    if (boundMutation && !target && progressExpectation !== 'none') progressProblems.push('mutation-commit-unproven');
    if (target && target.roundId !== action.roundId) progressProblems.push('mutation-identity-mismatch');
    if (target && actorBaseline && matchingIdentity(actorBaseline) && mutationReached(actorBaseline, target)) {
      progressProblems.push('mutation-target-not-new');
    }
    if (!['both', 'actor', 'none'].includes(progressExpectation)) progressProblems.push('invalid-progress-contract');
    if (progressExpectation !== 'both' && !action.progressExemptionReason?.trim()) {
      progressProblems.push('missing-progress-exemption-reason');
    }
    const faultBudget = action.expectedPeerDelayMs;
    if (faultBudget != null && (!Number.isFinite(faultBudget) || faultBudget <= 0
      || !action.expectedPeerDelayReason?.trim())) progressProblems.push('invalid-fault-budget');
    const budget = action.expectedPeerDelayReason
      ? Math.max(peerBudgetMs, Number.isFinite(faultBudget) && faultBudget! > 0
        ? faultBudget! : DEFAULT_PROGRESS_BUDGET_MS)
      : peerBudgetMs;
    const assess = (role: 'actor' | 'peer', baseline: ChaosDomSnapshot | null, progress: ChaosDomSnapshot | null) => {
      if (!(target ? baseline?.gameId === action.gameId : matchesActionBaseline(baseline, action))) {
        progressProblems.push(`${role}-missing-baseline`);
      } else if (target && !snapshots.some(snapshot => snapshot.client === (role === 'actor' ? action.client : peer)
        && matchingIdentity(snapshot) && hasMutationProjection(snapshot, target))) {
        progressProblems.push(`${role}-missing-projection`);
      } else if (!progress) {
        progressProblems.push(`${role}-${observationEnd - 1 - action.wallTime >= budget ? 'no-progress' : 'incomplete'}`);
      } else if ((role === 'actor' ? actorProgressAt! : progress.wallTime) - action.wallTime > budget) {
        progressProblems.push(`${role}-latency`);
      }
    };
    if (progressExpectation !== 'none') assess('actor', actorBaseline, actorProgress);
    if (progressExpectation === 'both') assess('peer', peerBaseline, peerProgress);
    return {
      actionId: action.actionId,
      actor: action.client,
      actionSurface: action.actionSurface,
      buttonText: action.buttonText,
      expectedPeerDelayReason: action.expectedPeerDelayReason,
      clickedAt: action.wallTime,
      gameId: action.gameId,
      dealerGameId: action.dealerGameId,
      roundId: action.roundId,
      rpcEndpoint: rpc?.endpoint ?? null,
      rpcStartedAt: rpc?.startedAt ?? null,
      rpcFinishedAt: rpc?.finishedAt ?? null,
      rpcDurationMs: rpc?.durationMs ?? null,
      rpcOutcome: rpc?.outcome ?? null,
      actorProgressAt,
      actorProgressMs: actorProgressAt != null ? actorProgressAt - action.wallTime : null,
      peerProgressAt: peerProgress?.wallTime ?? null,
      peerProgressMs: peerProgress ? peerProgress.wallTime - action.wallTime : null,
      progressExpectation,
      progressExemptionReason: action.progressExemptionReason ?? null,
      progressProblems,
      mutationTarget: target,
    };
  });

  const expectedPeerDelayActionIds = actionReceipts
    .filter((receipt) => Boolean(receipt.expectedPeerDelayReason))
    .map((receipt) => receipt.actionId);
  const peerBudgetBreaches = actionReceipts
      .filter((receipt) => receipt.progressProblems.some((problem) => ['peer-latency', 'peer-no-progress'].includes(problem)))
      .map((receipt) => receipt.actionId);
  const finalSnapshots: Partial<Record<ChaosClient, ChaosDomSnapshot>> = {};
  for (const snapshot of snapshots) finalSnapshots[snapshot.client] = snapshot;

  return {
    version: 2,
    startedAt: options.startedAt ?? events[0]?.wallTime ?? Date.now(),
    finishedAt,
    eventCount: events.length,
    snapshotCount: snapshots.length,
    networkRequestCount: networkRequests.length,
    violations,
    identityTransitions: buildIdentityTransitions(snapshots),
    actionReceipts,
    latency: {
      rpc: summarizeDurations(actionReceipts.map((receipt) => receipt.rpcDurationMs)),
      actorProgress: summarizeDurations(actionReceipts.map((receipt) => receipt.actorProgressMs)),
      peerProgress: summarizeDurations(actionReceipts.map((receipt) => receipt.peerProgressMs)),
      peerBudgetMs,
      expectedPeerDelayActionIds,
      peerBudgetBreaches,
    },
    finalSnapshots,
    events,
    networkRequests,
    coverageProblems: [
      ...(['host', 'peer'] as const).filter((client) => !snapshots.some((snapshot) =>
        snapshot.client === client && snapshot.gameId)).map((client) => `missing-client-evidence:${client}`),
      ...(options.captureProblems ?? []),
    ],
  };
}

export function continuousObserverFailure(evidence: ContinuousObserverEvidence): Error | null {
  const problems = [
    ...evidence.violations.map((violation) => `${violation.client}:${violation.code}`),
    ...evidence.actionReceipts.flatMap((receipt) => receipt.progressProblems.map((problem) => `${problem}:${receipt.actionId}`)),
    ...evidence.coverageProblems,
  ];
  if (!problems.length) return null;
  return new Error(`Continuous chaos observer found ${problems.length} violation(s): ${problems.join(', ')}`);
}

type BrowserObserverEvent<T = ChaosObserverEvent> = T extends ChaosObserverEvent
  ? Omit<T, 'client' | 'wallTime' | 'performanceTime' | 'url'> : never;

function browserObserverInit(config: { client: ChaosClient; bindingName: string }): void {
  const emit = (event: BrowserObserverEvent) => {
    const binding = (window as unknown as Record<string, unknown>)[config.bindingName];
    if (typeof binding !== 'function') return;
    const payload = {
      ...event,
      client: config.client,
      wallTime: Date.now(),
      performanceTime: performance.now(),
      // Evidence may be retained on failure. Never persist query strings or
      // fragments because preview-access URLs can carry short-lived secrets.
      url: `${window.location.origin}${window.location.pathname}`,
    } as ChaosObserverEvent;
    void Promise.resolve((binding as (value: ChaosObserverEvent) => unknown)(payload)).catch(() => {});
  };

  const visible = (element: Element | null): element is HTMLElement => {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || '1') > 0
      && rect.width > 0
      && rect.height > 0;
  };

  const effectiveZ = (element: Element | null): number | null => {
    if (!(element instanceof HTMLElement)) return null;
    let current: HTMLElement | null = element;
    let highest: number | null = null;
    while (current && current !== document.body) {
      const value = Number(window.getComputedStyle(current).zIndex);
      if (Number.isFinite(value)) highest = highest == null ? value : Math.max(highest, value);
      current = current.parentElement;
    }
    return highest;
  };

  const visibleNodes = (selector: string): HTMLElement[] => Array.from(
    document.querySelectorAll<HTMLElement>(selector),
  ).filter(visible);

  type ConditionState = { firstSeenAt: number; emitted: boolean };
  const conditions = new Map<string, ConditionState>();
  let lastSnapshot: ChaosDomSnapshot | null = null;
  let lastSnapshotSignature = '';
  let actionSequence = 0;
  let scheduled = false;
  const artifactStamps = new WeakMap<HTMLElement, { dealerGameId: string; signature: string }>();

  const updateCondition = (
    code: string,
    active: boolean,
    thresholdMs: number,
    message: string,
    details: Record<string, unknown>,
  ) => {
    if (!active) {
      conditions.delete(code);
      return;
    }
    const now = performance.now();
    const existing = conditions.get(code) ?? { firstSeenAt: now, emitted: false };
    conditions.set(code, existing);
    const durationMs = now - existing.firstSeenAt;
    if (!existing.emitted && durationMs >= thresholdMs) {
      existing.emitted = true;
      emit({ kind: 'violation', code, message, durationMs: Math.round(durationMs), details });
    }
  };

  const sample = () => {
    scheduled = false;
    const roots = Array.from(document.querySelectorAll<HTMLElement>('[data-lifecycle-branch="loaded-inner"]'));
    const root = roots[0] ?? null;
    const shellCount = document.querySelectorAll('[data-canonical-shell-root]').length;
    const feltCount = document.querySelectorAll('[data-canonical-felt-surface]').length;
    const nestedShellCount = document.querySelectorAll(
      '[data-canonical-shell-root] [data-canonical-shell-root]',
    ).length;
    const actionSurfaces = visibleNodes('[data-authoritative-action-surface]')
      .map((node) => {
        const name = node.getAttribute('data-authoritative-action-surface') ?? 'unknown';
        const buttons = Array.from(node.querySelectorAll<HTMLButtonElement>('button'))
          .map((button) => `${button.textContent?.trim() ?? ''}:${button.disabled ? 'disabled' : 'enabled'}`)
          .sort();
        return `${name}[${buttons.join('|')}]`;
      })
      .sort();
    const timerSelector = [
      '[data-canonical-shell-timer-rail]',
      '[data-shell-timer]',
      '[data-mobile-player-timer]',
      '[data-three-five-seven-timer]',
      '[data-active-player-timer]',
      '[data-game-timer]',
    ].join(',');
    const visibleTimerCount = visibleNodes(timerSelector).length;
    const visibleFaces = visibleNodes('[data-playing-card-face]');
    const visibleFaceCardIds = visibleFaces
      .map((node) => node.getAttribute('data-card-id') ?? node.textContent?.trim() ?? '<unknown-face>')
      .sort();
    const opponentCardBackCountByAnchor = new Map<string, number>();
    for (const anchor of Array.from(
      document.querySelectorAll<HTMLElement>('[data-card-anchor^="opp-stack-"]'),
    )) {
      const key = anchor.getAttribute('data-card-anchor');
      if (!key) continue;
      const count = anchor.querySelectorAll('[data-canonical-card-back]').length;
      opponentCardBackCountByAnchor.set(
        key,
        (opponentCardBackCountByAnchor.get(key) ?? 0) + count,
      );
    }
    const opponentCardBackCounts = Array.from(opponentCardBackCountByAnchor.entries())
      .map(([key, count]) => `${key}:${count}`)
      .sort();
    const visibleDice = visibleNodes('[data-die-idx]')
      .map((node) => [
        node.getAttribute('data-die-idx') ?? '<unknown-index>',
        node.getAttribute('data-die-value') ?? '<unknown-value>',
        node.getAttribute('data-die-held') ?? '<unknown-held>',
        node.getAttribute('data-die-row') ?? '<unknown-row>',
        node.getAttribute('data-die-phase-branch') ?? '<unknown-phase>',
      ].join(':'))
      .sort();
    const maskedVisibleFaceCardIds = visibleFaceCardIds.filter((cardId) => cardId.includes('?'));
    const announcementNode = visibleNodes('[data-canonical-announcement-content]')[0] ?? null;
    const announcement = announcementNode?.textContent?.trim() || null;
    const setup = visibleNodes('[data-dealer-game-setup-step]')[0] ?? null;
    const setupStep = setup?.getAttribute('data-dealer-game-setup-step') ?? null;
    const tabRail = visibleNodes('[data-canonical-shell-tabbar]')[0] ?? null;
    const sweep = visibleNodes('[data-sweep-the-legs-overlay]')[0] ?? null;
    const setupZ = effectiveZ(setup);
    const tabRailZ = effectiveZ(tabRail);
    const sweepZ = effectiveZ(sweep);
    const flyingCardCount = visibleNodes('[data-card-transport-flying="true"], [data-card-transport-intent-id]').length;
    const highCardCount = visibleNodes('[data-wartime-high-card="card"]').length;
    const gameId = root?.getAttribute('data-authoritative-game-id') ?? null;
    const gameStatus = root?.getAttribute('data-authoritative-game-status') ?? null;
    const gameType = root?.getAttribute('data-authoritative-game-type') ?? null;
    const dealerGameId = root?.getAttribute('data-authoritative-dealer-game-id') ?? null;
    const roundId = root?.getAttribute('data-authoritative-round-id') ?? null;
    const roundStatus = root?.getAttribute('data-authoritative-round-status') ?? null;
    const progressNumber = (attribute: string): number | null => {
      const raw = root?.getAttribute(attribute);
      if (raw == null || !/^\d+$/.test(raw)) return null;
      const value = Number(raw);
      return Number.isSafeInteger(value) ? value : null;
    };
    const holmTurnSequence = progressNumber('data-authoritative-holm-turn-sequence');
    const ginActionCount = progressNumber('data-authoritative-gin-action-count');
    const locked = root?.getAttribute('data-authoritative-decision-locks');
    const decisionLocks = locked == null ? null : locked.split(',').filter(Boolean).sort();
    const staleArtifactKeys: string[] = [];
    if (dealerGameId) {
      const stampArtifacts = (nodes: HTMLElement[], kind: string, signatureOf: (node: HTMLElement) => string) => {
        for (const node of nodes) {
          const signature = signatureOf(node);
          const previous = artifactStamps.get(node);
          if (!previous) {
            artifactStamps.set(node, { dealerGameId, signature });
            continue;
          }
          if (previous.dealerGameId === dealerGameId) continue;
          if (previous.signature === signature) {
            staleArtifactKeys.push(`${kind}:${signature}:${previous.dealerGameId}->${dealerGameId}`);
          } else {
            artifactStamps.set(node, { dealerGameId, signature });
          }
        }
      };
      stampArtifacts(visibleFaces, 'face', (node) => node.getAttribute('data-card-id') ?? '<unknown>');
      stampArtifacts(
        visibleNodes('[data-card-transport-flying="true"], [data-card-transport-intent-id]'),
        'transport',
        (node) => node.getAttribute('data-card-transport-intent-id') ?? '<unknown>',
      );
      stampArtifacts(sweep ? [sweep] : [], 'sweep', () => 'sweep-the-legs');
    }
    const progressSignature = JSON.stringify({
      gameId,
      gameStatus,
      gameType,
      dealerGameId,
      roundId,
      roundStatus,
      holmTurnSequence,
      ginActionCount,
      decisionLocks,
      actionSurfaces,
      visibleFaceCardIds,
      opponentCardBackCounts,
      visibleDice,
      announcement,
      setupStep,
      flyingCardCount,
      highCardCount,
      staleArtifactKeys,
    });
    const snapshotSignature = JSON.stringify({
      progressSignature,
      rootCount: roots.length,
      shellCount,
      feltCount,
      nestedShellCount,
      visibleTimerCount,
      setupZ,
      tabRailZ,
      sweepZ,
    });
    const snapshot: ChaosDomSnapshot = {
      kind: 'snapshot',
      client: config.client,
      wallTime: Date.now(),
      performanceTime: performance.now(),
      url: `${window.location.origin}${window.location.pathname}`,
      gameId,
      gameStatus,
      gameType,
      dealerGameId,
      roundId,
      roundStatus,
      holmTurnSequence,
      ginActionCount,
      decisionLocks,
      shellCount,
      feltCount,
      nestedShellCount,
      actionSurfaces,
      visibleTimerCount,
      visibleFaceCardIds,
      opponentCardBackCounts,
      visibleDice,
      maskedVisibleFaceCardIds,
      staleArtifactKeys,
      announcement,
      setupStep,
      setupZ,
      tabRailZ,
      sweepZ,
      flyingCardCount,
      highCardCount,
      progressSignature,
      snapshotSignature,
    };
    lastSnapshot = snapshot;
    if (snapshotSignature !== lastSnapshotSignature) {
      lastSnapshotSignature = snapshotSignature;
      emit(snapshot);
    }

    const loaded = roots.length === 1;
    updateCondition(
      'loaded-table-missing-canonical-owner',
      loaded && (shellCount !== 1 || feltCount !== 1),
      750,
      'A loaded lifecycle branch did not retain exactly one canonical shell and felt.',
      { shellCount, feltCount, gameId, dealerGameId },
    );
    updateCondition(
      'duplicate-canonical-shell',
      loaded && (shellCount > 1 || nestedShellCount > 0),
      100,
      'More than one canonical shell was mounted.',
      { shellCount, nestedShellCount, gameId, dealerGameId },
    );
    updateCondition(
      'duplicate-canonical-felt',
      loaded && feltCount > 1,
      100,
      'More than one canonical felt was mounted.',
      { feltCount, gameId, dealerGameId },
    );
    updateCondition(
      'masked-visible-card-face',
      maskedVisibleFaceCardIds.length > 0,
      0,
      'A face-up card containing a masked rank or suit became visible.',
      { maskedVisibleFaceCardIds, gameType, dealerGameId, roundId },
    );
    const staleFaceCount = staleArtifactKeys.filter((key) => key.startsWith('face:')).length;
    const staleNonFaceCount = staleArtifactKeys.length - staleFaceCount;
    updateCondition(
      'stale-gameplay-artifact-across-dealer-game',
      staleFaceCount >= 2 || staleNonFaceCount > 0,
      500,
      'Outgoing cards, transports, or celebration artifacts survived a concrete dealer-game identity change.',
      { staleArtifactKeys, gameType, dealerGameId, roundId },
    );
    const timedActionSurface = actionSurfaces.some((surface) =>
      surface.startsWith('holm-357-decision[')
      || surface.startsWith('horses-scc-turn[')
      || surface.startsWith('yahtzee-turn['));
    updateCondition(
      'timed-action-without-visible-timer',
      loaded && timedActionSurface && visibleTimerCount === 0,
      1_000,
      'A timed legal action surface remained visible without a visible timer owner.',
      { actionSurfaces, gameType, dealerGameId, roundId },
    );
    updateCondition(
      'dealer-setup-below-tab-rail',
      Boolean(setup && tabRail && setupZ != null && tabRailZ != null && setupZ <= tabRailZ),
      0,
      'Dealer Setup did not win the z-order over the canonical tab rail.',
      { setupStep, setupZ, tabRailZ },
    );
    updateCondition(
      'sweep-overlay-below-tab-rail',
      Boolean(sweep && tabRail && sweepZ != null && tabRailZ != null && sweepZ <= tabRailZ),
      0,
      'Sweep the Legs did not win the z-order over the canonical tab rail.',
      { sweepZ, tabRailZ },
    );
  };

  const scheduleSample = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sample);
  };

  const start = () => {
    emit({ kind: 'page-lifecycle', event: 'observer-started' });
    const root = document.documentElement;
    if (root) {
      new MutationObserver(scheduleSample).observe(root, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLElement>('button, [role="button"]') ?? null;
      const cribbageCard = target?.closest<HTMLElement>('[data-cribbage-hand-card-key]') ?? null;
      const interactive = button ?? cribbageCard;
      if (!interactive) return;
      const surface = interactive.closest<HTMLElement>('[data-authoritative-action-surface]');
      const text = interactive.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const trackedStandalone = Boolean(button?.matches(
        '[data-dealer-game-start], [data-start-game-btn], [data-gin-pile-layer="button"]',
      )) || /^Run Back\b/i.test(text);
      const cribbagePeggingCard = Boolean(
        cribbageCard
        && !document.querySelector('[data-authoritative-action-surface="cribbage-discard"]'),
      );
      if (!surface && !trackedStandalone && !cribbagePeggingCard) return;
      sample();
      const rootNode = document.querySelector<HTMLElement>('[data-lifecycle-branch="loaded-inner"]');
      const windowRecord = window as unknown as Record<string, unknown>;
      const expectedPeerDelayOnce = windowRecord.__PTOWN_CHAOS_EXPECTED_PEER_DELAY_ONCE__;
      const progressContract = windowRecord.__PTOWN_CHAOS_PROGRESS_CONTRACT_ONCE__ as
        Pick<ChaosActionClick, 'progressExpectation' | 'progressExemptionReason' | 'expectedPeerDelayMs' | 'expectedIdentity'> | undefined;
      delete windowRecord.__PTOWN_CHAOS_PROGRESS_CONTRACT_ONCE__;
      if (typeof expectedPeerDelayOnce === 'string') {
        delete windowRecord.__PTOWN_CHAOS_EXPECTED_PEER_DELAY_ONCE__;
      }
      actionSequence += 1;
      emit({
        kind: 'action-click',
        actionId: `${config.client}-${Date.now()}-${actionSequence}`,
        actionSurface: surface?.getAttribute('data-authoritative-action-surface')
          ?? button?.getAttribute('data-dealer-game-start')
          ?? (button?.hasAttribute('data-start-game-btn') ? 'session-start' : null)
          ?? (button?.hasAttribute('data-gin-pile-layer') ? 'gin-pile' : null)
          ?? (cribbagePeggingCard ? 'cribbage-pegging-card' : null)
          ?? 'run-back',
        buttonText: text,
        expectedPeerDelayReason: typeof expectedPeerDelayOnce === 'string'
          ? expectedPeerDelayOnce
          : interactive
            .closest<HTMLElement>('[data-chaos-expected-peer-delay]')
            ?.getAttribute('data-chaos-expected-peer-delay') ?? null,
        baselineProgressSignature: lastSnapshot?.progressSignature ?? null,
        gameId: rootNode?.getAttribute('data-authoritative-game-id') ?? null,
        dealerGameId: rootNode?.getAttribute('data-authoritative-dealer-game-id') ?? null,
        roundId: rootNode?.getAttribute('data-authoritative-round-id') ?? null,
        progressExpectation: progressContract?.progressExpectation ?? 'both',
        progressExemptionReason: progressContract?.progressExemptionReason ?? null,
        expectedPeerDelayMs: progressContract?.expectedPeerDelayMs ?? null,
        expectedIdentity: progressContract?.expectedIdentity,
      });
    }, true);
    window.addEventListener('pagehide', () => emit({ kind: 'page-lifecycle', event: 'page-hide' }));
    document.addEventListener('DOMContentLoaded', () => {
      emit({ kind: 'page-lifecycle', event: 'dom-content-loaded' });
      scheduleSample();
    }, { once: true });
    window.setInterval(scheduleSample, 100);
    scheduleSample();
  };

  start();
}

function isSupabaseRestRequest(request: Request): boolean {
  try {
    const url = new URL(request.url());
    return url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/');
  } catch {
    return false;
  }
}

function safeEndpoint(request: Request): string {
  try {
    return new URL(request.url()).pathname;
  } catch {
    return '<invalid-url>';
  }
}

export class HumanChaosContinuousObserver {
  private readonly events: ChaosObserverEvent[] = [];
  private readonly networkRequests: ChaosNetworkReceipt[] = [];
  private readonly requestStarts = new Map<Request, ChaosNetworkReceipt>();
  private readonly startedAt = Date.now();
  private requestSequence = 0;
  private sealed = false;
  private readonly captureProblems = new Set<string>();
  private readonly pendingMutationReads = new Set<Promise<void>>();

  constructor(private readonly options: { peerBudgetMs?: number } = {}) {}

  /** Assert an expected legal control is actually usable, without submitting it. */
  async requireActionableControl(client: ChaosClient, page: Page, selector: string, timeoutMs = DEFAULT_PROGRESS_BUDGET_MS): Promise<void> {
    try {
      await page.locator(selector).first().click({ trial: true, timeout: timeoutMs });
    } catch {
      this.recordNodeViolation(client, 'required-control-not-actionable',
        'The expected legal control was missing, disabled or obstructed.', { selector, timeoutMs });
      throw new Error(`Required ${client} control was not actionable: ${selector}`);
    }
  }

  async attachContext(context: BrowserContext, client: ChaosClient): Promise<void> {
    await context.exposeBinding(BINDING_NAME, (_source, event: ChaosObserverEvent) => {
      if (this.sealed) return;
      if (this.events.length < MAX_EVENTS) this.events.push(event);
      else this.captureProblems.add('event-capture-truncated');
    });
    await context.addInitScript(browserObserverInit, { client, bindingName: BINDING_NAME });
    context.on('page', (page) => this.attachPage(page, client));
    context.on('request', (request) => {
      if (this.sealed || !isSupabaseRestRequest(request)) return;
      this.requestSequence += 1;
      const receipt: ChaosNetworkReceipt = {
        requestId: `${client}-request-${this.requestSequence}`,
        client,
        method: request.method(),
        endpoint: safeEndpoint(request),
        startedAt: Date.now(),
        finishedAt: null,
        durationMs: null,
        outcome: 'pending',
        failure: null,
      };
      if (request.method() === 'POST' && tracksMutationProgress(receipt.endpoint)) {
        receipt.mutationKey = createHash('sha256').update(`${receipt.endpoint}:${request.postData() ?? ''}`).digest('hex');
        receipt.mutationTarget = null;
      }
      this.requestStarts.set(request, receipt);
      if (this.networkRequests.length < MAX_NETWORK_RECEIPTS) this.networkRequests.push(receipt);
      else this.captureProblems.add('network-capture-truncated');
    });
    context.on('requestfinished', (request) => this.finishRequest(request, 'finished'));
    context.on('requestfailed', (request) => this.finishRequest(
      request,
      'failed',
      request.failure()?.errorText ?? 'request failed',
    ));
  }

  finish(): ContinuousObserverEvidence {
    this.sealed = true;
    const configuredBudget = Number(process.env.PTOWN_E2E_MAX_ACTION_TO_PEER_MS);
    return buildContinuousObserverEvidence(
      [...this.events],
      this.networkRequests.map((request) => ({ ...request })),
      {
        startedAt: this.startedAt,
        finishedAt: Date.now(),
        peerBudgetMs: this.options.peerBudgetMs ?? (Number.isFinite(configuredBudget) && configuredBudget > 0
          ? configuredBudget : null),
        captureProblems: [...this.captureProblems,
          ...(this.pendingMutationReads.size ? ['mutation-response-capture-pending'] : [])],
      },
    );
  }

  private attachPage(page: Page, client: ChaosClient): void {
    page.on('pageerror', (error) => this.recordNodeViolation(
      client,
      'page-error',
      error.message,
      { name: error.name },
    ));
    page.on('crash', () => this.recordNodeViolation(
      client,
      'page-crash',
      'The browser page crashed during a human-chaos scenario.',
      {},
    ));
  }

  private finishRequest(
    request: Request,
    outcome: 'finished' | 'failed',
    failure: string | null = null,
  ): void {
    const receipt = this.requestStarts.get(request);
    if (!receipt) return;
    this.requestStarts.delete(request);
    receipt.finishedAt = Date.now();
    receipt.durationMs = receipt.finishedAt - receipt.startedAt;
    receipt.outcome = outcome;
    receipt.failure = failure;
    if (receipt.mutationKey && outcome === 'finished') {
      const task = (async () => {
        try {
          const response = await request.response();
          receipt.httpStatus = response?.status();
          if (response?.ok()) {
            receipt.mutationTarget = mutationProgressTarget(receipt.endpoint, request.postDataJSON(), await response.json());
          }
        } catch {
          // Unreadable/refused responses cannot establish a committed target.
          receipt.mutationTarget = null;
        }
      })();
      this.pendingMutationReads.add(task);
      void task.finally(() => this.pendingMutationReads.delete(task));
    }
  }

  private recordNodeViolation(
    client: ChaosClient,
    code: string,
    message: string,
    details: Record<string, unknown>,
  ): void {
    if (this.sealed) return;
    if (this.events.length >= MAX_EVENTS) {
      this.captureProblems.add('event-capture-truncated');
      return;
    }
    this.events.push({
      kind: 'violation',
      client,
      wallTime: Date.now(),
      performanceTime: 0,
      url: '<page-event>',
      code,
      message,
      durationMs: 0,
      details,
    });
  }
}
