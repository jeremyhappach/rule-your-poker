/**
 * Wartime surfaces — framework-level coverage hooks.
 *
 * One declarative contract every major surface adopts so that
 * IDENTITY / OWNERSHIP / GEOMETRY / LIFECYCLE / STATE / RENDER DECISIONS
 * become a property of architecture, not of bug-specific instrumentation.
 *
 * Zero cost when wartime is disabled — every hook short-circuits inside
 * recordWartime().
 *
 * Also feeds the Coverage Tracker so Admin Settings can show, per surface,
 * which categories have actually been wired in code.
 */

import { useEffect, useRef } from 'react';
import { recordWartime, recordWartimeTransition, type WartimeCategory } from './core';

// -------------------------------------------------------------------------
// Coverage tracker — records which categories have been observed for each
// registered surface. Drives the Admin Settings coverage matrix.
// -------------------------------------------------------------------------

export type CoverageCategory =
  | 'IDENTITY'
  | 'OWNERSHIP'
  | 'GEOMETRY'
  | 'LIFECYCLE'
  | 'STATE'
  | 'RENDER';

export const COVERAGE_CATEGORIES: CoverageCategory[] = [
  'IDENTITY',
  'OWNERSHIP',
  'GEOMETRY',
  'LIFECYCLE',
  'STATE',
  'RENDER',
];

export interface SurfaceCoverage {
  surface: string;
  categories: Record<CoverageCategory, boolean>;
  /** Currently mounted instance count. */
  mounted: number;
  /** Total times this surface has mounted (cumulative). */
  totalMounts: number;
}

const _coverage = new Map<string, SurfaceCoverage>();
const _covListeners = new Set<() => void>();
let _covVersion = 0;

function _emitCoverage() {
  _covVersion += 1;
  for (const l of _covListeners) l();
}

function _ensure(surface: string): SurfaceCoverage {
  let entry = _coverage.get(surface);
  if (!entry) {
    entry = {
      surface,
      categories: {
        IDENTITY: false,
        OWNERSHIP: false,
        GEOMETRY: false,
        LIFECYCLE: false,
        STATE: false,
        RENDER: false,
      },
      mounted: 0,
      totalMounts: 0,
    };
    _coverage.set(surface, entry);
  }
  return entry;
}

function _markCoverage(surface: string, category: CoverageCategory) {
  const e = _ensure(surface);
  if (!e.categories[category]) {
    e.categories[category] = true;
    _emitCoverage();
  }
}

let _covSnapshot: SurfaceCoverage[] = [];
let _covSnapshotVersion = -1;
export function getWartimeCoverage(): SurfaceCoverage[] {
  if (_covSnapshotVersion !== _covVersion) {
    _covSnapshot = Array.from(_coverage.values()).sort((a, b) =>
      a.surface.localeCompare(b.surface),
    );
    _covSnapshotVersion = _covVersion;
  }
  return _covSnapshot;
}

export function getWartimeCoverageVersion(): number {
  return _covVersion;
}

export function subscribeWartimeCoverage(cb: () => void): () => void {
  _covListeners.add(cb);
  return () => _covListeners.delete(cb);
}

/**
 * Declare a surface that should appear in the coverage matrix even before it
 * mounts (lets the matrix list every "supposed-to-exist" surface and which
 * categories are pre-registered).
 */
export function declareWartimeSurface(
  surface: string,
  expectedCategories: CoverageCategory[] = [],
): void {
  const e = _ensure(surface);
  // Declared categories represent code-level wiring presence; mark them as
  // covered so the matrix reflects wiring even before the surface mounts.
  for (const c of expectedCategories) {
    if (!e.categories[c]) e.categories[c] = true;
  }
  _emitCoverage();
}

// -------------------------------------------------------------------------
// Per-surface snapshot store — used by the transition engine to compute
// FROM/TO diffs without surface code participation.
// -------------------------------------------------------------------------

interface SurfaceSnapshot {
  identity?: Record<string, unknown>;
  ownership?: Record<string, unknown>;
  geometry?: Record<string, unknown>;
  state?: Record<string, unknown>;
  renderDecision?: { decision: string; payload?: Record<string, unknown> };
  mountAtMs?: number;
  unmountAtMs?: number;
}

const _snapshots = new Map<string, SurfaceSnapshot>(); // surface -> latest
let _pendingUnmount: { surface: string; at: number; snap: SurfaceSnapshot } | null = null;

