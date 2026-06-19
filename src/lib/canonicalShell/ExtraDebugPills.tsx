/**
 * EXTRA DEBUG PILLS — DEALER DBG, SEAT OWNERSHIP, DEALER AFFORDANCE.
 * Renders below FELT pill (stacked vertically). Each is a small
 * collapsible/copyable pill that proves the corresponding regression
 * via screenshots, no console.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useHideDebugUI } from '@/lib/debugUIVisibility';
import { useDebugPillEnabled, type DebugPillKey } from '@/lib/debugTray/debugPillsStore';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import {
  dealerDbgStore,
  seatOwnershipStore,
  dealerAffordanceStore,
  overlayOwnershipStore,
  timerDbgStore,
  type DealerAffordanceEntry,
  type DealerDbgEntry,
  type SeatOwnershipEntry,
  type OverlayOwnershipEntry,
  type TimerDbgEntry,
} from './extraDebugStore';

function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 6) : 'unknown';
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
}

type DebugEntry<T extends object = object> = { ts: number } & T;

function entryToText<T extends object>(e: DebugEntry<T>): string {
  const { ts, ...rest } = e;
  const lines = [fmtTime(ts), ''];
  for (const [k, v] of Object.entries(rest as Record<string, unknown>)) {
    let out: string;
    if (v && typeof v === 'object') {
      out = JSON.stringify(v);
    } else {
      out = String(v);
    }
    lines.push(`${k}: ${out}`);
  }
  return lines.join('\n');
}

interface PillProps<T extends object> {
  label: string;
  pillKey: DebugPillKey;
  store: {
    get: () => DebugEntry<T>[];
    subscribe: (l: () => void) => () => void;
  };
  summarize: (latest: DebugEntry<T> | undefined) => string;
  top: number;
}

function Pill<T extends object>({ label, pillKey, store, summarize, top }: PillProps<T>) {
  const entries = useSyncExternalStore(store.subscribe, store.get, store.get);
  const enabled = useDebugPillEnabled(pillKey);
  const inTray = useInDebugTray();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const latest = entries[entries.length - 1];

  const copyAll = async () => {
    const text = entries.map(entryToText).join('\n\n────────────\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* noop */ }
  };

  if (!enabled) return null;

  const wrapperStyle: React.CSSProperties = inTray
    ? {
        position: 'relative',
        display: 'inline-block',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        color: '#fff',
        pointerEvents: 'auto',
      }
    : {
        position: 'fixed',
        right: 8,
        top,
        zIndex: 99999,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        color: '#fff',
        pointerEvents: 'auto',
      };

  return (
    <div data-extra-debug-pill={label} style={wrapperStyle}>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: 'rgba(0,0,0,0.75)',
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: 999,
            padding: '4px 8px',
            color: '#fff',
            fontSize: 10,
          }}
        >
          {label} · {summarize(latest)}
        </button>
      ) : (
        <div
          style={{
            width: 300,
            maxHeight: '50vh',
            background: 'rgba(0,0,0,0.88)',
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
            <strong style={{ fontSize: 11 }}>{label}</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={copyAll} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 4, padding: '2px 6px', color: '#fff', fontSize: 10 }}>
                {copied ? 'COPIED' : 'COPY'}
              </button>
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 4, padding: '2px 6px', color: '#fff', fontSize: 10 }}>
                ✕
              </button>
            </div>
          </div>
          <div style={{ overflowY: 'auto', padding: '6px 8px' }}>
            {entries.length === 0 && <div style={{ opacity: 0.6 }}>No entries yet.</div>}
            {entries.slice().reverse().map((e, i) => (
              <pre key={`${e.ts}-${i}`} style={{ whiteSpace: 'pre-wrap', margin: 0, padding: '6px 0', borderTop: i === 0 ? 'none' : '1px dashed rgba(255,255,255,0.15)', fontSize: 10, lineHeight: 1.3 }}>
                {entryToText(e)}
              </pre>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ExtraDebugPills() {
  const hidden = useHideDebugUI();
  const timerDbgEnabled = useDebugPillEnabled('timerDbg');
  const previousParticipantsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!timerDbgEnabled || typeof document === 'undefined') return;
    let cancelled = false;
    let raf = 0;
    const sampleSeatClusterLifecycle = () => {
      const clusters = Array.from(
        document.querySelectorAll('[data-canonical-seat-cluster]'),
      ) as HTMLElement[];
      const participantIds = new Set<string>();
      const seatId: Record<string, string[]> = {};
      const status: Record<string, string[]> = {};
      const mountedCount: Record<string, number> = {};
      const mountedBy: Record<string, string[]> = {};
      const renderPath: Record<string, string[]> = {};
      const canonicalSeatClusterMounted: Record<string, boolean> = {};
      const chipDiscMounted: Record<string, boolean> = {};
      const seatProjectionSource: Record<string, string[]> = {};
      const teardownReason: Record<string, string> = {};

      for (const cluster of clusters) {
        const participant = shortId(cluster.dataset.playerId || `position:${cluster.dataset.seatPosition ?? 'unknown'}`);
        participantIds.add(participant);
        if (!seatId[participant]) seatId[participant] = [];
        if (!status[participant]) status[participant] = [];
        if (!mountedBy[participant]) mountedBy[participant] = [];
        if (!renderPath[participant]) renderPath[participant] = [];
        if (!seatProjectionSource[participant]) seatProjectionSource[participant] = [];
        mountedCount[participant] = (mountedCount[participant] ?? 0) + 1;
        canonicalSeatClusterMounted[participant] = true;
        chipDiscMounted[participant] = Boolean(chipDiscMounted[participant] || cluster.querySelector('[data-chip-center]'));
        seatId[participant].push(`pos:${cluster.dataset.seatPosition ?? '—'} slot:${cluster.dataset.seatSlot ?? '—'}`);
        status[participant].push(cluster.dataset.seatStatus ?? '—');
        mountedBy[participant].push(cluster.dataset.ownerLabel || 'unknown');
        renderPath[participant].push(cluster.dataset.ownerLabel || 'unknown');
        seatProjectionSource[participant].push(
          `provider:${cluster.dataset.providerInstance || '—'} orientation:${cluster.dataset.seatOrientation || '—'} growth:${cluster.dataset.seatGrowth || '—'}`,
        );
      }

      for (const previous of previousParticipantsRef.current) {
        if (!participantIds.has(previous)) teardownReason[previous] = 'not present in current DOM snapshot';
      }
      for (const [participant, count] of Object.entries(mountedCount)) {
        teardownReason[participant] = count > 1 ? 'duplicate mounted clusters in current DOM snapshot' : 'mounted';
      }
      previousParticipantsRef.current = participantIds;

      const duplicateParticipantIds = Object.entries(mountedCount)
        .filter(([, count]) => count > 1)
        .map(([participant]) => participant);
      const bodyText = document.body?.innerText ?? '';
      seatOwnershipStore.record({
        context: 'seat-cluster-lifecycle',
        participantId: Array.from(participantIds),
        seatId,
        status,
        mountedCount,
        mountedBy,
        renderPath,
        canonicalSeatClusterMounted,
        chipDiscMounted,
        seatProjectionSource,
        teardownReason,
        observerTransition: mountedBy && Object.values(mountedBy).some(paths => paths.some(path => path.includes('WaitingSurface') || path.includes('PreSessionSeatLayer'))),
        timeoutTransition: bodyText.includes('Waiting for Players') || bodyText.includes('Timed out') || bodyText.includes('timeout'),
        duplicateParticipantIds,
        invariantHolds: duplicateParticipantIds.length === 0,
      });
      if (!cancelled) raf = requestAnimationFrame(sampleSeatClusterLifecycle);
    };
    raf = requestAnimationFrame(sampleSeatClusterLifecycle);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [hidden]);

  // Sample shell-owned overlay layer ownership (slot/settlement/transient).
  // Each layer is the DOM node tagged [data-shell-overlay="<slot>"]; its
  // direct/descendant nodes that carry data-shell-overlay-owner=… are the
  // consumers currently portaling into the shell overlay band.
  useEffect(() => {
    if (hidden || typeof document === 'undefined') return;
    let cancelled = false;
    let raf = 0;
    const sample = () => {
      const sampleSlot = (name: 'slot' | 'settlement' | 'transient') => {
        const layer = document.querySelector(`[data-shell-overlay="${name}"]`) as HTMLElement | null;
        const owners = layer
          ? Array.from(layer.querySelectorAll('[data-shell-overlay-owner]')) as HTMLElement[]
          : [];
        return {
          mountedChildren: layer ? layer.childElementCount : 0,
          ownerLabels: owners.map((el) => el.dataset.shellOverlayOwner || 'unknown'),
        };
      };
      overlayOwnershipStore.record({
        slot: sampleSlot('slot'),
        settlement: sampleSlot('settlement'),
        transient: sampleSlot('transient'),
      });
      if (!cancelled) raf = requestAnimationFrame(sample);
    };
    raf = requestAnimationFrame(sample);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [hidden]);

  // Sample shell-timer DOM presence/visibility so the TIMER DBG pill can
  // distinguish "not mounted" vs "mounted hidden" vs "mounted with state".
  // The semantic state (gates / blockedReason) is recorded by the producer
  // (MobileGameTable publish site); here we merge DOM observations into the
  // latest semantic snapshot.
  useEffect(() => {
    if (hidden || typeof document === 'undefined') return;
    let cancelled = false;
    let raf = 0;
    const sample = () => {
      const el = document.querySelector('[data-canonical-shell-timer-rail]') as HTMLElement | null;
      const mounted = !!el;
      let visible = false;
      if (el) {
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        visible = cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0 && rect.width > 0 && rect.height > 0;
      }
      const entries = timerDbgStore.get();
      const latest = entries[entries.length - 1];
      if (latest && (latest.timerMounted !== mounted || latest.timerVisible !== visible)) {
        const { ts: _ts, ...rest } = latest;
        timerDbgStore.record({ ...(rest as TimerDbgEntry), timerMounted: mounted, timerVisible: visible });
      }
      if (!cancelled) raf = requestAnimationFrame(sample);
    };
    raf = requestAnimationFrame(sample);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [timerDbgEnabled]);


  if (hidden && !timerDbgEnabled) return null;
  return (
    <>
      {!hidden && (
        <>
          <Pill
            label="DEALER DBG"
            pillKey="dealerDbg"
            store={dealerDbgStore}
            summarize={(e) => e ? `local:${e.localDealerVisible ? 'Y' : 'N'} opp:${Object.values(e.opponentDealerVisible || {}).some(Boolean) ? 'Y' : 'N'}` : '—'}
            top={40}
          />
          <Pill
            label="SEAT OWNERSHIP"
            pillKey="seatOwnership"
            store={seatOwnershipStore}
            summarize={(e) => e ? `${e.invariantHolds ? '✓' : '✗'} 1/participant · ${e.context === 'seat-cluster-lifecycle' ? (e.duplicateParticipantIds?.join(',') || 'shell') : e.winSequencePhase}` : '—'}
            top={72}
          />

          <Pill
            label="DEALER AFFORDANCE"
            pillKey="dealerAffordance"
            store={dealerAffordanceStore}
            summarize={(e) => e ? `${e.game} i:${e.identityDealerVisible?'Y':'N'} s:${e.seatDealerVisible?'Y':'N'} l:${e.legacyDealerVisible?'Y':'N'}` : '—'}
            top={104}
          />

          <Pill
            label="OVERLAY OWNERSHIP"
            pillKey="overlayOwnership"
            store={overlayOwnershipStore}
            summarize={(e) => e
              ? `slot:${e.slot.mountedChildren}[${e.slot.ownerLabels.join(',') || '—'}] set:${e.settlement.mountedChildren} tr:${e.transient.mountedChildren}`
              : '—'}
            top={136}
          />
        </>
      )}

      <Pill
        label="TIMER DBG"
        pillKey="timerDbg"
        store={timerDbgStore}
        summarize={(e) => e
          ? `${e.gameType ?? '—'} pub:${e.timerPublished?'Y':'N'} mnt:${e.timerMounted?'Y':'N'} vis:${e.timerVisible?'Y':'N'} · ${e.blockedReason}`
          : '—'}
        top={168}
      />
    </>
  );
}
