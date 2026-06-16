/**
 * PVR LIFT pill — on-screen readout of the name-row lift calculation
 * for top-anchored seats (slots -2 and 2).
 *
 * Lives in the canonical DebugTray (alongside the XCO/network pill).
 * Collapsed by default; tap to expand a panel that grows upward so it
 * never covers the shell header or gameplay controls.
 *
 * Instrumentation only. No geometry side-effects.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';

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
    return '#f87171'; // red
  }
  if (p.actualLift < p.availableLift) return '#fbbf24'; // yellow
  return '#4ade80'; // green
}

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toString();
}

function Row({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: '#a1a1aa' }}>{label}</span>
      <span style={{ color: '#f4f4f5' }}>{typeof value === 'number' ? fmt(value) : value ?? '—'}</span>
    </div>
  );
}

function SlotBlock({ p }: { p: SlotPayload }) {
  return (
    <div style={{ borderTop: '1px solid #3f3f46', paddingTop: 4, marginTop: 4, color: statusColor(p) }}>
      <div style={{ fontWeight: 600 }}>slot {p.slot}</div>
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
  const [expanded, setExpanded] = useState(false);
  const inTray = useInDebugTray();

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
    const id = window.setInterval(bump, 500);
    return () => {
      window.clearInterval(id);
      if (raf != null) window.cancelAnimationFrame(raf);
      if (w.__pvrLiftBump === bump) delete w.__pvrLiftBump;
    };
  }, []);

  if (typeof window === 'undefined') return null;
  const store = ((window as unknown as Record<string, unknown>).__pvrLiftStore ?? {}) as Store;
  const slotNeg2 = store['slot-2'];
  const slot2 = store['slot2'];

  // Worst status across slots drives pill color.
  const worst: 'green' | 'yellow' | 'red' = (() => {
    const slots = [slotNeg2, slot2].filter(Boolean) as SlotPayload[];
    if (slots.some((p) => p.headerBoxVsVisibleDelta != null && p.headerBoxVsVisibleDelta > 0)) return 'red';
    if (slots.some((p) => p.actualLift < p.availableLift)) return 'yellow';
    return 'green';
  })();
  const pillBg = worst === 'red' ? '#7a1f1f' : worst === 'yellow' ? '#78581f' : '#1f5a3a';

  if (!expanded) {
    const pillStyle: CSSProperties = inTray
      ? { pointerEvents: 'auto', display: 'inline-block' }
      : {
          position: 'fixed',
          right: 8,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
          zIndex: 2147483647,
          pointerEvents: 'auto',
        };
    const lift2 = slot2 ? fmt(slot2.actualLift) : '—';
    const liftN2 = slotNeg2 ? fmt(slotNeg2.actualLift) : '—';
    return (
      <div style={pillStyle}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Expand PVR lift diagnostics"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: pillBg,
            color: '#fff',
            border: '1px solid #3f3f46',
            borderRadius: 999,
            padding: '4px 8px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
            whiteSpace: 'nowrap',
          }}
        >
          ↕ PVR {liftN2}/{lift2}
        </button>
      </div>
    );
  }

  const panelStyle: CSSProperties = {
    position: 'fixed',
    right: 8,
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 36px)',
    zIndex: 2147483647,
    width: 240,
    maxHeight: '70dvh',
    overflow: 'auto',
    background: 'rgba(0,0,0,0.9)',
    border: '1px solid #3f3f46',
    borderRadius: 8,
    padding: '6px 8px',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 10,
    lineHeight: 1.25,
    color: '#e4e4e7',
    backdropFilter: 'blur(6px)',
    pointerEvents: 'auto',
    boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
  };

  return (
    <>
      {/* Keep the collapsed-style pill visible in the tray so its slot stays anchored */}
      <div style={inTray ? { pointerEvents: 'auto', display: 'inline-block' } : { display: 'none' }}>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: pillBg,
            color: '#fff',
            border: '1px solid #3f3f46',
            borderRadius: 999,
            padding: '4px 8px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ↕ PVR ▾
        </button>
      </div>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700 }}>
          <span>PVR LIFT</span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            style={{ background: 'transparent', color: '#a1a1aa', border: 'none', cursor: 'pointer', fontSize: 12 }}
          >
            ✕
          </button>
        </div>
        {slotNeg2 ? <SlotBlock p={slotNeg2} /> : <div style={{ color: '#71717a' }}>slot -2: —</div>}
        {slot2 ? <SlotBlock p={slot2} /> : <div style={{ color: '#71717a' }}>slot 2: —</div>}
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #27272a', fontSize: 9, color: '#71717a' }}>
          green = full lift · yellow = clamped · red = header overreport
        </div>
      </div>
    </>
  );
}
