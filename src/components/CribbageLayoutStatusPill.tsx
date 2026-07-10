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

  // Position:fixed to the viewport so ancestor `overflow:hidden` (tab
  // rails, felt clip, action strip) cannot clip the header/controls.
  // Collapsed pill is a tiny chip pinned to top-right; expanded panel
  // opens downward from the same anchor with a sticky header so
  // Copy / Export TXT / collapse are always reachable.
  return (
    <div
      ref={anchorRef}
      style={{
        position: 'fixed',
        top: 6,
        right: 6,
        zIndex: 2147483000,
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
            background: 'rgba(0,0,0,0.65)',
            color: fields.layoutWasFallback ? '#fbbf24' : '#a3e635',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          {fields.layoutWasFallback ? `FB:${fields.layoutFallbackReason ?? '?'}` : 'layout OK'}
        </button>
      ) : (
        <div
          style={{
            width: 280,
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.9)',
            color: '#e5e7eb',
            border: '1px solid rgba(255,255,255,0.25)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: 6,
              borderBottom: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.95)',
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
            }}
          >
            <span style={{ flex: 1, fontWeight: 600, color: fields.layoutWasFallback ? '#fbbf24' : '#a3e635' }}>
              Cribbage Layout {fields.layoutWasFallback ? `FB:${fields.layoutFallbackReason ?? '?'}` : 'OK'}
            </span>
            <button
              onClick={handleCopy}
              style={{ padding: '2px 6px', borderRadius: 4, background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              {copied ? 'copied' : 'Copy'}
            </button>
            <button
              onClick={handleExport}
              style={{ padding: '2px 6px', borderRadius: 4, background: '#065f46', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              Export TXT
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="collapse"
              style={{ padding: '2px 6px', borderRadius: 4, background: '#374151', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              −
            </button>
          </div>
          <div style={{ padding: 6, overflow: 'auto' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{text}</pre>
          </div>
        </div>
      )}
    </div>
  );
};
