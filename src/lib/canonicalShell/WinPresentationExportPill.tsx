/**
 * Persistent floating "Win Ledger" export pill.
 *
 * Appears after the first win attempt is recorded and survives route
 * changes (mounted at App root, outside game geometry). Provides a
 * copy-to-clipboard export of CANONICAL_WIN_PRESENTATION_LEDGER.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  exportWinLedgerJson,
  hasAnyWinAttempts,
  readWinLedger,
  subscribeWinLedger,
  clearWinLedger,
} from './winPresentationLedger';

export function WinPresentationExportPill() {
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeWinLedger(() => setTick(t => t + 1)), []);

  const records = useMemo(() => readWinLedger(), [tick]);
  const visible = hasAnyWinAttempts();
  const violationCount = records.reduce((n, r) => n + (r.hasViolation ? 1 : 0), 0);

  if (!visible) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportWinLedgerJson());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: put in a prompt so user can copy manually
      window.prompt('Win ledger export (copy manually):', exportWinLedgerJson());
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483647,
        pointerEvents: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: violationCount > 0 ? 'rgba(190,20,40,0.92)' : 'rgba(15,15,20,0.85)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 999,
          padding: '4px 10px',
          fontSize: 11,
          lineHeight: '14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{
            background: 'transparent', color: 'inherit', border: 'none',
            cursor: 'pointer', padding: 0, font: 'inherit',
          }}
          title="Toggle Win Ledger details"
        >
          WIN LEDGER · {records.length}{violationCount > 0 ? ` · ⚠ ${violationCount}` : ''}
        </button>
        <button
          type="button"
          onClick={onCopy}
          style={{
            background: 'rgba(255,255,255,0.15)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.3)', borderRadius: 999,
            padding: '1px 8px', cursor: 'pointer', font: 'inherit',
          }}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
        <button
          type="button"
          onClick={() => { if (window.confirm('Clear win ledger?')) clearWinLedger(); }}
          style={{
            background: 'transparent', color: 'rgba(255,255,255,0.7)',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999,
            padding: '1px 6px', cursor: 'pointer', font: 'inherit',
          }}
          title="Clear ledger"
        >
          ✕
        </button>
      </div>
      {expanded && (
        <div
          style={{
            marginTop: 6,
            maxWidth: 'min(92vw, 640px)',
            maxHeight: '50vh',
            overflow: 'auto',
            background: 'rgba(10,10,14,0.95)',
            color: '#e6e6e6',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8,
            padding: 8,
            fontSize: 10,
            lineHeight: '13px',
          }}
        >
          {records.slice().reverse().map(rec => (
            <div key={rec.identity.winAttemptId} style={{ marginBottom: 8 }}>
              <div style={{ color: rec.hasViolation ? '#ff9aa2' : '#8fd6ff' }}>
                [{rec.identity.gameType ?? '?'}] {rec.identity.winAttemptId}
                {rec.hasViolation ? ' ⚠' : ''}
              </div>
              <div style={{ opacity: 0.7 }}>
                viewer={rec.identity.localViewerId?.slice(0, 8) ?? '?'} · role={rec.identity.localRole ?? '?'} ·
                winner={rec.identity.winnerPlayerId?.slice(0, 8) ?? '?'} · events={rec.events.length}
              </div>
              <div style={{ opacity: 0.85, marginTop: 2 }}>
                {rec.events.slice(-14).map((e, i) => (
                  <div key={i} style={{ color: e.violation ? '#ff9aa2' : undefined }}>
                    +{Math.round(e.perf)}ms {e.name}{e.violation ? ` [${e.violation}]` : ''} <span style={{ opacity: 0.6 }}>({e.source})</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
