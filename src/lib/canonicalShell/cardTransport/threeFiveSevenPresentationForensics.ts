/**
 * 3-5-7 PRESENTATION-LAYER FORENSICS
 *
 * Three permanent ring buffers exposed on `window` so a single repro
 * proves (or disproves) every remaining hypothesis about:
 *   - card-0 r1 flash
 *   - inter-round disappearance
 *   - hand remount churn
 *   - transport-destroyed-before-static-mount race
 *
 * Buffers (last 200 entries each):
 *   window.__357HandLifecycle             — every self/opponent PlayerHand render
 *   window.__357CardOwnershipTimeline     — per-card transport/static mount timing
 *   window.__357FanLifecycle              — FanLayout (PlayerHand fan root) mount/unmount/layout passes
 *
 * Cross-game safe (Holm staged deal, community reveals, etc. can reuse).
 * Zero React. Zero re-renders. Pure recorder.
 */

const HAND_CAP = 200;
const CARD_CAP = 400;
const FAN_CAP = 200;

export interface HandLifecycleEntry {
  t: number;
  wallTime: string;
  handContextId: string | null;
  phase: string | null;
  reactKey: string | null;
  mounted: boolean;
  visible: boolean;
  opacity: string | null;
  display: string | null;
  cardCount: number;
  cardIds: string[];
  component: 'SELF' | 'OPPONENT' | 'PLAYER_HAND';
  playerId: string | null;
  violation?: string;
  detail?: Record<string, unknown>;
}

export type CardHiddenReason =
  | 'none'
  | 'transport_inflight'
  | 'wave_transition'
  | 'fan_layout'
  | 'opacity_zero'
  | 'visibility_hidden'
  | 'display_none'
  | 'render_guard'
  | 'unknown';

export interface CardOwnershipEntry {
  cardId: string;
  intentId: string | null;
  handContextId: string | null;
  transportMounted: boolean;
  transportVisible: boolean;
  staticMounted: boolean;
  staticVisible: boolean;
  ownershipClaimed: boolean;
  transportMountTime: number | null;
  transportDestroyTime: number | null;
  staticMountTime: number | null;
  staticUnmountTime: number | null;
  /** staticMountTime - transportDestroyTime (negative ⇒ destroy preceded mount). */
  gapMs: number | null;
  // ─── Per-card "who killed it" forensic (added for authoritative vs visible diff) ───
  role?: 'self' | 'opp' | null;
  playerId?: string | null;
  fanIndex?: number | null;
  authoritativeVisible?: boolean;
  domMounted?: boolean;
  domRect?: { x: number; y: number; w: number; h: number } | null;
  hiddenByReason?: CardHiddenReason;
  dealPhase?: string | null;
  authoritativeCount?: number;
  visibleCount?: number;
  settledCount?: number;
  updatedAt: number;
}


export interface FanLifecycleEntry {
  t: number;
  wallTime: string;
  event: 'mount' | 'unmount' | 'layout-pass';
  reason:
    | 'authoritativeUpdate'
    | 'phaseChange'
    | 'keyChange'
    | 'resizeObserver'
    | 'geometryUpdate'
    | 'initialMount'
    | 'componentUnmount'
    | 'unknown';
  fanId: string;
  cardCount: number;
  layoutPasses: number;
  mountedAt: number | null;
  unmountedAt: number | null;
}

interface GlobalWindow extends Window {
  __357HandLifecycle?: HandLifecycleEntry[];
  __357CardOwnershipTimeline?: CardOwnershipEntry[];
  __357FanLifecycle?: FanLifecycleEntry[];
  __357CardOwnershipMap?: Map<string, CardOwnershipEntry>;
}

function w(): GlobalWindow | null {
  return typeof window === 'undefined' ? null : (window as GlobalWindow);
}

function ensure() {
  const g = w();
  if (!g) return null;
  if (!g.__357HandLifecycle) g.__357HandLifecycle = [];
  if (!g.__357CardOwnershipTimeline) g.__357CardOwnershipTimeline = [];
  if (!g.__357FanLifecycle) g.__357FanLifecycle = [];
  if (!g.__357CardOwnershipMap) g.__357CardOwnershipMap = new Map();
  return g;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function wall(): string {
  return new Date().toISOString();
}

export function record357HandLifecycle(entry: Omit<HandLifecycleEntry, 't' | 'wallTime'>): void {
  const g = ensure();
  if (!g) return;
  const buf = g.__357HandLifecycle!;
  buf.push({ ...entry, t: now(), wallTime: wall() });
  if (buf.length > HAND_CAP) buf.splice(0, buf.length - HAND_CAP);
}

export function record357DiagnosticViolation(
  violation: string,
  detail: Record<string, unknown>,
  context: Partial<Pick<HandLifecycleEntry, 'handContextId' | 'phase' | 'component' | 'playerId' | 'cardIds'>> = {},
): void {
  record357HandLifecycle({
    handContextId: context.handContextId ?? null,
    phase: context.phase ?? null,
    reactKey: violation,
    mounted: true,
    visible: false,
    opacity: null,
    display: null,
    cardCount: context.cardIds?.length ?? 0,
    cardIds: context.cardIds ?? [],
    component: context.component ?? 'PLAYER_HAND',
    playerId: context.playerId ?? null,
    violation,
    detail,
  });
}

export function record357FanLifecycle(entry: Omit<FanLifecycleEntry, 't' | 'wallTime'>): void {
  const g = ensure();
  if (!g) return;
  const buf = g.__357FanLifecycle!;
  buf.push({ ...entry, t: now(), wallTime: wall() });
  if (buf.length > FAN_CAP) buf.splice(0, buf.length - FAN_CAP);
}

export function record357CardOwnership(
  cardId: string,
  patch: Partial<Omit<CardOwnershipEntry, 'cardId' | 'updatedAt'>>,
): void {
  const g = ensure();
  if (!g) return;
  const map = g.__357CardOwnershipMap!;
  const prev = map.get(cardId) ?? {
    cardId,
    intentId: null,
    handContextId: null,
    transportMounted: false,
    transportVisible: false,
    staticMounted: false,
    staticVisible: false,
    ownershipClaimed: false,
    transportMountTime: null,
    transportDestroyTime: null,
    staticMountTime: null,
    staticUnmountTime: null,
    gapMs: null,
    updatedAt: now(),
  } as CardOwnershipEntry;
  const next: CardOwnershipEntry = { ...prev, ...patch, cardId, updatedAt: now() };
  if (next.staticMountTime != null && next.transportDestroyTime != null) {
    next.gapMs = +(next.staticMountTime - next.transportDestroyTime).toFixed(2);
  }
  map.set(cardId, next);
  // Mirror to flat array (last write wins; capped).
  const buf = g.__357CardOwnershipTimeline!;
  const idx = buf.findIndex((e) => e.cardId === cardId);
  if (idx >= 0) buf[idx] = next;
  else buf.push(next);
  if (buf.length > CARD_CAP) buf.splice(0, buf.length - CARD_CAP);
}

export function get357CardOwnership(cardId: string): CardOwnershipEntry | null {
  const g = ensure();
  if (!g) return null;
  return g.__357CardOwnershipMap!.get(cardId) ?? null;
}
