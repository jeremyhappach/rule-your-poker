/**
 * GinActiveHandLedgerPill — passive, manual on-screen control for the
 * GIN_ACTIVE_HAND_LEDGER ring buffer.
 *
 * Contract mirrors HolmPresentationLedgerPill:
 *   - Renders only when a Gin table is mounted (availability signal).
 *   - Recording is OFF by default; user taps ARM.
 *   - No polling, no observer, no gameplay subscription.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  clearGinLedger,
  formatGinLedgerAsText,
  getGinLedgerEventCount,
  isGinLedgerActive,
  isGinLedgerArmed,
  setGinLedgerArmed,
  subscribeGinLedgerArmed,
  subscribeGinLedgerAvailability,
} from '@/lib/ginRummy/ginActiveHandLedger';

export function GinActiveHandLedgerPill() {
  const [available, setAvailable] = useState<boolean>(() => isGinLedgerActive());
  const [armed, setArmed] = useState<boolean>(() => isGinLedgerArmed());
  const [count, setCount] = useState<number>(() => getGinLedgerEventCount());

  useEffect(() => {
    const offAvail = subscribeGinLedgerAvailability((v) => {
      setAvailable(v);
      setArmed(isGinLedgerArmed());
      setCount(getGinLedgerEventCount());
    });
    const offArm = subscribeGinLedgerArmed((v) => {
      setArmed(v);
      setCount(getGinLedgerEventCount());
    });
    return () => {
      offAvail();
      offArm();
    };
  }, []);

  const handleArm = useCallback(() => {
    setGinLedgerArmed(true);
    setArmed(isGinLedgerArmed());
    setCount(getGinLedgerEventCount());
  }, []);

  const handleRefreshCount = useCallback(() => {
    setCount(getGinLedgerEventCount());
  }, []);

  const handleClear = useCallback(() => {
    clearGinLedger();
    setCount(0);
  }, []);

  const handleCopy = useCallback(async () => {
    const text = formatGinLedgerAsText();
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
    setCount(getGinLedgerEventCount());
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
        bottom: 62,
        right: 6,
        zIndex: 100000,
        background: 'rgba(0,0,0,0.85)',
        color: '#FFD9B5',
        border: '1px solid #FFD9B5',
        borderRadius: 6,
        font: '10px/1.2 ui-monospace, Menlo, monospace',
        padding: '4px 6px',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
      data-gin-active-hand-ledger-pill=""
    >
      <span style={{ fontWeight: 700 }}>GIN ACTIVE HAND</span>
      <span onClick={handleRefreshCount} style={{ opacity: 0.85, cursor: 'pointer' }}>
        #{count}
      </span>
      <button type="button" onClick={handleArm} style={btn(armed ? '#9FE2BF' : '#FFD9B5')}>
        ARM
      </button>
      <button type="button" onClick={handleCopy} style={btn('#FFD9B5')}>
        COPY
      </button>
      <button type="button" onClick={handleClear} style={btn('#FFD9B5')}>
        CLEAR
      </button>
    </div>
  );
}

export default GinActiveHandLedgerPill;
