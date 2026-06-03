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

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  clearAnnouncementDebugEvents,
  formatAnnouncementDebugEventsAsText,
  getAnnouncementDebugEvents,
  isAnnouncementDebugEnabled,
  subscribeAnnouncementDebug,
} from './announcementDebugLog';

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

export function AnnouncementDebugPanel() {
  if (!isAnnouncementDebugEnabled()) return null;

  const events = useSyncExternalStore(
    subscribeAnnouncementDebug,
    getAnnouncementDebugEvents,
    getAnnouncementDebugEvents,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const handleCopy = async () => {
    const text = formatAnnouncementDebugEventsAsText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      try {
        window.prompt('Copy announcement debug log:', text);
      } catch {
        /* */
      }
    }
  };

  const newest = [...events].reverse();
  const recent = newest[0];

  return (
    <div
      data-announcement-debug-panel=""
      style={{
        position: 'fixed',
        right: 4,
        bottom: 4,
        zIndex: 2147483646,
        maxWidth: expanded ? 420 : 260,
        background: 'rgba(0,0,0,0.82)',
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
            flex: 1,
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            font: 'inherit',
            color: '#fff',
            padding: 0,
            fontWeight: 700,
          }}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▼' : '▶'} ANN ({events.length})
          {!expanded && recent ? (
            <span style={{ fontWeight: 400, opacity: 0.8 }}>
              {' '}· {recent.kind} {recent.summary.slice(0, 28)}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy full log"
          style={{
            background: '#222',
            color: copied ? '#7CFC00' : '#fff',
            border: '1px solid #555',
            borderRadius: 3,
            padding: '1px 6px',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          {copied ? '✓' : '⧉'}
        </button>
        <button
          type="button"
          onClick={() => clearAnnouncementDebugEvents()}
          title="Clear log"
          style={{
            background: '#222',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: 3,
            padding: '1px 6px',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          ✕
        </button>
      </div>
      {expanded ? (
        <div
          style={{
            maxHeight: 320,
            overflow: 'auto',
            padding: '4px 6px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {newest.length === 0 ? (
            <div style={{ opacity: 0.6 }}>(no events yet)</div>
          ) : (
            newest.map((e) => (
              <div key={e.seq} style={{ marginBottom: 2 }}>
                <span style={{ opacity: 0.7 }}>+{e.tMs}ms </span>
                <span style={{ color: KIND_COLOR[e.kind] ?? '#fff', fontWeight: 700 }}>
                  {e.kind}
                </span>{' '}
                <span>{e.summary}</span>
                {e.detail ? (
                  <span style={{ opacity: 0.7 }}> {JSON.stringify(e.detail)}</span>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
