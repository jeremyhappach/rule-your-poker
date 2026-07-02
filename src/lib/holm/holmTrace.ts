/**
 * holmTrace — PASSIVE rolling event buffer for Holm portal / lifecycle
 * investigation.
 *
 * Contract (post-contamination rebuild):
 *   - Module-level ref-backed ring buffer only.
 *   - No React subscriptions, no useSyncExternalStore, no listener fanout.
 *   - No provider/context, no intervals, no querySelector polling, no
 *     getBoundingClientRect / getComputedStyle sampling loop.
 *   - Recording is a no-op unless the user explicitly ARMs via the pill.
 *   - Probes MUST call `recordHolmTrace` only from event handlers or
 *     post-commit effects, never inline during render.
 *
 * The pill reads the buffer on demand via `snapshotHolmTrace()` /
 * `formatHolmTraceAsText()` on user tap. Event count is observed only on
 * tap; there is no live update path.
 */

export type HolmTraceKind =
  | 'FRAME_TARGET'
  | 'ORCHESTRATOR'
  | 'HOLM_SLOT'
  | 'TURN_SPOTLIGHT'
  | 'POT_GEOMETRY'
  | 'TURN_AUTHORITY_ARRIVAL'
  | 'DECISION_SUBMISSION'
  | 'TURN_INVARIANT_VIOLATION'
  | 'INCIDENT_CARD_SURFACE_DROP'
  | 'INCIDENT_ORCHESTRATOR_REMOUNT'
  | 'INCIDENT_PORTAL_TARGET_SWAP'
  | 'INCIDENT_TURN_POSITION_CHANGE'
  | 'INCIDENT_SPOTLIGHT_ANGLE_JUMP'
  | 'INCIDENT_POT_Y_DELTA'
  | 'HOLM_ACTIVE_HAND_DEAL_GEOMETRY'
  | 'HOLM_ACTIVE_HAND_DEAL_SIZE_SOURCE'
  | 'RESIZE_VIOLATION';

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
let seq = 0;
const t0 =
  typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();

// Visibility (is the pill allowed to render — Holm table mounted) vs.
// Armed (is recording active). Both default off. Visibility is set by
// Game.tsx; arming is exclusively a user gesture on the pill.
let _available = false;
let _armed = false;
const availabilityListeners = new Set<(available: boolean) => void>();

// Per-source last-state for incident detection.
const last = {
  frameToken: undefined as string | undefined,
  orchInstance: undefined as string | undefined,
  slotMounted: new Map<string, boolean>(),
  turnPos: undefined as number | null | undefined,
  spotlightAngle: undefined as number | undefined,
  potY: undefined as number | undefined,
};

function push(ev: HolmTraceEvent) {
  buffer.push(ev);
  if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
}

function resetIncidentState() {
  last.frameToken = undefined;
  last.orchInstance = undefined;
  last.slotMounted.clear();
  last.turnPos = undefined;
  last.spotlightAngle = undefined;
  last.potY = undefined;
}

/** Pill visibility — Holm table mounted. Does NOT enable recording. */
export function setHolmTraceActive(available: boolean): void {
  const changed = _available !== available;
  _available = available;
  if (!available) {
    // Leaving Holm — disarm and clear so the next session starts fresh.
    _armed = false;
    buffer.length = 0;
    seq = 0;
    resetIncidentState();
  }
  if (changed) {
    availabilityListeners.forEach((listener) => {
      try { listener(_available); } catch { /* availability UI must never affect gameplay */ }
    });
  }
}

export function isHolmTraceActive(): boolean {
  return _available;
}

/**
 * Isolated pill-availability signal. This is intentionally the only
 * subscription in the Holm trace module: it only toggles the fixed body-level
 * pill after Game enters/leaves Holm, and it is not connected to trace events
 * or gameplay state changes.
 */
export function subscribeHolmTraceAvailability(listener: (available: boolean) => void): () => void {
  availabilityListeners.add(listener);
  return () => availabilityListeners.delete(listener);
}

/** User-controlled arming. The ONLY enabler of recording. */
export function setHolmTraceArmed(armed: boolean): void {
  if (_armed === armed) return;
  _armed = armed;
  if (armed) {
    buffer.length = 0;
    seq = 0;
    resetIncidentState();
    push({
      seq: seq++,
      tMs: 0,
      kind: 'FRAME_TARGET',
      summary: 'arm',
      detail: { reason: 'user-arm' },
    });
  }
}

export function isHolmTraceArmed(): boolean {
  return _armed;
}

export function clearHolmTrace(): void {
  buffer.length = 0;
  seq = 0;
  resetIncidentState();
}

export function snapshotHolmTrace(): HolmTraceEvent[] {
  return buffer.slice();
}

export function getHolmTraceEventCount(): number {
  return buffer.length;
}

