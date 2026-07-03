/**
 * ThreeFiveSevenPresentationLedgerPill — passive, manual on-screen
 * control for the 357 ACTIVE HAND PRESENTATION LEDGER ring buffer.
 *
 * Mirrors HolmPresentationLedgerPill contract:
 *   - Always renders from the app shell so impacted clients can find it.
 *   - Recording is OFF by default; user taps ARM.
 *   - No polling, no observer, no gameplay subscription.
 *   - COPY writes the formatted export to clipboard.
 *   - CLEAR wipes the buffer (explicit only — availability toggles do
 *     NOT clear).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  clearThree57Ledger,
  formatThree57LedgerAsText,
  getThree57LedgerEventCount,
  isThree57LedgerActive,
  isThree57LedgerArmed,
  setThree57LedgerArmed,
  subscribeThree57LedgerArmed,
  subscribeThree57LedgerAvailability,
} from '@/lib/threeFiveSeven/presentationLedger';

export function ThreeFiveSevenPresentationLedgerPill() {
  const [available, setAvailable] = useState<boolean>(() => isThree57LedgerActive());
  const [armed, setArmed] = useState<boolean>(() => isThree57LedgerArmed());
  const [count, setCount] = useState<number>(() => getThree57LedgerEventCount());

  useEffect(() => {
    const offAvail = subscribeThree57LedgerAvailability((v) => {
      setAvailable(v);
      setArmed(isThree57LedgerArmed());
      setCount(getThree57LedgerEventCount());
    });
    const offArm = subscribeThree57LedgerArmed((v) => {
      setArmed(v);
      setCount(getThree57LedgerEventCount());
    });
    return () => {
      offAvail();
      offArm();
    };
  }, []);

  // While armed, poll the ring-buffer count so the "N events" status
  // stays live without requiring the user to tap the number. 500ms is
  // plenty for a status readout and keeps overhead negligible.
  useEffect(() => {
    if (!armed) return;
    const id = window.setInterval(() => {
      setCount(getThree57LedgerEventCount());
    }, 500);
    return () => window.clearInterval(id);
  }, [armed]);

  const handleArm = useCallback(() => {
    setThree57LedgerArmed(true);
    setArmed(isThree57LedgerArmed());
    setCount(getThree57LedgerEventCount());
  }, []);

  const handleDisarm = useCallback(() => {
    setThree57LedgerArmed(false);
    setArmed(isThree57LedgerArmed());
    setCount(getThree57LedgerEventCount());
  }, []);

  const handleRefreshCount = useCallback(() => {
    setCount(getThree57LedgerEventCount());
  }, []);

  const handleClear = useCallback(() => {
    clearThree57Ledger();
    setCount(0);
  }, []);

  const handleCopy = useCallback(async () => {
    const text = formatThree57LedgerAsText();
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
    setCount(getThree57LedgerEventCount());
  }, []);

  // Every-client visibility contract: do not return null. The control is
  // intentionally visible even on the lobby with "table unmounted" status
  // so users can confirm the retained per-client ledger surface exists
  // before entering a 3-5-7 table.

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
        background: 'rgba(0,0,0,0.85)',
        color: '#FFD59E',
        border: '1px solid #FFD59E',
        borderRadius: 6,
        font: '10px/1.2 ui-monospace, Menlo, monospace',
        padding: '4px 6px',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
      data-three57-presentation-ledger-pill=""
      data-available={available ? '1' : '0'}
      data-armed={armed ? '1' : '0'}
    >
      <span style={{ fontWeight: 700 }}>357 PRESENTATION LEDGER</span>
      <span
        onClick={handleRefreshCount}
        style={{ opacity: 0.9, cursor: 'pointer' }}
        title="Tap to refresh count"
      >
        357 ledger: {count} events | {armed ? 'armed' : 'disarmed'}
        {!available ? ' (table unmounted)' : ''}
      </span>
      <button
        type="button"
        onClick={armed ? handleDisarm : handleArm}
        style={btn(armed ? '#9FE2BF' : '#FFD59E')}
      >
        {armed ? 'DISARM' : 'ARM'}
      </button>
      <button type="button" onClick={handleCopy} style={btn('#FFD59E')}>
        COPY
      </button>
      <button type="button" onClick={handleClear} style={btn('#FFD59E')}>
        CLEAR
      </button>
    </div>
  );
}

export default ThreeFiveSevenPresentationLedgerPill;
