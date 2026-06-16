/**
 * Admin Harness — LAYOUT TUNING / PLAY VERTICAL RESERVE
 *
 * Live-tunes --play-vertical-reserve (0..40px, step 4) on :root.
 * Persists to localStorage('admin.playVerticalReserve').
 * No publish/reload required; binding is direct via inline CSS var.
 *
 * Shows derived diagnostics (Row 4 height, Play height, Felt height,
 * Aspect cap ACTIVE/FREE) read from computed styles each frame.
 *
 * Pure tuning harness — no game branches, no descriptor edits, no seat
 * movement. Mount inside <DebugTray>.
 */
import { useEffect, useRef, useState } from 'react';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';

const STORAGE_KEY = 'admin.playVerticalReserve';
const DEFAULT_PX = 20;
const MIN_PX = 0;
const MAX_PX = 40;
const STEP_PX = 4;

function clampStep(n: number): number {
  const c = Math.max(MIN_PX, Math.min(MAX_PX, n));
  return Math.round(c / STEP_PX) * STEP_PX;
}

function readStored(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_PX;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_PX;
    return clampStep(n);
  } catch {
    return DEFAULT_PX;
  }
}

function applyVar(px: number) {
  document.documentElement.style.setProperty('--play-vertical-reserve', `${px}px`);
}

interface Diag {
  pane: number;
  play: number;
  felt: number;
  feltW: number;
  capActive: boolean;
}

function readDiag(): Diag {
  const cs = getComputedStyle(document.documentElement);
  const parse = (name: string) => Number.parseFloat(cs.getPropertyValue(name)) || 0;
  const pane = parse('--hud-h-pane');
  const play = parse('--shell-play-h');
  const felt = parse('--shell-felt-h');
  const feltW = parse('--shell-felt-w');
  // Aspect cap active when felt-h equals feltW/1.09 rather than play-h
  const aspectCap = feltW / 1.09;
  const capActive = felt + 0.5 < play && Math.abs(felt - aspectCap) < 1.5;
  return { pane, play, felt, feltW, capActive };
}

export function LayoutTuningPill() {
  const inTray = useInDebugTray();
  const [value, setValue] = useState<number>(() => readStored());
  const [expanded, setExpanded] = useState(false);
  const [diag, setDiag] = useState<Diag>({ pane: 0, play: 0, felt: 0, feltW: 0, capActive: false });
  const rafRef = useRef<number | null>(null);

  // Apply on mount + whenever value changes.
  useEffect(() => {
    applyVar(value);
    try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* noop */ }
  }, [value]);

  // Poll diagnostics while expanded (cheap getComputedStyle reads).
  useEffect(() => {
    if (!expanded) return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      setDiag(readDiag());
      rafRef.current = window.setTimeout(tick, 250) as unknown as number;
    };
    tick();
    return () => {
      alive = false;
      if (rafRef.current != null) window.clearTimeout(rafRef.current);
    };
  }, [expanded]);

  const pillWrap: React.CSSProperties = inTray
    ? { pointerEvents: 'auto', display: 'inline-block' }
    : {
        position: 'fixed',
        right: 8,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
        zIndex: 2147483647,
        pointerEvents: 'auto',
      };

  if (!expanded) {
    return (
      <div style={pillWrap}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Layout Tuning — Play Vertical Reserve"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'hsl(220 70% 35%)',
            color: '#fff',
            border: '1px solid hsl(220 70% 22%)',
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
          📐 PVR {value}
        </button>
      </div>
    );
  }

  return (
    <div style={pillWrap}>
      <div
        style={{
          background: 'hsl(220 30% 12%)',
          color: '#e8eefc',
          border: '1px solid hsl(220 30% 28%)',
          borderRadius: 10,
          padding: 10,
          width: 280,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 11,
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, letterSpacing: '0.06em' }}>LAYOUT TUNING</div>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            style={{
              background: 'transparent',
              color: '#9bb',
              border: '1px solid #345',
              borderRadius: 6,
              padding: '2px 6px',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 4, opacity: 0.85 }}>PLAY VERTICAL RESERVE</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{value} px</div>

        <input
          type="range"
          min={MIN_PX}
          max={MAX_PX}
          step={STEP_PX}
          value={value}
          onChange={(e) => setValue(clampStep(Number.parseInt(e.target.value, 10)))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, opacity: 0.6, marginBottom: 8 }}>
          <span>0</span><span>20</span><span>40</span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[
            { label: 'MIN (0)', v: 0 },
            { label: 'RESET (20)', v: 20 },
            { label: 'MAX (40)', v: 40 },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={() => setValue(b.v)}
              style={{
                flex: 1,
                background: value === b.v ? 'hsl(220 70% 40%)' : 'hsl(220 30% 20%)',
                color: '#fff',
                border: '1px solid hsl(220 30% 32%)',
                borderRadius: 6,
                padding: '4px 6px',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #234', paddingTop: 8, lineHeight: 1.5 }}>
          <div style={{ opacity: 0.6, fontSize: 9, letterSpacing: '0.08em', marginBottom: 4 }}>DERIVED</div>
          <Row label="Row 4 height" value={`${Math.round(diag.pane)} px`} />
          <Row label="Play height" value={`${Math.round(diag.play)} px`} />
          <Row label="Felt height" value={`${Math.round(diag.felt)} px`} />
          <Row label="Felt width" value={`${Math.round(diag.feltW)} px`} />
          <Row
            label="Aspect cap"
            value={diag.capActive ? 'ACTIVE' : 'FREE'}
            highlight={diag.capActive}
          />
          {diag.capActive && (
            <div
              style={{
                marginTop: 6,
                padding: '4px 6px',
                background: 'hsl(28 90% 30%)',
                color: '#fff',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
                textAlign: 'center',
                letterSpacing: '0.04em',
              }}
            >
              ASPECT CAP ACTIVE
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 700, color: highlight ? '#ffb74d' : '#e8eefc' }}>{value}</span>
    </div>
  );
}
