/**
 * ChipTransportDbgPanel — collapsible audit pill for canonical chip
 * transport (Economy Wave 1). Gated by the 'chipTransportDbg' debug
 * pill toggle.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  clearChipTransportDbg,
  formatChipTransportDbgAsText,
  getChipTransportDbg,
  subscribeChipTransportDbg,
  type ChipTransportDbgRecord,
} from './chipTransportDbg';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';

function statusColor(r: ChipTransportDbgRecord): string {
  if (r.droppedReason) return '#ff7777';
  if (r.settled && r.destinationReactionApplied) return '#7CFC00';
  if (r.settled) return '#FFD580';
  return '#87CEFA';
}

function summarize(r: ChipTransportDbgRecord): string {
  const status = r.droppedReason
    ? `DROPPED:${r.droppedReason}`
    : r.settled
      ? (r.destinationReactionApplied ? 'settled+reacted' : 'settled')
      : 'in-flight';
  return `${r.from}→${r.to} ${r.variant} [${status}]`;
}

export function ChipTransportDbgPanel() {
  const inTray = useInDebugTray();
  const records = useSyncExternalStore(
    subscribeChipTransportDbg,
    getChipTransportDbg,
    getChipTransportDbg,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const enabled = useDebugPillEnabled('chipTransportDbg');
  if (!enabled) return null;

  const handleCopy = async () => {
    const txt = formatChipTransportDbgAsText();
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
    } catch {
      try { window.prompt('Copy chip transport log:', txt); } catch { /* */ }
    }
  };

  const newest = [...records].reverse();
  const recent = newest[0];

  return (
    <div
      data-chip-transport-dbg-panel=""
      style={{
        ...(inTray
          ? { position: 'relative' as const }
          : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(94vw, 560px)' : 'auto',
        maxWidth: expanded ? undefined : 340,
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        border: '1px solid #444',
        borderRadius: 4,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10,
        lineHeight: 1.3,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderBottom: expanded ? '1px solid #333' : 'none' }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', color: '#fff', padding: 0, fontWeight: 700 }}
        >
          {expanded ? '▼' : '▶'} CHIP TRANSPORT DBG ({records.length})
          {!expanded && recent ? (
            <span style={{ fontWeight: 400, opacity: 0.8 }}>
              {' '}· <span style={{ color: statusColor(recent) }}>{summarize(recent).slice(0, 38)}</span>
            </span>
          ) : null}
        </button>
        <button type="button" onClick={handleCopy} title="Copy"
          style={{ background: '#222', color: copied ? '#7CFC00' : '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          {copied ? '✓' : '⧉'}
        </button>
        <button type="button" onClick={() => clearChipTransportDbg()} title="Clear"
          style={{ background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          ✕
        </button>
      </div>
      {expanded ? (
        <div style={{ maxHeight: 420, overflow: 'auto', padding: '4px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {newest.length === 0 ? (
            <div style={{ opacity: 0.6 }}>(no chip transport intents yet)</div>
          ) : (
            newest.map((r) => {
              const time = new Date(r.ts).toISOString().substring(11, 23);
              return (
                <div key={r.intentId} style={{ marginBottom: 6, borderTop: '1px dashed #333', paddingTop: 3 }}>
                  <div>
                    <span style={{ opacity: 0.7 }}>{time} </span>
                    <span style={{ color: statusColor(r), fontWeight: 700 }}>● </span>
                    <span style={{ opacity: 0.85 }}>{r.intentId}</span>
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    variant={r.variant} reason={r.reason} amt={r.amount}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    {r.from} → {r.to}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    fromFound={String(r.fromEndpointFound ?? '?')} toFound={String(r.toEndpointFound ?? '?')}
                    {' '}mounted={String(r.transportMounted ?? '?')} visible={String(r.transportVisible ?? '?')}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    settled={String(r.settled ?? '?')} dropped={r.droppedReason ?? '∅'}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    react={r.destinationReaction ? JSON.stringify(r.destinationReaction) : '∅'}
                    {' '}targetFound={String(r.destinationReactionTargetFound ?? '?')}
                    {' '}applied={String(r.destinationReactionApplied ?? '?')}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
