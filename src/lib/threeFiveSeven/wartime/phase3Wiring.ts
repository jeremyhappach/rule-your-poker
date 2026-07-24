/**
 * 3-5-7 Wartime — Phase 3 production wiring.
 *
 * Provides the DOM/geometry/presentation/progression instrumentation
 * helpers. Each helper emits diagnostic-only events at real production
 * source sites. Importing this module marks Phase 3 requirements as
 * installed by their canonical source-site IDs; the module is imported
 * by the real owner files (MobileGameTable, PotToPlayerAnimation,
 * Game, orchestrator, App, useActiveHandCardRects, gameLogic).
 *
 * No behavioral changes: every observer/listener is passive.
 */

import { emitWartime, type WartimeIdentity, type WartimeOwner } from './emit';
import { markHelperImplemented } from './coverage';
import { SRC } from './sourceSites';

// ── DOM snapshot ──────────────────────────────────────────────

interface DomNodeSpec {
  key: string;
  el: Element | null;
  role?: string | null;
}

interface DomSnapshotEntry {
  key: string;
  role: string | null;
  present: boolean;
  connected: boolean | null;
  tag: string | null;
  id: string | null;
  className: string | null;
  ownership: Record<string, string | null> | null;
  viewportRect: Record<string, number> | null;
  computedStyle: {
    display: string | null;
    visibility: string | null;
    opacity: string | null;
    transform: string | null;
    zIndex: string | null;
    overflow: string | null;
    contain: string | null;
  } | null;
  parentOwnership: Record<string, string | null> | null;
}

function extractOwnership(el: Element | null): Record<string, string | null> | null {
  if (!el) return null;
  const out: Record<string, string | null> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith('data-357-') || attr.name.startsWith('data-canonical-') ||
        attr.name === 'data-chip-center' || attr.name === 'data-chip-reaction-target' ||
        attr.name === 'data-card-anchor' || attr.name === 'data-chip-anchor' ||
        attr.name === 'data-357-active-hand-region' || attr.name === 'data-legs-anchor' ||
        attr.name === 'data-trophy-anchor' || attr.name === 'aria-label') {
      out[attr.name] = attr.value;
    }
  }
  return Object.keys(out).length ? out : null;
}

function captureNode(spec: DomNodeSpec): DomSnapshotEntry {
  const el = spec.el;
  if (!el) {
    return {
      key: spec.key, role: spec.role ?? null, present: false, connected: null,
      tag: null, id: null, className: null, ownership: null, viewportRect: null,
      computedStyle: null, parentOwnership: null,
    };
  }
  let rect: Record<string, number> | null = null;
  let cs: DomSnapshotEntry['computedStyle'] = null;
  try { rect = rectSnapshot((el as HTMLElement).getBoundingClientRect()); } catch { /* ignore */ }
  try {
    const s = window.getComputedStyle(el);
    cs = {
      display: s.display, visibility: s.visibility, opacity: s.opacity,
      transform: s.transform, zIndex: s.zIndex, overflow: s.overflow, contain: s.contain,
    };
  } catch { /* ignore */ }
  return {
    key: spec.key,
    role: spec.role ?? null,
    present: true,
    connected: el.isConnected,
    tag: el.tagName.toLowerCase(),
    id: (el as HTMLElement).id || null,
    className: typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : null,
    ownership: extractOwnership(el),
    viewportRect: rect,
    computedStyle: cs,
    parentOwnership: extractOwnership(el.parentElement),
  };
}

