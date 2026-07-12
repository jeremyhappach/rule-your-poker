/**
 * HudStackTracePill — manual on-screen control for the narrow
 * HUD-stack transition trace (game selection → dealer-game setup →
 * awaiting-ante-decision).
 *
 * Pure instrumentation UI: ARM / EXPORT TXT / COPY / CLEAR. No timers,
 * no gameplay coupling, no layout side-effects. Renders only when a
 * shell HUD grid is mounted (probe drives the availability signal).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  clearHudStackTrace,
  formatHudStackTraceAsText,
  isHudStackTraceActive,
  isHudStackTraceArmed,
  setHudStackTraceArmed,
  subscribeHudStackTraceAvailability,
  getHudStackTraceEvents,
} from '@/lib/canonicalShell/hudStackTrace';

export function HudStackTracePill() {
  const [available, setAvailable] = useState<boolean>(() => isHudStackTraceActive());
  const [armed, setArmed] = useState<boolean>(() => isHudStackTraceArmed());
  const [expanded, setExpanded] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    return subscribeHudStackTraceAvailability((next) => {
      setAvailable(next);
      setArmed(isHudStackTraceArmed());
    });
  }, []);

  // Refresh count on a light interval while expanded — purely display.
  useEffect(() => {
    if (!expanded) return;
    const id = window.setInterval(() => setCount(getHudStackTraceEvents().length), 250);
    return () => window.clearInterval(id);
  }, [expanded]);

  const handleArm = useCallback(() => {
    setHudStackTraceArmed(true);
    setArmed(isHudStackTraceArmed());
    setCount(0);
  }, []);
  const handleClear = useCallback(() => {
    clearHudStackTrace();
    setArmed(isHudStackTraceArmed());
    setCount(0);
  }, []);
  const handleCopy = useCallback(async () => {
    const text = formatHudStackTraceAsText();
    try {
      if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch { /* non-fatal */ }
  }, []);
  const handleExport = useCallback(() => {
    const text = formatHudStackTraceAsText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `hudstack-trace-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  if (!available) return null;

  const btn = (bg: string): React.CSSProperties => ({
    background: bg,
    color: '#000',
    border: 'none',
    borderRadius: 3,
    padding: '2px 6px',
    font: 'inherit',
    fontWeight: 700,
    cursor: 'pointer',
  });

  return (
    <div
      data-hud-stack-trace-pill=""
      style={{
        position: 'fixed',
        bottom: 6,
        left: 6,
        zIndex: 100000,
        background: 'rgba(0,0,0,0.85)',
        color: '#9FE2BF',
        border: '1px solid #9FE2BF',
        borderRadius: 6,
        font: '10px/1.2 ui-monospace, Menlo, monospace',
        padding: '4px 6px',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <button type="button" onClick={() => setExpanded(v => !v)} style={btn('#9FE2BF')}>
        {expanded ? '▼' : '▶'}
      </button>
      <span style={{ fontWeight: 700 }}>HUD STACK</span>
      {expanded ? (
        <>
          <button type="button" onClick={handleArm} style={btn(armed ? '#FFD580' : '#9FE2BF')}>
            {armed ? 'ARMED' : 'ARM'}
          </button>
          <span>{count}</span>
          <button type="button" onClick={handleExport} style={btn('#9FE2BF')}>EXPORT TXT</button>
          <button type="button" onClick={handleCopy} style={btn('#9FE2BF')}>COPY</button>
          <button type="button" onClick={handleClear} style={btn('#9FE2BF')}>CLEAR</button>
        </>
      ) : null}
    </div>
  );
}

export default HudStackTracePill;
