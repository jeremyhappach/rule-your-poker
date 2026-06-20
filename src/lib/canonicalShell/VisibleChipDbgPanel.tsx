/**
 * VisibleChipDbgPanel — collapsible audit pill for the visible-chip
 * inventory (`[data-chip-reaction-target]`) at chip transport
 * dispatch + arrival. Gated by 'visibleChipDbg' pill.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  clearVisibleChipDbg,
  formatVisibleChipDbgAsText,
  getVisibleChipDbg,
  subscribeVisibleChipDbg,
  type VisibleChipDbgRecord,
} from './visibleChipDbg';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';

function color(r: VisibleChipDbgRecord): string {
  if (!r.winnerClusterPresent) return '#ff7777';
  if (!r.visibleWinnerChipFound) return '#ff9966';
  if (r.canonicalChipDiscRenderPath) return '#7CFC00';
  if (r.hudRenderPath) return '#87CEFA';
  return '#FFD580';
}

export function VisibleChipDbgPanel() {
  const inTray = useInDebugTray();
  const records = useSyncExternalStore(
    subscribeVisibleChipDbg,
    getVisibleChipDbg,
    getVisibleChipDbg,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const enabled = useDebugPillEnabled('visibleChipDbg');
  if (!enabled) return null;

  const handleCopy = async () => {
    const txt = formatVisibleChipDbgAsText();
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
    } catch {
      try { window.prompt('Copy visible chip log:', txt); } catch { /* */ }
    }
  };

  const newest = [...records].reverse();
  const recent = newest[0];

  return (
    <div
      data-visible-chip-dbg-panel=""
      style={{
        ...(inTray
          ? { position: 'relative' as const }
          : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(94vw, 640px)' : 'auto',
        maxWidth: expanded ? undefined : 400,
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
          {expanded ? '▼' : '▶'} VISIBLE CHIP DBG ({records.length})
          {!expanded && recent ? (
            <span style={{ fontWeight: 400, opacity: 0.8 }}>
              {' '}· <span style={{ color: color(recent) }}>
                {recent.site} ws={recent.winnerSeat} c={recent.reactionTargetCount} vis={recent.visibleWinnerChipFound ? '✓' : '✗'} clu={recent.winnerClusterPresent ? '✓' : '✗'}
              </span>
            </span>
          ) : null}
        </button>
        <button type="button" onClick={handleCopy} title="Copy"
          style={{ background: '#222', color: copied ? '#7CFC00' : '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          {copied ? '✓' : '⧉'}
        </button>
        <button type="button" onClick={() => clearVisibleChipDbg()} title="Clear"
          style={{ background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          ✕
        </button>
      </div>
      {expanded ? (
        <div style={{ maxHeight: 500, overflow: 'auto', padding: '4px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {newest.length === 0 ? (
            <div style={{ opacity: 0.6 }}>(no scans yet)</div>
          ) : (
            newest.map((r, i) => {
              const time = new Date(r.ts).toISOString().substring(11, 23);
              return (
                <div key={`${r.intentId}-${r.site}-${i}-${r.ts}`} style={{ marginBottom: 8, borderTop: '1px dashed #333', paddingTop: 3 }}>
                  <div>
                    <span style={{ opacity: 0.7 }}>{time} </span>
                    <span style={{ color: color(r), fontWeight: 700 }}>● </span>
                    <span style={{ opacity: 0.85 }}>{r.site} {r.intentId} winnerSeat={r.winnerSeat ?? '∅'}{r.winnerPlayerId ? ` pid=${r.winnerPlayerId.slice(0, 6)}` : ''}</span>
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    sel={r.reactionTargetSelector} count={r.reactionTargetCount} centers={r.chipCenterCount}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    visibleFound={String(r.visibleWinnerChipFound)} rect={r.visibleWinnerChipRect ? `${r.visibleWinnerChipRect.x},${r.visibleWinnerChipRect.y} ${r.visibleWinnerChipRect.w}x${r.visibleWinnerChipRect.h}` : '∅'}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    owner={r.visibleWinnerChipOwner ?? '∅'}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    paths: canonical={String(r.canonicalChipDiscRenderPath)} hud={String(r.hudRenderPath)} self={String(r.selfRenderPath)}
                  </div>
                  <div style={{ opacity: 0.85, color: r.winnerClusterPresent ? undefined : '#ff7777' }}>
                    cluster={String(r.winnerClusterPresent)}{r.winnerClusterMissingReason ? ` — ${r.winnerClusterMissingReason}` : ''}
                  </div>
                  {r.reactionTargets.length === 0 ? (
                    <div style={{ opacity: 0.7, color: '#ff9966' }}>  (no reaction targets matched)</div>
                  ) : (
                    r.reactionTargets.map((n) => (
                      <div key={n.index} style={{ marginTop: 2, paddingLeft: 8, borderLeft: '1px solid #333' }}>
                        <div style={{ opacity: 0.85 }}>
                          [{n.index}] pos={n.position} {n.tagName}.{(n.className || '').slice(0, 40)} conn={String(n.isConnected)}
                        </div>
                        <div style={{ opacity: 0.8 }}>
                          rect={n.rect ? `${n.rect.x},${n.rect.y} ${n.rect.w}x${n.rect.h}` : '∅'} vis={n.visibility} disp={n.display} op={n.opacity}
                        </div>
                        <div style={{ opacity: 0.75 }}>tf={(n.transform || '').slice(0, 60)}</div>
                        <div style={{ opacity: 0.75 }}>owner={n.ownerHint ?? '∅'}</div>
                        <div style={{ opacity: 0.7 }}>parents={n.parentChain.join(' < ').slice(0, 200)}</div>
                      </div>
                    ))
                  )}
                  {r.chipCenters.length > 0 ? (
                    <div style={{ marginTop: 3, opacity: 0.75 }}>
                      centers: {r.chipCenters.map((c) => `${c.position}@${c.rect ? `${c.rect.x},${c.rect.y}` : '∅'}`).join(' | ')}
                    </div>
                  ) : null}
                  {r.note ? <div style={{ opacity: 0.7 }}>note={r.note}</div> : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
