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
  /** Stable id of the SeatAnchorLayer provider whose context this
   *  snapshot read from (null when no ambient provider). Lets cross-
   *  surface diffs prove whether the provider survived a transition. */
  anchorProviderInstanceId?: string | null;
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
  /** Walk of `[data-*]` and tag descriptors from chip element upward;
   *  identifies the exact DOM owner chain of the rendered chip. */
  domAncestry?: string[] | null;
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
    'seatAnchorSource', 'seatAnchorCoordinates', 'anchorProviderInstanceId',
    'chipAnchorSource', 'chipAnchorCoordinates',
    'chipRenderer', 'chipStyleSource', 'chipVariant', 'chipValue',
    'chipDOMSelector', 'chipRect', 'chipComputedStyle', 'domAncestry',
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
      const delta = _diffSnapshots(prev, snap);
      recordWartime('SEATING', `player-visual-transition ${prevSurfaceForPlayer} → ${snap.surface}`, {
        playerId: snap.playerId,
        position: snap.position ?? null,
        from: { surface: prevSurfaceForPlayer, snapshot: prev },
        to:   { surface: snap.surface,         snapshot: snap },
        delta,
      });
      // CHIP_RENDER_PATH_DIFF — focused single-event diff that names
      // exactly which renderer / owner / anchor / style / projection /
      // slot / DOM-ancestry dimension diverged across the transition.
      recordWartime(
        'SEATING',
        `CHIP_RENDER_PATH_DIFF ${prevSurfaceForPlayer} → ${snap.surface}`,
        {
          playerId: snap.playerId,
          position: snap.position ?? null,
          rendererChange: {
            from: prev.chipRenderer ?? null, to: snap.chipRenderer ?? null,
          },
          ownerChange: {
            from: prev.surface, to: snap.surface,
          },
          anchorSourceChange: {
            from: prev.seatAnchorSource ?? null, to: snap.seatAnchorSource ?? null,
            providerFrom: prev.anchorProviderInstanceId ?? null,
            providerTo: snap.anchorProviderInstanceId ?? null,
            providerSurvived:
              !!(prev.anchorProviderInstanceId && snap.anchorProviderInstanceId &&
                 prev.anchorProviderInstanceId === snap.anchorProviderInstanceId),
          },
          styleSourceChange: {
            from: prev.chipStyleSource ?? null, to: snap.chipStyleSource ?? null,
            variantFrom: prev.chipVariant ?? null,
            variantTo: snap.chipVariant ?? null,
            statusFrom: prev.status ?? null,
            statusTo: snap.status ?? null,
          },
          projectionChange: {
            from: prev.projectionMode ?? null, to: snap.projectionMode ?? null,
          },
          slotChange: {
            from: prev.renderedSeatSlot ?? null, to: snap.renderedSeatSlot ?? null,
          },
          domAncestryChange: {
            from: prev.domAncestry ?? null, to: snap.domAncestry ?? null,
          },
          rectChange: {
            from: prev.chipRect ?? null, to: snap.chipRect ?? null,
          },
          fullDelta: delta,
        },
      );
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
// HIGH-CARD ATTRIBUTION HELPERS
//
// These give explicit callsite attribution so traces never leave a
// 2 → 0 → 2 → 0 sequence unattributed. Every code path that can clear,
// overwrite, or transition high-card visible state must emit one of
// these BEFORE mutating state.
// =========================================================================

export interface HighCardClearPayload {
  /** Producer tag: 'realtime-status-change' | 'cribbage-handoff-complete' |
   *  'non-host-sync' | 'host-complete-sync' | 'reset-path' | ... */
  source: string;
  /** file:line OR symbolic callsite ('useHighCardDealerSelection.non-host-receive'). */
  callsite: string;
  reason?: string | null;
  cardsLengthBeforeClear: number;
  cardsLengthAfterClear: number;
  gameStatus?: string | null;
  winnerPosition?: number | null;
  dealerSelectionComplete?: boolean | null;
  currentRoundId?: string | null;
  dealerGameId?: string | null;
  gameId?: string | null;
  surfaceInstanceId?: string | null;
}
export function recordHighCardCardsClear(payload: HighCardClearPayload): void {
  recordWartime('RENDERING', 'high-card.cards-clear', payload as unknown as Record<string, unknown>);
}

