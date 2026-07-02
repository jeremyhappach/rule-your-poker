/**
 * 357_ACTIVE_HAND_PRESENTATION_LEDGER — wartime instrumentation only.
 *
 * Append-only ring buffer of 3-5-7 local active-self presentation
 * events. Recording is OFF unless ARMed via the on-screen pill.
 * Availability is bound to a mounted 3-5-7 table.
 *
 * Modelled directly on `holmPresentationLedger`. No behavior changes,
 * no gameplay subscriptions. Callers pass normalised payloads.
 *
 * Event families (per repair requirement):
 *   A. 357_STAGED_DEAL_FACE_STATE
 *   B. 357_ACTIVE_HAND_DEAL_GEOMETRY
 *   C. 357_ACTIVE_HAND_LIFECYCLE
 *   D. 357_TRANSPORT_PRESENTATION
 *   +  VIOLATION (piggybacks so consumers can grep on family=VIOLATION)
 *
 * Violation tags:
 *   357_FACE_REVEAL_AFTER_LAND_VIOLATION
 *   357_RESIZE_VIOLATION
 *   357_POST_RESOLVE_GROW_VIOLATION
 *   357_GEOMETRY_SOURCE_FALLBACK
 *   357_STALE_HAND_BLEED_VIOLATION
 *   357_RENDER_NODE_REPLACED
 *   357_ACTIVE_HAND_REMOUNT_SAME_IDENTITY
 */

export type Three57LedgerFamily =
  | '357_STAGED_DEAL_FACE_STATE'
  | '357_ACTIVE_HAND_DEAL_GEOMETRY'
  | '357_ACTIVE_HAND_LIFECYCLE'
  | '357_TRANSPORT_PRESENTATION'
  | 'VIOLATION';

export interface Three57LedgerIdentity {
  dealerGameId?: string | null;
  roundId?: string | null;
  handNumber?: number | null;
  stageRound?: 3 | 5 | 7 | number | null;
  handContextId?: string | null;
  localPlayerId?: string | null;
  branch?: string;
}

export interface Three57LedgerEvent {
  seq: number;
  tMs: number;
  family: Three57LedgerFamily;
  tag: string;
  identity: Three57LedgerIdentity;
  payload?: Record<string, unknown>;
}

const MAX_EVENTS = 2000;
const buffer: Three57LedgerEvent[] = [];
let seq = 0;
const t0 =
  typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();

let _available = false;
let _armed = false;
const availabilityListeners = new Set<(available: boolean) => void>();
const armedListeners = new Set<(armed: boolean) => void>();

function nowMs(): number {
  const t =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  return Math.round(t - t0);
}

function push(ev: Three57LedgerEvent) {
  buffer.push(ev);
  if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
}

/**
 * Availability — 3-5-7 table mounted. Does NOT enable recording.
 * Per spec: preserve the full run after transition/end until explicit
 * clear. So we do NOT auto-clear the buffer on deactivation, only on
 * ARM (fresh session) or explicit CLEAR.
 */
export function setThree57LedgerActive(available: boolean): void {
  if (_available === available) return;
  _available = available;
  availabilityListeners.forEach((l) => {
    try { l(_available); } catch { /* noop */ }
  });
}

export function isThree57LedgerActive(): boolean {
  return _available;
}

export function subscribeThree57LedgerAvailability(
  listener: (available: boolean) => void,
): () => void {
  availabilityListeners.add(listener);
  return () => availabilityListeners.delete(listener);
}

export function setThree57LedgerArmed(armed: boolean): void {
  if (_armed === armed) return;
  _armed = armed;
  if (armed) {
    buffer.length = 0;
    seq = 0;
    push({
      seq: seq++,
      tMs: 0,
      family: '357_ACTIVE_HAND_LIFECYCLE',
      tag: 'ledger-arm',
      identity: {},
      payload: { reason: 'user-arm' },
    });
  }
  armedListeners.forEach((l) => {
    try { l(_armed); } catch { /* noop */ }
  });
}

export function isThree57LedgerArmed(): boolean {
  return _armed;
}

export function subscribeThree57LedgerArmed(
  listener: (armed: boolean) => void,
): () => void {
  armedListeners.add(listener);
  return () => armedListeners.delete(listener);
}

export function clearThree57Ledger(): void {
  buffer.length = 0;
  seq = 0;
}

export function snapshotThree57Ledger(): Three57LedgerEvent[] {
  return buffer.slice();
}

