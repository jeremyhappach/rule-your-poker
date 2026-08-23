/**
 * Continuous, deterministic long-haul network conditions for the debug harness.
 * This module decides impairments; networkSimTransport applies them beneath
 * Supabase HTTP and Realtime so every channel/request sees the same conditions.
 */

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function pickInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

export type ChaosClientRole = 'host' | 'peer' | 'unknown';
export type ChaosClientClass = 'mobile-like' | 'desktop-like';
export type ChaosPhaseKind =
  | 'healthy'
  | 'long-haul-lag'
  | 'jitter-burst'
  | 'radio-stall'
  | 'offline'
  | 'recovery';

export interface ChaosPhase {
  index: number;
  kind: ChaosPhaseKind;
  startMs: number;
  endMs: number;
  baseLatencyMs: number;
  jitterMs: number;
  disconnected: boolean;
  stallTransport: boolean;
  readFailureRate: number;
}

export interface ChaosProfile {
  seed: number;
  clientKey: string;
  role: ChaosClientRole;
  clientClass: ChaosClientClass;
  cycleIndex: number;
  phases: ChaosPhase[];
  totalDurationMs: number;
}

export type ChaosEventType =
  | 'phase_boundary'
  | 'disconnect_start'
  | 'reconnect'
  | 'http_delayed'
  | 'http_failed_before_send'
  | 'websocket_open_deferred'
  | 'websocket_forced_close'
  | 'realtime_delayed'
  | 'realtime_dropped'
  | 'session_recovery';

export interface ChaosTimelineEvent {
  ts: number;
  sessionMs: number;
  clientKey: string;
  role: ChaosClientRole;
  clientClass: ChaosClientClass;
  seed: number;
  cycleIndex: number;
  phaseIndex: number;
  type: ChaosEventType;
  source?: string;
  detail?: Record<string, unknown>;
}

export interface ChaosStatus {
  active: boolean;
  seed: number | null;
  clientKey: string | null;
  role: ChaosClientRole;
  clientClass: ChaosClientClass | null;
  cycleIndex: number;
  phaseIndex: number;
  phaseKind: ChaosPhaseKind | null;
  disconnected: boolean;
  phaseEndsAt: number | null;
}

export interface ChaosTransportDecision {
  delayMs: number;
  drop: boolean;
  failBeforeSend: boolean;
  phaseKind: ChaosPhaseKind | null;
}

interface ChaosSession {
  seed: number;
  clientKey: string;
  role: ChaosClientRole;
  clientClass: ChaosClientClass;
  cycleIndex: number;
  profile: ChaosProfile;
  phaseIndex: number;
  cycleStartedAt: number;
  sessionStartedAt: number;
  decisionRng: () => number;
  phaseTimer: ReturnType<typeof setTimeout> | null;
}

const INACTIVE_STATUS: ChaosStatus = {
  active: false,
  seed: null,
  clientKey: null,
  role: 'unknown',
  clientClass: null,
  cycleIndex: -1,
  phaseIndex: -1,
  phaseKind: null,
  disconnected: false,
  phaseEndsAt: null,
};

const timeline: ChaosTimelineEvent[] = [];
const statusListeners = new Set<() => void>();
const eventListeners = new Set<(event: ChaosTimelineEvent) => void>();
const TIMELINE_CAP = 4000;
let activeSession: ChaosSession | null = null;
let statusSnapshot: ChaosStatus = INACTIVE_STATUS;

