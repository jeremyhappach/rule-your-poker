import type { BrowserContext, Page } from '@playwright/test';

export type PresentationScope = {
  gameId: string; dealerGameId: string; roundId: string; handNumber: number;
  transferCursor?: number; terminalGenerationId?: string | null;
};
export type VisibleStage = {
  kind: 'award' | 'sweep' | 'pot' | 'payout'; id: string; finished: boolean;
  winning?: boolean; generation?: string | null;
};
export type CompletionEvidence = {
  scope: PresentationScope | null; stageId: string; kind: VisibleStage['kind'];
  reason: 'css-complete' | 'retired-complete' | 'early-removal' | 'shortened-css' | 'cancelled-css' | 'observation-gap';
  at: number; deadline: number; lastSeen: number | null; cssCompletedAt: number | null;
  elapsedMs?: number; declaredMs?: number;
};
export type TransitionSample = {
  at: number;
  scope: PresentationScope | null;
  reveal: (PresentationScope & { id: string; beat: string; localEnd: number; serverEnd: number }) | null;
  stages: VisibleStage[];
  sweepOverlay: boolean;
  setup: boolean;
  balances: Record<string, string>;
  deltas: Array<{ id: string; batch: string; cursor: number; reason: string; text: string }>;
  documentVisible: boolean;
  matchWin?: { id: string; text: string } | null;
  celebration?: string | null;
  completionEvidence?: CompletionEvidence[];
};
export type RoundPresentationExpectation = PresentationScope & {
  actionAt: number;
  revealId: string;
  revealServerEnd: number;
  terminal: boolean;
  openingBalances: Record<string, string>;
  closingBalances: Record<string, string>;
  chargeBatchIds: string[];
  potTransferIds: string[];
  /** Only the losing seats' legs fly; the winner's own legs remain in place. */
  sweepFlightCount?: number;
};

const sameScope = (a: PresentationScope | null, b: PresentationScope) => !!a
  && a.gameId === b.gameId && a.dealerGameId === b.dealerGameId
  && a.roundId === b.roundId && a.handNumber === b.handNumber;

export function assertCompletionEvidence(samples: readonly TransitionSample[], expected: PresentationScope): void {
  for (const row of samples) for (const evidence of row.completionEvidence ?? []) {
    if (!sameScope(evidence.scope, expected)) continue;
    if (evidence.reason === 'observation-gap') {
      throw new Error(`Inconclusive presentation observation ${expected.roundId}: ${evidence.kind} ${evidence.stageId}; `
        + `sampling gap ${evidence.at - (evidence.lastSeen ?? evidence.at)} ms without CSS completion evidence`);
    }
    if (['early-removal', 'shortened-css', 'cancelled-css'].includes(evidence.reason)) {
      throw new Error(`Presentation ${expected.roundId}: ${evidence.kind} ${evidence.stageId} ${evidence.reason}`);
    }
  }
}

