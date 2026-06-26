/**
 * HolmTracePill — temporary on-screen pill for Holm portal/lifecycle
 * investigation. Single COPY action exports the full ordered event
 * history (rolling 500-event buffer) as text.
 *
 * Mount: only when `isHolmTraceActive()` is true (managed by Game.tsx
 * based on `game.game_type === 'holm-game'`).
 *
 * No console output. No server writes. No behavior change.
 */
import { useSyncExternalStore, useState, useCallback } from 'react';
import {
  formatHolmTraceAsText,
  getHolmTraceEvents,
  isHolmTraceActive,
  subscribeHolmTrace,
} from '@/lib/holm/holmTrace';

export function HolmTracePill() {
  const events = useSyncExternalStore(
    subscribeHolmTrace,
    getHolmTraceEvents,
    () => [],
  );
  const [copied, setCopied] = useState(false);

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
  }, []);

  if (!isHolmTraceActive()) return null;

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
      <span style={{ opacity: 0.75 }}>ARMED</span>
      <span>EVENTS: {events.length}</span>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          background: copied ? '#9FE2BF' : '#FFD580',
          color: '#000',
          border: 'none',
          borderRadius: 3,
          padding: '2px 6px',
          font: 'inherit',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {copied ? 'COPIED' : 'COPY'}
      </button>
    </div>
  );
}

export default HolmTracePill;
