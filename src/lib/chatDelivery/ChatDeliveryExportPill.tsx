import { useEffect, useState } from 'react';
import {
  exportChatDeliveryLedgerJson,
  getClientInstanceId,
  hasAnyChatLifecycles,
  readChatDeliveryLedger,
  subscribeChatDeliveryLedger,
  clearChatDeliveryLedger,
} from './chatDeliveryLedger';

/**
 * Persistent compact export control for CHAT_DELIVERY_LEDGER.
 *
 * Mounted at the App root (outside any game / chat geometry) so it
 * survives route changes, auth redirects, and reload recovery. It
 * appears only after at least one chat lifecycle has been recorded on
 * this client, and always shows the current `clientInstanceId` so
 * exports from two devices can be paired.
 */
export function ChatDeliveryExportPill() {
  const [visible, setVisible] = useState<boolean>(() => hasAnyChatLifecycles());
  const [counts, setCounts] = useState<{ messages: number; system: number; violations: number }>(() => {
    const f = readChatDeliveryLedger();
    return {
      messages: f.messages.length,
      system: f.system.length,
      violations: f.messages.filter(m => m.hasViolation).length,
    };
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const f = readChatDeliveryLedger();
      setVisible(f.messages.length > 0 || f.system.length > 0);
      setCounts({
        messages: f.messages.length,
        system: f.system.length,
        violations: f.messages.filter(m => m.hasViolation).length,
      });
    };
    refresh();
    const unsub = subscribeChatDeliveryLedger(refresh);
    return () => { unsub(); };
  }, []);

  if (!visible) return null;

  const clientId = getClientInstanceId();
  const shortId = clientId.slice(0, 8);

  const handleExport = async () => {
    try {
      const json = exportChatDeliveryLedgerJson();
      let copiedOk = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(json);
          copiedOk = true;
        }
      } catch { copiedOk = false; }
      if (!copiedOk) {
        // Fallback: open in a new tab as a data URL.
        try {
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch { /* ignore */ }
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const handleClear = () => {
    // Hold shift to clear without confirmation
    // (kept minimal; this is a debug control).
    if (window.confirm('Clear CHAT_DELIVERY_LEDGER on this client?')) {
      clearChatDeliveryLedger();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 8,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
        zIndex: 2147483647,
        pointerEvents: 'auto',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        background: 'rgba(0,0,0,0.75)',
        color: '#fff',
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.2)',
        padding: '3px 6px',
        fontSize: 10,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        lineHeight: 1.2,
      }}
      title={`clientInstanceId=${clientId}`}
    >
      <span style={{ opacity: 0.7 }}>chat</span>
      <span style={{ opacity: 0.7 }}>#{shortId}</span>
      <span>m:{counts.messages}</span>
      <span>s:{counts.system}</span>
      {counts.violations > 0 && (
        <span style={{ color: '#f87171' }}>v:{counts.violations}</span>
      )}
      <button
        onClick={handleExport}
        style={{
          background: copied ? '#059669' : 'rgba(255,255,255,0.15)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 4,
          padding: '1px 6px',
          cursor: 'pointer',
          fontSize: 10,
        }}
      >
        {copied ? 'copied' : 'export'}
      </button>
      <button
        onClick={handleClear}
        style={{
          background: 'transparent',
          color: 'rgba(255,255,255,0.6)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 4,
          padding: '1px 5px',
          cursor: 'pointer',
          fontSize: 10,
        }}
        title="Clear this client's ledger"
      >
        ×
      </button>
    </div>
  );
}