/** Fail closed: eventual settlement/setup never supplies missing visual evidence. */
export function assertRoundPresentation(
  samples: readonly TransitionSample[], expected: RoundPresentationExpectation,
): { revealEnd: number; awardEnd: number; sweepEnd: number | null; potEnd: number | null; setupAt: number | null } {
  const fail = (reason: string): never => { throw new Error(`357 presentation ${expected.roundId}: ${reason}`); };
  const rows = samples.filter(row => row.at >= expected.actionAt);
  assertCompletionEvidence(rows, expected);
  if (rows.length < 2) fail('incomplete observation');
  if (rows.some(row => !row.documentVisible)) fail('browser was hidden during observation');
  const revealRows = rows.filter(row => row.reveal?.id === expected.revealId);
  if (!revealRows.length || revealRows.some(row => !sameScope(row.reveal, expected))) fail('missing or stale reveal identity');
  if (revealRows.some(row => row.reveal!.serverEnd !== expected.revealServerEnd)) fail('reveal clock does not match the action receipt');
  const beats = ['3', '2', '1', 'DROP', 'hold'];
  let previousBeatAt = -Infinity;
  for (const beat of beats) {
    const row = revealRows.find(row => row.reveal?.beat === beat);
    if (!row || row.at < previousBeatAt) fail(`missing or out-of-order reveal beat ${beat}`);
    previousBeatAt = row.at;
  }
  const revealEnd = revealRows[revealRows.length - 1].reveal!.localEnd;
  if (!Number.isFinite(revealEnd) || revealEnd <= previousBeatAt) fail('invalid reveal completion clock');
  if (!rows.some(row => row.at >= revealEnd && row.reveal?.id !== expected.revealId)) fail('reveal never completed');
  for (const row of rows) {
    if (row.at < revealEnd) {
      if (row.setup) fail('setup before reveal completion');
      if (row.stages.length) fail('award/transport before reveal completion');
      if (row.deltas.some(delta => expected.chargeBatchIds.includes(delta.batch))) fail('early chip helper');
      for (const [player, opening] of Object.entries(expected.openingBalances)) {
        if (row.balances[player] != null && row.balances[player] !== opening) fail(`early balance for ${player}`);
      }
    }
    if (row.stages.length && !sameScope(row.scope, expected)) fail('stale stage identity');
  }
  const intervals = (kind: VisibleStage['kind']) => {
    const entries = new Map<string, { start: number; end: number | null; stage: VisibleStage }>();
    let previous = new Set<string>();
    for (const row of rows) {
      const current = new Set<string>();
      for (const stage of row.stages.filter(stage => stage.kind === kind)) {
        current.add(stage.id);
        if (!stage.id) fail(`unidentified ${kind}`);
        const existing = entries.get(stage.id);
        if (existing && !previous.has(stage.id)) fail(`duplicate ${kind}`);
        const entry = existing ?? { start: row.at, end: null, stage };
        if (stage.finished && entry.end == null) entry.end = row.at;
        entries.set(stage.id, entry);
      }
      previous = current;
    }
    return entries;
  };
  const awards = intervals('award');
  if (awards.size !== 1) fail('missing or duplicate leg award');
  const award = [...awards.values()][0];
  if (award.stage.winning !== expected.terminal) fail('wrong leg outcome');
  if (award.start < revealEnd || award.end == null) fail('leg award did not finish');
  if (expected.terminal && (!award.stage.generation
    || !rows.some(row => sameScope(row.scope, expected) && row.scope?.terminalGenerationId === award.stage.generation))) {
    fail('award generation does not match terminal');
  }
  let sweepEnd: number | null = null;
  let potEnd: number | null = null;
  if (expected.terminal) {
    const sweeps = intervals('sweep');
    if (!expected.sweepFlightCount || sweeps.size !== expected.sweepFlightCount) fail('missing or duplicate sweep flight');
    if (!rows.some(row => row.sweepOverlay)) fail('missing sweep overlay');
    for (const sweep of sweeps.values()) {
      if (sweep.start < award.end! || sweep.end == null) fail('sweep before award completion or unfinished sweep');
    }
    sweepEnd = Math.max(...[...sweeps.values()].map(sweep => sweep.end!));
    const pots = intervals('pot');
    if (!expected.potTransferIds.length || pots.size !== expected.potTransferIds.length) fail('missing or duplicate pot flight');
    for (const [id, pot] of pots) {
      if (!expected.potTransferIds.includes(id)) fail('unrelated pot transfer');
      if (pot.start < sweepEnd || pot.end == null) fail('pot before sweep completion or unfinished pot flight');
      if (rows.some(row => row.at === pot.start && row.sweepOverlay)) fail('pot before sweep overlay completion');
    }
    potEnd = Math.max(...[...pots.values()].map(pot => pot.end!));
  }
  const completedAt = potEnd ?? award.end!;
  const setup = rows.find(row => row.setup);
  if (expected.terminal && (!setup || setup.at < completedAt)) fail('missing setup or setup before presentation completion');
  if (!expected.terminal && setup) fail('setup during ordinary continuation');
  for (const [player, closing] of Object.entries(expected.closingBalances)) {
    if (!rows.some(row => row.at >= completedAt && row.balances[player] === closing)) fail(`missing closing balance for ${player}`);
  }
  return { revealEnd, awardEnd: award.end!, sweepEnd, potEnd, setupAt: setup?.at ?? null };
}

