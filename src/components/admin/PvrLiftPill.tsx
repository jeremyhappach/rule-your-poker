/**
 * PVR LIFT pill — DEV-only on-screen readout of the name-row lift
 * calculation for top-anchored seats (slots -2 and 2).
 *
 * Reads live measurements published by CanonicalSeatCluster onto
 * `window.__pvrLiftStore`. No geometry side-effects; instrumentation
 * only. Hidden entirely outside `import.meta.env.DEV`.
 */
import { useEffect, useState } from 'react';

interface SlotPayload {
  slot: number;
  position: number;
  headerContainerTop: number | null;
  headerContainerBottom: number;
  headerContainerHeight: number | null;
  headerVisibleBottom: number | null;
  headerBoxVsVisibleDelta: number | null;
  chipTop: number;
  nameTop: number;
  nameBottom: number;
  chipMinusHeaderBox: number;
  availableLift: number;
  actualLift: number;
  ts: number;
}

type Store = Record<string, SlotPayload>;

function statusColor(p: SlotPayload): string {
  if (p.headerBoxVsVisibleDelta != null && p.headerBoxVsVisibleDelta > 0) {
    return 'text-red-400';
  }
  if (p.actualLift < p.availableLift) return 'text-yellow-400';
  return 'text-green-400';
}

function Row({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-100">{value ?? '—'}</span>
    </div>
  );
}

function SlotBlock({ p }: { p: SlotPayload }) {
  return (
    <div className={`border-t border-zinc-700 pt-1 mt-1 ${statusColor(p)}`}>
      <div className="font-semibold">slot {p.slot}</div>
      <Row label="headerBoxBottom" value={p.headerContainerBottom} />
      <Row label="headerVisibleBottom" value={p.headerVisibleBottom} />
      <Row label="headerBoxVsVisibleDelta" value={p.headerBoxVsVisibleDelta} />
      <Row label="chipTop" value={p.chipTop} />
      <Row label="chipMinusHeaderBox" value={p.chipMinusHeaderBox} />
      <Row label="availableLift" value={p.availableLift} />
      <Row label="actualLift" value={p.actualLift} />
    </div>
  );
}

export function PvrLiftPill() {
  const [, force] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as Record<string, unknown>;
    let raf: number | null = null;
    let pending = false;
    const bump = () => {
      if (pending) return;
      pending = true;
      raf = window.requestAnimationFrame(() => {
        pending = false;
        force((n) => (n + 1) & 0xffff);
      });
    };
    w.__pvrLiftBump = bump;
    // Periodic re-read in case nothing recomputed but values are stale.
    const id = window.setInterval(bump, 500);
    return () => {
      window.clearInterval(id);
      if (raf != null) window.cancelAnimationFrame(raf);
      if (w.__pvrLiftBump === bump) delete w.__pvrLiftBump;
    };
  }, []);

  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  const store = ((window as unknown as Record<string, unknown>).__pvrLiftStore ?? {}) as Store;
  const slotNeg2 = store['slot-2'];
  const slot2 = store['slot2'];

  return (
    <div
      style={{
        position: 'fixed',
        right: 6,
        top: 6,
        zIndex: 200,
        maxWidth: 240,
      }}
      className="rounded-md bg-black/85 border border-zinc-700 px-2 py-1 font-mono text-[10px] leading-tight backdrop-blur"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between text-zinc-200 font-semibold"
      >
        <span>PVR LIFT</span>
        <span className="text-zinc-500">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed ? (
        <div className="mt-1">
          {slotNeg2 ? <SlotBlock p={slotNeg2} /> : <div className="text-zinc-500">slot -2: —</div>}
          {slot2 ? <SlotBlock p={slot2} /> : <div className="text-zinc-500">slot 2: —</div>}
          <div className="mt-1 pt-1 border-t border-zinc-800 text-[9px] text-zinc-500">
            green = full lift · yellow = clamped · red = header overreport
          </div>
        </div>
      ) : null}
    </div>
  );
}