function _diff(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    const va = (a as any)?.[k];
    const vb = (b as any)?.[k];
    if (JSON.stringify(va) !== JSON.stringify(vb)) out[k] = { from: va, to: vb };
  }
  return out;
}

function _maybeEmitTransition(toSurface: string, toSnap: SurfaceSnapshot) {
  if (!_pendingUnmount) return;
  const elapsed = performance.now() - _pendingUnmount.at;
  if (elapsed > 800) {
    _pendingUnmount = null;
    return;
  }
  const fromSnap = _pendingUnmount.snap;
  const identityDelta = _diff(fromSnap.identity, toSnap.identity);
  const ownershipDelta = _diff(fromSnap.ownership, toSnap.ownership);
  const geometryDelta = _diff(fromSnap.geometry, toSnap.geometry);
  const stateDelta = _diff(fromSnap.state, toSnap.state);
  const renderDelta =
    (fromSnap.renderDecision?.decision ?? null) !== (toSnap.renderDecision?.decision ?? null)
      ? {
          decision: {
            from: fromSnap.renderDecision?.decision ?? null,
            to: toSnap.renderDecision?.decision ?? null,
          },
        }
      : {};

  recordWartime('LIFECYCLE', `TRANSITION: ${_pendingUnmount.surface} → ${toSurface}`, {
    elapsedMs: Math.round(elapsed),
    identityDelta,
    ownershipDelta,
    geometryDelta,
    stateDelta,
    renderDelta,
    fromSnapshot: fromSnap,
    toSnapshot: toSnap,
  });
  _pendingUnmount = null;
}

// -------------------------------------------------------------------------
// Hooks
// -------------------------------------------------------------------------

function _stableKey(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Register a surface in the framework. Emits mount/unmount lifecycle and
 * identity-change events automatically. Returns nothing — pair with the
 * other coverage hooks below.
 */
export function useWartimeSurface(
  surface: string,
  identity: Record<string, unknown> = {},
): void {
  _markCoverage(surface, 'IDENTITY');
  _markCoverage(surface, 'LIFECYCLE');

  const lastIdentityKey = useRef<string | null>(null);
  const identityKey = _stableKey(identity);

  // Mount / unmount
  useEffect(() => {
    const e = _ensure(surface);
    e.mounted += 1;
    e.totalMounts += 1;
    _emitCoverage();
    const mountAt = performance.now();
    const snap: SurfaceSnapshot = {
      ..._snapshots.get(surface),
      identity,
      mountAtMs: mountAt,
    };
    _snapshots.set(surface, snap);
    recordWartime('LIFECYCLE', `surface.mount: ${surface}`, { identity });
    _maybeEmitTransition(surface, snap);

    return () => {
      const ex = _ensure(surface);
      ex.mounted = Math.max(0, ex.mounted - 1);
      _emitCoverage();
      const at = performance.now();
      const lastSnap = _snapshots.get(surface) ?? snap;
      const exitSnap: SurfaceSnapshot = { ...lastSnap, unmountAtMs: at };
      _snapshots.set(surface, exitSnap);
      recordWartime('LIFECYCLE', `surface.unmount: ${surface}`, {
        identity: lastSnap.identity,
        elapsedMs: Math.round(at - mountAt),
      });
      _pendingUnmount = { surface, at, snap: exitSnap };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface]);

  // Identity drift while mounted
  useEffect(() => {
    if (lastIdentityKey.current === null) {
      lastIdentityKey.current = identityKey;
      return;
    }
    if (lastIdentityKey.current !== identityKey) {
      const prevSnap = _snapshots.get(surface);
      const prevIdentity = prevSnap?.identity;
      const nextSnap: SurfaceSnapshot = { ...prevSnap, identity };
      _snapshots.set(surface, nextSnap);
      recordWartime('IDENTITY', `surface.identity-changed: ${surface}`, {
        from: prevIdentity,
        to: identity,
        diff: _diff(prevIdentity, identity),
      });
      lastIdentityKey.current = identityKey;
    }
  }, [identityKey, surface, identity]);
}

/**
 * Declare ownership for a surface. Diff-emits on change.
 */
export function useWartimeOwnership(
  surface: string,
  ownership: Record<string, unknown>,
): void {
  _markCoverage(surface, 'OWNERSHIP');
  const key = _stableKey(ownership);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === key) return;
    const prevSnap = _snapshots.get(surface);
    const prev = prevSnap?.ownership;
    _snapshots.set(surface, { ...prevSnap, ownership });
    if (last.current !== null) {
      recordWartime('OWNERSHIP', `surface.ownership-changed: ${surface}`, {
        from: prev,
        to: ownership,
        diff: _diff(prev, ownership),
      });
    } else {
      recordWartime('OWNERSHIP', `surface.ownership-initial: ${surface}`, { ownership });
    }
    last.current = key;
  }, [key, surface, ownership]);
}