export function getThree57LedgerEventCount(): number {
  return buffer.length;
}

function normalizeIdentity(id: Three57LedgerIdentity): Three57LedgerIdentity {
  return {
    dealerGameId: id.dealerGameId ?? null,
    roundId: id.roundId ?? null,
    handNumber: id.handNumber ?? null,
    stageRound: id.stageRound ?? null,
    handContextId: id.handContextId ?? null,
    localPlayerId: id.localPlayerId ?? null,
    branch: id.branch,
  };
}

/**
 * Core record entry. No-op unless armed. Safe to call from any
 * render / effect / handler.
 */
export function recordThree57Ledger(
  family: Three57LedgerFamily,
  tag: string,
  identity: Three57LedgerIdentity,
  payload?: Record<string, unknown>,
): void {
  if (!_armed) return;
  push({
    seq: seq++,
    tMs: nowMs(),
    family,
    tag,
    identity: normalizeIdentity(identity),
    payload,
  });
}

export function recordThree57LedgerViolation(
  originatingFamily: Three57LedgerFamily,
  tag: string,
  identity: Three57LedgerIdentity,
  payload?: Record<string, unknown>,
): void {
  if (!_armed) return;
  push({
    seq: seq++,
    tMs: nowMs(),
    family: 'VIOLATION',
    tag: `${originatingFamily}:${tag}`,
    identity: normalizeIdentity(identity),
    payload,
  });
}

// ── Face-state history + violation detector ─────────────────────────
//
// Tracks the visible face mode transitions per stable card identity
// within a hand. Emits `357_FACE_REVEAL_AFTER_LAND_VIOLATION` when a
// card that has already been observed face-up is observed as back /
// placeholder, or when a card's first observed face state occurs
// AFTER a visible back state for that same identity.

export type Three57FaceMode = 'back' | 'face' | 'reservation' | 'absent';

interface FaceHistoryEntry {
  everFace: boolean;
  everBack: boolean;
  lastMode: Three57FaceMode | null;
  firstMode: Three57FaceMode | null;
  landed: boolean;
}

const faceHistoryByHand = new Map<string, Map<string, FaceHistoryEntry>>();
let lastFaceHandKey: string | null = null;

function faceHandKey(id: Three57LedgerIdentity): string {
  return `${id.handContextId ?? '?'}|s${id.stageRound ?? '?'}|p${id.localPlayerId ?? '?'}`;
}

export interface Three57SlotFaceSample {
  cardId: string | null;
  slotIndex: number;
  mode: Three57FaceMode;
  landed: boolean;
  reactKey?: string | null;
  domNodeIdent?: string | null;
  reason?: string | null;
}