// =========================================================================
// FIRST 2 → 0 DISAPPEARANCE RECORDER
//
// Fires EXACTLY ONCE per gameId for the first transition from
// previousCardsLength > 0 → nextCardsLength === 0. Centralizes attribution
// so the very first disappearance is captured no matter which clear
// callsite (local clear, sync overwrite, render-path switch, remount)
// caused it.
// =========================================================================

export interface HighCardFirstDisappearancePayload {
  gameId: string;
  previousCards: Array<{ position?: number | null; rank?: string | null; suit?: string | null }>;
  nextCards: Array<{ position?: number | null; rank?: string | null; suit?: string | null }>;
  previousLength: number;
  nextLength: number;
  /** 'local-state' | 'realtime-sync-overwrite' | 'render-path-switch'
   *  | 'visibility-gating' | 'component-remount' | 'unknown' */
  source: string;
  callsite: string;
  renderPath?: string | null;
  surfaceInstanceId?: string | null;
  gameStatus?: string | null;
  dealerGameId?: string | null;
  roundId?: string | null;
  syncedStateCardsLen?: number | null;
  hasSyncedState?: boolean | null;
}

const _seenHighCardFirstDisappearance = new Set<string>();

export function recordHighCardFirstDisappearance(
  payload: HighCardFirstDisappearancePayload,
): void {
  if (_seenHighCardFirstDisappearance.has(payload.gameId)) return;
  _seenHighCardFirstDisappearance.add(payload.gameId);
  recordWartime(
    'RENDERING',
    'high-card.first-disappearance',
    payload as unknown as Record<string, unknown>,
  );
  // Wartime contract: if no writer event occurred within the preceding
  // 500ms window, the disappearance is UNATTRIBUTED — emit the defect
  // marker so the trace surfaces it without inference.
  const recent = _recentHighCardWritersWithin(500);
  if (recent === 0) {
    recordHighCardUnattributedMutation({
      gameId: payload.gameId,
      previousLength: payload.previousLength,
      nextLength: payload.nextLength,
      windowMs: 500,
      recentWritersInWindow: 0,
      surfaceInstanceId: payload.surfaceInstanceId ?? null,
      componentKey: null,
      note: 'first-disappearance with no preceding HIGH_CARD_MUTATION_SOURCE writer event in 500ms window',
    });
  }
}

export function resetHighCardFirstDisappearance(gameId?: string): void {
  if (!gameId) { _seenHighCardFirstDisappearance.clear(); return; }
  _seenHighCardFirstDisappearance.delete(gameId);
}

export type HighCardStateSource =
  | 'local'
  | 'external-prop'
  | 'realtime-sync'
  | 'derived-state'
  | 'reset-path'
  | 'host-complete-replay'
  | 'unknown';

export interface HighCardStateSourcePayload {
  gameId: string;
  previousSource: HighCardStateSource | null;
  newSource: HighCardStateSource;
  cardCount: number;
  cardIds: string[];
  renderPath: string | null;
  gameStatus?: string | null;
  surfaceInstanceId?: string | null;
}
const _lastHighCardStateSource = new Map<string, HighCardStateSourcePayload>();
export function recordHighCardStateSource(payload: HighCardStateSourcePayload): void {
  const prev = _lastHighCardStateSource.get(payload.gameId);
  // Emit only when source OR card-identity changes — this is the attribution
  // signal needed to distinguish "local clear" vs "sync overwrite".
  const sig = `${payload.newSource}|${payload.cardCount}|${payload.cardIds.join(',')}`;
  const prevSig = prev ? `${prev.newSource}|${prev.cardCount}|${prev.cardIds.join(',')}` : null;
  if (sig === prevSig) return;
  const enriched: HighCardStateSourcePayload = {
    ...payload,
    previousSource: prev?.newSource ?? null,
  };
  _lastHighCardStateSource.set(payload.gameId, enriched);
  recordWartime(
    'RENDERING',
    'high-card.state-source',
    enriched as unknown as Record<string, unknown>,
  );
}