/**
 * Declare geometry source(s) for a surface. Diff-emits on change.
 */
export function useWartimeGeometry(
  surface: string,
  geometry: Record<string, unknown>,
): void {
  _markCoverage(surface, 'GEOMETRY');
  const key = _stableKey(geometry);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === key) return;
    const prevSnap = _snapshots.get(surface);
    const prev = prevSnap?.geometry;
    _snapshots.set(surface, { ...prevSnap, geometry });
    if (last.current !== null) {
      recordWartime('GEOMETRY', `surface.geometry-changed: ${surface}`, {
        from: prev,
        to: geometry,
        diff: _diff(prev, geometry),
      });
    } else {
      recordWartime('GEOMETRY', `surface.geometry-initial: ${surface}`, { geometry });
    }
    last.current = key;
  }, [key, surface, geometry]);
}

/**
 * Track a single piece of state for a surface. Diff-emits with from/to.
 * Declarative — call multiple times per surface for multiple values.
 */
export function useWartimeState<T>(surface: string, label: string, value: T): void {
  _markCoverage(surface, 'STATE');
  const key = _stableKey(value);
  const last = useRef<{ key: string | null; value: T | null }>({ key: null, value: null });
  useEffect(() => {
    if (last.current.key === key) return;
    // Merge into snapshot under state.<label>
    const prevSnap = _snapshots.get(surface);
    const prevState = (prevSnap?.state ?? {}) as Record<string, unknown>;
    const nextState = { ...prevState, [label]: value };
    _snapshots.set(surface, { ...prevSnap, state: nextState });
    if (last.current.key !== null) {
      recordWartime('GAMEPLAY', `state.${surface}.${label}`, {
        from: last.current.value,
        to: value,
      });
    } else {
      recordWartime('GAMEPLAY', `state.${surface}.${label}.initial`, { value });
    }
    last.current = { key, value };
  }, [key, surface, label, value]);
}

/**
 * Record an explicit render-decision branch. Must be called *inside* the
 * branching component (cannot be inferred). Signature-keyed so it does
 * not spam every render.
 */
export function recordWartimeRender(
  surface: string,
  decision: string,
  payload?: Record<string, unknown>,
): void {
  _markCoverage(surface, 'RENDER');
  const snap = _snapshots.get(surface);
  const prev = snap?.renderDecision?.decision ?? null;
  _snapshots.set(surface, {
    ...snap,
    renderDecision: { decision, payload },
  });
  if (prev !== decision) {
    recordWartime('RENDERING', `render.${surface}: ${decision}`, {
      from: prev,
      to: decision,
      ...payload,
    });
  }
}

/**
 * React-friendly variant — call from inside the component so the decision
 * is captured every render but only emitted on change.
 */
export function useWartimeRender(
  surface: string,
  decision: string,
  payload?: Record<string, unknown>,
): void {
  _markCoverage(surface, 'RENDER');
  const lastRef = useRef<string | null>(null);
  if (lastRef.current !== decision) {
    // Emit during render is OK because recordWartime is a pure side-effect
    // to an out-of-tree ring buffer.
    recordWartimeRender(surface, decision, payload);
    lastRef.current = decision;
  }
}

// -------------------------------------------------------------------------
// Manual transition (escape hatch). Most transitions are auto-emitted via
// the mount/unmount engine; this is only for cases where two surfaces
// coexist briefly and the implicit engine cannot infer the boundary.
// -------------------------------------------------------------------------
export function recordSurfaceTransition(
  fromSurface: string,
  toSurface: string,
  context: Record<string, unknown> = {},
): void {
  const from = _snapshots.get(fromSurface) ?? {};
  const to = _snapshots.get(toSurface) ?? {};
  recordWartimeTransition(`${fromSurface} → ${toSurface}`, context, from as any, to as any);
}

