/**
 * Canonical announcement rail telemetry — persistent, DB-backed.
 *
 * Writes to `debug_sync_events` so canonical-rail behavior is
 * inspectable from telemetry queries, with no console dependency
 * and no need to ask the tester to read devtools.
 *
 * Temporarily forced ON for the Cribbage announcement regression investigation.
 * This avoids URL/localStorage manipulation and keeps the signal persistently
 * inspectable until the investigation is explicitly turned off.
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
import type { AnnouncementBehavior, AnnouncementScope, AnnouncementType } from './types';

const RAIL_TELEMETRY_FORCED_ON = true;

function isEnabled(): boolean {
  return RAIL_TELEMETRY_FORCED_ON;
}

export function refreshRailTelemetryFlag(): void {
  // Kept for existing callers; telemetry is intentionally force-enabled here.
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
    .then(() => undefined);
}
