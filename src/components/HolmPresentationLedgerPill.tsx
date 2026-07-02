/**
 * HolmPresentationLedgerPill — passive, manual on-screen control for
 * the HOLM_PRESENTATION_LEDGER ring buffer.
 *
 * Contract mirrors HolmTracePill:
 *   - Renders only when a Holm table is mounted (availability signal).
 *   - Recording is OFF by default; user taps ARM.
 *   - No polling, no observer, no gameplay subscription.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  clearHolmLedger,
  formatHolmLedgerAsText,
  getHolmLedgerEventCount,
  isHolmLedgerActive,
  isHolmLedgerArmed,
  setHolmLedgerArmed,
  subscribeHolmLedgerArmed,
  subscribeHolmLedgerAvailability,
} from '@/lib/holm/holmPresentationLedger';

export function HolmPresentationLedgerPill() {
  const [available, setAvailable] = useState<boolean>(() => isHolmLedgerActive());
  const [armed, setArmed] = useState<boolean>(() => isHolmLedgerArmed());
  const [count, setCount] = useState<number>(() => getHolmLedgerEventCount());

  useEffect(() => {
    const offAvail = subscribeHolmLedgerAvailability((v) => {
      setAvailable(v);
      setArmed(isHolmLedgerArmed());
      setCount(getHolmLedgerEventCount());
    });
    const offArm = subscribeHolmLedgerArmed((v) => {
      setArmed(v);
      setCount(getHolmLedgerEventCount());
    });
    return () => {
      offAvail();
      offArm();
    };
  }, []);

  const handleArm = useCallback(() => {
    setHolmLedgerArmed(true);
    setArmed(isHolmLedgerArmed());
    setCount(getHolmLedgerEventCount());
  }, []);

  const handleRefreshCount = useCallback(() => {
    setCount(getHolmLedgerEventCount());
  }, []);

  const handleClear = useCallback(() => {
    clearHolmLedger();
    setCount(0);
  }, []);

  const handleCopy = useCallback(async () => {
    const text = formatHolmLedgerAsText();
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
      /* clipboard errors must never affect gameplay */
    }
    setCount(getHolmLedgerEventCount());
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
        bottom: 34,
        right: 6,
        zIndex: 100000,
        background: 'rgba(0,0,0,0.85)',
        color: '#B5E7FF',
        border: '1px solid #B5E7FF',
        borderRadius: 6,
        font: '10px/1.2 ui-monospace, Menlo, monospace',
        padding: '4px 6px',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
      data-holm-presentation-ledger-pill=""
    >
      <span style={{ fontWeight: 700 }}>HOLM PRESENTATION</span>
      <span onClick={handleRefreshCount} style={{ opacity: 0.85, cursor: 'pointer' }}>
        #{count}
      </span>
      <button type="button" onClick={handleArm} style={btn(armed ? '#9FE2BF' : '#B5E7FF')}>
        ARM
      </button>
      <button type="button" onClick={handleCopy} style={btn('#B5E7FF')}>
        COPY
      </button>
      <button type="button" onClick={handleClear} style={btn('#B5E7FF')}>
        CLEAR
      </button>
    </div>
  );
}

export default HolmPresentationLedgerPill;
