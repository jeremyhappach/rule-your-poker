/**
 * ShellLifecyclePanel — on-screen collapsible panel that visualizes
 * canonical shell surface mount/unmount, slot phase transitions,
 * readiness reports, and Gin readiness pipeline events.
 *
 * Toggle via ?shell_lc=1 or localStorage.setItem('ptp_shell_lc','1').
 * Defaults on in dev. Positioned top-right so it does not collide
 * with AnnouncementDebugPanel (bottom-right) or DebugModeIndicator.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  clearShellLifecycleEvents,
  formatShellLifecycleEventsAsText,
  getShellLifecycleEvents,
  isShellLifecycleDebugEnabled,
  subscribeShellLifecycle,
  type ShellLifecycleEvent,
} from './shellLifecycleLog';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import {
  ensureHarnessCacheLoaded,
  subscribeGlobalDebugMode,
} from '@/lib/debugHarness/runtimeCache';

const KIND_COLOR: Record<string, string> = {
  mount: '#90EE90',
  unmount: '#FF8C8C',
  'slot-phase': '#FFD580',
  'neutral-shown': '#FFB6C1',
  'neutral-hidden': '#9FE2BF',
  'readiness-probe-register': '#87CEFA',
  'readiness-probe-unregister': '#FFA07A',
  'readiness-report': '#7CFC00',
  'readiness-clear': '#FF6B6B',
  'gin-identity': '#DDA0DD',
  'gin-ready': '#FFD700',
  gating: '#F0E68C',
  fact: '#FFFACD',
};

type FilterMode = 'all' | 'mounts' | 'readiness' | 'slot' | 'gin';

function matchesFilter(e: ShellLifecycleEvent, mode: FilterMode, text: string): boolean {
  if (mode === 'mounts') {
    if (e.kind !== 'mount' && e.kind !== 'unmount') return false;
  } else if (mode === 'readiness') {
    if (
      e.kind !== 'readiness-probe-register' &&
      e.kind !== 'readiness-probe-unregister' &&
      e.kind !== 'readiness-report' &&
      e.kind !== 'readiness-clear' &&
      e.kind !== 'gin-ready' &&
      e.kind !== 'gin-identity'
    ) return false;
  } else if (mode === 'slot') {
    if (
      e.kind !== 'slot-phase' &&
      e.kind !== 'neutral-shown' &&
      e.kind !== 'neutral-hidden'
    ) return false;
  } else if (mode === 'gin') {
    const hay = `${e.summary} ${JSON.stringify(e.detail ?? {})}`.toLowerCase();
    if (!/gin/.test(hay) && e.kind !== 'gin-ready' && e.kind !== 'gin-identity') return false;
  }
  if (text.trim()) {
    const needle = text.trim().toLowerCase();
    const hay = `${e.kind} ${e.summary} ${JSON.stringify(e.detail ?? {})}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export function ShellLifecyclePanel() {
  const [, forceVisibilityCheck] = useState(0);
  const events = useSyncExternalStore(
    subscribeShellLifecycle,
    getShellLifecycleEvents,
    getShellLifecycleEvents,
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

  if (!isShellLifecycleDebugEnabled()) return null;

  const handleCopy = async () => {
    const txt = formatShellLifecycleEventsAsText();
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
    } catch {
      try { window.prompt('Copy shell lifecycle log:', txt); } catch { /* */ }
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
      data-shell-lifecycle-panel=""
      style={{
        position: 'fixed',
        left: 4,
        bottom: 4,
        zIndex: 2147483645,
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
          {expanded ? '▼' : '▶'} SHELL LC ({filtered.length}/{events.length})
          {!expanded && recent ? (
            <span style={{ fontWeight: 400, opacity: 0.8 }}>
              {' '}· {recent.kind} {recent.summary.slice(0, 26)}
              {recent.repeat > 1 ? ` ×${recent.repeat}` : ''}
            </span>
          ) : null}
        </button>
        <button type="button" onClick={handleCopy} title="Copy full log"
          style={{ background: '#222', color: copied ? '#7CFC00' : '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          {copied ? '✓' : '⧉'}
        </button>
        <button type="button" onClick={() => clearShellLifecycleEvents()} title="Clear log"
          style={{ background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          ✕
        </button>
      </div>
      {expanded ? (
        <>
          <div style={{ display: 'flex', gap: 4, padding: '4px 6px', borderBottom: '1px solid #222', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" style={chipStyle(filter === 'all')} onClick={() => setFilter('all')}>All</button>
            <button type="button" style={chipStyle(filter === 'mounts')} onClick={() => setFilter('mounts')}>Mounts</button>
            <button type="button" style={chipStyle(filter === 'slot')} onClick={() => setFilter('slot')}>Slot</button>
            <button type="button" style={chipStyle(filter === 'readiness')} onClick={() => setFilter('readiness')}>Readiness</button>
            <button type="button" style={chipStyle(filter === 'gin')} onClick={() => setFilter('gin')}>Gin</button>
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
