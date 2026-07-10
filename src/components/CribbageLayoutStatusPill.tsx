/**
 * CribbageLayoutStatusPill
 *
 * Minimal, collapsible, exportable status pill for diagnosing why the
 * active-hand fallback layout activates during Cribbage discard.
 *
 * - Small chip pinned to bottom-right of the parent container.
 * - Collapsed by default.
 * - Copy + Export TXT buttons (per debug-pill standard).
 * - Read-only. Does not affect gameplay or layout.
 */

import { useMemo, useRef, useState } from 'react';

export interface CribbageLayoutStatusFields {
  layoutWasFallback: boolean;
  layoutFallbackReason: string | null;
  layoutNormalAvailable: boolean;
  resolveActiveHandLayoutReturnReason: string;
  stageRefAttached: boolean;
  lastGetBoundingClientRect: { width: number; height: number } | null;
  resolvedStageRect: { width: number; height: number } | null;
  stageRectWidth: number | null;
  stageRectHeight: number | null;
  resizeObserverAttached: boolean;
  resizeObserverFireCount: number;
  didRemeasureAfterCardsArrived: boolean;
  didRemeasureAfterDealReady: boolean;
  fallbackFinalCardWidth: number | null;
  fallbackFinalCardHeight: number | null;
  fallbackOverlapRatio: number | null;
  visibleDomCardNodeCount: number;
}

interface Props {
  fields: CribbageLayoutStatusFields;
}

function serialize(fields: CribbageLayoutStatusFields): string {
  const lines: string[] = [];
  lines.push(`layoutWasFallback: ${fields.layoutWasFallback}`);
  lines.push(`layoutFallbackReason: ${fields.layoutFallbackReason ?? '(none)'}`);
  lines.push(`layoutNormalAvailable: ${fields.layoutNormalAvailable}`);
  lines.push(`resolveActiveHandLayoutReturnReason: ${fields.resolveActiveHandLayoutReturnReason}`);
  lines.push(`stageRefAttached: ${fields.stageRefAttached}`);
  const r = fields.lastGetBoundingClientRect;
  lines.push(`lastGetBoundingClientRect: ${r ? `${r.width.toFixed(2)} x ${r.height.toFixed(2)}` : 'null'}`);
  const s = fields.resolvedStageRect;
  lines.push(`resolvedStageRect: ${s ? `${s.width.toFixed(2)} x ${s.height.toFixed(2)}` : 'null'}`);
  lines.push(`stageRectWidth: ${fields.stageRectWidth ?? 'null'}`);
  lines.push(`stageRectHeight: ${fields.stageRectHeight ?? 'null'}`);
  lines.push(`resizeObserverAttached: ${fields.resizeObserverAttached}`);
  lines.push(`resizeObserverFireCount: ${fields.resizeObserverFireCount}`);
  lines.push(`didRemeasureAfterCardsArrived: ${fields.didRemeasureAfterCardsArrived}`);
  lines.push(`didRemeasureAfterDealReady: ${fields.didRemeasureAfterDealReady}`);
  lines.push(`fallbackFinalCardWidth: ${fields.fallbackFinalCardWidth ?? 'null'}`);
  lines.push(`fallbackFinalCardHeight: ${fields.fallbackFinalCardHeight ?? 'null'}`);
  lines.push(`fallbackOverlapRatio: ${fields.fallbackOverlapRatio ?? 'null'}`);
  lines.push(`visibleDomCardNodeCount: ${fields.visibleDomCardNodeCount}`);
  return lines.join('\n');
}

export const CribbageLayoutStatusPill = ({ fields }: Props) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  const text = useMemo(() => serialize(fields), [fields]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const handleExport = () => {
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cribbage-layout-status-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      ref={anchorRef}
      style={{
        position: 'absolute',
        bottom: 4,
        right: 4,
        zIndex: 60,
        pointerEvents: 'auto',
        fontSize: 10,
        lineHeight: 1.2,
      }}
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: '2px 6px',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.55)',
            color: fields.layoutWasFallback ? '#fbbf24' : '#a3e635',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          {fields.layoutWasFallback ? `FB:${fields.layoutFallbackReason ?? '?'}` : 'layout OK'}
        </button>
      ) : (
        <div
          style={{
            maxWidth: 260,
            maxHeight: 260,
            overflow: 'auto',
            padding: 6,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.85)',
            color: '#e5e7eb',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <button
              onClick={() => setOpen(false)}
              style={{ padding: '1px 5px', borderRadius: 4, background: '#374151', color: '#fff' }}
            >
              −
            </button>
            <button
              onClick={handleCopy}
              style={{ padding: '1px 5px', borderRadius: 4, background: '#1f2937', color: '#fff' }}
            >
              {copied ? 'copied' : 'copy'}
            </button>
            <button
              onClick={handleExport}
              style={{ padding: '1px 5px', borderRadius: 4, background: '#065f46', color: '#fff' }}
            >
              Export TXT
            </button>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{text}</pre>
        </div>
      )}
    </div>
  );
};
