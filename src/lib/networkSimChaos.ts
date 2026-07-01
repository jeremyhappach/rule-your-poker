/**
 * networkSimChaos — Cross-Country Chaos profile.
 *
 * A reusable two-client stress profile that simulates real remote-play
 * instability. Each client (host + non-host) rolls its own randomized
 * conditions from an exportable seed. Two clients sharing the same seed
 * + settings reproduce the same injected-event schedule.
 *
 * Contract:
 *   - Never mutates payloads. Only delays / reorders delivery locally
 *     and briefly holds+bursts callbacks around a simulated disconnect.
 *   - Never injects game-state transitions. Only rewraps the normal
 *     realtime callback path already provided by simulateRealtime().
 *   - Exposes a persistent timeline of every injected event for export.
 *
 * Integration:
 *   networkSim.ts imports chaosWrap() when mode === 'cross_country_chaos'
 *   and delegates delivery to this module.
 */

// ── Seeded RNG (mulberry32) ────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// ── Types ───────────────────────────────────────────────────────

export type ChaosClientRole = 'host' | 'peer' | 'unknown';
export type ChaosClientClass = 'mobile-like' | 'desktop-like';

export interface ChaosPhase {
  index: number;
  startMs: number;       // relative to session start
  endMs: number;
  baseLatencyMs: number; // asymmetric per-client baseline
  jitterMs: number;
  disconnected: boolean; // if true, callbacks queue until phase end
  burstOnRecover: boolean;
}

export interface ChaosProfile {
  seed: number;
  clientKey: string;
  role: ChaosClientRole;
  clientClass: ChaosClientClass;
  phases: ChaosPhase[];
  totalDurationMs: number;
}

export type ChaosEventType =
  | 'delivered'
  | 'delayed'
  | 'jitter_reorder'
  | 'burst_freeze_start'
  | 'burst_freeze_end'
  | 'catchup_burst'
  | 'disconnect_start'
  | 'reconnect'
  | 'snapshot_recovery'
  | 'phase_boundary'
  | 'session_recovery';


export interface ChaosTimelineEvent {
  ts: number;
  sessionMs: number;
  clientKey: string;
  role: ChaosClientRole;
  clientClass: ChaosClientClass;
  seed: number;
  phaseIndex: number;
  type: ChaosEventType;
  source?: string;
  startMs?: number;
  endMs?: number;
  detail?: Record<string, unknown>;
}

// ── Session state ──────────────────────────────────────────────

