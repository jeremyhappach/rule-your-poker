/**
 * WartimeDebugPanel — single shell-owned debug surface for the
 * Wartime Debug Framework. Replaces the day-to-day role of the
 * Announcement Debug Panel and Startup Flight Recorder overlay
 * while keeping both codepaths intact behind feature flags.
 *
 * Positioned top-right at the highest possible z-index so it
 * cannot be obscured by any other overlay.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import {
  WARTIME_CATEGORIES,
  buildWartimeExportJson,
  buildWartimeExportText,
  clearWartimeEvents,
  formatWartimeEventsAsText,
  getWartimeEvents,
  getWartimeStats,
  isWartimeEnabled,
  startWartimeRecording,
  stopWartimeRecording,
  subscribeWartime,
  subscribeWartimeEnabled,
  type WartimeCategory,
} from './core';
import { attachWartimeBridges } from './bridges';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';


const ALL: 'ALL' = 'ALL';

export function WartimeDebugPanel() {
  const enabled = useSyncExternalStore(subscribeWartimeEnabled, isWartimeEnabled, isWartimeEnabled);
  const events = useSyncExternalStore(subscribeWartime, getWartimeEvents, getWartimeEvents);
  // Re-render on recording state changes by re-subscribing to the same event stream;
  // stats are pulled at render time.
  const stats = getWartimeStats();
  const [expanded, setExpanded] = useState(false);
  const inTray = useInDebugTray();

  const [category, setCategory] = useState<'ALL' | WartimeCategory>(ALL);
  const [filter, setFilter] = useState('');
  const [exportFilteredOnly, setExportFilteredOnly] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const [copied, setCopied] = useState(false);



  useEffect(() => {
    if (enabled) attachWartimeBridges();
  }, [enabled]);

  // Tick once per second while recording so duration updates live.
  const [, force] = useState(0);
  useEffect(() => {
    if (!stats.recording) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [stats.recording]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return events.filter((e) => {
      if (category !== ALL && e.category !== category) return false;
      if (!needle) return true;
      const hay = `${e.category} ${e.event} ${JSON.stringify(e.payload ?? {})}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [events, category, filter]);

  const text = useMemo(() => formatWartimeEventsAsText(filtered), [filtered]);

  const exportOpts = useMemo(
    () => ({
      includeFilteredOnly: exportFilteredOnly,
      filtered,
      activeFilters: {
        category: category === ALL ? null : category,
        text: filter.trim() || null,
      },
    }),
    [exportFilteredOnly, filtered, category, filter],
  );


  if (!enabled) return null;

  const durationMs = stats.startedAtMs
    ? (stats.stoppedAtMs ?? Date.now()) - stats.startedAtMs
    : 0;
  const durationStr = formatDuration(durationMs);
  const startedStr = stats.startedAtMs ? new Date(stats.startedAtMs).toLocaleTimeString() : '—';

  // When collapsed inside the tray, render only a compact pill (no fixed
  // positioning — the tray lays it out). When expanded, anchor to the
  // bottom-right and grow UPWARD so we never cover the shell header or
  // admin / dealer controls.
  const recState: 'OFF' | 'READY' | 'REC' = !stats.recording && stats.count === 0
    ? 'READY'
    : stats.recording
      ? 'REC'
      : 'READY';
  const pillLabel = stats.recording
    ? `⚔️ REC ${stats.count}`
    : stats.count > 0
      ? `⚔️ ${stats.count}`
      : `⚔️ ${recState}`;

  if (!expanded) {
    const pillStyle: CSSProperties = inTray
      ? { pointerEvents: 'auto', display: 'inline-block' }
      : {
          position: 'fixed',
          right: 8,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
          zIndex: 2147483647,
          pointerEvents: 'auto',
        };
    return (
      <div style={pillStyle}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Expand Wartime Debug"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: stats.recording ? '#7a1f1f' : 'hsl(var(--muted))',
            color: stats.recording ? '#fff' : 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 999,
            padding: '4px 8px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            whiteSpace: 'nowrap',
          }}
        >
          {pillLabel} ▴
        </button>
      </div>
    );
  }

  const shellStyle: CSSProperties = {
    position: 'fixed',
    right: 8,
    left: 8,
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
    width: 'auto',
    maxWidth: 'min(96vw, 560px)',
    marginLeft: 'auto',
    zIndex: 2147483647,
    maxHeight: '70dvh',
    display: 'grid',
    gridTemplateRows: 'auto auto auto minmax(0, 1fr)',
    borderRadius: 8,
    boxShadow: '0 12px 30px hsl(var(--foreground) / 0.28)',
    pointerEvents: 'auto',
  };


  return (
    <section
      data-wartime-debug-panel=""
      className="border border-border bg-background/95 text-foreground backdrop-blur-sm"
      style={shellStyle}
      aria-label="Wartime debug panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="text-xs font-semibold">
            {expanded ? '▼' : '▶'} WARTIME DEBUG{' '}
            <span style={{ color: stats.recording ? '#ff5252' : 'inherit' }}>
              {stats.recording ? '● REC' : '○ idle'}
            </span>{' '}
            ({stats.count}/{stats.maxEvents}
            {stats.dropped > 0 ? ` · ${stats.dropped} dropped` : ''})
          </div>
          {expanded ? (
            <div className="text-[10px] text-muted-foreground">
              started {startedStr} · {durationStr}
            </div>
          ) : null}
        </button>
        {expanded ? (
          <div className="flex shrink-0 items-center gap-1">
            {stats.recording ? (
              <button
                type="button"
                className="rounded border border-border bg-red-700/40 px-2 py-1 text-[10px] text-foreground"
                onClick={() => stopWartimeRecording('manual')}
              >
                STOP
              </button>
            ) : (
              <button
                type="button"
                className="rounded border border-border bg-emerald-700/40 px-2 py-1 text-[10px] text-foreground"
                onClick={() => startWartimeRecording()}
              >
                START
              </button>
            )}
            <button
              type="button"
              className="rounded border border-border bg-muted px-2 py-1 text-[10px]"
              onClick={() => clearWartimeEvents()}
            >
              Clear
            </button>
            <button
              type="button"
              className="rounded border border-border bg-muted px-2 py-1 text-[10px]"
              onClick={async () => {
                const payload = buildWartimeExportText(exportOpts);
                try {
                  await navigator.clipboard.writeText(payload);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  areaRef.current?.select();
                  document.execCommand('copy');
                }
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              className="rounded border border-border bg-muted px-2 py-1 text-[10px]"
              onClick={() => download(buildWartimeExportText(exportOpts), 'wartime', 'txt', 'text/plain')}
            >
              TXT
            </button>
            <button
              type="button"
              className="rounded border border-border bg-muted px-2 py-1 text-[10px]"
              onClick={() => download(buildWartimeExportJson(exportOpts), 'wartime', 'json', 'application/json')}
            >
              JSON
            </button>
            <label
              className="flex shrink-0 items-center gap-1 rounded border border-border bg-muted px-1.5 py-1 text-[9px]"
              title="When OFF, exports include the FULL retained ring buffer regardless of filter chips/text. When ON, exports only what the panel currently shows."
            >
              <input
                type="checkbox"
                checked={exportFilteredOnly}
                onChange={(e) => setExportFilteredOnly(e.target.checked)}
              />
              filtered only
            </label>
          </div>
        ) : null}
      </div>


      {expanded ? (
        <>
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
            <CategoryChip current={category} value={ALL} onSelect={setCategory} label="ALL" />
            {WARTIME_CATEGORIES.map((c) => (
              <CategoryChip key={c} current={category} value={c} onSelect={setCategory} label={c} />
            ))}
          </div>
          <div className="border-b border-border px-2 py-1">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter (event / payload substring)"
              className="w-full rounded border border-border bg-background px-2 py-1 text-[10px] outline-none"
            />
          </div>
          <textarea
            ref={areaRef}
            readOnly
            value={text || '(no events — press START and reproduce the issue)'}
            className="h-full min-h-[260px] w-full resize-none bg-background p-2 font-mono text-[10px] leading-snug text-foreground outline-none"
          />
        </>
      ) : null}
    </section>
  );
}

function CategoryChip({
  current,
  value,
  onSelect,
  label,
}: {
  current: 'ALL' | WartimeCategory;
  value: 'ALL' | WartimeCategory;
  onSelect: (v: 'ALL' | WartimeCategory) => void;
  label: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded border px-1.5 py-0.5 text-[9px] ${active ? 'border-foreground bg-foreground text-background' : 'border-border bg-muted text-foreground'}`}
    >
      {label}
    </button>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function download(content: string, prefix: string, ext: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper exported so the panel never crashes silently — used by App.tsx
// to additionally hide the legacy panels while wartime is enabled.
export { useWartimeEnabledForLegacyHide };

function useWartimeEnabledForLegacyHide(): boolean {
  return useSyncExternalStore(subscribeWartimeEnabled, isWartimeEnabled, isWartimeEnabled);
}
