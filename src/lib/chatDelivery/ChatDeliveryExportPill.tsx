import { useEffect, useMemo, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import {
  clearChatDeliveryLedger,
  exportChatDeliveryLedger,
  getChatDeliveryClientInstanceId,
  getChatDeliveryLedger,
  installChatDeliveryConsoleTap,
} from './chatDeliveryLedger';

export function ChatDeliveryExportPill() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    installChatDeliveryConsoleTap();
    const onUpdate = () => setTick((value) => value + 1);
    window.addEventListener('chat-delivery-ledger-updated', onUpdate);
    return () => window.removeEventListener('chat-delivery-ledger-updated', onUpdate);
  }, []);

  const ledger = getChatDeliveryLedger();
  const clientId = getChatDeliveryClientInstanceId();
  const shortClientId = useMemo(() => clientId.slice(0, 8), [clientId]);

  // Always render — this is a persistent published-build export control.

  const handleExport = () => {
    const json = exportChatDeliveryLedger();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `chat-delivery-ledger-${shortClientId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    clearChatDeliveryLedger();
    setTick((value) => value + 1);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 6px)',
        right: 6,
        zIndex: 2147483647,
        pointerEvents: 'auto',
      }}
      className="flex items-center gap-1 rounded border border-amber-400/60 bg-black/90 px-2 py-1 text-[10px] text-amber-100 shadow-lg"
      title={`CHAT_DELIVERY_LEDGER client ${clientId}`}
      data-chat-delivery-ledger-client={clientId}
      data-chat-delivery-ledger-tick={tick}
    >
      <span className="font-semibold">CHAT</span>
      <span className="tabular-nums">{ledger.events.length}e</span>
      <span className="tabular-nums text-red-300">{ledger.violations.length}v</span>
      <span className="font-mono text-amber-200/80">{shortClientId}</span>
      <button
        type="button"
        onClick={handleExport}
        className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-white/15"
        aria-label="Export chat delivery ledger"
        title="Export chat delivery ledger"
      >
        <Download className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={handleClear}
        className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-white/15"
        aria-label="Clear chat delivery ledger"
        title="Clear chat delivery ledger"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
