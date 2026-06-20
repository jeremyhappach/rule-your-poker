/**
 * WINNER CHIP ENDPOINT DBG — diagnostic for the asymmetric failure
 *   fromEndpointFound=true, toEndpointFound=false (Economy Wave 1).
 *
 * Captures a stamped snapshot of the DOM at:
 *   - announcementComplete
 *   - immediately before dispatchMany
 *   - on transport drop (called from caller when known)
 *
 * Snapshot dimensions:
 *   - all [data-chip-center] positions present in document
 *   - winnerSeat / loserSeats / winnerPlayerId
 *   - winner seat present?
 *   - winner cluster present? (ancestor with [data-canonical-seat-cluster])
 *   - winner chip subtree present? (chip-center has child node count > 0)
 */

export interface WinnerChipEndpointSnapshot {
  ts: number;
  site: string;
  winnerPlayerId?: string | null;
  winnerSeat?: number | null;
  loserSeats?: number[];
  chipCenterPositions: number[];
  domCount: number;
  winnerSeatPresent: boolean;
  loserSeatsPresent: number[];
  winnerClusterPresent: boolean;
  winnerChipSubtreePresent: boolean;
  note?: string;
}

const MAX = 30;
let snapshots: WinnerChipEndpointSnapshot[] = [];
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => { try { l(); } catch { /* */ } }); }

export function subscribeWinnerChipEndpointDbg(l: () => void): () => void {
  listeners.add(l); return () => { listeners.delete(l); };
}
export function getWinnerChipEndpointDbg(): WinnerChipEndpointSnapshot[] {
  return snapshots;
}
export function clearWinnerChipEndpointDbg(): void { snapshots = []; emit(); }

export interface CaptureArgs {
  site: string;
  winnerPlayerId?: string | null;
  winnerSeat?: number | null;
  loserSeats?: number[];
  note?: string;
}

export function captureWinnerChipEndpoint(args: CaptureArgs): WinnerChipEndpointSnapshot {
  const positions: number[] = [];
  let winnerClusterPresent = false;
  let winnerChipSubtreePresent = false;
  let winnerSeatPresent = false;
  const loserSeatsPresent: number[] = [];
  let domCount = 0;
  try {
    const nodes = Array.from(document.querySelectorAll('[data-chip-center]')) as HTMLElement[];
    domCount = nodes.length;
    for (const n of nodes) {
      const raw = n.getAttribute('data-chip-center');
      const pos = raw == null ? NaN : Number(raw);
      if (!Number.isNaN(pos)) positions.push(pos);
      if (args.winnerSeat != null && pos === args.winnerSeat) {
        winnerSeatPresent = true;
        winnerChipSubtreePresent = n.childElementCount > 0;
        winnerClusterPresent = !!n.closest('[data-canonical-seat-cluster]')
          || !!n.closest('[data-seat-cluster]')
          || !!n.closest('[data-canonical-opponent-seat]');
      }
      if (args.loserSeats?.includes(pos)) loserSeatsPresent.push(pos);
    }
  } catch {
    /* DOM unavailable */
  }
  const snap: WinnerChipEndpointSnapshot = {
    ts: Date.now(),
    site: args.site,
    winnerPlayerId: args.winnerPlayerId ?? null,
    winnerSeat: args.winnerSeat ?? null,
    loserSeats: args.loserSeats ?? [],
    chipCenterPositions: positions.sort((a, b) => a - b),
    domCount,
    winnerSeatPresent,
    loserSeatsPresent,
    winnerClusterPresent,
    winnerChipSubtreePresent,
    note: args.note,
  };
  const next = snapshots.concat(snap);
  snapshots = next.length > MAX ? next.slice(next.length - MAX) : next;
  emit();
  // Also surface to console for live tailing:
  // eslint-disable-next-line no-console
  console.warn('[WINNER CHIP ENDPOINT DBG]', snap.site, {
    winnerSeat: snap.winnerSeat,
    winnerPlayerId: snap.winnerPlayerId?.slice(0, 8),
    domCount: snap.domCount,
    positions: snap.chipCenterPositions,
    winnerSeatPresent: snap.winnerSeatPresent,
    winnerClusterPresent: snap.winnerClusterPresent,
    winnerChipSubtreePresent: snap.winnerChipSubtreePresent,
    loserSeatsPresent: snap.loserSeatsPresent,
    note: snap.note,
  });
  return snap;
}

export function formatWinnerChipEndpointDbgAsText(): string {
  if (snapshots.length === 0) return 'WINNER CHIP ENDPOINT DBG (empty)\n';
  const lines: string[] = ['WINNER CHIP ENDPOINT DBG'];
  for (const s of snapshots) {
    lines.push(
      `${new Date(s.ts).toISOString()} ${s.site}`,
      `  winnerPlayerId=${s.winnerPlayerId ?? '∅'} winnerSeat=${s.winnerSeat ?? '∅'}`,
      `  loserSeats=[${(s.loserSeats ?? []).join(',')}]`,
      `  domCount=${s.domCount} positions=[${s.chipCenterPositions.join(',')}]`,
      `  winnerSeatPresent=${s.winnerSeatPresent}`,
      `  loserSeatsPresent=[${s.loserSeatsPresent.join(',')}]`,
      `  winnerClusterPresent=${s.winnerClusterPresent}`,
      `  winnerChipSubtreePresent=${s.winnerChipSubtreePresent}`,
      ...(s.note ? [`  note=${s.note}`] : []),
    );
  }
  return lines.join('\n') + '\n';
}