function generateProfile(
  seed: number,
  clientKey: string,
  role: ChaosClientRole,
  cycleIndex: number,
  forcedClass?: ChaosClientClass,
): ChaosProfile {
  const rng = mulberry32(seed ^ hashString(clientKey) ^ Math.imul(cycleIndex + 1, 0x9e3779b1));
  const clientClass = forcedClass ?? (role === 'host' ? 'desktop-like' : role === 'peer' ? 'mobile-like' : rng() < 0.5 ? 'mobile-like' : 'desktop-like');
  const mobileMultiplier = clientClass === 'mobile-like' ? 1.45 : 1;
  const plan: Array<{
    kind: ChaosPhaseKind;
    duration: [number, number];
    base: [number, number];
    jitter: [number, number];
    readFailureRate: number;
  }> = [
    { kind: 'healthy', duration: [14_000, 24_000], base: [45, 110], jitter: [15, 55], readFailureRate: 0 },
    { kind: 'long-haul-lag', duration: [18_000, 32_000], base: [220, 480], jitter: [80, 260], readFailureRate: 0.02 },
    { kind: 'jitter-burst', duration: [10_000, 18_000], base: [140, 340], jitter: [450, 1_400], readFailureRate: 0.04 },
    { kind: 'radio-stall', duration: [1_800, 5_500], base: [0, 0], jitter: [0, 0], readFailureRate: 0 },
    { kind: 'recovery', duration: [7_000, 13_000], base: [160, 320], jitter: [120, 380], readFailureRate: 0.02 },
    { kind: 'offline', duration: [2_500, 8_000], base: [0, 0], jitter: [0, 0], readFailureRate: 1 },
    { kind: 'recovery', duration: [8_000, 15_000], base: [180, 360], jitter: [120, 420], readFailureRate: 0.03 },
    { kind: 'healthy', duration: [12_000, 22_000], base: [50, 130], jitter: [20, 70], readFailureRate: 0 },
  ];

  const phases: ChaosPhase[] = [];
  let cursor = 0;
  plan.forEach((definition, index) => {
    const duration = pickInt(rng, definition.duration[0], definition.duration[1]);
    const multiplier = definition.kind === 'offline' || definition.kind === 'radio-stall' ? 1 : mobileMultiplier;
    phases.push({
      index,
      kind: definition.kind,
      startMs: cursor,
      endMs: cursor + duration,
      baseLatencyMs: Math.floor(pickInt(rng, definition.base[0], definition.base[1]) * multiplier),
      jitterMs: Math.floor(pickInt(rng, definition.jitter[0], definition.jitter[1]) * multiplier),
      disconnected: definition.kind === 'offline',
      stallTransport: definition.kind === 'radio-stall',
      readFailureRate: definition.readFailureRate,
    });
    cursor += duration;
  });

  return { seed, clientKey, role, clientClass, cycleIndex, phases, totalDurationMs: cursor };
}

function currentPhase(session = activeSession): ChaosPhase | null {
  return session?.profile.phases[session.phaseIndex] ?? null;
}

function recordEvent(
  type: ChaosEventType,
  source?: string,
  detail?: Record<string, unknown>,
): void {
  const session = activeSession;
  if (!session) return;
  const event: ChaosTimelineEvent = {
    ts: Date.now(),
    sessionMs: Date.now() - session.sessionStartedAt,
    clientKey: session.clientKey,
    role: session.role,
    clientClass: session.clientClass,
    seed: session.seed,
    cycleIndex: session.cycleIndex,
    phaseIndex: session.phaseIndex,
    type,
    source,
    detail,
  };
  timeline.push(event);
  if (timeline.length > TIMELINE_CAP) timeline.splice(0, timeline.length - TIMELINE_CAP);
  eventListeners.forEach((listener) => listener(event));
}

function publishStatus(): void {
  const session = activeSession;
  const phase = currentPhase(session);
  statusSnapshot = session && phase
    ? {
        active: true,
        seed: session.seed,
        clientKey: session.clientKey,
        role: session.role,
        clientClass: session.clientClass,
        cycleIndex: session.cycleIndex,
        phaseIndex: phase.index,
        phaseKind: phase.kind,
        disconnected: phase.disconnected,
        phaseEndsAt: session.cycleStartedAt + phase.endMs,
      }
    : INACTIVE_STATUS;
  statusListeners.forEach((listener) => listener());
}

function enterPhase(nextIndex: number): void {
  const session = activeSession;
  if (!session) return;
  const previousPhase = currentPhase(session);

  if (nextIndex >= session.profile.phases.length) {
    session.cycleIndex += 1;
    session.cycleStartedAt = Date.now();
    session.profile = generateProfile(session.seed, session.clientKey, session.role, session.cycleIndex, session.clientClass);
    session.phaseIndex = 0;
  } else {
    session.phaseIndex = nextIndex;
  }

  const phase = currentPhase(session);
  if (!phase) return;
  if (previousPhase?.disconnected && !phase.disconnected) {
    recordEvent('reconnect', 'chaos_phase', { nextPhase: phase.kind });
  }
  recordEvent('phase_boundary', 'chaos_phase', { kind: phase.kind, cycleIndex: session.cycleIndex });
  if (phase.disconnected) recordEvent('disconnect_start', 'chaos_phase', { durationMs: phase.endMs - phase.startMs });
  publishStatus();
  session.phaseTimer = setTimeout(() => enterPhase(session.phaseIndex + 1), Math.max(0, phase.endMs - phase.startMs));
}