/** Runs inside the browser. Observes visible DOM and CSS completion, never app internals. */
export function installTransitionPresentationObserver(): void {
  const target = window as unknown as { __transitionPresentationInstalled?: boolean; __transitionPresentationSample: (sample: TransitionSample) => Promise<void> };
  if (target.__transitionPresentationInstalled) return;
  target.__transitionPresentationInstalled = true;
  const completed = new WeakSet<Element>();
  const endedEarly = new WeakSet<Element>();
  // A trusted full CSS end can precede the renderer's retirement deadline.
  // Keep that fact independently; a later sampling pause cannot erase it.
  const cssCompletedAt = new WeakMap<Element, number>();
  const declaredDurations = new WeakMap<Element, number>();
  const pendingEvidence: CompletionEvidence[] = [];
  const observedAwards = new Map<Element, { stage: VisibleStage; scope: PresentationScope | null; end: number; lastSeen: number }>();
  const selectors = '[data-leg-award], [data-leg-sweep-flight], [data-chip-transport-intent][data-chip-transport-from="pot"][data-chip-transport-variant="canonicalWinTransfer"], [data-chip-transport-intent][data-chip-transport-from="seat"]';
  let previous = '';
  const visible = (node: Element) => {
    for (let parent: Element | null = node; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return [node, ...node.children].some(child => {
      const box = child.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
    });
  };
  const sample = () => {
    const root = document.querySelector('[data-357-presentation-scope], [data-cribbage-presentation-scope], [data-yahtzee-presentation-scope]');
    let scope: PresentationScope | null = null;
    try { scope = JSON.parse(root?.getAttribute('data-357-presentation-scope') ?? root?.getAttribute('data-cribbage-presentation-scope') ?? root?.getAttribute('data-yahtzee-presentation-scope') ?? 'null'); } catch { /* malformed identity remains missing */ }
    const revealNode = document.querySelector('[data-357-decision-reveal]');
    const attr = (node: Element, name: string) => node.getAttribute(name) ?? '';
    const reveal = revealNode && visible(revealNode) ? {
      id: attr(revealNode, 'data-357-decision-reveal'), beat: attr(revealNode, 'data-357-reveal-beat'),
      gameId: attr(revealNode, 'data-357-reveal-game'), dealerGameId: attr(revealNode, 'data-357-reveal-dealer-game'),
      roundId: attr(revealNode, 'data-357-reveal-round'), handNumber: Number(attr(revealNode, 'data-357-reveal-hand')),
      localEnd: Number(attr(revealNode, 'data-357-reveal-local-end')),
      serverEnd: Number(attr(revealNode, 'data-357-reveal-server-end')),
    } : null;
    const stages: VisibleStage[] = [];
    const finishedExits: Array<{ stage: VisibleStage; scope: PresentationScope | null }> = [];
    for (const [node, award] of observedAwards) {
      if (!node.isConnected) {
        const now = Date.now();
        if (!completed.has(node) && !endedEarly.has(node)) {
          const reason = now < award.end ? 'early-removal'
            : cssCompletedAt.has(node) || now - award.lastSeen < 100 ? 'retired-complete' : 'observation-gap';
          pendingEvidence.push({ scope: award.scope, stageId: award.stage.id, kind: award.stage.kind,
            reason, at: now, deadline: award.end, lastSeen: award.lastSeen,
            cssCompletedAt: cssCompletedAt.get(node) ?? null });
          if (reason === 'retired-complete') {
            finishedExits.push({ stage: { ...award.stage, finished: true }, scope: award.scope });
          }
        }
        observedAwards.delete(node);
      }
    }
    for (const node of document.querySelectorAll(selectors)) {
      const observed = observedAwards.get(node);
      if (observed && cssCompletedAt.has(node) && !endedEarly.has(node) && Date.now() >= observed.end) completed.add(node);
      if (!visible(node) && !completed.has(node)) continue;
      const kind = node.hasAttribute('data-leg-award') ? 'award' : node.hasAttribute('data-leg-sweep-flight') ? 'sweep' : node.getAttribute('data-chip-transport-from') === 'seat' ? 'payout' : 'pot';
      const stage: VisibleStage = { kind, id: attr(node, kind === 'award' ? 'data-leg-award' : kind === 'sweep' ? 'data-leg-sweep-flight' : 'data-chip-transport-intent'),
        finished: completed.has(node), winning: kind === 'award' ? attr(node, 'data-leg-award-winning') === '1' : undefined,
        generation: kind === 'award' ? node.getAttribute('data-leg-award-generation') : undefined };
      stages.push(stage);
      if (kind === 'payout') for (const element of [node, ...node.children]) {
        const declared = (element as HTMLElement).style?.animationDuration ?? '';
        const duration = parseFloat(declared) * (declared.endsWith('ms') ? 1 : 1000);
        if (duration > 0 && !declaredDurations.has(element)) declaredDurations.set(element, duration);
      }
      if (kind === 'award' || kind === 'pot' || kind === 'payout') {
        const end = Number(attr(node, kind === 'award' ? 'data-leg-award-completes-at' : 'data-chip-transport-completes-at'));
        if (end > 0) observedAwards.set(node, { stage, scope, end, lastSeen: Date.now() });
      }
    }
    const balances: Record<string, string> = {};
    const addBalance = (player: string, value: string) => {
      // Preserve disagreements between two simultaneously visible copies.
      if (player) balances[player] = balances[player] && balances[player] !== value ? `${balances[player]} <> ${value}` : value;
    };
    for (const node of document.querySelectorAll('[data-canonical-seat-cluster] [data-canonical-chip-balance-label]')) {
      if (visible(node)) addBalance(node.closest('[data-player-id]')?.getAttribute('data-player-id') ?? '', (node.textContent ?? '').trim());
    }
    for (const node of document.querySelectorAll('[data-chip-delta-anchor^="player:"]')) {
      if (visible(node)) addBalance(attr(node, 'data-chip-delta-anchor').slice(7), (node.textContent ?? '').trim());
    }
    const matchWin = document.querySelector('[data-canonical-announcement-type="match_win"]');
    const celebration = document.querySelector('[data-canonical-celebration-id]');
    const state: Omit<TransitionSample, 'at'> = {
      scope, reveal, stages,
      sweepOverlay: [...document.querySelectorAll('[data-sweep-the-legs-overlay]')].some(visible),
      setup: [...document.querySelectorAll('[data-dealer-game-setup-step], [data-canonical-announcement-type="dealer_configuring"]')].some(visible),
      balances,
      deltas: [...document.querySelectorAll('[data-chip-balance-delta]')].filter(visible).map(node => ({
        id: attr(node, 'data-chip-balance-delta'), batch: attr(node, 'data-chip-balance-delta-batch'),
        cursor: Number(attr(node, 'data-chip-balance-delta-cursor')), reason: attr(node, 'data-chip-balance-delta-reason'), text: (node.textContent ?? '').trim(),
      })),
      documentVisible: document.visibilityState === 'visible',
      matchWin: matchWin && visible(matchWin) ? { id: attr(matchWin, 'data-canonical-announcement-id'), text: (matchWin.textContent ?? '').trim() } : null,
      celebration: celebration && [...celebration.children].some(visible) ? attr(celebration, 'data-canonical-celebration-id') : null,
    };
    const signature = JSON.stringify(state);
    for (const exit of finishedExits) {
      // Record the outgoing stage's completion before the same DOM commit's
      // successor/setup state, preserving its captured identity.
      void target.__transitionPresentationSample({ at: Date.now(), ...state, scope: exit.scope,
        setup: false, stages: [exit.stage] });
    }
    for (const evidence of pendingEvidence.splice(0)) {
      void target.__transitionPresentationSample({ at: evidence.at, ...state, completionEvidence: [evidence] });
    }
    if (signature !== previous) {
      previous = signature;
      void target.__transitionPresentationSample({ at: Date.now(), ...state });
    }
  };
  const captureAnimationEnd = (event: Event) => {
    const animation = event as AnimationEvent;
    if (!/^(flyToTarget|legToPlayer-|__chipTransport_)/.test(animation.animationName)) return;
    const node = (event.target as Element).closest(selectors);
    if (event.type === 'animationcancel' && node?.getAttribute('data-chip-transport-from') !== 'seat') return;
    if (node && event.isTrusted) {
      const deadline = Number(node.getAttribute('data-leg-award-completes-at') ?? node.getAttribute('data-chip-transport-completes-at'));
      const sweepDuration = Number(node.getAttribute('data-leg-sweep-flight-duration-ms'));
      // CSS timelines can finish just before the JS retirement clock. For a
      // seat payout, validate the renderer's declared inline duration first;
      // keep the full retirement deadline for completion on DOM removal.
      const declared = (event.target as HTMLElement).style.animationDuration;
      const declaredMs = declaredDurations.get(event.target as Element)
        ?? parseFloat(declared) * (declared.endsWith('ms') ? 1 : 1000);
      const observed = observedAwards.get(node);
      const cancelled = event.type === 'animationcancel';
      let reason: CompletionEvidence['reason'] = 'css-complete';
      if (cancelled) {
        endedEarly.add(node);
        reason = 'cancelled-css';
      } else if (node.getAttribute('data-chip-transport-from') === 'seat' && declaredMs > 0) {
        if (animation.elapsedTime * 1000 < declaredMs) {
          endedEarly.add(node);
          reason = 'shortened-css';
        } else if (!endedEarly.has(node)) {
          cssCompletedAt.set(node, Date.now());
          if (Date.now() >= deadline) completed.add(node);
        }
      } else if ((deadline > 0 && Date.now() < deadline) || (sweepDuration > 0 && animation.elapsedTime * 1000 < sweepDuration)) endedEarly.add(node);
      else if (!endedEarly.has(node)) completed.add(node);
      if (observed && node.getAttribute('data-chip-transport-from') === 'seat') {
        pendingEvidence.push({ scope: observed.scope, stageId: observed.stage.id, kind: observed.stage.kind,
          reason, at: Date.now(), deadline, lastSeen: observed.lastSeen,
          cssCompletedAt: cssCompletedAt.get(node) ?? null, elapsedMs: animation.elapsedTime * 1000, declaredMs });
      }
      sample();
    }
  };
  document.addEventListener('animationend', captureAnimationEnd, true);
  document.addEventListener('animationcancel', captureAnimationEnd, true);
  new MutationObserver(sample).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const frame = () => { sample(); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
}

export class TransitionPresentationObserver {
  readonly samples: TransitionSample[] = [];
  overflow = false;
  async attach(context: BrowserContext, page: Page): Promise<void> {
    await context.exposeBinding('__transitionPresentationSample', (_, sample: TransitionSample) => {
      if (this.samples.length >= 20_000) { this.overflow = true; return; }
      this.samples.push(sample);
    });
    await context.addInitScript(installTransitionPresentationObserver);
    await page.evaluate(installTransitionPresentationObserver);
  }
  assert(expected: RoundPresentationExpectation) {
    if (this.overflow) throw new Error('Transition observation overflow; evidence is incomplete');
    return assertRoundPresentation(this.samples, expected);
  }
}
