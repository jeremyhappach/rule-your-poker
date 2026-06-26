/**
 * holmTrace — temporary in-memory event recorder for Holm portal /
 * lifecycle investigation. Pure observability. No console, no network.
 *
 * Buffer cap: 500 events (ring). Active only while a Holm table is
 * mounted (see `setHolmTraceActive`). Cleared on table/session change.
 *
 * Event schema:
 *   kind:    HolmTraceKind  — see union below
 *   summary: short label
 *   detail:  flat record (timestamp included automatically)
 *
 * Incident detection: the recorder watches successive events of certain
 * kinds and inserts an `INCIDENT_*` marker BEFORE the new event when a
 * meaningful delta is detected. Each marker carries `prev` and `next`
 * snapshots so the export is self-describing.
 */

export type HolmTraceKind =
  | 'FRAME_TARGET'
  | 'ORCHESTRATOR'
  | 'HOLM_SLOT'
  | 'TURN_SPOTLIGHT'
  | 'POT_GEOMETRY'
  | 'INCIDENT_CARD_SURFACE_DROP'
  | 'INCIDENT_ORCHESTRATOR_REMOUNT'
  | 'INCIDENT_PORTAL_TARGET_SWAP'
  | 'INCIDENT_TURN_POSITION_CHANGE'
  | 'INCIDENT_SPOTLIGHT_ANGLE_JUMP'
  | 'INCIDENT_POT_Y_DELTA';

export interface HolmTraceEvent {
  seq: number;
  tMs: number;
  kind: HolmTraceKind;
  summary: string;
  detail?: Record<string, unknown>;
}

const MAX_EVENTS = 500;
const SPOTLIGHT_JUMP_DEG = 20;
const POT_Y_DELTA_PX = 6;

const buffer: HolmTraceEvent[] = [];
let snapshot: HolmTraceEvent[] = [];
let seq = 0;
const t0 =
  typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();

const listeners = new Set<() => void>();
let _active = false;

// Per-source last-state for incident detection.
const last = {
  frameToken: undefined as string | undefined,
  orchInstance: undefined as string | undefined,
  slotMounted: new Map<string, boolean>(),
  turnPos: undefined as number | null | undefined,
  spotlightAngle: undefined as number | undefined,
  potY: undefined as number | undefined,
};

function notify() {
  snapshot = buffer.slice();
  for (const l of listeners) {
    try { l(); } catch { /* */ }
  }
}

function push(ev: HolmTraceEvent) {
  buffer.push(ev);
  if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
}

export function isHolmTraceActive(): boolean {
  return _active;
}

export function setHolmTraceActive(active: boolean): void {
  if (_active === active) return;
  _active = active;
  if (active) {
    // Fresh session — reset incident state and buffer.
    buffer.length = 0;
    seq = 0;
    last.frameToken = undefined;
    last.orchInstance = undefined;
    last.slotMounted.clear();
    last.turnPos = undefined;
    last.spotlightAngle = undefined;
    last.potY = undefined;
    recordHolmTrace('FRAME_TARGET', 'session-start', { reason: 'holm-trace-active' });
  } else {
    recordHolmTrace('FRAME_TARGET', 'session-end', {});
  }
  notify();
}

export function clearHolmTrace(): void {
  buffer.length = 0;
  seq = 0;
  notify();
}

export function getHolmTraceEvents(): HolmTraceEvent[] {
  return snapshot;
}