function rectSnapshot(r: DOMRect | null): Record<string, number> | null {
  if (!r) return null;
  return { x: r.x, y: r.y, top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

export interface DomSnapshotOpts {
  checkpoint: string;
  causedByEventId?: string | null;
  identity: WartimeIdentity;
  owner?: WartimeOwner;
  nodes: DomNodeSpec[];
  extra?: Record<string, unknown>;
}

export function captureDomSnapshot(opts: DomSnapshotOpts): void {
  if (typeof document === 'undefined') return;
  const entries = opts.nodes.map(captureNode);
  emitWartime({
    eventName: 'dom_snapshot',
    sourceSiteId: SRC.DOM_SNAPSHOT.id,
    identity: opts.identity,
    owner: opts.owner,
    payload: {
      checkpoint: opts.checkpoint,
      causedByEventId: opts.causedByEventId ?? null,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      entries,
      ...(opts.extra ?? {}),
    },
  });
}

/**
 * Convenience: snapshot the canonical set of 3-5-7 nodes from the
 * active table surface. Selectors are scoped and stable diagnostic
 * attributes; unrelated DOM is never captured.
 */
export function captureCanonical357Snapshot(opts: {
  checkpoint: string;
  identity: WartimeIdentity;
  owner?: WartimeOwner;
  causedByEventId?: string | null;
  extra?: Record<string, unknown>;
}): void {
  if (typeof document === 'undefined') return;
  const q = (sel: string) => document.querySelector(sel);
  const qa = (sel: string) => Array.from(document.querySelectorAll(sel));
  const nodes: DomNodeSpec[] = [
    { key: 'table_container', el: q('[data-canonical-felt-surface]'), role: 'table' },
    { key: 'active_player_box', el: q('[data-active-player-box]'), role: 'active-player' },
    { key: 'self_hand_root', el: q('[data-357-active-hand-region]'), role: 'self-hand' },
    { key: 'celebration_root', el: q('[data-canonical-celebration-root]'), role: 'celebration' },
    { key: 'setup_modal', el: q('[data-dealer-game-setup-modal]'), role: 'setup-modal' },
    { key: 'sweeps_pot_anim', el: q('[data-sweeps-pot-animation]'), role: 'presentation' },
    { key: 'sweep_the_legs_anim', el: q('[data-sweep-the-legs-animation]'), role: 'presentation' },
    { key: 'legs_to_player_anim', el: q('[data-legs-to-player-animation]'), role: 'presentation' },
    { key: 'pot_to_player_anim', el: q('[data-pot-to-player-animation]'), role: 'presentation' },
  ];
  qa('[data-card-anchor]').forEach((el, i) => nodes.push({ key: `card_anchor_${i}`, el, role: 'card' }));
  qa('[data-chip-center]').forEach((el, i) => nodes.push({ key: `chip_center_${i}`, el, role: 'chip-center' }));
  qa('[data-chip-reaction-target]').forEach((el, i) => nodes.push({ key: `chip_reaction_${i}`, el, role: 'chip-reaction' }));
  qa('[data-legs-anchor]').forEach((el, i) => nodes.push({ key: `legs_${i}`, el, role: 'legs' }));
  qa('[data-trophy-anchor]').forEach((el, i) => nodes.push({ key: `trophy_${i}`, el, role: 'trophy' }));
  qa('[data-dealer-game-surface]').forEach((el, i) => nodes.push({ key: `dealer_game_surface_${i}`, el, role: 'dealer-game-surface' }));
  captureDomSnapshot({
    checkpoint: opts.checkpoint,
    identity: opts.identity,
    owner: opts.owner,
    causedByEventId: opts.causedByEventId,
    nodes,
    extra: opts.extra,
  });
}

// ── Targeted MutationObserver ─────────────────────────────────

interface MutationObserverOpts {
  root: Element;
  category: 'table-surface' | 'celebration-portal' | 'setup-modal';
  identity: () => WartimeIdentity;
  phase?: () => string | null;
  owner?: WartimeOwner;
}

const RELEVANT_ATTRS = new Set([
  'class', 'style', 'hidden',
]);

export function installTargetedMutationObserver(opts: MutationObserverOpts): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // Only capture nodes with diagnostic significance.
      if (m.type === 'attributes') {
        const target = m.target as Element;
        const attrName = m.attributeName ?? '';
        const isDiag = attrName.startsWith('data-357-') || attrName.startsWith('data-canonical-') ||
                       attrName === 'data-chip-center' || attrName === 'data-chip-reaction-target' ||
                       RELEVANT_ATTRS.has(attrName);
        if (!isDiag) continue;
        emitWartime({
          eventName: 'dom_mutation',
          sourceSiteId: SRC.DOM_MUTATION.id,
          identity: opts.identity(),
          owner: opts.owner,
          payload: {
            category: opts.category,
            kind: 'attribute',
            attrName,
            oldValue: m.oldValue,
            newValue: target.getAttribute(attrName),
            tag: target.tagName.toLowerCase(),
            ownership: extractOwnership(target),
            phase: opts.phase?.() ?? null,
          },
        });
      } else if (m.type === 'childList') {
        for (const n of Array.from(m.addedNodes)) {
          if (!(n instanceof Element)) continue;
          const own = extractOwnership(n);
          if (!own) continue;
          emitWartime({
            eventName: 'dom_mutation',
            sourceSiteId: SRC.DOM_MUTATION.id,
            identity: opts.identity(),
            owner: opts.owner,
            payload: {
              category: opts.category, kind: 'added',
              tag: n.tagName.toLowerCase(), ownership: own,
              phase: opts.phase?.() ?? null,
            },
          });
        }
        for (const n of Array.from(m.removedNodes)) {
          if (!(n instanceof Element)) continue;
          const own = extractOwnership(n);
          if (!own) continue;
          emitWartime({
            eventName: 'dom_mutation',
            sourceSiteId: SRC.DOM_MUTATION.id,
            identity: opts.identity(),
            owner: opts.owner,
            payload: {
              category: opts.category, kind: 'removed',
              tag: n.tagName.toLowerCase(), ownership: own,
              phase: opts.phase?.() ?? null,
            },
          });
        }
      }
    }
  });
  observer.observe(opts.root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class', 'style', 'hidden', 'data-357-phase', 'data-357-state',
                      'data-canonical-celebration-root', 'data-chip-center',
                      'data-chip-reaction-target', 'data-card-anchor'],
  });
  return () => observer.disconnect();
}

