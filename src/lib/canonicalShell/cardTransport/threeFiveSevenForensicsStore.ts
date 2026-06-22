export interface ForensicsTimerOwner {
  id: string;
  componentName: string;
  gameType: string | null;
  handContextId: string | null;
  waveContextId: string | null;
  dealRuntimeId: string | null;
  phase: string;
  visible: boolean;
  running: boolean;
  timeLeft: number | null;
  usesDealRuntime: boolean;
  suppressedLegacySource?: string | null;
  attemptedRunning?: boolean;
  reactKey: string | null;
  renderCount: number;
  mountedAt: number;
  unmountedAt: number | null;
  mounted: boolean;
  updatedAt: number;
}

export interface ForensicsHandRender {
  id: string;
  component: 'SELF' | 'OPPONENT' | 'PLAYER_HAND';
  componentName: string;
  seat: number | null;
  playerId: string | null;
  mounted: boolean;
  playerHandMounted: boolean;
  playerHandKey: string | null;
  reactKey: string | null;
  renderCount: number;
  cardsLength: number | null;
  effectiveCardsLength: number | null;
  visibleCount: number | null;
  actualRenderedDomCount: number;
  fanLayoutInitialized: boolean | null;
  mountedAt: number;
  unmountedAt: number | null;
  updatedAt: number;
}

export interface ForensicsRenderTransition {
  timestamp: number;
  wallTime: string;
  component: string;
  event: 'mount' | 'unmount' | 'key change' | 'effectiveCards change' | 'actualRenderedDomCount change' | 'visibleCount change' | 'timer change';
  old: unknown;
  new: unknown;
}

const timerOwners = new Map<string, ForensicsTimerOwner>();
const handRenders = new Map<string, ForensicsHandRender>();
const transitions: ForensicsRenderTransition[] = [];
const listeners = new Set<() => void>();
const MAX_TRANSITIONS = 500;
let timerOwnersSnapshot: ForensicsTimerOwner[] = [];
let mountedTimerOwnersSnapshot: ForensicsTimerOwner[] = [];
let handRendersSnapshot: ForensicsHandRender[] = [];
let transitionsSnapshot: ForensicsRenderTransition[] = [];
let dirty = true;

