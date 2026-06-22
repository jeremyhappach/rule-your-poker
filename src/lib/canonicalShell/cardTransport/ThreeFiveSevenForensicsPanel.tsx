/**
 * ThreeFiveSevenForensicsPanel — the "nuclear option".
 *
 * Permanent Debug Tools pill. Captures every render (rAF when expanded,
 * ~100ms interval when collapsed) into a 250-sample ring buffer plus a
 * full transition log of every watched-field change.
 *
 * Sections:
 *   A · DEAL RUNTIME
 *   B · TIMER FORENSICS (DOM inventory of every timer-like element)
 *   C · SELF HAND FORENSICS
 *   D · OPPONENT FORENSICS (per-seat)
 *   E · CARD-0 AUTOPSY (per-frame timeline, r1 self card-0)
 *   F · DOM INVENTORY (timers / hands / canonical card backs / flying cards / runtimes / hand+seat anchors)
 *   G · TRANSITION HISTORY (append-on-change)
 *
 * Pure derived/observed — no instrumentation hooks added into game code.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  getCardTransportDbg,
  getDealDbg,
  subscribeCardTransportDbg,
  subscribeDealDbg,
  type CardTransportDbgEntry,
  type DealDbgEntry,
} from './cardTransportDbg';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';
import {
  getMountedThreeFiveSevenTimerOwners,
  getThreeFiveSevenHandRenders,
  getThreeFiveSevenRenderTransitions,
  subscribeThreeFiveSevenForensics,
  type ForensicsHandRender,
  type ForensicsRenderTransition,
  type ForensicsTimerOwner,
} from './threeFiveSevenForensicsStore';

// ─────────────────────────────────────────────────────────────────────
// Ring buffers + transition log (module-level so data survives panel
// collapse/expand and pill-toggling).
// ─────────────────────────────────────────────────────────────────────

const RING_MAX = 250;
const TRANSITIONS_MAX = 500;
const CARD0_TIMELINE_MAX = 500;

interface Rect { x: number; y: number; w: number; h: number; cx: number; cy: number }

interface TimerInventoryItem {
  ownerId: string;
  componentName: string;
  gameType: string | null;
  handContextId: string | null;
  waveContextId: string | null;
  dealRuntimeId: string | null;
  phase: string;
  running: boolean;
  timeLeft: number | null;
  usesDealRuntime: boolean;
  reactKey: string | null;
  renderCount: number;
  selector: string;
  tag: string;
  rect: Rect | null;
  mounted: boolean;
  visible: boolean;
  parent: string;
  attrs: Record<string, string>;
}

interface SelfHandSnapshot {
  playerHandMounted: boolean;
  playerHandKey: string;
  playerHandRenderCount: number;
  fanLayoutInitialized: boolean;
  fanRootRect: Rect | null;
  handAnchorRect: Rect | null;
  authoritativeLength: number | null;
  effectiveLength: number | null;
  actualRenderedDomCount: number;
  cacheLength: number | null;
  cacheUpdatedAt: number | null;
  ownershipFloor: number | null;
  ownershipFloorApplied: boolean | null;
}

interface OpponentSnapshot {
  playerId: string;
  seat: number | null;
  mounted: boolean;
  cardCountToShow: number | null;
  visibleCount: number | null;
  actualRenderedDomCount: number;
  baselineApplied: boolean | null;
  renderGuardPassed: boolean | null;
  renderCount: number;
  lastVisibleCount: number | null;
  lastRenderedCount: number | null;
}

interface ForensicsSnapshot {
  t: number;
  // Section A
  gameType: string;
  dealerGameId: string | null;
  handNumber: number | null;
  roundNumber: number | null;
  waveContextId: string | null;
  dealRuntimeMounted: boolean;
  dealRuntimeKey: string | null;
  phase: string;
  expectedCount: number;
  cardsDispatched: number;
  cardsSettled: number;
  dealSettled: boolean;
  readyReleased: boolean;
  enterGameplayCalled: boolean;
  enterGameplayAt: number | null;
  runtimeRenderCount: number;
  // Section B (summary; full inventory in DOM inventory)
  mountedTimerCount: number;
  runningTimerCount: number;
  visibleTimerCount: number;
  timers: TimerInventoryItem[];
  // Section C
  selfHand: SelfHandSnapshot;
  // Section D
  opponents: OpponentSnapshot[];
  handRenders: ForensicsHandRender[];
  renderTransitions: ForensicsRenderTransition[];
}

interface TransitionEntry {
  t: number;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  stackHint: string;
}

interface Card0Frame {
  t: number;
  ownershipClaimAt: number | null;
  transportDestroyedAt: number | null;
  card0DomMountedAt: number | null;
  transportMounted: boolean;
  transportVisible: boolean;
  ownershipClaimed: boolean;
  destroyed: boolean;
  card0PresentInDOM: boolean;
  transportPresentInDOM: boolean;
  handAnchorRect: Rect | null;
  fanRootRect: Rect | null;
  card0Rect: Rect | null;
  distancePx: number | null;
}

const ringBuffer: ForensicsSnapshot[] = [];
const transitionLog: TransitionEntry[] = [];
const card0Timeline: Card0Frame[] = [];
const listeners = new Set<() => void>();

let runtimeRenderCount = 0;
let playerHandRenderCount = 0;
let lastPlayerHandKey = '';
const opponentRenderCounts = new Map<string, number>();
const opponentLastVisible = new Map<string, number>();
const opponentLastRendered = new Map<string, number>();

let lastSnapshot: ForensicsSnapshot | null = null;
let lastCard0IntentId: string | null = null;
let card0LaunchedAt: number | null = null;
let card0DestroyedAt: number | null = null;
let card0DomMountedAt: number | null = null;
let installed = false;

function emit() { listeners.forEach((l) => { try { l(); } catch { /* */ } }); }
function subscribeForensics(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }
function getRingBuffer(): ForensicsSnapshot[] { return ringBuffer; }
function getTransitionLog(): TransitionEntry[] { return transitionLog; }
function getCard0Timeline(): Card0Frame[] { return card0Timeline; }