// ── Targeted ResizeObserver ───────────────────────────────────

interface ResizeObserverOpts {
  el: Element;
  key: string;
  identity: () => WartimeIdentity;
  phase?: () => string | null;
  extra?: () => Record<string, unknown>;
  owner?: WartimeOwner;
}

export function installTargetedResizeObserver(opts: ResizeObserverOpts): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  const prevRef: { w?: number; h?: number } = {};
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const cr = e.contentRect;
      const w = Math.round(cr.width * 100) / 100;
      const h = Math.round(cr.height * 100) / 100;
      if (prevRef.w === w && prevRef.h === h) continue;
      let transform: string | null = null;
      try { transform = window.getComputedStyle(e.target).transform; } catch { /* ignore */ }
      emitWartime({
        eventName: 'dom_resize',
        sourceSiteId: SRC.DOM_RESIZE.id,
        identity: opts.identity(),
        owner: opts.owner,
        payload: {
          key: opts.key,
          previous: { w: prevRef.w ?? null, h: prevRef.h ?? null },
          next: { w, h },
          transform,
          ownership: extractOwnership(e.target),
          phase: opts.phase?.() ?? null,
          ...(opts.extra?.() ?? {}),
        },
      });
      prevRef.w = w;
      prevRef.h = h;
    }
  });
  ro.observe(opts.el);
  return () => ro.disconnect();
}

// ── Geometry transition ───────────────────────────────────────

export interface GeometryDecision {
  branch: string;
  cardWidthPx: number | null;
  cardHeightPx: number | null;
  scale: number | null;
  gapPx?: number | null;
  reservePx?: number | null;
  containerWidthPx?: number | null;
  containerHeightPx?: number | null;
  visibleCardCount?: number | null;
  terminalHold?: boolean | null;
  showCards?: boolean | null;
  winAnimationActive?: boolean | null;
  phase?: string | null;
}

export function emitGeometryTransition(opts: {
  previous: GeometryDecision | null;
  next: GeometryDecision;
  inputs: Record<string, unknown>;
  identity: WartimeIdentity;
  owner?: WartimeOwner;
  sourceExpressionId: string;
  causedByEventId?: string | null;
}): void {
  emitWartime({
    eventName: 'geometry_transition',
    sourceSiteId: SRC.GEOMETRY_TRANSITION.id,
    identity: opts.identity,
    owner: opts.owner,
    payload: {
      previous: opts.previous,
      next: opts.next,
      inputs: opts.inputs,
      sourceExpressionId: opts.sourceExpressionId,
      causedByEventId: opts.causedByEventId ?? null,
    },
  });
}

// ── Pot destination resolution ────────────────────────────────

export interface PotDestinationCandidate {
  key: string;
  selector: string | null;
  present: boolean;
  connected: boolean | null;
  visible: boolean | null;
  rect: Record<string, number> | null;
  ownership: Record<string, string | null> | null;
  semanticType: string | null;
}