// -------------------------------------------------------------------------
// Pre-declare known surfaces so the coverage matrix is visible immediately.
// -------------------------------------------------------------------------
// Per-surface declared coverage — reflects what is actually wired in code
// today. Each entry lists the categories whose hook is present in that
// surface's source. Surfaces with an empty array are placeholders awaiting
// Phase 2 wiring.
const KNOWN_SURFACES: Array<[string, CoverageCategory[]]> = [
  ['Game.route', []],
  ['PersistentTableShell', ['IDENTITY', 'LIFECYCLE', 'GEOMETRY', 'STATE', 'RENDER']],
  ['WaitingTable', []],
  ['NeutralInterstitial', ['IDENTITY', 'LIFECYCLE', 'OWNERSHIP', 'STATE', 'RENDER']],
  ['DealerSelection', []],
  ['DealerGameSetup', []],
  ['PlayfieldSlotController', ['IDENTITY', 'LIFECYCLE', 'STATE']],
  ['GameplaySlot', []],
  ['SeatAnchorLayer', []],
  ['ChipAnchorLayer', []],
  ['HUD', []],
  ['ActivePlayerPane', []],
  ['Announcements', []],
  ['Celebrations', []],
  ['WinOverlays', []],
  ['CribbageFelt', []],
  ['HighCardRender', []],
];
for (const [s, cats] of KNOWN_SURFACES) declareWartimeSurface(s, cats);

// =========================================================================
// PlayerVisualSnapshot — cross-surface per-player diff engine.
//
// Each surface that renders a seated player calls
//   recordPlayerVisualSnapshot('WaitingTable' | 'NeutralInterstitial' | ...,
//     { playerId, position, seatAnchorSource, chipAnchorSource, ... })
// per render (signature-keyed so it only emits on change).
//
// When the SAME playerId is recorded on a DIFFERENT surface than the
// previous snapshot for that player, an automatic
// `[WARTIME] player-visual-transition` event is emitted with deltas
// across every visual dimension — no manual diffing required.
// =========================================================================

export interface PlayerVisualSnapshot {
  surface: string;
  playerId: string;
  userId?: string | null;
  position?: number | null;
  viewerPosition?: number | null;
  logicalSeat?: number | null;
  renderedSeatSlot?: number | string | null;
  seatAnchorSource?: string | null;
  seatAnchorCoordinates?: Record<string, unknown> | null;
  chipAnchorSource?: string | null;
  chipAnchorCoordinates?: Record<string, unknown> | null;
  chipRenderer?: string | null;
  chipStyleSource?: string | null;
  chipVariant?: string | null;
  chipValue?: string | number | null;
  /** DOM coordinates of the chip element (when locatable). */
  chipDOMSelector?: string | null;
  chipRect?: Record<string, number> | null;
  chipComputedStyle?: Record<string, string> | null;
  status?: string | null;
  projectionMode?: string | null;
  isViewerSelf?: boolean | null;
  isSuppressed?: boolean | null;
  suppressionReason?: string | null;
}

const _playerVisualSnapshots = new Map<string, PlayerVisualSnapshot>(); // key: surface:playerId
const _playerLastSurface = new Map<string, string>();                   // playerId -> last surface

function _diffSnapshots(a: PlayerVisualSnapshot, b: PlayerVisualSnapshot) {
  const keys: (keyof PlayerVisualSnapshot)[] = [
    'position', 'viewerPosition', 'logicalSeat', 'renderedSeatSlot',
    'seatAnchorSource', 'seatAnchorCoordinates',
    'chipAnchorSource', 'chipAnchorCoordinates',
    'chipRenderer', 'chipStyleSource', 'chipVariant', 'chipValue',
    'chipDOMSelector', 'chipRect', 'chipComputedStyle',
    'status', 'projectionMode', 'isViewerSelf', 'isSuppressed', 'suppressionReason',
  ];
  const delta: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    const va = a[k] as unknown;
    const vb = b[k] as unknown;
    if (JSON.stringify(va) !== JSON.stringify(vb)) delta[k as string] = { from: va, to: vb };
  }
  return delta;
}

