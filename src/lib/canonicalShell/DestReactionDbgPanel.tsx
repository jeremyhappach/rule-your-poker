/**
 * DestReactionDbgPanel — collapsible audit pill for destination
 * reactions (Economy Wave 1). Gated by 'destReactionDbg' pill.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  clearDestReactionDbg,
  formatDestReactionDbgAsText,
  getDestReactionDbg,
  subscribeDestReactionDbg,
  type DestReactionDbgRecord,
} from './destReactionDbg';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';

function color(r: DestReactionDbgRecord): string {
  if (r.destinationReactionTargetFound === false) return '#ff7777';
  if (r.overriddenDuringReaction) return '#ff9966';
  if (r.reactionFinished) return '#7CFC00';
  if (r.reactionStarted) return '#FFD580';
  if (r.reactionMounted) return '#87CEFA';
  return '#aaa';
}

export function DestReactionDbgPanel() {
  const inTray = useInDebugTray();
  const records = useSyncExternalStore(
    subscribeDestReactionDbg,
    getDestReactionDbg,
    getDestReactionDbg,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const enabled = useDebugPillEnabled('destReactionDbg');
  if (!enabled) return null;

  const handleCopy = async () => {
    const txt = formatDestReactionDbgAsText();
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
    } catch {
      try { window.prompt('Copy dest reaction log:', txt); } catch { /* */ }
    }
  };

  const newest = [...records].reverse();
  const recent = newest[0];

  return (
    <div
      data-dest-reaction-dbg-panel=""
      style={{
        ...(inTray
          ? { position: 'relative' as const }
          : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(94vw, 600px)' : 'auto',
        maxWidth: expanded ? undefined : 380,
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
          {expanded ? '▼' : '▶'} DEST REACTION DBG ({records.length})
          {!expanded && recent ? (
            <span style={{ fontWeight: 400, opacity: 0.8 }}>
              {' '}· <span style={{ color: color(recent) }}>
                {recent.to} m={recent.reactionMounted ? '✓' : '✗'} s={recent.reactionStarted ? '✓' : '✗'} f={recent.reactionFinished ? '✓' : '✗'}
              </span>
            </span>
          ) : null}
        </button>
        <button type="button" onClick={handleCopy} title="Copy"
          style={{ background: '#222', color: copied ? '#7CFC00' : '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          {copied ? '✓' : '⧉'}
        </button>
        <button type="button" onClick={() => clearDestReactionDbg()} title="Clear"
          style={{ background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          ✕
        </button>
      </div>
      {expanded ? (
        <div style={{ maxHeight: 460, overflow: 'auto', padding: '4px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {newest.length === 0 ? (
            <div style={{ opacity: 0.6 }}>(no destination reactions yet)</div>
          ) : (
            newest.map((r) => {
              const time = new Date(r.ts).toISOString().substring(11, 23);
              return (
                <div key={r.intentId} style={{ marginBottom: 6, borderTop: '1px dashed #333', paddingTop: 3 }}>
                  <div>
                    <span style={{ opacity: 0.7 }}>{time} </span>
                    <span style={{ color: color(r), fontWeight: 700 }}>● </span>
                    <span style={{ opacity: 0.85 }}>{r.intentId} → {r.to}</span>
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    reaction={r.destinationReaction ? JSON.stringify(r.destinationReaction) : '∅'}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    selector={r.targetSelector ?? '?'} targetFound={String(r.destinationReactionTargetFound ?? '?')}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    mounted={String(r.reactionMounted ?? '?')} started={String(r.reactionStarted ?? '?')} finished={String(r.reactionFinished ?? '?')}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    animName={r.computedAnimationName ?? '?'} dur={r.computedAnimationDuration ?? '?'}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    tfBefore={(r.computedTransformBefore ?? '?').slice(0, 80)}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    tfDuring={(r.computedTransformDuring ?? '?').slice(0, 80)}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    tfAfter={(r.computedTransformAfter ?? '?').slice(0, 80)}
                  </div>
                  <div style={{ opacity: 0.85, color: r.overriddenDuringReaction ? '#ff9966' : undefined }}>
                    overridden={String(r.overriddenDuringReaction ?? '?')}
                  </div>
                  {r.targetElement ? (
                    <>
                      <div style={{ opacity: 0.8 }}>
                        el={r.targetElement.tagName}.{(r.targetElement.className || '').slice(0, 50)} dcc={r.targetElement.dataChipCenter ?? '∅'}
                      </div>
                      <div style={{ opacity: 0.8 }}>
                        rect={r.targetElement.rect ? `${r.targetElement.rect.x},${r.targetElement.rect.y} ${r.targetElement.rect.w}x${r.targetElement.rect.h}` : '∅'}
                        {' '}vis={r.targetElement.visibility} disp={r.targetElement.display} op={r.targetElement.opacity}
                      </div>
                      <div style={{ opacity: 0.75 }}>
                        parent={r.targetElement.parentTagName ?? '∅'} [{(r.targetElement.parentDataAttrs ?? '').slice(0, 80)}]
                      </div>
                    </>
                  ) : null}
                  {r.note ? <div style={{ opacity: 0.7 }}>{r.note}</div> : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