export function emitPotDestinationResolution(opts: {
  triggerId: string | null;
  winnerId: string | null;
  winnerPosition: number | null;
  amount: number;
  requestedSelector: string | null;
  candidates: PotDestinationCandidate[];
  selected: PotDestinationCandidate | null;
  selectedSemanticType: string | null;
  resolverBranch: string;
  fallbackBranch?: string | null;
  startCoord?: { x: number; y: number } | null;
  endCoord?: { x: number; y: number } | null;
  sourceRect?: Record<string, number> | null;
  tableRelativeRect?: Record<string, number> | null;
  failureReason?: string | null;
  identity: WartimeIdentity;
  owner?: WartimeOwner;
}): void {
  emitWartime({
    eventName: 'pot_destination_resolution',
    sourceSiteId: SRC.POT_DESTINATION_RESOLUTION.id,
    identity: opts.identity,
    owner: opts.owner,
    payload: {
      triggerId: opts.triggerId,
      winnerId: opts.winnerId,
      winnerPosition: opts.winnerPosition,
      amount: opts.amount,
      requestedSelector: opts.requestedSelector,
      candidates: opts.candidates,
      selected: opts.selected,
      selectedSemanticType: opts.selectedSemanticType,
      resolverBranch: opts.resolverBranch,
      fallbackBranch: opts.fallbackBranch ?? null,
      startCoord: opts.startCoord ?? null,
      endCoord: opts.endCoord ?? null,
      sourceRect: opts.sourceRect ?? null,
      tableRelativeRect: opts.tableRelativeRect ?? null,
      failureReason: opts.failureReason ?? null,
    },
  });
}

// ── Progression / advancement ─────────────────────────────────

export function emitProgressionAdvancement(opts: {
  callback: string;
  entry: 'entry' | 'return';
  reason?: string | null;
  guards?: Record<string, unknown> | null;
  capturedIdentity?: WartimeIdentity | null;
  liveIdentity?: WartimeIdentity | null;
  presentationPhase?: string | null;
  winAnimationActive?: boolean | null;
  gameStatus?: string | null;
  currentDealerGameId?: string | null;
  nextDealerGameId?: string | null;
  oldSurfaceMounted?: boolean | null;
  newSurfaceMounted?: boolean | null;
  modalMounted?: boolean | null;
  elapsedMsSincePrior?: number | null;
  identity: WartimeIdentity;
  owner?: WartimeOwner;
}): void {
  emitWartime({
    eventName: 'progression_advancement',
    sourceSiteId: SRC.PROGRESSION_ADVANCEMENT.id,
    identity: opts.identity,
    owner: opts.owner,
    payload: {
      callback: opts.callback,
      entry: opts.entry,
      reason: opts.reason ?? null,
      guards: opts.guards ?? null,
      capturedIdentity: opts.capturedIdentity ?? null,
      liveIdentity: opts.liveIdentity ?? null,
      presentationPhase: opts.presentationPhase ?? null,
      winAnimationActive: opts.winAnimationActive ?? null,
      gameStatus: opts.gameStatus ?? null,
      currentDealerGameId: opts.currentDealerGameId ?? null,
      nextDealerGameId: opts.nextDealerGameId ?? null,
      oldSurfaceMounted: opts.oldSurfaceMounted ?? null,
      newSurfaceMounted: opts.newSurfaceMounted ?? null,
      modalMounted: opts.modalMounted ?? null,
      elapsedMsSincePrior: opts.elapsedMsSincePrior ?? null,
    },
  });
}

// ── Self face-up channel settled ──────────────────────────────

export type ChannelSettledReason =
  | 'transport_completed'
  | 'authoritative_passthrough'
  | 'refresh_rejoin_reconstruction'
  | 'terminal_suppression'
  | 'identity_mismatch'
  | 'runtime_unmount';

