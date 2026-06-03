/**
 * AnnouncementDebugPanel — small collapsible debug panel for the
 * announcement lifecycle investigation. Bottom-right, monospace,
 * newest event on top, copy-to-clipboard.
 *
 * Visibility gated by isAnnouncementDebugEnabled() — defaults on in
 * dev, off in prod. Toggle in prod via:
 *   localStorage.setItem('ptp_ann_debug', '1')
 *   ?ann_debug=1
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  clearAnnouncementDebugEvents,
  formatAnnouncementDebugEventsAsText,
  getAnnouncementDebugEvents,
  isAnnouncementDebugEnabled,
  subscribeAnnouncementDebug,
  type AnnouncementDebugEvent,
} from './announcementDebugLog';
import {
  ensureHarnessCacheLoaded,
  subscribeGlobalDebugMode,
} from '@/lib/debugHarness/runtimeCache';

const KIND_COLOR: Record<string, string> = {
  emit: '#7CFC00',
  dismiss: '#FFA07A',
  'clearAmbient': '#FFB6C1',
  'clearScope': '#FF6B6B',
  'active-change': '#87CEFA',
  'ambient-change': '#DDA0DD',
  'transient-change': '#FFD580',
  'rail-active-change': '#FFD700',
  'rail-event-flag-change': '#F0E68C',
  'layer-mount': '#90EE90',
  'layer-unmount': '#FF8C8C',
  'scope-change': '#9FE2BF',
  'scope-teardown': '#FF6B6B',
};

type FilterMode = 'all' | 'wins' | 'transitions';

function matchesFilter(e: AnnouncementDebugEvent, mode: FilterMode, text: string): boolean {
  if (mode === 'wins') {
    const hay = `${e.summary} ${JSON.stringify(e.detail ?? {})}`.toLowerCase();
    if (!/match_win|round_win|chip_award/.test(hay)) return false;
  } else if (mode === 'transitions') {
    if (
      e.kind !== 'active-change' &&
      e.kind !== 'ambient-change' &&
      e.kind !== 'transient-change' &&
      e.kind !== 'rail-active-change' &&
      e.kind !== 'rail-event-flag-change' &&
      e.kind !== 'layer-mount' &&
      e.kind !== 'layer-unmount' &&
      e.kind !== 'scope-change' &&
      e.kind !== 'scope-teardown' &&
      e.kind !== 'emit-dropped' &&
      e.kind !== 'emit-ambient-replace' &&
      e.kind !== 'emit-transient-preempt' &&
      e.kind !== 'emit-transient-set-active' &&
      e.kind !== 'emit-transient-enqueued' &&
      e.kind !== 'transient-promoted' &&
      e.kind !== 'transient-ttl-expired'
    ) return false;
  }
  if (text.trim()) {
    const needle = text.trim().toLowerCase();
    const hay = `${e.kind} ${e.summary} ${JSON.stringify(e.detail ?? {})}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export function AnnouncementDebugPanel() {
  const [, forceVisibilityCheck] = useState(0);
  const events = useSyncExternalStore(
    subscribeAnnouncementDebug,
    getAnnouncementDebugEvents,
    getAnnouncementDebugEvents,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [text, setText] = useState('');

  useEffect(() => {
    void ensureHarnessCacheLoaded().finally(() => forceVisibilityCheck((n) => n + 1));
    return subscribeGlobalDebugMode(() => forceVisibilityCheck((n) => n + 1));
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const filtered = useMemo(
    () => events.filter((e) => matchesFilter(e, filter, text)),
    [events, filter, text],
  );

  if (!isAnnouncementDebugEnabled()) return null;

  const handleCopy = async () => {
    const text = formatAnnouncementDebugEventsAsText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      try { window.prompt('Copy announcement debug log:', text); } catch { /* */ }
    }
  };

  const newest = [...filtered].reverse();
  const recent = newest[0];

  const chipStyle = (active: boolean): React.CSSProperties => ({
    background: active ? '#3a3a3a' : 'transparent',
    color: active ? '#fff' : '#bbb',
    border: '1px solid #555',
    borderRadius: 3,
    padding: '1px 5px',
    cursor: 'pointer',
    font: 'inherit',
  });

  return (
    <div
      data-announcement-debug-panel=""
      style={{
        position: 'fixed',
        right: 4,
        bottom: 4,
        zIndex: 2147483646,
        width: expanded ? 'min(94vw, 460px)' : 'min(78vw, 280px)',
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
          display: 'flex',
          alignItems: 'center',
          gap: 4,
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
          {expanded ? '▼' : '▶'} ANN DEBUG ({filtered.length}/{events.length})
          {!expanded && recent ? (
            <span style={{ fontWeight: 400, opacity: 0.8 }}>
              {' '}· {recent.kind} {recent.summary.slice(0, 28)}
              {recent.repeat > 1 ? ` ×${recent.repeat}` : ''}
            </span>
          ) : null}
        </button>
        <button type="button" onClick={handleCopy} title="Copy full log"
          style={{ background: '#222', color: copied ? '#7CFC00' : '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          {copied ? '✓' : '⧉'}
        </button>
        <button type="button" onClick={() => clearAnnouncementDebugEvents()} title="Clear log"
          style={{ background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          ✕
        </button>
      </div>
      {expanded ? (
        <>
          <div style={{ display: 'flex', gap: 4, padding: '4px 6px', borderBottom: '1px solid #222', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" style={chipStyle(filter === 'all')} onClick={() => setFilter('all')}>All</button>
            <button type="button" style={chipStyle(filter === 'wins')} onClick={() => setFilter('wins')}>Wins</button>
            <button type="button" style={chipStyle(filter === 'transitions')} onClick={() => setFilter('transitions')}>Transitions</button>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="filter…"
              style={{
                flex: 1, minWidth: 60, background: '#111', color: '#fff',
                border: '1px solid #444', borderRadius: 3, padding: '1px 4px',
                font: 'inherit', outline: 'none',
              }}
            />
          </div>
          <div style={{ maxHeight: 360, overflow: 'auto', padding: '4px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {newest.length === 0 ? (
              <div style={{ opacity: 0.6 }}>(no events match)</div>
            ) : (
              newest.map((e) => (
                <div key={e.seq} style={{ marginBottom: 2 }}>
                  <span style={{ opacity: 0.7 }}>+{e.tMs}ms </span>
                  <span style={{ color: KIND_COLOR[e.kind] ?? '#fff', fontWeight: 700 }}>{e.kind}</span>{' '}
                  <span>{e.summary}</span>
                  {e.repeat > 1 ? (
                    <span style={{ color: '#FFD700', fontWeight: 700 }}>
                      {' '}×{e.repeat}
                      <span style={{ opacity: 0.6, fontWeight: 400 }}> (last +{e.tLastMs}ms)</span>
                    </span>
                  ) : null}
                  {e.detail ? (
                    <span style={{ opacity: 0.7 }}> {JSON.stringify(e.detail)}</span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