function rectOf(el: Element | null): Rect | null {
  if (!el || typeof (el as HTMLElement).getBoundingClientRect !== 'function') return null;
  const r = (el as HTMLElement).getBoundingClientRect();
  return {
    x: +r.x.toFixed(1), y: +r.y.toFixed(1),
    w: +r.width.toFixed(2), h: +r.height.toFixed(2),
    cx: +(r.x + r.width / 2).toFixed(1), cy: +(r.y + r.height / 2).toFixed(1),
  };
}

function isVisible(el: Element | null): boolean {
  if (!el) return false;
  const r = (el as HTMLElement).getBoundingClientRect?.();
  if (!r || r.width <= 0 || r.height <= 0) return false;
  const cs = typeof window !== 'undefined' ? window.getComputedStyle(el as HTMLElement) : null;
  if (cs && (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0')) return false;
  return true;
}

function attrsOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    if (a.name.startsWith('data-') || a.name === 'class' || a.name === 'id' || a.name === 'aria-label') {
      out[a.name] = a.value.slice(0, 80);
    }
  }
  return out;
}

function parentChain(el: Element | null, depth = 3): string {
  if (!el) return '';
  const parts: string[] = [];
  let cur: Element | null = el.parentElement;
  for (let i = 0; i < depth && cur; i++) {
    const owner = cur.getAttribute?.('data-anchor-owner') ?? cur.getAttribute?.('data-canonical-shell-viewer-card-endpoint');
    parts.push(owner ?? cur.tagName.toLowerCase());
    cur = cur.parentElement;
  }
  return parts.join('<');
}

function ownerOf(el: Element | null): string {
  if (!el) return '';
  const anc = el.closest?.('[data-anchor-owner]');
  return anc?.getAttribute('data-anchor-owner') ?? '';
}

function uidOf(el: Element, idx: number): string {
  return el.getAttribute('data-card-id')
    ?? el.getAttribute('data-card-anchor')
    ?? el.getAttribute('data-canonical-card-back')
    ?? el.id
    ?? `${el.tagName.toLowerCase()}#${idx}`;
}

