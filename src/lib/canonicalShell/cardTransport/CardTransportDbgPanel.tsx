/**
 * CardTransportDbgPanel — collapsible audit pill for canonical card
 * transport. Gated by the 'cardTransportDbg' debug pill toggle.
 *
 * Per intent: identity, endpoints, resolved anchors, rects, geometry
 * deltas, timing wall-clocks (actualStart/Arrival/ownershipClaim/
 * destroyed), portal layer, mount/visible/settled/dropped, and the
 * lifecycle samples (launch / midflight / arrival / destroy) with full
 * computed-style snapshots so motion choppiness is attributable.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  clearCardTransportDbg,
  formatCardTransportDbgAsText,
  getCardTransportDbg,
  subscribeCardTransportDbg,
  type CardTransportDbgEntry,
} from './cardTransportDbg';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';

function statusColor(r: CardTransportDbgEntry): string {
  if (r.droppedReason) return '#ff7777';
  if (r.settled && r.transportDestroyedTime) return '#7CFC00';
  if (r.settled) return '#FFD580';
  if (r.transportMounted) return '#87CEFA';
  return '#aaaaaa';
}

function summarize(r: CardTransportDbgEntry): string {
  const status = r.droppedReason
    ? `DROPPED:${r.droppedReason}`
    : r.transportDestroyedTime ? 'destroyed'
    : r.settled ? 'settled'
    : r.transportMounted ? 'in-flight'
    : 'pending';
  const fromK = r.from?.kind ?? '?';
  const toK = r.to?.kind ?? '?';
  return `${fromK}→${toK} ${r.face ?? ''} [${status}]`;
}

export function CardTransportDbgPanel() {
  const inTray = useInDebugTray();
  const records = useSyncExternalStore(
    subscribeCardTransportDbg,
    getCardTransportDbg,
    getCardTransportDbg,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const enabled = useDebugPillEnabled('cardTransportDbg');
  if (!enabled) return null;

  const handleCopy = async () => {
    const txt = formatCardTransportDbgAsText();
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
    } catch {
      try { window.prompt('Copy card transport log:', txt); } catch { /* */ }
    }
  };

  const newest = [...records].reverse();
  const recent = newest[0];
  const toggleId = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div
      data-card-transport-dbg-panel=""
      style={{
        ...(inTray
          ? { position: 'relative' as const }
          : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(96vw, 720px)' : 'auto',
        maxWidth: expanded ? undefined : 360,
        background: 'rgba(0,0,0,0.88)',
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
          {expanded ? '▼' : '▶'} CARD TRANSPORT DBG ({records.length})
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
        <button type="button" onClick={() => clearCardTransportDbg()} title="Clear"
          style={{ background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          ✕
        </button>
      </div>
      {expanded ? (
        <div style={{ maxHeight: 480, overflow: 'auto', padding: '4px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {newest.length === 0 ? (
            <div style={{ opacity: 0.6 }}>(no card transport intents yet)</div>
          ) : (
            newest.map((r) => {
              const open = openIds.has(r.intentId);
              return (
                <div key={r.intentId} style={{ marginBottom: 6, borderTop: '1px dashed #333', paddingTop: 3 }}>
                  <button type="button" onClick={() => toggleId(r.intentId)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', color: '#fff', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
                    <span style={{ color: statusColor(r), fontWeight: 700 }}>{open ? '▼ ' : '▶ '}● </span>
                    <span style={{ opacity: 0.9 }}>{r.intentId}</span>
                    <span style={{ opacity: 0.7 }}> · {summarize(r)}</span>
                  </button>
                  {open ? (
                    <div style={{ paddingLeft: 10, marginTop: 2 }}>
                      <div style={{ opacity: 0.85 }}>cardId={r.cardId} face={r.face} handCtx={r.handContextId ?? '∅'}</div>
                      <div style={{ opacity: 0.85 }}>from={JSON.stringify(r.from)} → to={JSON.stringify(r.to)}</div>
                      <div style={{ opacity: 0.85 }}>resolvedFrom={r.resolvedFromAnchor ?? '?'} resolvedTo={r.resolvedToAnchor ?? '?'}</div>
                      <div style={{ opacity: 0.85 }}>fromRect={JSON.stringify(r.fromAnchorRect)}</div>
                      <div style={{ opacity: 0.85 }}>toRect={JSON.stringify(r.toAnchorRect)}</div>
                      <div style={{ opacity: 0.85 }}>dx={r.dx} dy={r.dy} dur={r.durationMs}ms delay={r.launchDelayMs}ms</div>
                      <div style={{ opacity: 0.85 }}>actualStart={r.actualStartTime?.toFixed?.(1)} actualArrival={r.actualArrivalTime?.toFixed?.(1)}</div>
                      <div style={{ opacity: 0.85 }}>ownershipClaim={r.ownershipClaimTime?.toFixed?.(1)} destroyed={r.transportDestroyedTime?.toFixed?.(1)}</div>
                      <div style={{ opacity: 0.85 }}>portal={r.portalLayer} mounted={String(r.transportMounted)} visible={String(r.transportVisible)}</div>
                      <div style={{ opacity: 0.85 }}>settled={String(r.settled)} dropped={r.droppedReason ?? '∅'}</div>
                      {(r.samples ?? []).map((s, i) => (
                        <div key={i} style={{ opacity: 0.85, marginTop: 2, borderLeft: '2px solid #444', paddingLeft: 4 }}>
                          <div><b>· {s.phase}</b> @ {s.t.toFixed?.(1)}</div>
                          <div>anim={s.animationName} state={s.animationPlayState} iter={s.animationIterationCount}</div>
                          <div>dur={s.animationDuration} delay={s.animationDelay} ease={s.animationTimingFunction}</div>
                          <div>trans={s.transitionProperty}/{s.transitionDuration}</div>
                          <div>xform={s.transform}</div>
                          <div>rect={JSON.stringify(s.rect)}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