interface ChaosSession {
  seed: number;
  clientKey: string;
  role: ChaosClientRole;
  clientClass: ChaosClientClass;
  profile: ChaosProfile;
  rng: () => number;
  startedAt: number;
  heldQueue: Array<{ source: string; run: () => void; queuedAt: number }>;
  phaseIndex: number;
  phaseTimer: ReturnType<typeof setTimeout> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

let activeSession: ChaosSession | null = null;
const timeline: ChaosTimelineEvent[] = [];
const TIMELINE_CAP = 2000;

function recordEvent(ev: Omit<ChaosTimelineEvent, 'ts' | 'sessionMs' | 'clientKey' | 'role' | 'clientClass' | 'seed' | 'phaseIndex'>): void {
  if (!activeSession) return;
  const now = Date.now();
  timeline.push({
    ts: now,
    sessionMs: now - activeSession.startedAt,
    clientKey: activeSession.clientKey,
    role: activeSession.role,
    clientClass: activeSession.clientClass,
    seed: activeSession.seed,
    phaseIndex: activeSession.phaseIndex,
    ...ev,
  });
  if (timeline.length > TIMELINE_CAP) timeline.splice(0, timeline.length - TIMELINE_CAP);
}

// ── Profile generator ──────────────────────────────────────────

const HOST_BASE_RANGE: [number, number] = [40, 180];
const PEER_BASE_RANGE: [number, number] = [80, 320];
const MOBILE_LATENCY_MULT = 1.6;

function pickInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

function generateProfile(seed: number, clientKey: string, role: ChaosClientRole): ChaosProfile {
  const rng = mulberry32(seed ^ hashString(clientKey));

  // Force one client to look mobile-like when we can distinguish roles.
  const mobileWhenPeer = role === 'peer';
  const clientClass: ChaosClientClass =
    role === 'host'
      ? 'desktop-like'
      : mobileWhenPeer
      ? 'mobile-like'
      : rng() < 0.5
      ? 'mobile-like'
      : 'desktop-like';

  const baseRange = role === 'host' ? HOST_BASE_RANGE : PEER_BASE_RANGE;

  // Build a stack of phases (~90s total by default).
  const phases: ChaosPhase[] = [];
  let cursor = 0;
  const targetTotalMs = 90_000;
  let idx = 0;

  while (cursor < targetTotalMs) {
    const phaseKind = rng();
    let phaseDur: number;
    let disconnected = false;
    let base = pickInt(rng, baseRange[0], baseRange[1]);
    let jitter = pickInt(rng, 20, 180);
    let burstOnRecover = false;

    if (phaseKind < 0.55) {
      // Normal-ish
      phaseDur = pickInt(rng, 4000, 12000);
    } else if (phaseKind < 0.8) {
      // Short burst freeze / hold + catch-up burst
      phaseDur = pickInt(rng, 600, 2500);
      base = pickInt(rng, 400, 1200);
      jitter = pickInt(rng, 150, 500);
      burstOnRecover = true;
    } else if (phaseKind < 0.92) {
      // Heavy jitter / reorder
      phaseDur = pickInt(rng, 3000, 8000);
      jitter = pickInt(rng, 400, 900);
    } else {
      // Full disconnect
      phaseDur = pickInt(rng, 1500, 5000);
      disconnected = true;
      burstOnRecover = true;
    }

    if (clientClass === 'mobile-like') {
      base = Math.floor(base * MOBILE_LATENCY_MULT);
      jitter = Math.floor(jitter * MOBILE_LATENCY_MULT);
    }

    phases.push({
      index: idx++,
      startMs: cursor,
      endMs: cursor + phaseDur,
      baseLatencyMs: base,
      jitterMs: jitter,
      disconnected,
      burstOnRecover,
    });
    cursor += phaseDur;
  }

  return {
    seed,
    clientKey,
    role,
    clientClass,
    phases,
    totalDurationMs: cursor,
  };
}

// ── Session lifecycle ──────────────────────────────────────────

function scheduleNextPhase(): void {
  if (!activeSession) return;
  const s = activeSession;
  const phase = s.profile.phases[s.phaseIndex];
  if (!phase) return;

  const dur = phase.endMs - phase.startMs;
  if (phase.disconnected) {
    recordEvent({
      type: 'disconnect_start',
      startMs: phase.startMs,
      endMs: phase.endMs,
      detail: { baseLatencyMs: phase.baseLatencyMs, jitterMs: phase.jitterMs },
    });
  } else {
    recordEvent({
      type: 'phase_boundary',
      startMs: phase.startMs,
      endMs: phase.endMs,
      detail: {
        baseLatencyMs: phase.baseLatencyMs,
        jitterMs: phase.jitterMs,
        burstOnRecover: phase.burstOnRecover,
      },
    });
  }

  s.phaseTimer = setTimeout(() => {
    if (!activeSession || activeSession !== s) return;

    if (phase.disconnected) {
      recordEvent({ type: 'reconnect', detail: { phaseIndex: phase.index } });
      recordEvent({ type: 'snapshot_recovery', detail: { queuedCount: s.heldQueue.length } });
    }
    if (phase.burstOnRecover && s.heldQueue.length > 0) {
      const queued = s.heldQueue.slice();
      s.heldQueue = [];
      recordEvent({ type: 'catchup_burst', detail: { count: queued.length } });
      queued.forEach((q, i) => {
        setTimeout(() => {
          try { q.run(); } finally {
            recordEvent({ type: 'delivered', source: q.source, detail: { burstIndex: i, waitedMs: Date.now() - q.queuedAt } });
          }
        }, i * 15);
      });
    }

    s.phaseIndex += 1;
    if (s.phaseIndex < s.profile.phases.length) {
      scheduleNextPhase();
    }
  }, dur);
}

export interface StartChaosOptions {
  seed?: number;
  clientKey: string;
  role?: ChaosClientRole;
}

export function startChaosSession(opts: StartChaosOptions): ChaosProfile {
  stopChaosSession();
  const seed = opts.seed ?? (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0);
  const role: ChaosClientRole = opts.role ?? 'unknown';
  const profile = generateProfile(seed, opts.clientKey, role);
  activeSession = {
    seed,
    clientKey: opts.clientKey,
    role,
    clientClass: profile.clientClass,
    profile,
    rng: mulberry32(seed ^ hashString(opts.clientKey) ^ 0xA5A5A5A5),
    startedAt: Date.now(),
    heldQueue: [],
    phaseIndex: 0,
    phaseTimer: null,
    reconnectTimer: null,
  };
  scheduleNextPhase();
  return profile;
}

export function stopChaosSession(): void {
  if (!activeSession) return;
  if (activeSession.phaseTimer) clearTimeout(activeSession.phaseTimer);
  if (activeSession.reconnectTimer) clearTimeout(activeSession.reconnectTimer);
  // Flush any held callbacks so we don't strand them.
  const queued = activeSession.heldQueue;
  activeSession.heldQueue = [];
  queued.forEach((q) => { try { q.run(); } catch { /* */ } });
  activeSession = null;
}

export function updateChaosRole(role: ChaosClientRole): void {
  if (!activeSession) return;
  activeSession.role = role;
}

export function getActiveChaosProfile(): ChaosProfile | null {
  return activeSession?.profile ?? null;
}

export function getChaosSeed(): number | null {
  return activeSession?.seed ?? null;
}

// ── Delivery wrapper ───────────────────────────────────────────

/**
 * Called by simulateRealtime when mode === 'cross_country_chaos'.
 * Never mutates payload — only decides when to invoke callback.
 */
export function chaosDeliver<T>(source: string, payload: T, callback: (payload: T) => void): void {
  const s = activeSession;
  if (!s) {
    callback(payload);
    return;
  }
  const now = Date.now();
  const sessionMs = now - s.startedAt;
  const phase =
    s.profile.phases[s.phaseIndex] ??
    s.profile.phases[s.profile.phases.length - 1];

  if (phase && phase.disconnected) {
    s.heldQueue.push({ source, queuedAt: now, run: () => callback(payload) });
    recordEvent({ type: 'burst_freeze_start', source, detail: { sessionMs } });
    return;
  }

  const base = phase?.baseLatencyMs ?? 0;
  const jitter = phase?.jitterMs ?? 0;
  const jitterDelta = jitter > 0 ? Math.floor(s.rng() * jitter) : 0;
  const delay = base + jitterDelta;

  if (delay <= 0) {
    callback(payload);
    recordEvent({ type: 'delivered', source, detail: { delay: 0 } });
    return;
  }

  const willReorder = jitter > 300 && s.rng() < 0.25;
  const evType: ChaosEventType = willReorder ? 'jitter_reorder' : 'delayed';
  recordEvent({ type: evType, source, detail: { base, jitter, jitterDelta, delay } });

  setTimeout(() => {
    try { callback(payload); } finally {
      recordEvent({ type: 'delivered', source, detail: { delay } });
    }
  }, delay);
}

// ── Export helpers ─────────────────────────────────────────────

export function getChaosTimeline(): ChaosTimelineEvent[] {
  return timeline.slice();
}

export function clearChaosTimeline(): void {
  timeline.length = 0;
}

/**
 * Append a SESSION_RECOVERY event to the chaos timeline unconditionally
 * (chaos session need not be active). Used by the session recovery lease
 * so every recovery transition is auditable/exportable.
 */
export function appendSessionRecoveryEvent(detail: Record<string, unknown>): void {
  const now = Date.now();
  const s = activeSession;
  timeline.push({
    ts: now,
    sessionMs: s ? now - s.startedAt : 0,
    clientKey: s?.clientKey ?? 'no-chaos-session',
    role: s?.role ?? 'unknown',
    clientClass: s?.clientClass ?? 'desktop-like',
    seed: s?.seed ?? 0,
    phaseIndex: s?.phaseIndex ?? -1,
    type: 'session_recovery',
    source: (detail.kind as string) ?? 'session_recovery',
    detail,
  });
  if (timeline.length > TIMELINE_CAP) timeline.splice(0, timeline.length - TIMELINE_CAP);
}


export function exportChaosTimelineJson(): string {
  const profile = activeSession?.profile ?? null;
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      profile,
      timeline,
    },
    null,
    2,
  );
}