export function recordThree57FaceState(
  identity: Three57LedgerIdentity,
  ctx: {
    renderBranch: string;
    sourceBranch: string;
    dealPhase: string | null;
    forceHiddenFaces: boolean;
    expectedFinalCapacity: number | null;
    arrivedCount: number;
    claimedCount: number | null;
    settledCount: number | null;
    slotCount: number;
    perSlot: Three57SlotFaceSample[];
  },
): void {
  if (!_armed) return;
  const scope = faceHandKey(identity);
  if (lastFaceHandKey !== scope) {
    // new hand identity — do not clear old history immediately, only
    // when a fresh scope arrives. Keep prior scope so late transport
    // events for the prior hand are still attributable if they fire.
    lastFaceHandKey = scope;
  }
  let scopeMap = faceHistoryByHand.get(scope);
  if (!scopeMap) {
    scopeMap = new Map();
    faceHistoryByHand.set(scope, scopeMap);
  }

  const perSlotPayload = ctx.perSlot.map((s) => {
    const key = s.cardId ?? `slot:${s.slotIndex}`;
    let entry = scopeMap!.get(key);
    let faceChangeReason: string | null = null;
    let prevMode: Three57FaceMode | null = null;
    if (!entry) {
      entry = {
        everFace: false,
        everBack: false,
        lastMode: null,
        firstMode: s.mode,
        landed: s.landed,
      };
      scopeMap!.set(key, entry);
    } else {
      prevMode = entry.lastMode;
      if (prevMode !== s.mode) {
        faceChangeReason = `${prevMode ?? 'null'}→${s.mode}`;
      }
    }
    if (s.mode === 'face') entry.everFace = true;
    if (s.mode === 'back') entry.everBack = true;
    entry.lastMode = s.mode;
    if (s.landed) entry.landed = true;

    // Violations
    // (a) already-landed card is currently rendered as back / reservation / absent
    if (entry.landed && (s.mode === 'back' || s.mode === 'reservation' || s.mode === 'absent') && entry.everFace) {
      recordThree57LedgerViolation('357_STAGED_DEAL_FACE_STATE', '357_FACE_REVEAL_AFTER_LAND_VIOLATION', identity, {
        cardId: s.cardId,
        slotIndex: s.slotIndex,
        mode: s.mode,
        prevMode,
        firstMode: entry.firstMode,
        renderBranch: ctx.renderBranch,
        sourceBranch: ctx.sourceBranch,
        reason: 'landed-card-not-face',
      });
    }
    // (b) first face-up observation for identity followed a visible back
    if (s.mode === 'face' && entry.everBack && !entry.everFace) {
      recordThree57LedgerViolation('357_STAGED_DEAL_FACE_STATE', '357_FACE_REVEAL_AFTER_LAND_VIOLATION', identity, {
        cardId: s.cardId,
        slotIndex: s.slotIndex,
        mode: s.mode,
        prevMode,
        firstMode: entry.firstMode,
        renderBranch: ctx.renderBranch,
        sourceBranch: ctx.sourceBranch,
        reason: 'first-face-after-back',
      });
    }

    return {
      cardId: s.cardId,
      slotIndex: s.slotIndex,
      mode: s.mode,
      prevMode,
      faceChangeReason,
      landed: s.landed,
      reactKey: s.reactKey ?? null,
      domNodeIdent: s.domNodeIdent ?? null,
      reason: s.reason ?? null,
    };
  });

  push({
    seq: seq++,
    tMs: nowMs(),
    family: '357_STAGED_DEAL_FACE_STATE',
    tag: 'sample',
    identity: normalizeIdentity(identity),
    payload: {
      renderBranch: ctx.renderBranch,
      sourceBranch: ctx.sourceBranch,
      dealPhase: ctx.dealPhase,
      forceHiddenFaces: ctx.forceHiddenFaces,
      expectedFinalCapacity: ctx.expectedFinalCapacity,
      arrivedCount: ctx.arrivedCount,
      claimedCount: ctx.claimedCount,
      settledCount: ctx.settledCount,
      slotCount: ctx.slotCount,
      perSlot: perSlotPayload,
    },
  });
}

// ── Geometry commit ledger ──────────────────────────────────────────
//
// Per-hand-identity committed card size. Emits 357_RESIZE_VIOLATION /
// 357_POST_RESOLVE_GROW_VIOLATION when a later sample changes
// width/height/scale under an unchanged hand identity.

interface GeometryEntry {
  committedCardWidth: number | null;
  committedCardHeight: number | null;
  committedScale: number | null;
  landedAny: boolean;
  commitCount: number;
}

const geometryByHand = new Map<string, GeometryEntry>();

function geometryHandKey(id: Three57LedgerIdentity): string {
  return `${id.handContextId ?? '?'}|s${id.stageRound ?? '?'}|p${id.localPlayerId ?? '?'}`;
}

export interface Three57GeometrySample {
  event: string; // 'first-render' | 'first-transport' | 'card-land' | 'settle' | 'fold' | 'timeout' | 'sitting-out' | 'action-resolution' | 'stage-transition' | 'mount' | 'unmount' | 'post-paint' | 'commit-accept' | 'commit-reject' | 'render'
  branch: string;
  sourceLabels: Record<string, string | number | null>;
  expectedCapacity: number | null;
  visibleCapacity: number | null;
  claimedCapacity: number | null;
  cardWidth: number | null;
  cardHeight: number | null;
  wrapperScale: number | null;
  slotXY?: Array<{ index: number; x: number; y: number }> | null;
  fanOverlap: number | null;
  fanSpread: number | null;
  rotationDeg: number | null;
  paneRect: { w: number; h: number } | null;
  domRectsPerCard?: Array<{ cardId: string | null; slotIndex: number; x: number; y: number; w: number; h: number }> | null;
  computedTransform?: string | null;
  parentTransform?: string | null;
  commitId?: string | null;
  prevCommitId?: string | null;
  commitKind: 'new' | 'reuse' | 'fallback' | 'recompute' | 'sample';
  selectingFunction: string;
  isPostDealBranch: boolean;
  legalIdentityChange: boolean;
}

