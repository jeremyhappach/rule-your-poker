/**
 * FELT DEBUG PILL — on-screen visibility of felt-plate commitment decisions.
 *
 * Collapsed: a small "FELT" pill in the corner showing the current phase.
 * Expanded: scrollable panel of the last 20 transitions with timestamps,
 * plus a Copy button so screenshots/clipboard prove regressions instead
 * of inferring from console traces.
 *
 * Gated by Global Debug Mode (same gate as harnesses).
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useHideDebugUI } from '@/lib/debugUIVisibility';
import {
  getFeltDebugEntries,
  subscribeFeltDebug,
  type FeltDebugEntry,
} from './feltDebugStore';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function entryToText(e: FeltDebugEntry): string {
  const lines = [fmtTime(e.ts), ''];

  lines.push(`phase: ${e.phase}`);
  lines.push(`status: ${e.status}`);
  lines.push(`committedDealerGameReason: ${e.committedDealerGameReason}`);
  lines.push('');
  lines.push(`isSessionWaitingTable: ${e.isSessionWaitingTable}`);
  lines.push(`hasCommittedDealerGame: ${e.hasCommittedDealerGame}`);
  lines.push(`hasRoundContext: ${e.hasRoundContext}`);
  lines.push('');
  lines.push(`selectedDealerGame: ${e.selectedDealerGame ?? 'none'}`);
  lines.push(`selectedStakes: ${e.selectedStakes ?? 'none'}`);
  lines.push('');
  lines.push(`displayPlate: ${e.displayPlate}`);
  lines.push(`displayGame: ${e.displayGame}`);
  lines.push(`displayStakes: ${e.displayStakes}`);
  lines.push('');
  lines.push(`gameSource: ${e.gameSource}`);
  lines.push(`stakesSource: ${e.stakesSource}`);
  lines.push('');
  lines.push(`legacyIsWaitingPhase: ${e.legacyIsWaitingPhase}`);
  lines.push(`legacyCanInfluenceFeltPlate: ${e.legacyCanInfluenceFeltPlate}`);
  lines.push(`fallbackReason: ${e.fallbackReason}`);
  lines.push('');
  lines.push('FELT RENDER TRACE');
  lines.push(`publisher: ${e.publisher ?? 'none'}`);
  lines.push(`publisherTable: ${e.publisherTable ?? 'none'}`);
  lines.push(`renderedPlate: ${e.renderedPlate ?? 'none'}`);
  lines.push(`renderedGame: ${e.renderedGame ?? 'none'}`);
  lines.push(`renderedStakes: ${e.renderedStakes ?? 'none'}`);
  lines.push(`renderSource: ${e.renderSource ?? 'none'}`);
  lines.push(`renderFrame: ${e.renderFrame ?? 'none'}`);
  lines.push(`publishedGame: ${e.publishedGame ?? 'none'}`);
  lines.push(`publishedStakes: ${e.publishedStakes ?? 'none'}`);
  lines.push(`publishedPlate: ${e.publishedPlate ?? 'none'}`);
  lines.push(`stickyGame: ${e.stickyGame ?? 'none'}`);
  lines.push(`stickyStakes: ${e.stickyStakes ?? 'none'}`);
  lines.push(`stickyPlate: ${e.stickyPlate ?? 'none'}`);

  return lines.join('\n');
}

export function FeltDebugPill() {
  const hidden = useHideDebugUI();
  const entries = useSyncExternalStore(
    subscribeFeltDebug,
    getFeltDebugEntries,
    getFeltDebugEntries,
  );
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  if (hidden) return null;

  const latest = entries[entries.length - 1];

  const copyAll = async () => {
    const text = entries.map(entryToText).join('\n\n────────────\n\n');
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      data-felt-debug-pill=""
      style={{
        position: 'fixed',
        right: 8,
        top: 8,
        zIndex: 99999,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        color: '#fff',
        pointerEvents: 'auto',
      }}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: 'rgba(0,0,0,0.75)',
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: 999,
            padding: '4px 8px',
            color: '#fff',
            fontSize: 10,
            lineHeight: 1.2,
          }}
        >
          FELT · {latest ? (latest.renderedPlate ?? latest.displayPlate) : '—'} · {latest?.status ?? latest?.renderSource ?? 'idle'}
        </button>
      ) : (
        <div
          style={{
            width: 280,
            maxHeight: '60vh',
            background: 'rgba(0,0,0,0.88)',
            border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderBottom: '1px solid rgba(255,255,255,0.2)',
              gap: 6,
            }}
          >
            <strong style={{ fontSize: 11 }}>FELT DEBUG</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={copyAll}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 4,
                  padding: '2px 6px',
                  color: '#fff',
                  fontSize: 10,
                }}
              >
                {copied ? 'COPIED' : 'COPY'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 4,
                  padding: '2px 6px',
                  color: '#fff',
                  fontSize: 10,
                }}
              >
                ✕
              </button>
            </div>
          </div>
          <div style={{ overflowY: 'auto', padding: '6px 8px' }}>
            {entries.length === 0 && (
              <div style={{ opacity: 0.6 }}>No transitions yet.</div>
            )}
            {entries
              .slice()
              .reverse()
              .map((e, i) => (
                <pre
                  key={`${e.ts}-${i}`}
                  style={{
                    whiteSpace: 'pre-wrap',
                    margin: 0,
                    padding: '6px 0',
                    borderTop: i === 0 ? 'none' : '1px dashed rgba(255,255,255,0.15)',
                    fontSize: 10,
                    lineHeight: 1.3,
                  }}
                >
                  {entryToText(e)}
                </pre>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