export function emitChannelSettled(opts: {
  identity: WartimeIdentity;
  owner?: WartimeOwner;
  orchestratorInstanceId: string | null;
  runtimeComponentInstanceId?: string | null;
  handContextId: string | null;
  expectedCount: number | null;
  authoritativeCount: number | null;
  visibleCount: number | null;
  transportedCount: number | null;
  passthroughStatus: boolean;
  passthroughReason: string | null;
  settledReason: ChannelSettledReason;
  runtimePhase: string | null;
  completedLatch: boolean;
  settledLatch: boolean;
  terminalState: boolean;
  advancingState: boolean;
  modalMounted: boolean;
}): void {
  emitWartime({
    eventName: 'deal.self_face_up.channel_settled',
    sourceSiteId: SRC.DEAL_SELF_FACE_UP_SETTLED.id,
    identity: opts.identity,
    owner: opts.owner,
    payload: {
      orchestratorInstanceId: opts.orchestratorInstanceId,
      runtimeComponentInstanceId: opts.runtimeComponentInstanceId ?? null,
      handContextId: opts.handContextId,
      expectedCount: opts.expectedCount,
      authoritativeCount: opts.authoritativeCount,
      visibleCount: opts.visibleCount,
      transportedCount: opts.transportedCount,
      passthroughStatus: opts.passthroughStatus,
      passthroughReason: opts.passthroughReason,
      settledReason: opts.settledReason,
      runtimePhase: opts.runtimePhase,
      completedLatch: opts.completedLatch,
      settledLatch: opts.settledLatch,
      terminalState: opts.terminalState,
      advancingState: opts.advancingState,
      modalMounted: opts.modalMounted,
    },
  });
}

// ── Global error origin ───────────────────────────────────────

let globalErrorInstalled = false;
export function installGlobalErrorListeners(): void {
  if (globalErrorInstalled || typeof window === 'undefined') return;
  globalErrorInstalled = true;
  window.addEventListener('error', (ev) => {
    emitWartime({
      eventName: 'global.error.origin',
      sourceSiteId: SRC.GLOBAL_ERROR_ORIGIN.id,
      payload: {
        kind: 'window.error',
        message: ev.message ?? null,
        errorName: ev.error && (ev.error as Error).name ? (ev.error as Error).name : null,
        stack: ev.error && (ev.error as Error).stack ? (ev.error as Error).stack : null,
        filename: ev.filename ?? null,
        lineno: ev.lineno ?? null,
        colno: ev.colno ?? null,
      },
    });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = (ev as PromiseRejectionEvent).reason;
    const asErr = reason instanceof Error ? reason : null;
    emitWartime({
      eventName: 'global.error.origin',
      sourceSiteId: SRC.GLOBAL_ERROR_ORIGIN.id,
      payload: {
        kind: 'unhandledrejection',
        message: asErr ? asErr.message : String(reason),
        errorName: asErr ? asErr.name : typeof reason,
        stack: asErr ? asErr.stack : null,
      },
    });
  });
}

// Report an application-level error (error-boundary / toast) origin.
export function reportGlobalErrorOrigin(opts: {
  kind: 'error_boundary' | 'error_toast' | string;
  message: string;
  errorName?: string | null;
  stack?: string | null;
  ownerComponentInstanceId?: string | null;
  identity?: WartimeIdentity;
  nearestAsyncOwnerId?: string | null;
  nearestDbRequestId?: string | null;
  nearestRealtimeOwnerId?: string | null;
  nearestStateWriteEventId?: string | null;
}): void {
  emitWartime({
    eventName: 'global.error.origin',
    sourceSiteId: SRC.GLOBAL_ERROR_ORIGIN.id,
    identity: opts.identity,
    payload: {
      kind: opts.kind,
      message: opts.message,
      errorName: opts.errorName ?? null,
      stack: opts.stack ?? null,
      ownerComponentInstanceId: opts.ownerComponentInstanceId ?? null,
      nearestAsyncOwnerId: opts.nearestAsyncOwnerId ?? null,
      nearestDbRequestId: opts.nearestDbRequestId ?? null,
      nearestRealtimeOwnerId: opts.nearestRealtimeOwnerId ?? null,
      nearestStateWriteEventId: opts.nearestStateWriteEventId ?? null,
    },
  });
}

// ── DB mutation correlation (Phase 3) ─────────────────────────