export interface HighCardVisibleRendererPayload {
  gameId: string;
  rendererName: string;
  componentName: string;
  renderPath: string;
  containerId?: string | null;
  wartimeTagged: boolean;
  visibleCardCount?: number | null;
  surfaceInstanceId?: string | null;
}
const _seenHighCardRenderers = new Set<string>();
export function recordHighCardVisibleRenderer(payload: HighCardVisibleRendererPayload): void {
  const key = `${payload.gameId}:${payload.rendererName}:${payload.componentName}`;
  if (_seenHighCardRenderers.has(key)) return;
  _seenHighCardRenderers.add(key);
  recordWartime(
    'OWNERSHIP',
    'high-card.visible-renderer',
    payload as unknown as Record<string, unknown>,
  );
}
export function resetHighCardVisibleRendererCache(gameId?: string): void {
  if (!gameId) { _seenHighCardRenderers.clear(); return; }
  for (const k of Array.from(_seenHighCardRenderers)) {
    if (k.startsWith(`${gameId}:`)) _seenHighCardRenderers.delete(k);
  }
}

export type HighCardPhase =
  | 'waiting'
  | 'dealing'
  | 'reveal'
  | 'winner-announcement'
  | 'dealer-setup-transition';

export interface HighCardPhasePayload {
  gameId: string;
  phase: HighCardPhase;
  cardsVisible: boolean;
  cardCount: number;
  winnerPosition: number | null;
  gameStatus?: string | null;
  surfaceInstanceId?: string | null;
}
const _lastHighCardPhase = new Map<string, HighCardPhase>();
export function recordHighCardPhaseTransition(
  payload: HighCardPhasePayload,
): void {
  const prev = _lastHighCardPhase.get(payload.gameId) ?? null;
  if (prev === payload.phase) return;
  if (prev !== null) {
    recordWartime('LIFECYCLE', 'high-card.phase-exit', {
      ...payload,
      phase: prev,
      nextPhase: payload.phase,
    } as unknown as Record<string, unknown>);
  }
  recordWartime('LIFECYCLE', 'high-card.phase-enter', {
    ...payload,
    previousPhase: prev,
  } as unknown as Record<string, unknown>);
  _lastHighCardPhase.set(payload.gameId, payload.phase);
}
export function resetHighCardPhaseCache(gameId?: string): void {
  if (!gameId) { _lastHighCardPhase.clear(); return; }
  _lastHighCardPhase.delete(gameId);
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
  recordWartime('ANIMATIONS', `high-card.${event}`, payload as unknown as Record<string, unknown>);
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

// =========================================================================
// DOM probe helper — used by snapshot producers to populate chipRect /
// chipComputedStyle so the cross-surface transition diff can reason
// about pixel-level moves and style deltas.
// =========================================================================
export function probeChipDom(position: number | null | undefined): {
  chipDOMSelector: string | null;
  chipRect: Record<string, number> | null;
  chipComputedStyle: Record<string, string> | null;
} {
  if (position == null || typeof document === 'undefined') {
    return { chipDOMSelector: null, chipRect: null, chipComputedStyle: null };
  }
  const selector = `[data-chip-center="${position}"]`;
  let el: Element | null = null;
  try { el = document.querySelector(selector); } catch { /* ignore */ }
  if (!el) return { chipDOMSelector: selector, chipRect: null, chipComputedStyle: null };
  let rect: Record<string, number> | null = null;
  try {
    const r = (el as HTMLElement).getBoundingClientRect();
    rect = {
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2),
    };
  } catch { /* ignore */ }
  let style: Record<string, string> | null = null;
  try {
    const cs = window.getComputedStyle(el as HTMLElement);
    style = {
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      transform: cs.transform, zIndex: cs.zIndex, color: cs.color,
      background: cs.backgroundColor,
    };
  } catch { /* ignore */ }
  return { chipDOMSelector: selector, chipRect: rect, chipComputedStyle: style };
}

