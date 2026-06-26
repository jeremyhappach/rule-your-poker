/**
 * HolmTracePill — passive, manual on-screen control for the Holm
 * portal/lifecycle trace buffer.
 *
 * Contract:
 *   - Renders only when a Holm table is mounted (isHolmTraceActive()).
 *   - Recording is OFF by default; user taps ARM to enable.
 *   - No useSyncExternalStore, no subscriptions, no intervals, no
 *     querySelector polling, no DOM measurement.
 *   - Event count updates only on user tap (REFRESH / ARM / COPY / CLEAR).
 *   - Pill is `position: fixed` body-level; outside the gameplay tree.
 */
import { useState, useCallback } from 'react';
import {
  clearHolmTrace,
  formatHolmTraceAsText,
  getHolmTraceEventCount,
  isHolmTraceActive,
  isHolmTraceArmed,
  setHolmTraceArmed,
} from '@/lib/holm/holmTrace';

export function HolmTracePill() {
  const [armed, setArmed] = useState<boolean>(() => isHolmTraceArmed());
  const [count, setCount] = useState<number>(() => getHolmTraceEventCount());
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    setArmed(isHolmTraceArmed());
    setCount(getHolmTraceEventCount());
  }, []);

  const handleArmToggle = useCallback(() => {
    setHolmTraceArmed(!isHolmTraceArmed());
    refresh();
  }, [refresh]);

  const handleClear = useCallback(() => {
    clearHolmTrace();
    refresh();
  }, [refresh]);

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
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
    refresh();
  }, [refresh]);

  if (!isHolmTraceActive()) return null;

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
      <span style={{ opacity: 0.75 }}>{armed ? 'ARMED' : 'IDLE'}</span>
      <span>EVENTS: {count}</span>
      <button type="button" onClick={handleArmToggle} style={btn(armed ? '#F08080' : '#FFD580')}>
        {armed ? 'DISARM' : 'ARM'}
      </button>
      <button type="button" onClick={refresh} style={btn('#FFD580')}>
        REFRESH
      </button>
      <button type="button" onClick={handleCopy} style={btn(copied ? '#9FE2BF' : '#FFD580')}>
        {copied ? 'COPIED' : 'COPY'}
      </button>
      <button type="button" onClick={handleClear} style={btn('#FFD580')}>
        CLEAR
      </button>
    </div>
  );
}

export default HolmTracePill;