function now(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
function emit(): void { dirty = true; listeners.forEach((l) => { try { l(); } catch { /* noop */ } }); }
function refreshSnapshots(): void {
  if (!dirty) return;
  timerOwnersSnapshot = Array.from(timerOwners.values()).sort((a, b) => a.mountedAt - b.mountedAt);
  mountedTimerOwnersSnapshot = timerOwnersSnapshot.filter((o) => o.mounted);
  handRendersSnapshot = Array.from(handRenders.values()).sort((a, b) => a.mountedAt - b.mountedAt);
  transitionsSnapshot = transitions.slice();
  dirty = false;
}
function pushTransition(component: string, event: ForensicsRenderTransition['event'], oldValue: unknown, newValue: unknown): void {
  transitions.push({ timestamp: now(), wallTime: new Date().toISOString(), component, event, old: oldValue, new: newValue });
  if (transitions.length > MAX_TRANSITIONS) transitions.shift();
}

export function subscribeThreeFiveSevenForensics(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getThreeFiveSevenTimerOwners(): ForensicsTimerOwner[] {
  refreshSnapshots();
  return timerOwnersSnapshot;
}

export function getMountedThreeFiveSevenTimerOwners(): ForensicsTimerOwner[] {
  refreshSnapshots();
  return mountedTimerOwnersSnapshot;
}

export function getThreeFiveSevenHandRenders(): ForensicsHandRender[] {
  refreshSnapshots();
  return handRendersSnapshot;
}

export function getThreeFiveSevenRenderTransitions(): ForensicsRenderTransition[] {
  refreshSnapshots();
  return transitionsSnapshot;
}

export function recordThreeFiveSevenTimerOwner(
  id: string,
  patch: Omit<Partial<ForensicsTimerOwner>, 'id' | 'mountedAt' | 'updatedAt'> & { componentName: string },
): void {
  const t = now();
  const prev = timerOwners.get(id);
  if (!prev) {
    const next: ForensicsTimerOwner = {
      id,
      componentName: patch.componentName,
      gameType: patch.gameType ?? null,
      handContextId: patch.handContextId ?? null,
      waveContextId: patch.waveContextId ?? null,
      dealRuntimeId: patch.dealRuntimeId ?? null,
      phase: patch.phase ?? 'UNKNOWN',
      visible: !!patch.visible,
      running: !!patch.running,
      timeLeft: patch.timeLeft ?? null,
      usesDealRuntime: !!patch.usesDealRuntime,
      suppressedLegacySource: patch.suppressedLegacySource ?? null,
      attemptedRunning: patch.attemptedRunning ?? false,
      reactKey: patch.reactKey ?? null,
      renderCount: patch.renderCount ?? 1,
      mountedAt: t,
      unmountedAt: null,
      mounted: true,
      updatedAt: t,
    };
    timerOwners.set(id, next);
    pushTransition(next.componentName, 'mount', null, { id, phase: next.phase, running: next.running });
    emit();
    return;
  }
  const next: ForensicsTimerOwner = { ...prev, ...patch, id, mounted: true, unmountedAt: null, updatedAt: t };
  if (prev.phase !== next.phase || prev.running !== next.running || prev.visible !== next.visible || prev.timeLeft !== next.timeLeft) {
    pushTransition(next.componentName, 'timer change', {
      phase: prev.phase, visible: prev.visible, running: prev.running, timeLeft: prev.timeLeft,
    }, {
      phase: next.phase, visible: next.visible, running: next.running, timeLeft: next.timeLeft,
    });
  }
  timerOwners.set(id, next);
  emit();
}

export function unregisterThreeFiveSevenTimerOwner(id: string): void {
  const prev = timerOwners.get(id);
  if (!prev || !prev.mounted) return;
  const t = now();
  timerOwners.set(id, { ...prev, mounted: false, visible: false, running: false, unmountedAt: t, updatedAt: t });
  pushTransition(prev.componentName, 'unmount', { id, phase: prev.phase, running: prev.running }, null);
  emit();
}

export function recordThreeFiveSevenHandRender(
  id: string,
  patch: Omit<Partial<ForensicsHandRender>, 'id' | 'mountedAt' | 'updatedAt'> & { componentName: string },
): void {
  const t = now();
  const prev = handRenders.get(id);
  if (!prev) {
    const next: ForensicsHandRender = {
      id,
      component: patch.component ?? 'PLAYER_HAND',
      componentName: patch.componentName,
      seat: patch.seat ?? null,
      playerId: patch.playerId ?? null,
      mounted: true,
      playerHandMounted: patch.playerHandMounted ?? true,
      playerHandKey: patch.playerHandKey ?? null,
      reactKey: patch.reactKey ?? null,
      renderCount: patch.renderCount ?? 1,
      cardsLength: patch.cardsLength ?? null,
      effectiveCardsLength: patch.effectiveCardsLength ?? null,
      visibleCount: patch.visibleCount ?? null,
      actualRenderedDomCount: patch.actualRenderedDomCount ?? 0,
      fanLayoutInitialized: patch.fanLayoutInitialized ?? null,
      mountedAt: t,
      unmountedAt: null,
      updatedAt: t,
    };
    handRenders.set(id, next);
    pushTransition(next.componentName, 'mount', null, { id, key: next.playerHandKey, actualRenderedDomCount: next.actualRenderedDomCount });
    emit();
    return;
  }
  const next: ForensicsHandRender = { ...prev, ...patch, id, mounted: true, playerHandMounted: true, unmountedAt: null, updatedAt: t };
  if (prev.playerHandKey !== next.playerHandKey || prev.reactKey !== next.reactKey) {
    pushTransition(next.componentName, 'key change', prev.playerHandKey ?? prev.reactKey, next.playerHandKey ?? next.reactKey);
  }
  if (prev.effectiveCardsLength !== next.effectiveCardsLength) {
    pushTransition(next.componentName, 'effectiveCards change', prev.effectiveCardsLength, next.effectiveCardsLength);
  }
  if (prev.visibleCount !== next.visibleCount) {
    pushTransition(next.componentName, 'visibleCount change', prev.visibleCount, next.visibleCount);
  }
  if (prev.actualRenderedDomCount !== next.actualRenderedDomCount) {
    pushTransition(next.componentName, 'actualRenderedDomCount change', prev.actualRenderedDomCount, next.actualRenderedDomCount);
  }
  handRenders.set(id, next);
  emit();
}

export function unregisterThreeFiveSevenHandRender(id: string): void {
  const prev = handRenders.get(id);
  if (!prev || !prev.mounted) return;
  const t = now();
  handRenders.set(id, { ...prev, mounted: false, playerHandMounted: false, unmountedAt: t, updatedAt: t });
  pushTransition(prev.componentName, 'unmount', { id, key: prev.playerHandKey, count: prev.actualRenderedDomCount }, null);
  emit();
}