export function recordThree57Geometry(
  identity: Three57LedgerIdentity,
  sample: Three57GeometrySample,
): void {
  if (!_armed) return;
  const scope = geometryHandKey(identity);
  let entry = geometryByHand.get(scope);
  if (!entry) {
    entry = {
      committedCardWidth: null,
      committedCardHeight: null,
      committedScale: null,
      landedAny: false,
      commitCount: 0,
    };
    geometryByHand.set(scope, entry);
  }

  const isCommit = sample.commitKind === 'new' || sample.commitKind === 'recompute' || sample.commitKind === 'fallback';

  // Violation detectors
  if (entry.committedCardWidth != null && sample.cardWidth != null) {
    const dw = sample.cardWidth - entry.committedCardWidth;
    const dh = (sample.cardHeight ?? 0) - (entry.committedCardHeight ?? 0);
    if ((Math.abs(dw) > 0.5 || Math.abs(dh) > 0.5) && !sample.legalIdentityChange) {
      recordThree57LedgerViolation('357_ACTIVE_HAND_DEAL_GEOMETRY', '357_RESIZE_VIOLATION', identity, {
        prev: {
          cardWidth: entry.committedCardWidth,
          cardHeight: entry.committedCardHeight,
          scale: entry.committedScale,
        },
        next: {
          cardWidth: sample.cardWidth,
          cardHeight: sample.cardHeight,
          scale: sample.wrapperScale,
        },
        branch: sample.branch,
        selectingFunction: sample.selectingFunction,
        event: sample.event,
      });
    }
    if (entry.landedAny && dw > 0.5) {
      recordThree57LedgerViolation('357_ACTIVE_HAND_DEAL_GEOMETRY', '357_POST_RESOLVE_GROW_VIOLATION', identity, {
        prevWidth: entry.committedCardWidth,
        nextWidth: sample.cardWidth,
        branch: sample.branch,
        event: sample.event,
        selectingFunction: sample.selectingFunction,
      });
    }
  }

  if (sample.isPostDealBranch && (sample.commitKind === 'fallback' || /legacy|visible-count|remeasure|default/i.test(sample.selectingFunction))) {
    recordThree57LedgerViolation('357_ACTIVE_HAND_DEAL_GEOMETRY', '357_GEOMETRY_SOURCE_FALLBACK', identity, {
      branch: sample.branch,
      selectingFunction: sample.selectingFunction,
      commitKind: sample.commitKind,
      event: sample.event,
    });
  }

  // Update committed baseline
  if (isCommit && sample.cardWidth != null) {
    entry.committedCardWidth = sample.cardWidth;
    entry.committedCardHeight = sample.cardHeight;
    entry.committedScale = sample.wrapperScale;
    entry.commitCount += 1;
  }
  if (sample.event === 'card-land' || sample.event === 'settle') entry.landedAny = true;

  push({
    seq: seq++,
    tMs: nowMs(),
    family: '357_ACTIVE_HAND_DEAL_GEOMETRY',
    tag: sample.event,
    identity: normalizeIdentity(identity),
    payload: sample as unknown as Record<string, unknown>,
  });
}

// ── Lifecycle ledger ────────────────────────────────────────────────
//
// Mount / unmount, hand+stage identity change, cached geometry owner
// resets, stale card retention detector, remount-same-identity guard.

const lastLifecycleIdentityByPlayer = new Map<string, string>();
const currentlyMountedIdentities = new Set<string>();
const activeMountsPerPlayer = new Map<string, Set<string>>();

function lifecycleKey(id: Three57LedgerIdentity): string {
  return `${id.handContextId ?? '?'}|s${id.stageRound ?? '?'}|p${id.localPlayerId ?? '?'}`;
}