export function startChaosSession(options: { seed?: number; clientKey: string; role?: ChaosClientRole }): ChaosProfile {
  stopChaosSession();
  const seed = options.seed ?? (Date.now() ^ hashString(options.clientKey)) >>> 0;
  const role = options.role ?? 'unknown';
  const profile = generateProfile(seed, options.clientKey, role, 0);
  activeSession = {
    seed,
    clientKey: options.clientKey,
    role,
    clientClass: profile.clientClass,
    cycleIndex: 0,
    profile,
    phaseIndex: 0,
    cycleStartedAt: Date.now(),
    sessionStartedAt: Date.now(),
    decisionRng: mulberry32(seed ^ hashString(options.clientKey) ^ 0xa5a5a5a5),
    phaseTimer: null,
  };
  enterPhase(0);
  return profile;
}

export function stopChaosSession(): void {
  if (activeSession?.phaseTimer) clearTimeout(activeSession.phaseTimer);
  activeSession = null;
  statusSnapshot = INACTIVE_STATUS;
  statusListeners.forEach((listener) => listener());
}

export function updateChaosRole(role: ChaosClientRole): void {
  const session = activeSession;
  if (!session || session.role === role) return;
  const elapsed = Date.now() - session.cycleStartedAt;
  session.role = role;
  session.profile = generateProfile(session.seed, session.clientKey, role, session.cycleIndex, session.clientClass);
  const matchingIndex = session.profile.phases.findIndex((phase) => elapsed < phase.endMs);
  session.phaseIndex = matchingIndex >= 0 ? matchingIndex : session.profile.phases.length - 1;
  publishStatus();
}

export function getActiveChaosProfile(): ChaosProfile | null {
  return activeSession?.profile ?? null;
}

export function getChaosStatus(): ChaosStatus {
  return statusSnapshot;
}

export function subscribeChaosStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function subscribeChaosEvents(listener: (event: ChaosTimelineEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

function makeDecision(kind: 'read' | 'write' | 'realtime'): ChaosTransportDecision {
  const session = activeSession;
  const phase = currentPhase(session);
  if (!session || !phase) return { delayMs: 0, drop: false, failBeforeSend: false, phaseKind: null };
  if (phase.disconnected) {
    return { delayMs: 0, drop: kind === 'realtime', failBeforeSend: kind !== 'realtime', phaseKind: phase.kind };
  }
  if (phase.stallTransport) {
    return {
      delayMs: Math.max(0, session.cycleStartedAt + phase.endMs - Date.now()),
      drop: false,
      failBeforeSend: false,
      phaseKind: phase.kind,
    };
  }
  const delayMs = phase.baseLatencyMs + pickInt(session.decisionRng, 0, phase.jitterMs);
  const failBeforeSend = kind === 'read' && session.decisionRng() < phase.readFailureRate;
  return { delayMs, drop: false, failBeforeSend, phaseKind: phase.kind };
}

export function getChaosRequestDecision(kind: 'read' | 'write'): ChaosTransportDecision {
  return makeDecision(kind);
}

export function getChaosRealtimeDecision(): ChaosTransportDecision {
  return makeDecision('realtime');
}

export function recordChaosTransportEvent(
  type: ChaosEventType,
  source: string,
  detail?: Record<string, unknown>,
): void {
  recordEvent(type, source, detail);
}

/** Compatibility path for any callback wrapper outside the transport. */
export function chaosDeliver<T>(source: string, payload: T, callback: (payload: T) => void): void {
  const decision = getChaosRealtimeDecision();
  if (decision.drop) {
    recordEvent('realtime_dropped', source, { phase: decision.phaseKind });
    return;
  }
  if (decision.delayMs <= 0) {
    callback(payload);
    return;
  }
  recordEvent('realtime_delayed', source, { phase: decision.phaseKind, delayMs: decision.delayMs });
  setTimeout(() => callback(payload), decision.delayMs);
}

export function getChaosTimeline(): readonly ChaosTimelineEvent[] {
  return timeline;
}

export function clearChaosTimeline(): void {
  timeline.length = 0;
}

export function appendSessionRecoveryEvent(detail: Record<string, unknown>): void {
  recordEvent('session_recovery', (detail.kind as string | undefined) ?? 'session_recovery', detail);
}

export function exportChaosTimelineJson(): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), profile: activeSession?.profile ?? null, timeline }, null, 2);
}
