/**
 * HolmTracePill — passive, manual on-screen control for the Holm
 * portal/lifecycle trace buffer.
 *
 * Contract:
 *   - Renders only when a Holm table is mounted (isolated availability signal).
 *   - Recording is OFF by default; user taps ARM to enable.
 *   - No useSyncExternalStore, no intervals, no querySelector polling, no DOM
 *     measurement. The only subscription is pill availability, not gameplay.
 *   - Pill is `position: fixed` body-level; outside the gameplay tree.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  clearHolmTrace,
  formatHolmTraceAsText,
  isHolmTraceActive,
  isHolmTraceArmed,
  setHolmTraceArmed,
  subscribeHolmTraceAvailability,
} from '@/lib/holm/holmTrace';

export function HolmTracePill() {
  const [available, setAvailable] = useState<boolean>(() => isHolmTraceActive());
  const [armed, setArmed] = useState<boolean>(() => isHolmTraceArmed());

  useEffect(() => {
    return subscribeHolmTraceAvailability((nextAvailable) => {
      setAvailable(nextAvailable);
      setArmed(isHolmTraceArmed());
    });
  }, []);

  const handleArm = useCallback(() => {
    setHolmTraceArmed(true);
    setArmed(isHolmTraceArmed());
  }, []);

  const handleClear = useCallback(() => {
    clearHolmTrace();
    setArmed(isHolmTraceArmed());
  }, []);

  const handleCopy = useCallback(async () => {
    const text = formatHolmTraceAsText();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch {
      // Copy errors are intentionally non-fatal; this control must never touch gameplay.
    }
    setArmed(isHolmTraceArmed());
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
      style={{
        position: 'fixed',
        bottom: 6,
        right: 6,
        zIndex: 100000,
        background: 'rgba(0,0,0,0.85)',
        color: '#FFD580',
        border: '1px solid #FFD580',
        borderRadius: 6,
        font: '10px/1.2 ui-monospace, Menlo, monospace',
        padding: '4px 6px',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
      data-holm-trace-pill=""
    >
      <span style={{ fontWeight: 700 }}>HOLM TRACE</span>
      <button type="button" onClick={handleArm} style={btn(armed ? '#9FE2BF' : '#FFD580')}>
        ARM
      </button>
      <button type="button" onClick={handleCopy} style={btn('#FFD580')}>
        COPY
      </button>
      <button type="button" onClick={handleClear} style={btn('#FFD580')}>
        CLEAR
      </button>
    </div>
  );
}

export default HolmTracePill;