// =========================================================================
// DOM ancestry probe — walks up from the chip element capturing tagName +
// notable `data-*` attributes per ancestor. Used by chip-render-path
// snapshots so CHIP_RENDER_PATH_DIFF surfaces DOM-owner divergence
// (e.g. NeutralInterstitial container vs. WaitingTable container)
// without requiring per-component instrumentation.
// =========================================================================
export function probeChipDomAncestry(
  position: number | null | undefined,
  maxDepth = 10,
): string[] {
  if (position == null || typeof document === 'undefined') return [];
  const selector = `[data-chip-center="${position}"]`;
  let el: Element | null = null;
  try { el = document.querySelector(selector); } catch { return []; }
  if (!el) return [];
  const ancestry: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < maxDepth) {
    const tag = cur.tagName.toLowerCase();
    const dataAttrs: string[] = [];
    for (const attr of Array.from(cur.attributes)) {
      if (attr.name.startsWith('data-') && attr.name !== 'data-state') {
        const v = attr.value ? `=${attr.value.slice(0, 24)}` : '';
        dataAttrs.push(`${attr.name}${v}`);
      }
    }
    ancestry.push(`${tag}${dataAttrs.length ? `[${dataAttrs.join('|')}]` : ''}`);
    cur = cur.parentElement;
    depth += 1;
  }
  return ancestry;
}

// =========================================================================
// HIGH-CARD WRITER ATTRIBUTION
//
// Emitted IMMEDIATELY BEFORE any code path mutates the visible high-card
// cards array. Captures producer / callsite / reason / previous+next
// card identity + a JS stack so the trace can prove the exact writer
// responsible for the first 2 → 0 disappearance — no inference.
// =========================================================================
export interface HighCardWriterPayload {
  gameId: string;
  source:
    | 'host-deal'
    | 'host-determine-winner'
    | 'host-complete-replay'
    | 'host-complete-sync'
    | 'non-host-sync'
    | 'reset-path'
    | 'cribbage-complete-handoff'
    | 'ante-to-cribbage-transition'
    | 'setGame-dealer-selection-state-realtime'
    | 'setGame-fetchGameData'
    | 'startGame-clear'
    | 'selectDealer-clear'
    | 'game-over-restart-clear'
    | 'unknown';
  callsite: string;
  reason: string;
  previousLength: number;
  nextLength: number;
  previousCardIds: string[];
  nextCardIds: string[];
  renderPath?: string | null;
  surfaceInstanceId?: string | null;
  winnerPosition?: number | null;
  isComplete?: boolean | null;
  stack?: string | null;
  extra?: Record<string, unknown>;
}
const _recentWriters: Array<{ tMs: number; source: string }> = [];
export function _recentHighCardWritersWithin(windowMs: number): number {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let n = 0;
  for (const w of _recentWriters) if (now - w.tMs <= windowMs) n++;
  return n;
}
export function recordHighCardWriter(payload: HighCardWriterPayload): void {
  const stack = payload.stack ?? (() => {
    try {
      const e = new Error('writer-stack');
      return (e.stack ?? '').split('\n').slice(0, 12).join('\n');
    } catch { return null; }
  })();
  const tMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  _recentWriters.push({ tMs, source: payload.source });
  if (_recentWriters.length > 200) _recentWriters.splice(0, _recentWriters.length - 200);
  recordWartime(
    'GAMEPLAY',
    `HIGH_CARD_MUTATION_SOURCE ${payload.source}`,
    { ...payload, stack } as unknown as Record<string, unknown>,
  );
}

// ── HIGH_CARD_UNATTRIBUTED_MUTATION ───────────────────────────────────
// Emitted by the sampler/watcher only when a transition is observed
// with ZERO matching writer events in the preceding window. This is
// the contract breach: if a cards change has no writer attribution,
// classify as Wartime defect.
export interface HighCardUnattributedMutationPayload {
  gameId: string | null;
  previousLength: number;
  nextLength: number;
  windowMs: number;
  recentWritersInWindow: number;
  surfaceInstanceId?: string | null;
  componentKey?: string | null;
  note?: string;
}
export function recordHighCardUnattributedMutation(
  payload: HighCardUnattributedMutationPayload,
): void {
  recordWartime(
    'GAMEPLAY',
    'HIGH_CARD_UNATTRIBUTED_MUTATION',
    payload as unknown as Record<string, unknown>,
  );
}

