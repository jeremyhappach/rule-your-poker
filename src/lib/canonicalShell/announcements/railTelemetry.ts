/**
 * Canonical announcement rail telemetry — persistent, DB-backed.
 *
 * Writes to `debug_sync_events` so canonical-rail behavior is
 * inspectable from telemetry queries, with no console dependency
 * and no need to ask the tester to read devtools.
 *
 * Gated by the standard sync-debug channel
 * (?ptp_debug=sync, ?debug_sync_events=1, or
 * localStorage ptp_debug_sync_events="1") — same posture as the
 * rest of the sync investigations. Always-on would be too noisy.
 *
 * Event names emitted (event_type = 'transition'):
 *   - rail-emit-accepted          provider accepted an emit
 *   - rail-emit-rejected          provider dropped an emit (with reason)
 *   - rail-dismiss                provider received an explicit dismiss
 *   - rail-clear-ambient          provider received broad clearAmbient
 *   - rail-render-active          renderer received an active announcement
 *   - rail-render-suppressed      renderer suppressed an active announcement
 *
 * Each row carries: emitted scope, current provider scope, ambient
 * vs transient, behavior, viewer / actor ids when relevant, and the
 * announcement id + type. Enough to attribute the lifecycle gap to
 * one of: emitter not firing, scope rejection, immediate dismissal,
 * renderer suppression — without console logs.
 */

import { supabase } from '@/integrations/supabase/client';
import { isDebugChannel } from '@/lib/debugChannels';
import type { AnnouncementBehavior, AnnouncementScope, AnnouncementType } from './types';

let _enabled: boolean | null = null;
function isEnabled(): boolean {
  if (_enabled !== null) return _enabled;
  try {
    if (isDebugChannel('sync')) return (_enabled = true);
  } catch { /* */ }
  try {
    const p = new URLSearchParams(window.location.search);
    const v = p.get('debug_sync_events') ?? p.get('debug_rail');
    if (v === '1' || v === '' || v?.toLowerCase() === 'true') return (_enabled = true);
  } catch { /* */ }
  try {
    if (window.localStorage.getItem('ptp_debug_sync_events') === '1') return (_enabled = true);
    if (window.localStorage.getItem('ptp_debug_rail') === '1') return (_enabled = true);
  } catch { /* */ }
  return (_enabled = false);
}

export function refreshRailTelemetryFlag(): void {
  _enabled = null;
}

export type RailTelemetryName =
  | 'rail-emit-accepted'
  | 'rail-emit-rejected'
  | 'rail-dismiss'
  | 'rail-clear-ambient'
  | 'rail-render-active'
  | 'rail-render-suppressed';

export interface RailTelemetryArgs {
  eventName: RailTelemetryName;
  severity?: 'info' | 'warn' | 'error';
  announcementId?: string | null;
  announcementType?: AnnouncementType | null;
  behavior?: AnnouncementBehavior | null;
  emittedScope?: AnnouncementScope | null;
  providerScope?: AnnouncementScope | null;
  reason?: string | null;
  viewerUserId?: string | null;
  actorUserId?: string | null;
  extra?: Record<string, unknown>;
}

/**
 * Fire-and-forget persistent rail telemetry write.
 *
 * Bypasses the persistSyncDebugEvent 1s dedup window because rail
 * activity is bursty (multiple emits per render under unstable deps)
 * and we want every attempt visible to attribute regressions.
 */
export function persistRailTelemetry(args: RailTelemetryArgs): void {
  if (!isEnabled()) return;

  const gameId =
    args.providerScope?.dealerGameId ?? args.emittedScope?.dealerGameId ?? null;
  // game_id is NOT NULL in debug_sync_events; skip writes we cannot attribute.
  if (!gameId) return;

  const payload = {
    announcementId: args.announcementId ?? null,
    announcementType: args.announcementType ?? null,
    behavior: args.behavior ?? null,
    emittedScope: args.emittedScope ?? null,
    providerScope: args.providerScope ?? null,
    reason: args.reason ?? null,
    viewerUserId: args.viewerUserId ?? null,
    actorUserId: args.actorUserId ?? null,
    ...(args.extra ?? {}),
  };

  supabase
    .from('debug_sync_events' as any)
    .insert({
      game_id: gameId,
      game_type: 'canonical-rail',
      hand_number: 0,
      round_id: args.providerScope?.roundId ?? args.emittedScope?.roundId ?? null,
      event_type: 'transition',
      severity: args.severity ?? 'info',
      event_name: args.eventName,
      payload,
    } as any)
    .then(({ error }) => {
      if (error) {
        // Last-resort console — telemetry channel itself failed.
        // eslint-disable-next-line no-console
        console.warn('[rail-telemetry] write failed:', error.message);
      }
    });
}