// Latest 3-5-7 deal entry: handContextId like ".....#h<N>#r<R>"
function pick357Deal(deals: DealDbgEntry[]): DealDbgEntry | null {
  return [...deals].reverse().find((d) => /#h\d+#r\d+$/.test(d.handContextId)) ?? null;
}

function parseHandCtx(ctx: string | null): { dealerGameId: string | null; handNumber: number | null; roundNumber: number | null } {
  if (!ctx) return { dealerGameId: null, handNumber: null, roundNumber: null };
  const m = ctx.match(/^(.*?)#h(\d+)#r(\d+)$/);
  if (!m) return { dealerGameId: null, handNumber: null, roundNumber: null };
  return { dealerGameId: m[1], handNumber: parseInt(m[2], 10), roundNumber: parseInt(m[3], 10) };
}

const WATCHED_FIELDS: (keyof ForensicsSnapshot | string)[] = [
  'phase', 'roundNumber', 'waveContextId',
  'effectiveCards', 'visibleCount', 'actualRenderedDomCount',
  'mountedTimerCount', 'runningTimerCount', 'visibleTimerCount',
  'playerHandMounted', 'playerHandKey', 'fanLayoutInitialized',
];

function recordTransition(field: string, oldV: unknown, newV: unknown, stackHint: string) {
  transitionLog.push({ t: performance.now(), field, oldValue: oldV, newValue: newV, stackHint });
  if (transitionLog.length > TRANSITIONS_MAX) transitionLog.shift();
}

function diffAndRecord(prev: ForensicsSnapshot | null, next: ForensicsSnapshot) {
  if (!prev) return;
  // Top-level scalar fields
  for (const f of ['phase', 'roundNumber', 'waveContextId', 'mountedTimerCount', 'runningTimerCount', 'visibleTimerCount']) {
    const a = (prev as unknown as Record<string, unknown>)[f];
    const b = (next as unknown as Record<string, unknown>)[f];
    if (a !== b) recordTransition(f, a, b, 'forensicsScan');
  }
  // Self-hand
  for (const f of ['playerHandMounted', 'playerHandKey', 'fanLayoutInitialized', 'actualRenderedDomCount', 'effectiveLength', 'authoritativeLength']) {
    const a = (prev.selfHand as unknown as Record<string, unknown>)[f];
    const b = (next.selfHand as unknown as Record<string, unknown>)[f];
    if (a !== b) recordTransition(`selfHand.${f}`, a, b, 'forensicsScan');
  }
}

function appendCard0Frame(cts: CardTransportDbgEntry[], deal: DealDbgEntry | null) {
  if (!deal) return;
  const handEpoch = deal.handContextId.match(/^(.*#h\d+)#r\d+$/)?.[1];
  if (!handEpoch) return;
  const r1Ctx = `${handEpoch}#r1`;
  const card0 = cts.find((r) => r.handContextId === r1Ctx && /#card-0$/.test(r.intentId));
  if (!card0) return;
  // Detect new card-0 (new hand)
  if (card0.intentId !== lastCard0IntentId) {
    lastCard0IntentId = card0.intentId;
    card0LaunchedAt = performance.now();
    card0DestroyedAt = null;
    card0DomMountedAt = null;
    card0Timeline.length = 0;
  }
  if (card0.transportDestroyedTime && card0DestroyedAt == null) {
    card0DestroyedAt = performance.now();
  }

  // DOM probes
  const handAnchorEl = document.querySelector('[data-canonical-self-hand-anchor-position="top-of-pane"]');
  const activeRegion = document.querySelector('[data-357-active-hand-region]');
  const selfCardEls = activeRegion ? Array.from(activeRegion.querySelectorAll('[data-playing-card-root], [data-card-id], [data-canonical-card-back]')) : [];
  const card0DomEl = selfCardEls[0] ?? null;
  if (card0DomEl && card0DomMountedAt == null) card0DomMountedAt = performance.now();
  const flyingCardEl = document.querySelector(`[data-card-transport-intent-id="${card0.intentId}"]`);
  const handAnchorRect = rectOf(handAnchorEl);
  const fanRootRect = rectOf((selfCardEls[0]?.parentElement as Element | null) ?? activeRegion);
  const card0Rect = rectOf(card0DomEl);
  const distancePx = (handAnchorRect && card0Rect)
    ? +Math.hypot(card0Rect.cx - handAnchorRect.cx, card0Rect.cy - handAnchorRect.cy).toFixed(1)
    : null;

  card0Timeline.push({
    t: performance.now(),
    ownershipClaimAt: card0.ownershipClaimTime ?? null,
    transportDestroyedAt: card0.transportDestroyedTime ?? null,
    card0DomMountedAt,
    transportMounted: !!card0.transportMounted,
    transportVisible: !!card0.transportVisible,
    ownershipClaimed: !!card0.ownershipClaimTime,
    destroyed: !!card0.transportDestroyedTime,
    card0PresentInDOM: !!card0DomEl,
    transportPresentInDOM: !!flyingCardEl,
    handAnchorRect,
    fanRootRect,
    card0Rect,
    distancePx,
  });
  if (card0Timeline.length > CARD0_TIMELINE_MAX) card0Timeline.shift();
}

function scan(): ForensicsSnapshot | null {
  if (typeof document === 'undefined') return null;
  runtimeRenderCount++;

  const deals = getDealDbg();
  const cts = getCardTransportDbg();
  const deal = pick357Deal(deals);
  const ctx = deal?.handContextId ?? null;
  const { dealerGameId, handNumber, roundNumber } = parseHandCtx(ctx);

  // ── Timer inventory ─────────────────────────────────────────────
  const timerSelectors = [
    '[data-canonical-shell-timer-rail]',
    '[data-shell-timer]',
    '[data-mobile-player-timer]',
    '[data-three-five-seven-timer]',
    '[data-legacy-timer]',
    '[data-active-player-timer]',
    '[data-game-timer]',
  ];
  const timerEls = new Set<Element>();
  for (const sel of timerSelectors) {
    document.querySelectorAll(sel).forEach((el) => timerEls.add(el));
  }
  const registeredTimerOwners = getMountedThreeFiveSevenTimerOwners();
  const registeredIds = new Set(registeredTimerOwners.map((o) => o.id));
  const registeredTimers: TimerInventoryItem[] = registeredTimerOwners.map((o) => ({
    ownerId: o.id,
    componentName: o.componentName,
    gameType: o.gameType,
    handContextId: o.handContextId,
    waveContextId: o.waveContextId,
    dealRuntimeId: o.dealRuntimeId,
    phase: o.phase,
    running: o.running,
    timeLeft: o.timeLeft,
    usesDealRuntime: o.usesDealRuntime,
    reactKey: o.reactKey,
    renderCount: o.renderCount,
    selector: 'registered-owner',
    tag: 'react',
    rect: null,
    mounted: o.mounted,
    visible: o.visible,
    parent: '',
    attrs: {},
  }));
  const domTimers: TimerInventoryItem[] = Array.from(timerEls).filter((el) => {
    const id = el.getAttribute('data-forensics-timer-owner-id');
    return !id || !registeredIds.has(id);
  }).map((el) => {
    const sel = timerSelectors.find((s) => el.matches(s)) ?? '?';
    const phase = el.getAttribute('data-forensics-timer-phase') ?? String(deal?.phase ?? 'NO_RUNTIME');
    const running = el.getAttribute('data-forensics-timer-running') === '1'
      || (isVisible(el) && el.getAttribute('data-shell-timer-paused') !== '1');
    const timeLeftRaw = el.getAttribute('data-forensics-timer-time-left');
    return {
      ownerId: el.getAttribute('data-forensics-timer-owner-id') ?? `DOM:${sel}:${parentChain(el, 1)}`,
      componentName: el.getAttribute('data-forensics-component') ?? (sel.includes('canonical') ? 'ShellTimerRail' : 'DOM timer'),
      gameType: el.getAttribute('data-forensics-game-type') ?? null,
      handContextId: el.getAttribute('data-forensics-hand-context-id') ?? ctx,
      waveContextId: el.getAttribute('data-forensics-wave-context-id') ?? ctx,
      dealRuntimeId: el.getAttribute('data-forensics-deal-runtime-id') ?? ctx?.replace(/#r\d+$/, '') ?? null,
      phase,
      running,
      timeLeft: timeLeftRaw != null && timeLeftRaw !== '' ? Number(timeLeftRaw) : null,
      usesDealRuntime: !!ctx,
      reactKey: el.getAttribute('data-forensics-react-key'),
      renderCount: Number(el.getAttribute('data-forensics-render-count') ?? 0),
      selector: sel,
      tag: el.tagName.toLowerCase(),
      rect: rectOf(el),
      mounted: true,
      visible: isVisible(el),
      parent: parentChain(el),
      attrs: attrsOf(el),
    };
  });
  const timers: TimerInventoryItem[] = [...registeredTimers, ...domTimers];
  const visibleTimerCount = timers.filter((t) => t.visible).length;
  const runningTimerCount = timers.filter((t) => t.running).length;

  // ── Self hand probes ────────────────────────────────────────────
  const handAnchorEl = document.querySelector('[data-canonical-self-hand-anchor-position="top-of-pane"]');
  const activeRegion = document.querySelector('[data-357-active-hand-region]');
  const selfCardEls = activeRegion ? Array.from(activeRegion.querySelectorAll('[data-card-id]')) : [];
  const fanLayoutInitialized = selfCardEls.length > 0;
  const playerHandKey = handAnchorEl?.getAttribute('data-card-anchor') ?? '∅';
  if (playerHandKey !== lastPlayerHandKey) {
    if (lastPlayerHandKey) recordTransition('PlayerHand.key', lastPlayerHandKey, playerHandKey, 'domDelta');
    lastPlayerHandKey = playerHandKey;
    playerHandRenderCount++;
  }
  const selfOwn = deal?.ownership ? Object.values(deal.ownership).find((o) => o.role === 'self') : null;
  const selfHand: SelfHandSnapshot = {
    playerHandMounted: !!handAnchorEl,
    playerHandKey,
    playerHandRenderCount,
    fanLayoutInitialized,
    fanRootRect: rectOf((selfCardEls[0]?.parentElement as Element | null) ?? activeRegion),
    handAnchorRect: rectOf(handAnchorEl),
    authoritativeLength: selfOwn?.authoritativeCount ?? null,
    effectiveLength: selfOwn?.visibleCount ?? null,
    actualRenderedDomCount: selfCardEls.length,
    cacheLength: selfOwn?.visibleCount ?? null,
    cacheUpdatedAt: selfOwn?.updatedAt ?? null,
    ownershipFloor: selfOwn?.prevWaveCount ?? null,
    ownershipFloorApplied: selfOwn?.baselineApplied ?? null,
  };

  // ── Opponent probes ─────────────────────────────────────────────
  const opponents: OpponentSnapshot[] = [];
  const oppEntries = deal?.ownership
    ? Object.values(deal.ownership).filter((o) => o.role === 'opp')
    : [];
  for (const o of oppEntries) {
    // DOM count for opp: cards-by-player on the felt (outside active region).
    // Use opp-stack anchor proximity if present; otherwise filter [data-card-id] containing playerId.
    const stackEl = document.querySelector(`[data-card-anchor="opp-stack-${o.playerId}"]`)
      || document.querySelector(`[data-opp-player-id="${o.playerId}"]`);
    const stackChildren = stackEl ? Array.from(stackEl.querySelectorAll('[data-card-id], [data-canonical-card-back]')) : [];
    // Fallback: any [data-card-id*=":<playerId-prefix>:"] outside active region
    const fallback = stackChildren.length === 0
      ? Array.from(document.querySelectorAll(`[data-card-id*="${o.playerId.slice(0, 6)}"]`))
        .filter((el) => !activeRegion || !activeRegion.contains(el))
      : [];
    const renderedCount = stackChildren.length || fallback.length;
    const prevRender = opponentRenderCounts.get(o.playerId) ?? 0;
    if ((opponentLastVisible.get(o.playerId) ?? null) !== o.visibleCount
        || (opponentLastRendered.get(o.playerId) ?? null) !== renderedCount) {
      opponentRenderCounts.set(o.playerId, prevRender + 1);
    }
    const seatAttr = stackEl?.getAttribute('data-card-anchor')?.match(/opp-stack-(\d+)/);
    opponents.push({
      playerId: o.playerId,
      seat: seatAttr ? parseInt(seatAttr[1], 10) : null,
      mounted: !!stackEl,
      cardCountToShow: o.authoritativeCount,
      visibleCount: o.visibleCount,
      actualRenderedDomCount: renderedCount,
      baselineApplied: o.baselineApplied,
      renderGuardPassed: o.renderGuardPassed,
      renderCount: opponentRenderCounts.get(o.playerId) ?? 0,
      lastVisibleCount: opponentLastVisible.get(o.playerId) ?? null,
      lastRenderedCount: opponentLastRendered.get(o.playerId) ?? null,
    });
    opponentLastVisible.set(o.playerId, o.visibleCount);
    opponentLastRendered.set(o.playerId, renderedCount);
  }

  const snap: ForensicsSnapshot = {
    t: performance.now(),
    gameType: '3-5-7',
    dealerGameId,
    handNumber,
    roundNumber,
    waveContextId: ctx,
    dealRuntimeMounted: !!deal,
    dealRuntimeKey: ctx,
    phase: String(deal?.phase ?? 'NO_RUNTIME'),
    expectedCount: deal?.expectedCount ?? 0,
    cardsDispatched: deal?.cardsDispatched ?? 0,
    cardsSettled: deal?.cardsSettled ?? 0,
    dealSettled: !!deal?.dealSettled,
    readyReleased: !!deal?.readyReleased,
    enterGameplayCalled: !!deal?.enterGameplayCalledAt,
    enterGameplayAt: deal?.enterGameplayCalledAt ?? null,
    runtimeRenderCount,
    mountedTimerCount: timers.length,
    runningTimerCount,
    visibleTimerCount,
    timers,
    selfHand,
    opponents,
  };

  diffAndRecord(lastSnapshot, snap);
  appendCard0Frame(cts, deal);

  ringBuffer.push(snap);
  if (ringBuffer.length > RING_MAX) ringBuffer.shift();
  lastSnapshot = snap;
  emit();
  return snap;
}

function ensureInstalled() {
  if (installed) return;
  installed = true;
  // Always-on sampler so the ring buffer exists even when the pill is off.
  if (typeof window === 'undefined') return;
  window.setInterval(() => {
    try { scan(); } catch { /* noop */ }
  }, 150);
}

// ─────────────────────────────────────────────────────────────────────
// DOM inventory (computed lazily on render — not buffered)
// ─────────────────────────────────────────────────────────────────────

interface InventoryItem {
  uid: string;
  component: string;
  reactKey: string;
  mounted: boolean;
  visible: boolean;
  rect: Rect | null;
  parent: string;
  owner: string;
}

function inventory(category: string, selector: string): InventoryItem[] {
  if (typeof document === 'undefined') return [];
  const els = Array.from(document.querySelectorAll(selector));
  return els.map((el, i) => ({
    uid: uidOf(el, i),
    component: category,
    reactKey: el.getAttribute('data-react-key') ?? '',
    mounted: true,
    visible: isVisible(el),
    rect: rectOf(el),
    parent: parentChain(el, 2),
    owner: ownerOf(el),
  }));
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

export function ThreeFiveSevenForensicsPanel() {
  const inTray = useInDebugTray();
  const enabled = useDebugPillEnabled('threeFiveSevenForensics');

  useEffect(() => { ensureInstalled(); }, []);

  // Subscribe so the panel rerenders on any new snapshot.
  useSyncExternalStore(subscribeForensics, getRingBuffer, getRingBuffer);
  useSyncExternalStore(subscribeDealDbg, getDealDbg, getDealDbg);
  useSyncExternalStore(subscribeCardTransportDbg, getCardTransportDbg, getCardTransportDbg);
  const transitions = useSyncExternalStore(subscribeForensics, getTransitionLog, getTransitionLog);
  const card0frames = useSyncExternalStore(subscribeForensics, getCard0Timeline, getCard0Timeline);

  const [expanded, setExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<'A'|'B'|'C'|'D'|'E'|'F'|'G'>('A');

  // While expanded, ramp sampling up to ~rAF.
  useEffect(() => {
    if (!enabled || !expanded) return;
    let raf = 0;
    const tick = () => { try { scan(); } catch { /* noop */ } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, expanded]);

  if (!enabled) return null;

  const snap = lastSnapshot;
  const aBad = snap && snap.phase === 'DEALING' && snap.enterGameplayCalled;
  const bBadRunning = snap && snap.phase === 'DEALING' && snap.runningTimerCount > 0;
  const bBadVisible = snap && snap.phase === 'DEALING' && snap.visibleTimerCount > 0;
  const cBadDom = snap && (snap.selfHand.effectiveLength ?? 0) > snap.selfHand.actualRenderedDomCount;

  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0 2px' };
  const k: React.CSSProperties = { color: '#9fb3c8' };
  const v: React.CSSProperties = { color: '#fff', fontVariantNumeric: 'tabular-nums' };
  const violation: React.CSSProperties = { color: '#ff6b6b', fontWeight: 700 };
  const ok: React.CSSProperties = { color: '#7CFC00', fontWeight: 700 };
  const sect: React.CSSProperties = { borderTop: '1px solid #2a2a2a', padding: '6px 6px 4px', marginTop: 4 };
  const sectTitle: React.CSSProperties = { color: '#FFD580', fontWeight: 700, marginBottom: 3 };

  function copy() {
    const payload = {
      capturedAt: new Date().toISOString(),
      latest: snap,
      ringBuffer: [...ringBuffer],
      transitions: [...transitions],
      card0Timeline: [...card0frames],
      inventory: {
        timers: inventory('Timer', '[data-canonical-shell-timer-rail], [data-shell-timer], [data-mobile-player-timer], [data-three-five-seven-timer], [data-legacy-timer], [data-active-player-timer], [data-game-timer]'),
        playerHands: inventory('PlayerHand', '[data-canonical-self-hand-anchor-position], [data-player-hand]'),
        cardBacks: inventory('CardBack', '[data-canonical-card-back]'),
        flyingCards: inventory('FlyingCard', '[data-card-transport-intent-id]'),
        dealRuntimes: inventory('DealRuntime', '[data-deal-runtime-id], [data-canonical-deal-runtime]'),
        handAnchors: inventory('HandAnchor', '[data-card-anchor^="hand-"]'),
        seatAnchors: inventory('SeatAnchor', '[data-card-anchor^="seat-"], [data-card-anchor^="opp-stack-"]'),
        cardIds: inventory('CardId', '[data-card-id]'),
      },
      counters: { runtimeRenderCount, playerHandRenderCount, opponentRenderCounts: Object.fromEntries(opponentRenderCounts) },
    };
    const text = JSON.stringify(payload, null, 2);
    navigator.clipboard?.writeText(text).catch(() => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      } catch { /* noop */ }
    });
  }

  const tabs: Array<{ id: 'A'|'B'|'C'|'D'|'E'|'F'|'G'; label: string }> = [
    { id: 'A', label: 'A·RUNTIME' },
    { id: 'B', label: 'B·TIMERS' },
    { id: 'C', label: 'C·SELF' },
    { id: 'D', label: 'D·OPP' },
    { id: 'E', label: 'E·CARD0' },
    { id: 'F', label: 'F·DOM' },
    { id: 'G', label: 'G·TRANS' },
  ];

  return (
    <div
      data-three-five-seven-forensics-panel=""
      style={{
        ...(inTray
          ? { position: 'relative' as const }
          : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(96vw, 560px)' : 'auto',
        maxWidth: expanded ? undefined : 380,
        background: 'rgba(0,0,0,0.92)', color: '#fff',
        border: '1px solid #555', borderRadius: 4,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10, lineHeight: 1.35, pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px' }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', color: '#fff', padding: 0, fontWeight: 700 }}
        >
          {expanded ? '▼' : '▶'} 357 FORENSICS
          {snap ? (
            <span style={{ fontWeight: 400, opacity: 0.85 }}>
              {' '}· h{snap.handNumber ?? '?'} r{snap.roundNumber ?? '?'} {snap.phase}
              {' '}T={snap.mountedTimerCount}/{snap.visibleTimerCount} self={snap.selfHand.actualRenderedDomCount}/{snap.selfHand.effectiveLength ?? '?'}
              {aBad ? <span style={violation}> ⚠A</span> : null}
              {(bBadRunning || bBadVisible) ? <span style={violation}> ⚠B</span> : null}
              {cBadDom ? <span style={violation}> ⚠C</span> : null}
            </span>
          ) : <span style={{ opacity: 0.6 }}> · (no data)</span>}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); copy(); const b = e.currentTarget as HTMLButtonElement; const o = b.textContent; b.textContent = '✓'; setTimeout(() => { b.textContent = o; }, 1200); }}
          style={{ background: '#1e3a5f', color: '#fff', border: '1px solid #4a7bb8', borderRadius: 3, padding: '2px 8px', fontFamily: 'inherit', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
          title="Copy forensics snapshot + ring buffer + transitions + DOM inventory"
        >Copy</button>
      </div>

      {expanded ? (
        <div style={{ maxHeight: 560, overflow: 'auto' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: '2px 4px', borderTop: '1px solid #333', background: 'rgba(255,255,255,0.03)' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveSection(t.id)}
                style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                  background: activeSection === t.id ? '#FFD580' : 'transparent',
                  color: activeSection === t.id ? '#000' : '#fff',
                  border: '1px solid #555', fontFamily: 'inherit', fontWeight: 700,
                }}
              >{t.label}</button>
            ))}
          </div>

          {snap == null ? <div style={{ padding: 6, opacity: 0.6 }}>(no snapshot yet)</div> : (
            <>
              {activeSection === 'A' && (
                <div style={sect}>
                  <div style={sectTitle}>A · DEAL RUNTIME</div>
                  <Row label="gameType" value={snap.gameType} />
                  <Row label="dealerGameId" value={snap.dealerGameId ?? '∅'} />
                  <Row label="handNumber" value={String(snap.handNumber ?? '—')} />
                  <Row label="roundNumber" value={String(snap.roundNumber ?? '—')} />
                  <Row label="waveContextId" value={snap.waveContextId ?? '∅'} />
                  <Row label="dealRuntimeMounted" value={String(snap.dealRuntimeMounted)} good={snap.dealRuntimeMounted} />
                  <Row label="dealRuntimeKey" value={snap.dealRuntimeKey ?? '∅'} />
                  <Row label="phase" value={snap.phase} />
                  <Row label="expectedCount" value={String(snap.expectedCount)} />
                  <Row label="cardsDispatched" value={String(snap.cardsDispatched)} />
                  <Row label="cardsSettled" value={String(snap.cardsSettled)} />
                  <Row label="dealSettled" value={String(snap.dealSettled)} good={snap.dealSettled} />
                  <Row label="readyReleased" value={String(snap.readyReleased)} good={snap.readyReleased} />
                  <Row label="enterGameplayCalled" value={String(snap.enterGameplayCalled)} bad={!!aBad} />
                  <Row label="enterGameplayAt" value={snap.enterGameplayAt ? `${(snap.enterGameplayAt/1000).toFixed(2)}s` : '—'} />
                  <Row label="runtimeRenderCount" value={String(snap.runtimeRenderCount)} />
                  {aBad ? <div style={{ ...violation, padding: '4px 2px' }}>⚠ phase=DEALING AND enterGameplayCalled=true</div> : null}
                </div>
              )}

              {activeSection === 'B' && (
                <div style={sect}>
                  <div style={sectTitle}>B · TIMER FORENSICS</div>
                  <Row label="mountedTimerCount" value={String(snap.mountedTimerCount)} bad={snap.mountedTimerCount > 1} />
                  <Row label="runningTimerCount" value={String(snap.runningTimerCount)} bad={!!bBadRunning} />
                  <Row label="visibleTimerCount" value={String(snap.visibleTimerCount)} bad={!!bBadVisible} />
                  {(bBadRunning || bBadVisible) ? <div style={{ ...violation, padding: '4px 2px' }}>⚠ phase=DEALING but timer is running/visible</div> : null}
                  <div style={{ marginTop: 4, color: '#9fd6ff', fontWeight: 700 }}>per-timer inventory</div>
                  {snap.timers.length === 0 ? <div style={{ opacity: 0.6 }}>(no timer DOM)</div> : snap.timers.map((t, i) => (
                    <div key={i} style={{ borderTop: '1px dashed #2a2a2a', padding: '2px 0' }}>
                      <div style={{ color: t.visible ? '#7CFC00' : '#9fb3c8' }}>{t.selector} <span style={{ opacity: 0.7 }}>({t.tag})</span></div>
                      <div>mounted={String(t.mounted)} visible={String(t.visible)} paused={t.attrs['data-shell-timer-paused'] ?? '—'}</div>
                      <div>rect={t.rect ? `${t.rect.x},${t.rect.y} ${t.rect.w}×${t.rect.h}` : '—'}</div>
                      <div style={{ opacity: 0.75 }}>parent={t.parent || '∅'}</div>
                    </div>
                  ))}
                </div>
              )}

              {activeSection === 'C' && (
                <div style={sect}>
                  <div style={sectTitle}>C · SELF HAND FORENSICS</div>
                  <Row label="PlayerHandMounted" value={String(snap.selfHand.playerHandMounted)} good={snap.selfHand.playerHandMounted} bad={!snap.selfHand.playerHandMounted} />
                  <Row label="PlayerHandKey" value={snap.selfHand.playerHandKey} />
                  <Row label="PlayerHandRenderCount" value={String(snap.selfHand.playerHandRenderCount)} />
                  <Row label="fanLayoutInitialized" value={String(snap.selfHand.fanLayoutInitialized)} />
                  <Row label="fanRootRect" value={fmtRect(snap.selfHand.fanRootRect)} />
                  <Row label="handAnchorRect" value={fmtRect(snap.selfHand.handAnchorRect)} />
                  <Row label="authoritativeLength" value={String(snap.selfHand.authoritativeLength ?? '—')} />
                  <Row label="effectiveLength" value={String(snap.selfHand.effectiveLength ?? '—')} />
                  <Row label="actualRenderedDomCount" value={String(snap.selfHand.actualRenderedDomCount)} bad={!!cBadDom} />
                  <Row label="cacheLength" value={String(snap.selfHand.cacheLength ?? '—')} />
                  <Row label="cacheUpdatedAt" value={snap.selfHand.cacheUpdatedAt ? `${(snap.selfHand.cacheUpdatedAt/1000).toFixed(2)}s` : '—'} />
                  <Row label="ownershipFloor (prevWave)" value={String(snap.selfHand.ownershipFloor ?? '—')} />
                  <Row label="ownershipFloorApplied" value={String(snap.selfHand.ownershipFloorApplied ?? '—')} />
                  {cBadDom ? <div style={{ ...violation, padding: '4px 2px' }}>⚠ actualRenderedDomCount &lt; effectiveLength</div> : null}
                </div>
              )}

              {activeSection === 'D' && (
                <div style={sect}>
                  <div style={sectTitle}>D · OPPONENT FORENSICS</div>
                  {snap.opponents.length === 0 ? <div style={{ opacity: 0.6 }}>(no opponents in ownership)</div> : snap.opponents.map((o) => {
                    const bad = (o.visibleCount ?? 0) > o.actualRenderedDomCount;
                    return (
                      <div key={o.playerId} style={{ borderTop: '1px dashed #2a2a2a', padding: '3px 0' }}>
                        <div style={{ color: bad ? '#ff6b6b' : '#87CEFA', fontWeight: 700 }}>{o.playerId.slice(0, 8)} seat={o.seat ?? '?'} {bad ? '⚠ DOM&lt;VIS' : ''}</div>
                        <Row label="mounted" value={String(o.mounted)} good={o.mounted} />
                        <Row label="cardCountToShow" value={String(o.cardCountToShow ?? '—')} />
                        <Row label="visibleCount" value={String(o.visibleCount ?? '—')} />
                        <Row label="actualRenderedDomCount" value={String(o.actualRenderedDomCount)} bad={bad} />
                        <Row label="baselineApplied" value={String(o.baselineApplied ?? '—')} />
                        <Row label="renderGuardPassed" value={String(o.renderGuardPassed ?? '—')} />
                        <Row label="renderCount" value={String(o.renderCount)} />
                        <Row label="lastVisibleCount" value={String(o.lastVisibleCount ?? '—')} />
                        <Row label="lastRenderedCount" value={String(o.lastRenderedCount ?? '—')} />
                      </div>
                    );
                  })}
                </div>
              )}

              {activeSection === 'E' && (
                <div style={sect}>
                  <div style={sectTitle}>E · CARD-0 AUTOPSY (r1 self · {card0frames.length} frames)</div>
                  <Row label="card0IntentId" value={lastCard0IntentId ?? '∅'} />
                  <Row label="launchedAt" value={card0LaunchedAt ? `${(card0LaunchedAt/1000).toFixed(2)}s` : '—'} />
                  <Row label="destroyedAt" value={card0DestroyedAt ? `${(card0DestroyedAt/1000).toFixed(2)}s` : '—'} />
                  <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 4 }}>
                    {card0frames.length === 0 ? <div style={{ opacity: 0.6 }}>(no card-0 launched yet)</div> : card0frames.map((f, i) => {
                      const bad = f.destroyed && f.transportPresentInDOM;
                      const gap = f.ownershipClaimed && !f.card0PresentInDOM;
                      return (
                        <div key={i} style={{ borderTop: '1px dashed #2a2a2a', padding: '2px 0' }}>
                          <div style={{ color: bad || gap ? '#ff6b6b' : '#87CEFA' }}>
                            +{(f.t - (card0LaunchedAt ?? f.t)).toFixed(0)}ms · M{f.transportMounted ? '1' : '0'} V{f.transportVisible ? '1' : '0'} OC{f.ownershipClaimed ? '1' : '0'} D{f.destroyed ? '1' : '0'} · domCard0={String(f.card0PresentInDOM)} domTransport={String(f.transportPresentInDOM)} {gap ? '⚠ GAP' : ''}
                          </div>
                          <div style={{ opacity: 0.8 }}>dist={f.distancePx ?? '—'}px · anchor={f.handAnchorRect ? `(${f.handAnchorRect.cx},${f.handAnchorRect.cy})` : '—'} card={f.card0Rect ? `(${f.card0Rect.cx},${f.card0Rect.cy})` : '—'}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeSection === 'F' && (
                <div style={sect}>
                  <div style={sectTitle}>F · DOM INVENTORY (live)</div>
                  <InventoryBlock title="Timers" selector="[data-canonical-shell-timer-rail], [data-shell-timer], [data-mobile-player-timer], [data-three-five-seven-timer], [data-legacy-timer], [data-active-player-timer], [data-game-timer]" />
                  <InventoryBlock title="PlayerHands" selector="[data-canonical-self-hand-anchor-position], [data-player-hand]" />
                  <InventoryBlock title="CanonicalCardBacks" selector="[data-canonical-card-back]" />
                  <InventoryBlock title="FlyingCards" selector="[data-card-transport-intent-id]" />
                  <InventoryBlock title="DealRuntimes" selector="[data-deal-runtime-id], [data-canonical-deal-runtime]" />
                  <InventoryBlock title="HandAnchors" selector='[data-card-anchor^="hand-"]' />
                  <InventoryBlock title="SeatAnchors" selector='[data-card-anchor^="seat-"], [data-card-anchor^="opp-stack-"]' />
                  <InventoryBlock title="CardIds" selector="[data-card-id]" />
                </div>
              )}

              {activeSection === 'G' && (
                <div style={sect}>
                  <div style={sectTitle}>G · TRANSITION HISTORY (last {transitions.length}/{TRANSITIONS_MAX})</div>
                  <div style={{ maxHeight: 360, overflow: 'auto' }}>
                    {transitions.length === 0 ? <div style={{ opacity: 0.6 }}>(no transitions yet)</div> : [...transitions].reverse().map((tr, i) => (
                      <div key={i} style={{ borderTop: '1px dashed #2a2a2a', padding: '2px 0' }}>
                        <div style={{ color: '#FFD580' }}>+{tr.t.toFixed(0)}ms · <b>{tr.field}</b></div>
                        <div>old={fmtVal(tr.oldValue)} → new={fmtVal(tr.newValue)}</div>
                        <div style={{ opacity: 0.6 }}>{tr.stackHint}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Small helpers / subcomponents ──────────────────────────────────

function Row({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  const k: React.CSSProperties = { color: '#9fb3c8' };
  const v: React.CSSProperties = {
    color: bad ? '#ff6b6b' : good ? '#7CFC00' : '#fff',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: (good || bad) ? 700 : 400,
  };
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0 2px' }}>
      <span style={k}>{label}</span><span style={v}>{value}</span>
    </div>
  );
}

function fmtRect(r: Rect | null): string {
  if (!r) return '—';
  return `${r.x},${r.y} ${r.w}×${r.h} c=(${r.cx},${r.cy})`;
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function InventoryBlock({ title, selector }: { title: string; selector: string }) {
  const items = inventory(title, selector);
  return (
    <div style={{ borderTop: '1px dashed #2a2a2a', padding: '3px 0' }}>
      <div style={{ color: '#9fd6ff', fontWeight: 700 }}>{title} ({items.length})</div>
      {items.length === 0 ? <div style={{ opacity: 0.55 }}>(none)</div> : items.slice(0, 24).map((it, i) => (
        <div key={i} style={{ padding: '1px 0' }}>
          <div style={{ color: it.visible ? '#7CFC00' : '#9fb3c8' }}>{it.uid} <span style={{ opacity: 0.7 }}>vis={String(it.visible)}</span></div>
          <div style={{ opacity: 0.8 }}>rect={fmtRect(it.rect)}</div>
          <div style={{ opacity: 0.65 }}>owner={it.owner || '∅'} · parent={it.parent || '∅'}</div>
        </div>
      ))}
      {items.length > 24 ? <div style={{ opacity: 0.6 }}>… +{items.length - 24} more (in Copy snapshot)</div> : null}
    </div>
  );
}
