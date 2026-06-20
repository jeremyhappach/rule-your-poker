/**
 * SettlementDbgPanel — collapsible on-screen panel + copy button for
 * the canonical settlement audit trail. Mirrors NormalizationDbgPanel
 * UX. Gated by the 'settlementDbg' debug pill toggle.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  clearSettlementDbg,
  formatSettlementDbgAsText,
  getSettlementDbgEntries,
  subscribeSettlementDbg,
  type SettlementDbgEntry,
} from './settlementDbg';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';

const KIND_COLOR: Record<string, string> = {
  submit: '#FFD580',
  shadow: '#87CEFA',
  phase: '#7CFC00',
  flag: '#C8A2C8',
};

function summarize(e: SettlementDbgEntry): string {
  if (e.kind === 'phase') return `phase ${e.fromPhase}→${e.toPhase}`;
  if (e.kind === 'flag') return `${e.flag}=${e.value}`;
  const i = e.intent!;
  return `${e.kind} hand#${i.handNumber} xf=${i.transfers.length} prelude=${i.prelude?.type ?? '∅'}`;
}

function fmtEndpoint(e: { kind: string; position?: number }): string {
  return e.kind === 'seat' ? `seat#${e.position}` : e.kind;
}

export function SettlementDbgPanel() {
  const inTray = useInDebugTray();
  const entries = useSyncExternalStore(
    subscribeSettlementDbg,
    getSettlementDbgEntries,
    getSettlementDbgEntries,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const pillEnabled = useDebugPillEnabled('settlementDbg');
  if (!pillEnabled) return null;

  const handleCopy = async () => {
    const txt = formatSettlementDbgAsText();
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
    } catch {
      try { window.prompt('Copy settlement log:', txt); } catch { /* */ }
    }
  };

  const newest = [...entries].reverse();
  const recent = newest[0];

  return (
    <div
      data-settlement-dbg-panel=""
      style={{
        ...(inTray
          ? { position: 'relative' as const }
          : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(94vw, 560px)' : 'auto',
        maxWidth: expanded ? undefined : 320,
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
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 6px',
          borderBottom: expanded ? '1px solid #333' : 'none',
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            flex: 1, textAlign: 'left', background: 'transparent', border: 'none',
            cursor: 'pointer', font: 'inherit', color: '#fff', padding: 0, fontWeight: 700,
          }}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▼' : '▶'} SETTLEMENT DBG ({entries.length})
          {!expanded && recent ? (
            <span style={{ fontWeight: 400, opacity: 0.8 }}>
              {' '}· {summarize(recent).slice(0, 34)}
              {summarize(recent).length > 34 ? '…' : ''}
            </span>
          ) : null}
        </button>
        <button type="button" onClick={handleCopy} title="Copy full log"
          style={{ background: '#222', color: copied ? '#7CFC00' : '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          {copied ? '✓' : '⧉'}
        </button>
        <button type="button" onClick={() => clearSettlementDbg()} title="Clear log"
          style={{ background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          ✕
        </button>
      </div>
      {expanded ? (
        <div style={{ maxHeight: 420, overflow: 'auto', padding: '4px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {newest.length === 0 ? (
            <div style={{ opacity: 0.6 }}>(no settlement events yet)</div>
          ) : (
            newest.map((e) => {
              const time = new Date(e.ts).toISOString().substring(11, 23);
              if (e.kind === 'phase') {
                return (
                  <div key={e.seq} style={{ marginBottom: 3 }}>
                    <span style={{ opacity: 0.7 }}>{time} </span>
                    <span style={{ color: KIND_COLOR.phase, fontWeight: 700 }}>PHASE </span>
                    <span>{e.fromPhase} → {e.toPhase}</span>
                    <span style={{ opacity: 0.6 }}> ({e.caller})</span>
                  </div>
                );
              }
              if (e.kind === 'flag') {
                return (
                  <div key={e.seq} style={{ marginBottom: 3 }}>
                    <span style={{ opacity: 0.7 }}>{time} </span>
                    <span style={{ color: KIND_COLOR.flag, fontWeight: 700 }}>FLAG </span>
                    <span>{e.flag}={String(e.value)}</span>
                    <span style={{ opacity: 0.6 }}> ({e.caller})</span>
                  </div>
                );
              }
              const i = e.intent!;
              return (
                <div key={e.seq} style={{ marginBottom: 5, borderTop: '1px dashed #333', paddingTop: 2 }}>
                  <div>
                    <span style={{ opacity: 0.7 }}>{time} </span>
                    <span style={{ color: KIND_COLOR[e.kind], fontWeight: 700 }}>
                      {e.kind.toUpperCase()}{' '}
                    </span>
                    <span>{e.caller}</span>
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    game={i.gameId.slice(0, 8)} hand={i.handNumber} prelude={i.prelude?.type ?? '∅'}
                  </div>
                  {i.transfers.map((t, idx) => (
                    <div key={idx} style={{ opacity: 0.85 }}>
                      xf{idx}: {fmtEndpoint(t.from)}→{fmtEndpoint(t.to)} amt={t.amount}
                      {' '}var={t.variant ?? 'default'}
                      {' '}react={t.destinationReaction ? JSON.stringify(t.destinationReaction) : '∅'}
                    </div>
                  ))}
                  <div style={{ opacity: 0.85 }}>
                    celeb winners={i.celebration.winners.length} confetti={String(!!i.celebration.confetti)}
                    {' '}spotlight={String(!!i.celebration.spotlight)} minMs={i.celebration.minDurationMs ?? '∅'}
                  </div>
                  <div style={{ opacity: 0.75 }}>
                    ann: "{i.celebration.announcement}"
                  </div>
                  {e.note ? <div style={{ opacity: 0.7 }}>note: {e.note}</div> : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
