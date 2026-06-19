/**
 * SeatClusterInvariantMonitor — always-on dev-mode runtime assertion that
 * each participantId is mounted as exactly one <CanonicalSeatCluster> in
 * the live DOM. Promoted from the SEAT OWNERSHIP pill (which still runs
 * for wartime visualization) so violations fire even when the pill is
 * hidden.
 *
 * Rule: participantId → mountedCount == 1 at every lifecycle phase.
 *
 * On violation, calls the standard checkInvariant() helper which emits
 *   [sync-invariant] ❌ shell::one-cluster-per-participant — ...
 * and persists via the existing pipeline. Signature-deduped so it only
 * re-fires when the duplicate set actually changes.
 */
import { useEffect } from 'react';
import { checkInvariant } from '@/lib/debugSyncInvariants';

function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 6) : 'unknown';
}

export function SeatClusterInvariantMonitor(): null {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (typeof document === 'undefined') return;

    let cancelled = false;
    let raf = 0;
    let lastSignature: string | null = null;

    const sample = () => {
      if (cancelled) return;
      const clusters = Array.from(
        document.querySelectorAll('[data-canonical-seat-cluster]'),
      ) as HTMLElement[];

      const mountedCount: Record<string, number> = {};
      const mountedBy: Record<string, string[]> = {};

      for (const cluster of clusters) {
        const participant = shortId(
          cluster.dataset.playerId ||
            `position:${cluster.dataset.seatPosition ?? 'unknown'}`,
        );
        mountedCount[participant] = (mountedCount[participant] ?? 0) + 1;
        if (!mountedBy[participant]) mountedBy[participant] = [];
        mountedBy[participant].push(cluster.dataset.ownerLabel || 'unknown');
      }

      const duplicateParticipantIds = Object.entries(mountedCount)
        .filter(([, count]) => count > 1)
        .map(([participant]) => participant);

      // Signature-dedupe: only re-fire when the duplicate set actually changes.
      const signature = duplicateParticipantIds.length === 0
        ? 'ok'
        : duplicateParticipantIds
            .map((p) => `${p}:${mountedCount[p]}:${(mountedBy[p] || []).join('|')}`)
            .join(',');

      if (signature !== lastSignature) {
        lastSignature = signature;
        if (duplicateParticipantIds.length > 0) {
          checkInvariant(
            'shell',
            'one-cluster-per-participant',
            false,
            'CanonicalSeatCluster mounted more than once for the same participantId. Games must not mount shell-owned artifacts.',
            {
              duplicateParticipantIds,
              mountedCount,
              mountedBy,
            },
          );
        }
      }

      raf = requestAnimationFrame(sample);
    };

    raf = requestAnimationFrame(sample);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