export function recordHolmTrace(
  kind: HolmTraceKind,
  summary: string,
  detail?: Record<string, unknown>,
): void {
  if (!_armed) return;

  const tMs = Math.round(
    (typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now()) - t0,
  );

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
      emitMarker('INCIDENT_PORTAL_TARGET_SWAP', `felt-frame ${last.frameToken} → ${token}`, last.frameToken, token);
    }
    if (token) last.frameToken = token;
  }

  if (kind === 'ORCHESTRATOR') {
    const phase = String(detail?.phase ?? '');
    const instance = String(detail?.instance ?? '');
    if (phase === 'mount' && instance) {
      if (last.orchInstance && last.orchInstance !== instance) {
        emitMarker('INCIDENT_ORCHESTRATOR_REMOUNT', `orchestrator ${last.orchInstance} → ${instance}`, last.orchInstance, instance);
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
        emitMarker('INCIDENT_CARD_SURFACE_DROP', `slot ${id} unmounted`, { mounted: true }, { mounted: false, suppression: detail?.suppressionReason });
        last.slotMounted.set(id, false);
      } else if (phase === 'mount') {
        last.slotMounted.set(id, true);
      } else if (phase === 'render-eligibility') {
        if (detail?.renderEligible === false && wasMounted) {
          emitMarker('INCIDENT_CARD_SURFACE_DROP', `slot ${id} render-suppressed`, { mounted: true }, { mounted: false, suppression: detail?.suppressionReason });
          last.slotMounted.set(id, false);
        } else if (detail?.renderEligible === true) {
          last.slotMounted.set(id, true);
        }
      }
    }
  }

  if (kind === 'TURN_SPOTLIGHT') {
    const pos = (detail?.currentTurnPosition ?? null) as number | null;
    const ang = detail?.angle as number | undefined;
    if (last.turnPos !== undefined && pos !== last.turnPos) {
      emitMarker('INCIDENT_TURN_POSITION_CHANGE', `turn ${last.turnPos ?? 'null'} → ${pos ?? 'null'}`, last.turnPos, pos);
    }
    if (typeof ang === 'number' && typeof last.spotlightAngle === 'number' && Math.abs(ang - last.spotlightAngle) >= SPOTLIGHT_JUMP_DEG) {
      emitMarker('INCIDENT_SPOTLIGHT_ANGLE_JUMP', `angle ${last.spotlightAngle.toFixed(1)}° → ${ang.toFixed(1)}°`, last.spotlightAngle, ang);
    }
    last.turnPos = pos;
    if (typeof ang === 'number') last.spotlightAngle = ang;
  }

  if (kind === 'POT_GEOMETRY') {
    const y = detail?.potRect && typeof (detail.potRect as { y?: number }).y === 'number'
      ? (detail.potRect as { y: number }).y
      : undefined;
    if (typeof y === 'number' && typeof last.potY === 'number' && Math.abs(y - last.potY) >= POT_Y_DELTA_PX) {
      emitMarker('INCIDENT_POT_Y_DELTA', `pot.y ${last.potY.toFixed(1)} → ${y.toFixed(1)}`, last.potY, y);
    }
    if (typeof y === 'number') last.potY = y;
  }

  if (kind === 'TURN_AUTHORITY_ARRIVAL') {
    if (detail?.incomingMatchesExpected === false) {
      emitMarker(
        'TURN_INVARIANT_VIOLATION',
        `authority skip ${detail?.previousCurrentTurnPosition ?? 'null'} → ${detail?.nextCurrentTurnPosition ?? 'null'} expected ${detail?.expectedClockwiseNextEligibleSeat ?? 'null'}`,
        detail?.previousCurrentTurnPosition ?? null,
        detail?.nextCurrentTurnPosition ?? null,
      );
    }
    if (detail?.incomingTargetsSkippedSeat === true) {
      emitMarker(
        'TURN_INVARIANT_VIOLATION',
        `authority targeted skipped seat ${detail?.nextCurrentTurnPosition ?? 'null'}`,
        detail?.decisionSummaryForIncomingSeat ?? null,
        detail?.nextCurrentTurnPosition ?? null,
      );
    }
  }

  if (kind === 'DECISION_SUBMISSION' && detail?.authorityMatchesActor === false) {
    emitMarker(
      'TURN_INVARIANT_VIOLATION',
      `decision attempted out of turn actor=${detail?.actorPosition ?? 'null'} authority=${detail?.authoritativeCurrentTurnPosition ?? 'null'}`,
      detail?.authoritativeCurrentTurnPosition ?? null,
      detail?.actorPosition ?? null,
    );
  }

  push({ seq: seq++, tMs, kind, summary, detail });
}

export function formatHolmTraceAsText(): string {
  const events = buffer.slice();
  const head = `HOLM TRACE EXPORT
events: ${events.length} (cap ${MAX_EVENTS})
exported: ${new Date().toISOString()}
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