export function subscribeHolmTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function recordHolmTrace(
  kind: HolmTraceKind,
  summary: string,
  detail?: Record<string, unknown>,
): void {
  if (!_active) return;

  const tMs = Math.round(
    (typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now()) - t0,
  );

  // Incident detection — emit marker BEFORE the new event so timeline reads
  // marker → caused-by event.
  const emitMarker = (markerKind: HolmTraceKind, summaryText: string, prev: unknown, next: unknown) => {
    push({
      seq: seq++,
      tMs,
      kind: markerKind,
      summary: summaryText,
      detail: { prev, next, trigger: { kind, summary, detail } },
    });
  };

  if (kind === 'FRAME_TARGET') {
    const token = String(detail?.token ?? detail?.feltToken ?? '');
    if (token && last.frameToken !== undefined && token !== last.frameToken) {
      emitMarker(
        'INCIDENT_PORTAL_TARGET_SWAP',
        `felt-frame ${last.frameToken} → ${token}`,
        last.frameToken,
        token,
      );
    }
    if (token) last.frameToken = token;
  }

  if (kind === 'ORCHESTRATOR') {
    const phase = String(detail?.phase ?? '');
    const instance = String(detail?.instance ?? '');
    if (phase === 'mount' && instance) {
      if (last.orchInstance && last.orchInstance !== instance) {
        emitMarker(
          'INCIDENT_ORCHESTRATOR_REMOUNT',
          `orchestrator ${last.orchInstance} → ${instance}`,
          last.orchInstance,
          instance,
        );
      }
      last.orchInstance = instance;
    }
  }

  if (kind === 'HOLM_SLOT') {
    const id = String(detail?.artifactId ?? '');
    const phase = String(detail?.phase ?? '');
    if (id) {
      const wasMounted = last.slotMounted.get(id) === true;
      if (phase === 'unmount' && wasMounted) {
        emitMarker(
          'INCIDENT_CARD_SURFACE_DROP',
          `slot ${id} unmounted`,
          { mounted: true },
          { mounted: false, suppression: detail?.suppressionReason },
        );
        last.slotMounted.set(id, false);
      } else if (phase === 'mount') {
        last.slotMounted.set(id, true);
      } else if (phase === 'render' && detail?.renderEligible === false && wasMounted) {
        emitMarker(
          'INCIDENT_CARD_SURFACE_DROP',
          `slot ${id} render-suppressed`,
          { mounted: true },
          { mounted: false, suppression: detail?.suppressionReason },
        );
        last.slotMounted.set(id, false);
      } else if (phase === 'render' && detail?.renderEligible === true) {
        last.slotMounted.set(id, true);
      }
    }
  }

  if (kind === 'TURN_SPOTLIGHT') {
    const pos = (detail?.currentTurnPosition ?? null) as number | null;
    const ang = detail?.angle as number | undefined;
    if (last.turnPos !== undefined && pos !== last.turnPos) {
      emitMarker(
        'INCIDENT_TURN_POSITION_CHANGE',
        `turn ${last.turnPos ?? 'null'} → ${pos ?? 'null'}`,
        last.turnPos,
        pos,
      );
    }
    if (
      typeof ang === 'number' &&
      typeof last.spotlightAngle === 'number' &&
      Math.abs(ang - last.spotlightAngle) >= SPOTLIGHT_JUMP_DEG
    ) {
      emitMarker(
        'INCIDENT_SPOTLIGHT_ANGLE_JUMP',
        `angle ${last.spotlightAngle.toFixed(1)}° → ${ang.toFixed(1)}°`,
        last.spotlightAngle,
        ang,
      );
    }
    last.turnPos = pos;
    if (typeof ang === 'number') last.spotlightAngle = ang;
  }

  if (kind === 'POT_GEOMETRY') {
    const y = detail?.potRect && typeof (detail.potRect as any).y === 'number'
      ? (detail.potRect as any).y as number
      : undefined;
    if (
      typeof y === 'number' &&
      typeof last.potY === 'number' &&
      Math.abs(y - last.potY) >= POT_Y_DELTA_PX
    ) {
      emitMarker(
        'INCIDENT_POT_Y_DELTA',
        `pot.y ${last.potY.toFixed(1)} → ${y.toFixed(1)}`,
        last.potY,
        y,
      );
    }
    if (typeof y === 'number') last.potY = y;
  }

  push({ seq: seq++, tMs, kind, summary, detail });
  notify();
}

export function formatHolmTraceAsText(): string {
  const events = buffer.slice();
  const head = `HOLM TRACE EXPORT
events: ${events.length} (cap ${MAX_EVENTS})
t0: ${new Date().toISOString()}
ua: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}
viewport: ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'n/a'}
─────────────────────────────────────────────────────────`;
  const lines = events.map(e => {
    const t = String(e.tMs).padStart(6, ' ');
    const k = e.kind.padEnd(32, ' ');
    const d = e.detail ? ` ${safeStringify(e.detail)}` : '';
    return `+${t}ms #${e.seq} ${k} ${e.summary}${d}`;
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
