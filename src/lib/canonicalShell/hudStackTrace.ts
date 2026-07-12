/**
 * hudStackTrace — narrow, opt-in wartime ledger for the
 * HUD-stack pixel-shift observed on the
 *   game selection → dealer-game setup → awaiting-ante-decision
 * transition.
 *
 * Instrumentation-only. No layout or timing behavior is introduced;
 * measurements use useLayoutEffect + requestAnimationFrame purely to
 * coalesce reads AFTER the browser layout the shell already scheduled.
 *
 * Event stream (append-only in memory, exportable via pill):
 *   - hudstack_measurement
 *   - hudstack_rect_changed
 *   - hudstack_ancestor_rect_changed
 *   - hudstack_render_branch_changed
 *   - hudstack_policy_changed
 *   - hudstack_moved_without_policy_change   (contradiction)
 *
 * Recording is OFF by default; user taps ARM from the pill to enable.
 */

export type HudStackEventName =
  | 'hudstack_measurement'
  | 'hudstack_rect_changed'
  | 'hudstack_ancestor_rect_changed'
  | 'hudstack_render_branch_changed'
  | 'hudstack_policy_changed'
  | 'hudstack_moved_without_policy_change';

export interface HudStackEvent {
  t: number;                       // ms since arm
  wallClockISO: string;
  name: HudStackEventName;
  reason?: string | null;          // sample trigger label
  payload: Record<string, unknown>;
}

const MAX_EVENTS = 2000;

let armed = false;
let armedAt = 0;
let events: HudStackEvent[] = [];

const availabilityListeners = new Set<(available: boolean) => void>();
let available = false;

export function setHudStackTraceAvailable(next: boolean) {
  if (available === next) return;
  available = next;
  for (const l of availabilityListeners) l(available);
}

export function subscribeHudStackTraceAvailability(fn: (available: boolean) => void) {
  availabilityListeners.add(fn);
  fn(available);
  return () => { availabilityListeners.delete(fn); };
}

export function isHudStackTraceActive() { return available; }
export function isHudStackTraceArmed() { return armed; }

export function setHudStackTraceArmed(next: boolean) {
  armed = next;
  if (armed) {
    armedAt = performance.now();
    events = [];
  }
}

export function clearHudStackTrace() {
  events = [];
  armed = false;
}

export function recordHudStackEvent(
  name: HudStackEventName,
  payload: Record<string, unknown>,
  reason?: string | null,
) {
  if (!armed) return;
  if (events.length >= MAX_EVENTS) return;
  events.push({
    t: Math.round(performance.now() - armedAt),
    wallClockISO: new Date().toISOString(),
    name,
    reason: reason ?? null,
    payload,
  });
}

export function getHudStackTraceEvents(): HudStackEvent[] {
  return events.slice();
}

export function formatHudStackTraceAsText(): string {
  const lines: string[] = [];
  lines.push(`# HUD STACK TRACE`);
  lines.push(`# armed=${armed} events=${events.length} armedAtISO=${new Date(Date.now() - (performance.now() - armedAt)).toISOString()}`);
  for (const e of events) {
    lines.push(`+${String(e.t).padStart(6, ' ')}ms ${e.name}${e.reason ? ` [${e.reason}]` : ''} ${JSON.stringify(e.payload)}`);
  }
  return lines.join('\n');
}