export function recordPlayerVisualSnapshot(snap: PlayerVisualSnapshot): void {
  const key = `${snap.surface}:${snap.playerId}`;
  const prevSameSurface = _playerVisualSnapshots.get(key);
  const prevSurfaceForPlayer = _playerLastSurface.get(snap.playerId) ?? null;

  // Cache + always store the latest for this surface.
  const sigPrev = prevSameSurface ? JSON.stringify(prevSameSurface) : null;
  const sigNext = JSON.stringify(snap);
  const changed = sigPrev !== sigNext;
  _playerVisualSnapshots.set(key, snap);
  _playerLastSurface.set(snap.playerId, snap.surface);

  if (changed) {
    recordWartime('SEATING', `player-visual-snapshot ${snap.surface}`, {
      playerId: snap.playerId,
      surface: snap.surface,
      snapshot: snap,
    });
  }

  // If the player previously rendered on a DIFFERENT surface, emit
  // a cross-surface transition diff automatically.
  if (prevSurfaceForPlayer && prevSurfaceForPlayer !== snap.surface) {
    const prevKey = `${prevSurfaceForPlayer}:${snap.playerId}`;
    const prev = _playerVisualSnapshots.get(prevKey);
    if (prev) {
      recordWartime('SEATING', `player-visual-transition ${prevSurfaceForPlayer} → ${snap.surface}`, {
        playerId: snap.playerId,
        position: snap.position ?? null,
        from: { surface: prevSurfaceForPlayer, snapshot: prev },
        to:   { surface: snap.surface,         snapshot: snap },
        delta: _diffSnapshots(prev, snap),
      });
    }
  }
}

// =========================================================================
// HighCard render/lifecycle/classifier helpers.
// =========================================================================

interface HighCardRenderState {
  renderPath: string | null;
  cardsLength: number;
  cardIds: string[];
  winnerPosition: number | null;
  isComplete: boolean;
  hasAnnouncement: boolean;
  shouldRenderCards: boolean;
  hideReason: string | null;
  componentKey: string | null;
  gameStatus: string | null;
}

const _lastHighCardRender = new Map<string, HighCardRenderState>(); // gameId -> last

export interface HighCardRenderPayload extends Partial<HighCardRenderState> {
  gameId: string;
  selectedCardsSource?: string;
  renderedCardCount?: number;
}

export function recordHighCardSurfaceMount(payload: Record<string, unknown>): void {
  recordWartime('LIFECYCLE', 'surface.mount HighCardDealerSelection', payload);
}
export function recordHighCardSurfaceUnmount(payload: Record<string, unknown>): void {
  recordWartime('LIFECYCLE', 'surface.unmount HighCardDealerSelection', payload);
}

export function recordHighCardRender(payload: HighCardRenderPayload): void {
  const next: HighCardRenderState = {
    renderPath: payload.renderPath ?? null,
    cardsLength: payload.cardsLength ?? 0,
    cardIds: payload.cardIds ?? [],
    winnerPosition: payload.winnerPosition ?? null,
    isComplete: payload.isComplete ?? false,
    hasAnnouncement: payload.hasAnnouncement ?? false,
    shouldRenderCards: payload.shouldRenderCards ?? false,
    hideReason: payload.hideReason ?? null,
    componentKey: payload.componentKey ?? null,
    gameStatus: payload.gameStatus ?? null,
  };
  const prev = _lastHighCardRender.get(payload.gameId);
  _lastHighCardRender.set(payload.gameId, next);

  if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) {
    recordWartime('RENDERING', 'render.HighCardDealerSelection', {
      gameId: payload.gameId,
      selectedCardsSource: payload.selectedCardsSource ?? null,
      renderedCardCount: payload.renderedCardCount ?? next.cardsLength,
      from: prev ?? null,
      to: next,
    });
  }

  // Disappearance classifier — when card count drops to 0.
  if (prev && prev.cardsLength > 0 && next.cardsLength === 0) {
    let cause:
      | 'cards-array-cleared'
      | 'synced-state-cleared'
      | 'render-branch-hidden'
      | 'surface-unmounted'
      | 'component-key-changed'
      | 'status-transition'
      | 'unknown' = 'unknown';
    if (prev.componentKey !== next.componentKey) cause = 'component-key-changed';
    else if (prev.gameStatus !== next.gameStatus) cause = 'status-transition';
    else if (prev.shouldRenderCards && !next.shouldRenderCards) cause = 'render-branch-hidden';
    else if (payload.selectedCardsSource === 'syncedState') cause = 'synced-state-cleared';
    else cause = 'cards-array-cleared';

    recordWartime('RENDERING', 'high-card.cards-disappeared', {
      gameId: payload.gameId,
      previousCards: prev.cardIds,
      nextCards: next.cardIds,
      causeCandidate: cause,
      previousGameStatus: prev.gameStatus,
      nextGameStatus: next.gameStatus,
      previousRenderPath: prev.renderPath,
      nextRenderPath: next.renderPath,
      previousComponentKey: prev.componentKey,
      nextComponentKey: next.componentKey,
      previousShouldRenderCards: prev.shouldRenderCards,
      nextShouldRenderCards: next.shouldRenderCards,
    });
  }
}