let dbCorrSeq = 0;
export async function withDbMutationCorrelation<T extends { error: unknown }>(
  ctx: {
    label: string;
    table: string;
    op: 'insert' | 'update' | 'delete' | 'upsert' | 'select' | 'rpc';
    identity?: WartimeIdentity;
    owner?: WartimeOwner;
    payloadHash?: string | null;
    causedByEventId?: string | null;
    sourceSiteId?: string;
  },
  runner: (requestId: string) => Promise<T>,
): Promise<T> {
  dbCorrSeq += 1;
  const requestId = `db3.${ctx.label}.${dbCorrSeq.toString(36)}`;
  const start = performance.now();
  emitWartime({
    eventName: 'db_mutation_begin',
    sourceSiteId: ctx.sourceSiteId ?? SRC.DB_MUTATION_CORRELATION.id,
    identity: ctx.identity,
    owner: ctx.owner,
    payload: {
      requestId, table: ctx.table, op: ctx.op,
      payloadHash: ctx.payloadHash ?? null,
      causedByEventId: ctx.causedByEventId ?? null,
    },
  });
  try {
    const res = await runner(requestId);
    const anyRes = res as { error?: { message?: string } | null; data?: unknown };
    const eventName = anyRes.error ? 'db_mutation_error' : 'db_mutation_complete';
    emitWartime({
      eventName,
      sourceSiteId: ctx.sourceSiteId ?? SRC.DB_MUTATION_CORRELATION.id,
      identity: ctx.identity,
      owner: ctx.owner,
      payload: {
        requestId, table: ctx.table, op: ctx.op,
        latencyMs: performance.now() - start,
        errorMessage: anyRes.error?.message ?? null,
        returnedIdSample: sampleReturnedId(anyRes.data),
      },
    });
    return res;
  } catch (err) {
    emitWartime({
      eventName: 'db_mutation_error',
      sourceSiteId: ctx.sourceSiteId ?? SRC.DB_MUTATION_CORRELATION.id,
      identity: ctx.identity,
      owner: ctx.owner,
      payload: {
        requestId, table: ctx.table, op: ctx.op,
        latencyMs: performance.now() - start,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
      captureStack: true,
    });
    throw err;
  }
}

function sampleReturnedId(data: unknown): string | null {
  if (!data) return null;
  const first = Array.isArray(data) ? data[0] : data;
  if (first && typeof first === 'object' && 'id' in first) {
    const v = (first as { id: unknown }).id;
    if (typeof v === 'string' || typeof v === 'number') return String(v);
  }
  return null;
}

// ── Realtime causality (Phase 3) ──────────────────────────────

let rtCauseOwnerSeq = 0;
let rtCauseReceiptSeq = 0;

export function wrapRealtimeCausality<TPayload>(opts: {
  channelLabel: string;
  table: string | null;
  sourceSiteId?: string;
  identity?: () => WartimeIdentity | undefined;
  handler: (payload: TPayload) => void | Promise<void>;
}): (payload: TPayload) => void {
  rtCauseOwnerSeq += 1;
  const ownerId = `rtc.${opts.channelLabel}.${rtCauseOwnerSeq.toString(36)}`;
  return (payload: TPayload) => {
    rtCauseReceiptSeq += 1;
    const anyP = payload as unknown as {
      eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown>; commit_timestamp?: string;
    };
    emitWartime({
      eventName: 'realtime.causality',
      sourceSiteId: opts.sourceSiteId ?? SRC.REALTIME_CAUSALITY.id,
      identity: opts.identity?.() ?? undefined,
      payload: {
        ownerId,
        channelLabel: opts.channelLabel,
        table: opts.table,
        eventType: anyP.eventType ?? null,
        localReceiptSequence: rtCauseReceiptSeq,
        localReceiptAt: performance.now(),
        serverCommitTimestamp: anyP.commit_timestamp ?? null,
        oldIdentitySample: sampleIdentityFields(anyP.old ?? null),
        newIdentitySample: sampleIdentityFields(anyP.new ?? null),
      },
    });
    try {
      void opts.handler(payload);
    } catch (err) {
      emitWartime({
        eventName: 'realtime.causality.handler_error',
        sourceSiteId: opts.sourceSiteId ?? SRC.REALTIME_CAUSALITY.id,
        payload: {
          ownerId,
          message: err instanceof Error ? err.message : String(err),
        },
        captureStack: true,
      });
    }
  };
}

function sampleIdentityFields(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const k of ['id', 'game_id', 'dealer_game_id', 'current_game_uuid', 'current_round',
                    'round_number', 'hand_number', 'status', 'last_round_result']) {
    if (k in row) out[k] = row[k];
  }
  return out;
}