export function recordThree57Lifecycle(
  action:
    | 'mount'
    | 'unmount'
    | 'render'
    | 'hand-stage-transition'
    | 'cached-geometry-owner-created'
    | 'cached-geometry-owner-reset'
    | 'phase-lock-created'
    | 'phase-lock-reset'
    | 'stale-child-retained'
    | 'renderer-branch-change',
  identity: Three57LedgerIdentity,
  payload: Record<string, unknown> = {},
): void {
  if (!_armed) return;

  const key = lifecycleKey(identity);
  const playerScope = `p${identity.localPlayerId ?? '?'}|hand${identity.handContextId ?? '?'}`;

  if (action === 'mount') {
    // remount-same-identity violation
    if (currentlyMountedIdentities.has(key)) {
      recordThree57LedgerViolation('357_ACTIVE_HAND_LIFECYCLE', '357_ACTIVE_HAND_REMOUNT_SAME_IDENTITY', identity, {
        key,
        ...payload,
      });
    }
    currentlyMountedIdentities.add(key);
    let set = activeMountsPerPlayer.get(playerScope);
    if (!set) {
      set = new Set();
      activeMountsPerPlayer.set(playerScope, set);
    }
    // stale-hand-bleed: any lower-stage identity still mounted for the
    // same player when a higher stage mounts.
    if (typeof identity.stageRound === 'number') {
      for (const otherKey of set) {
        const m = /\|s(\d+)\|/.exec(otherKey);
        const otherStage = m ? Number(m[1]) : null;
        if (otherStage != null && otherStage < identity.stageRound) {
          recordThree57LedgerViolation('357_ACTIVE_HAND_LIFECYCLE', '357_STALE_HAND_BLEED_VIOLATION', identity, {
            newStage: identity.stageRound,
            staleMountedKey: otherKey,
          });
        }
      }
    }
    set.add(key);

    const prev = lastLifecycleIdentityByPlayer.get(playerScope);
    if (prev && prev !== key) {
      push({
        seq: seq++,
        tMs: nowMs(),
        family: '357_ACTIVE_HAND_LIFECYCLE',
        tag: 'hand-stage-transition',
        identity: normalizeIdentity(identity),
        payload: { prevIdentityKey: prev, nextIdentityKey: key },
      });
    }
    lastLifecycleIdentityByPlayer.set(playerScope, key);
  } else if (action === 'unmount') {
    currentlyMountedIdentities.delete(key);
    const set = activeMountsPerPlayer.get(playerScope);
    if (set) set.delete(key);
  }

  push({
    seq: seq++,
    tMs: nowMs(),
    family: '357_ACTIVE_HAND_LIFECYCLE',
    tag: action,
    identity: normalizeIdentity(identity),
    payload: { key, ...payload },
  });
}

/** Emit when a stable physical card identity's DOM node/key changes. */
export function recordThree57RenderNodeReplaced(
  identity: Three57LedgerIdentity,
  payload: {
    cardId: string;
    prevReactKey: string | null;
    nextReactKey: string | null;
    prevNodeIdent: string | null;
    nextNodeIdent: string | null;
    phase: string;
  },
): void {
  if (!_armed) return;
  recordThree57LedgerViolation('357_ACTIVE_HAND_LIFECYCLE', '357_RENDER_NODE_REPLACED', identity, payload);
}

// ── Transport ledger ────────────────────────────────────────────────
export interface Three57TransportSample {
  intentId: string | null;
  cardId: string;
  source: string | null;
  destination: string | null;
  finalSlot: number | null;
  faceDirective: 'face' | 'back' | 'inherit' | null;
  boundary: 'dispatch' | 'start' | 'land' | 'settle' | 'retire';
  rendererOwner: string | null;
  domNodeIdent: string | null;
  reactKey: string | null;
  geometry: {
    x: number | null;
    y: number | null;
    w: number | null;
    h: number | null;
    scale: number | null;
  } | null;
  wallTMs: number;
}

export function recordThree57Transport(
  identity: Three57LedgerIdentity,
  sample: Three57TransportSample,
): void {
  if (!_armed) return;
  push({
    seq: seq++,
    tMs: nowMs(),
    family: '357_TRANSPORT_PRESENTATION',
    tag: sample.boundary,
    identity: normalizeIdentity(identity),
    payload: sample as unknown as Record<string, unknown>,
  });
}

// ── Format / export ─────────────────────────────────────────────────
export function formatThree57LedgerAsText(): string {
  const events = buffer.slice();
  const head = `357 ACTIVE HAND PRESENTATION LEDGER
events: ${events.length} (cap ${MAX_EVENTS})
exported: ${new Date().toISOString()}
ua: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}
viewport: ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'n/a'}
─────────────────────────────────────────────────────────`;
  const lines = events.map((e) => {
    const t = String(e.tMs).padStart(6, ' ');
    const fam = e.family.padEnd(30, ' ');
    const id = safeStringify(e.identity);
    const payload = e.payload ? ` ${safeStringify(e.payload)}` : '';
    return `+${t}ms #${e.seq} ${fam} ${e.tag} id=${id}${payload}`;
  });
  return [head, ...lines].join('\n');
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, val) => {
      if (typeof val === 'number') return Number.isFinite(val) ? Math.round(val * 100) / 100 : null;
      return val;
    });
  } catch {
    return '[unserializable]';
  }
}
