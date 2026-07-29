/**
 * Shared readout bridge for the canonical active-pane action
 * reservation. Production consumers publish the SAME resolver output
 * they used for geometry — Geo Lab renders it verbatim. There is no
 * second, diagnostic-only formula.
 */
import { useSyncExternalStore } from 'react';
import type { ActiveActionReservation } from './activeActionReservation';

export interface ActiveActionReservationReport extends ActiveActionReservation {
  game: string;
  paneHeightPx: number;
  cardRegionHeightPx: number;
  at: number;
}

const reports = new Map<string, ActiveActionReservationReport>();
const listeners = new Set<() => void>();
let version = 0;

export function publishActiveActionReservationReport(
  report: Omit<ActiveActionReservationReport, 'at'>,
): void {
  const prev = reports.get(report.game);
  if (
    prev &&
    prev.effectiveReservationPx === report.effectiveReservationPx &&
    prev.measuredLowerZonePx === report.measuredLowerZonePx &&
    prev.paneHeightPx === report.paneHeightPx &&
    prev.cardRegionHeightPx === report.cardRegionHeightPx &&
    prev.mode === report.mode &&
    prev.rows === report.rows
  ) {
    return;
  }
  reports.set(report.game, { ...report, at: Date.now() });
  version += 1;
  listeners.forEach((l) => l());
}

export function getActiveActionReservationReport(
  game: string,
): ActiveActionReservationReport | null {
  return reports.get(game) ?? null;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useActiveActionReservationReport(
  game: string,
): ActiveActionReservationReport | null {
  void useSyncExternalStore(subscribe, () => version, () => version);
  return reports.get(game) ?? null;
}