export function recordHighCardCardRender(payload: {
  cardKey: string;
  cardId?: string | null;
  position?: number | null;
  rank?: string | null;
  suit?: string | null;
  source?: string | null;
  renderIndex?: number | null;
  surfaceInstanceId?: string | null;
}): void {
  recordWartime('RENDERING', 'high-card.card-render', payload);
}

export function recordHighCardCardMount(payload: Record<string, unknown>): void {
  recordWartime('LIFECYCLE', 'high-card.card-mount', payload);
}
export function recordHighCardCardUnmount(payload: Record<string, unknown>): void {
  recordWartime('LIFECYCLE', 'high-card.card-unmount', payload);
}


// =========================================================================
// HIGH-CARD RAW EVENTS — explicitly NOT deduplicated.
//
// The dedup'd `render.HighCardDealerSelection` event masks fast 2→0→2
// flicker if intermediate frames briefly clear cards. The raw stream
// records every call so a visual 2→0→2→0 can be reconstructed without
// inference. Scoped to the high-card window: callers stop emitting once
// dealer setup begins / surface unmounts.
// =========================================================================

export function recordHighCardStateRaw(payload: Record<string, unknown>): void {
  recordWartime('GAMEPLAY', 'high-card.state.raw', payload);
}
export function recordHighCardRenderRaw(payload: Record<string, unknown>): void {
  recordWartime('RENDERING', 'high-card.render.raw', payload);
}
export function recordHighCardVisualRaw(payload: Record<string, unknown>): void {
  recordWartime('RENDERING', 'high-card.visual.raw', payload);
}

// =========================================================================
// HIGH-CARD ANIMATION / TIMER RECORDER
// =========================================================================
export interface HighCardTimerPayload {
  timerId?: string | number | null;
  delayMs?: number | null;
  phaseFrom?: string | null;
  phaseTo?: string | null;
  cardsLength?: number | null;
  cardIds?: string[] | null;
  winnerPosition?: number | null;
  componentKey?: string | null;
  surfaceInstanceId?: string | null;
  gameId?: string | null;
  reason?: string | null;
}
export function recordHighCardTimer(event:
  | 'timeout.scheduled'
  | 'timeout.fired'
  | 'timeout.cancelled'
  | 'phase.changed'
  | 'reveal.phase'
  | 'card.reveal.started'
  | 'card.reveal.completed'
  | 'winner.phase.started'
  | 'winner.announcement.started'
  | 'onComplete.scheduled'
  | 'onComplete.fired',
  payload: HighCardTimerPayload,
): void {
  recordWartime('ANIMATIONS', `high-card.${event}`, payload);
}

// =========================================================================
// PLAYER-VISUAL TRANSITION DIFF (named alias — backwards-compatible call
// path. The auto-diff inside recordPlayerVisualSnapshot already emits a
// `player-visual-transition` event when the same playerId moves between
// surfaces. This helper lets producers explicitly tag a cross-surface
// snapshot pair without depending on emission timing.)
// =========================================================================
export function recordPlayerVisualTransitionDiff(args: {
  fromSurface: string;
  toSurface: string;
  playerId: string;
  from: PlayerVisualSnapshot;
  to: PlayerVisualSnapshot;
}): void {
  recordWartime(
    'SEATING',
    `player-visual-transition-diff ${args.fromSurface} → ${args.toSurface}`,
    {
      playerId: args.playerId,
      fromSurface: args.fromSurface,
      toSurface: args.toSurface,
      from: args.from,
      to: args.to,
      delta: _diffSnapshots(args.from, args.to),
    },
  );
}