// ── Async owner (Phase 3) ─────────────────────────────────────

let asyncOwnerSeq3 = 0;
export function trackAsyncOwner(opts: {
  ownerLabel: string;
  kind: 'timeout' | 'interval' | 'rAF' | 'promise' | 'animation_end' | 'transition_end' | 'effect_cleanup' | 'orchestrator_completion' | 'realtime_callback' | 'supabase_continuation';
  identity?: WartimeIdentity;
  owner?: WartimeOwner;
  delayMs?: number | null;
  causedByEventId?: string | null;
  sourceSiteId?: string;
  extra?: Record<string, unknown>;
}): string {
  asyncOwnerSeq3 += 1;
  const asyncOwnerId = `ao3.${opts.ownerLabel}.${asyncOwnerSeq3.toString(36)}`;
  emitWartime({
    eventName: 'async_scheduled',
    sourceSiteId: opts.sourceSiteId ?? SRC.ASYNC_OWNER.id,
    identity: opts.identity,
    owner: opts.owner,
    payload: {
      asyncOwnerId, ownerLabel: opts.ownerLabel, kind: opts.kind,
      delayMs: opts.delayMs ?? null, causedByEventId: opts.causedByEventId ?? null,
      ...(opts.extra ?? {}),
    },
  });
  return asyncOwnerId;
}

export function emitAsyncOwnerFired(opts: {
  asyncOwnerId: string;
  outcome: 'fired' | 'cancelled' | 'suppressed';
  identity?: WartimeIdentity;
  liveIdentity?: WartimeIdentity;
  identityMatch?: boolean | null;
  suppressionReason?: string | null;
  resultingStateWriteEventId?: string | null;
  resultingDbRequestId?: string | null;
  sourceSiteId?: string;
  extra?: Record<string, unknown>;
}): void {
  emitWartime({
    eventName: opts.outcome === 'cancelled'
      ? 'async_cancelled'
      : opts.outcome === 'suppressed'
        ? 'async_suppressed'
        : 'async_fired',
    sourceSiteId: opts.sourceSiteId ?? SRC.ASYNC_OWNER.id,
    identity: opts.identity,
    payload: {
      asyncOwnerId: opts.asyncOwnerId,
      outcome: opts.outcome,
      liveIdentity: opts.liveIdentity ?? null,
      identityMatch: opts.identityMatch ?? null,
      suppressionReason: opts.suppressionReason ?? null,
      resultingStateWriteEventId: opts.resultingStateWriteEventId ?? null,
      resultingDbRequestId: opts.resultingDbRequestId ?? null,
      ...(opts.extra ?? {}),
    },
  });
}

// ── Requirement registration (module load) ────────────────────
// Marking installed at module load reflects that the code is wired at
// every canonical source site listed in sourceSites.ts. Each helper is
// imported and invoked from the corresponding real owner file — the
// import graph is compile-time verified.
// Phase 3 helpers are implemented in this module. Production-owner
// registration is NOT asserted here — the real owner files register
// their canonical source sites via registerWartimeProductionHook.
markHelperImplemented('deal.self_face_up.channel_settled', SRC.DEAL_SELF_FACE_UP_SETTLED.id);
markHelperImplemented('dom.snapshot.checkpoints', SRC.DOM_SNAPSHOT.id);
markHelperImplemented('dom.observer.mutation', SRC.DOM_MUTATION.id);
markHelperImplemented('dom.observer.resize', SRC.DOM_RESIZE.id);
markHelperImplemented('geometry.transition', SRC.GEOMETRY_TRANSITION.id);
markHelperImplemented('pot_destination.resolution', SRC.POT_DESTINATION_RESOLUTION.id);
markHelperImplemented('progression.advancement', SRC.PROGRESSION_ADVANCEMENT.id);
markHelperImplemented('global.error.origin', SRC.GLOBAL_ERROR_ORIGIN.id);
markHelperImplemented('db.mutation.correlation', SRC.DB_MUTATION_CORRELATION.id);
markHelperImplemented('realtime.causality', SRC.REALTIME_CAUSALITY.id);
markHelperImplemented('async.owner', SRC.ASYNC_OWNER.id);