// ── CHIP_RUNTIME_CONTINUITY ──────────────────────────────────────────
// Emitted by CanonicalSeatCluster (and the deferred wrapper) on mount
// and unmount with stable per-mount instance ids for the seat anchor
// provider, the cluster React component, and the chip DOM node. A
// trace can answer YES/NO to "did each layer survive WaitingTable →
// NeutralInterstitial → DealerSelection" by diffing successive mounts
// for the same (playerId, position).
export interface ChipRuntimeContinuityPayload {
  phase: 'mount' | 'unmount';
  surface: string;
  position: number;
  playerId?: string | null;
  providerInstanceId: string | null;
  clusterInstanceId: string;
  deferredWrapperInstanceId?: string | null;
  rootDomNodeId?: string | null;
  chipDomNodeId?: string | null;
  rootRect?: { x: number; y: number; w: number; h: number } | null;
}
export function recordChipRuntimeContinuity(
  payload: ChipRuntimeContinuityPayload,
): void {
  recordWartime(
    'OWNERSHIP',
    `CHIP_RUNTIME_CONTINUITY.${payload.phase}`,
    payload as unknown as Record<string, unknown>,
  );
}

export interface ChipInstanceTransitionPayload {
  position: number;
  playerId?: string | null;
  layer: 'provider' | 'cluster' | 'chipDomNode' | 'rootDomNode' | 'deferredWrapper';
  from: string | null;
  to: string | null;
  reason: string;
  surface?: string | null;
}
// Module-scope per-(position) memory so we can emit transitions across
// surface boundaries even when the previous cluster has already
// unmounted (its useEffect ran the cleanup, but the next mount can
// still see what came before via this registry).
const _chipContinuityMemory = new Map<
  number,
  {
    providerInstanceId: string | null;
    clusterInstanceId: string | null;
    chipDomNodeId: string | null;
    rootDomNodeId: string | null;
    surface: string;
  }
>();
export function noteChipContinuityMount(p: ChipRuntimeContinuityPayload): void {
  const prev = _chipContinuityMemory.get(p.position);
  const next = {
    providerInstanceId: p.providerInstanceId,
    clusterInstanceId: p.clusterInstanceId,
    chipDomNodeId: p.chipDomNodeId ?? null,
    rootDomNodeId: p.rootDomNodeId ?? null,
    surface: p.surface,
  };
  if (prev) {
    const layers: Array<[ChipInstanceTransitionPayload['layer'], string | null, string | null]> = [
      ['provider', prev.providerInstanceId, next.providerInstanceId],
      ['cluster', prev.clusterInstanceId, next.clusterInstanceId],
      ['chipDomNode', prev.chipDomNodeId, next.chipDomNodeId],
      ['rootDomNode', prev.rootDomNodeId, next.rootDomNodeId],
    ];
    for (const [layer, from, to] of layers) {
      if (from !== to) {
        recordChipInstanceTransition({
          position: p.position,
          playerId: p.playerId ?? null,
          layer,
          from,
          to,
          reason: `surface ${prev.surface} → ${next.surface}`,
          surface: next.surface,
        });
      }
    }
  }
  _chipContinuityMemory.set(p.position, next);
}
export function recordChipInstanceTransition(
  payload: ChipInstanceTransitionPayload,
): void {
  recordWartime(
    'OWNERSHIP',
    `CHIP_INSTANCE_TRANSITION ${payload.layer}`,
    payload as unknown as Record<string, unknown>,
  );
}

// =========================================================================
// HIGH-CARD DOM vs HOOK DIVERGENCE
//
// Emitted from the rAF sampler when the visible DOM card count diverges
// from the hook card count. Carries both snapshots so the trace can
// attribute symptom ↔ cause without a second repro.
// =========================================================================
export interface HighCardStateVisualDivergencePayload {
  gameId: string;
  surfaceInstanceId?: string | null;
  componentKey?: string | null;
  renderPath?: string | null;
  hookCardsLength: number;
  hookCardIds: string[];
  domCardCount: number;
  domCardKeys: string[];
  domCardIds: string[];
  winnerPosition?: number | null;
  isComplete?: boolean | null;
  gameStatus?: string | null;
  sampledAtMs?: number | null;
}
export function recordHighCardStateVisualDivergence(
  payload: HighCardStateVisualDivergencePayload,
): void {
  recordWartime(
    'RENDERING',
    'HIGH_CARD_STATE_VISUAL_DIVERGENCE',
    payload as unknown as Record<string, unknown>,
  );
}
