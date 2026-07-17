import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { BUILD_META } from '@/lib/buildMeta';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';


export type StartupFlightCategory =
  | 'PHASE TIMELINE'
  | 'STATUS TIMELINE'
  | 'ROUND TIMELINE'
  | 'IDENTITY TIMELINE'
  | 'REALTIME TIMELINE'
  | 'FETCH TIMELINE'
  | 'SYNC TIMELINE'
  | 'PLACEHOLDER TIMELINE'
  | 'READINESS TIMELINE'
  | 'MOUNT TIMELINE'
  | 'EFFECT TIMELINE'
  | 'WRITE TIMELINE'
  | 'RENDER TIMELINE';

type Jsonish = string | number | boolean | null | undefined | Jsonish[] | { [key: string]: Jsonish };

export interface StartupFlightEvent {
  seq: number;
  category: StartupFlightCategory;
  event: string;
  wallTime: string;
  epochMs: number;
  perfMs: number;
  deltaMs: number | null;
  oldValue?: Jsonish;
  newValue?: Jsonish;
  payload?: Record<string, Jsonish>;
}

const MAX_EVENTS = 2500;
const listeners = new Set<() => void>();
let events: StartupFlightEvent[] = [];
let seq = 0;
let lastPerfMs: number | null = null;
let copiedAt: number | null = null;
const valueCache = new Map<string, Jsonish>();

function nowPerf(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function emit() {
  events = events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : [...events];
  for (const listener of listeners) listener();
}

function stableJson(value: unknown): string {
  try {
    return JSON.stringify(value, Object.keys(value as object).sort());
  } catch {
    return String(value);
  }
}

function normalize(value: unknown, depth = 0): Jsonish {
  if (value === undefined || value === null) return value as null | undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 3) return '[depth-limit]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => normalize(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, Jsonish> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      out[k] = normalize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function recordStartupFlight(
  category: StartupFlightCategory,
  event: string,
  payload: Record<string, unknown> = {},
) {
  const perfMs = Math.round(nowPerf());
  const deltaMs = lastPerfMs == null ? null : perfMs - lastPerfMs;
  lastPerfMs = perfMs;
  const normalized = normalize(payload) as Record<string, Jsonish>;
  const oldValue = normalized.oldValue;
  const newValue = normalized.newValue;
  delete normalized.oldValue;
  delete normalized.newValue;
  events.push({
    seq: ++seq,
    category,
    event,
    wallTime: new Date().toISOString(),
    epochMs: Date.now(),
    perfMs,
    deltaMs,
    oldValue,
    newValue,
    payload: normalized,
  });
  emit();
}

export function recordStartupValue(
  category: StartupFlightCategory,
  label: string,
  nextValue: unknown,
  payload: Record<string, unknown> = {},
) {
  const key = `${category}:${label}`;
  const next = normalize(nextValue);
  const prev = valueCache.get(key);
  if (prev !== undefined && stableJson(prev) === stableJson(next)) return;
  valueCache.set(key, next);
  recordStartupFlight(category, label, {
    ...payload,
    oldValue: prev,
    newValue: next,
  });
}

export function resetStartupFlight(reason = 'manual reset') {
  events = [];
  seq = 0;
  lastPerfMs = null;
  copiedAt = null;
  valueCache.clear();
  recordStartupFlight('PHASE TIMELINE', 'flight-recorder reset', { reason });
}

export function getStartupFlightEvents() {
  return events;
}

export function formatStartupFlightText(snapshot = events): string {
  return snapshot.map((e) => {
    const delta = e.deltaMs == null ? 'Δ----' : `Δ${String(e.deltaMs).padStart(4, ' ')}ms`;
    const oldNew = e.oldValue !== undefined || e.newValue !== undefined
      ? ` | ${JSON.stringify(e.oldValue ?? null)} → ${JSON.stringify(e.newValue ?? null)}`
      : '';
    const payload = e.payload && Object.keys(e.payload).length > 0 ? ` | ${JSON.stringify(e.payload)}` : '';
    return `${String(e.seq).padStart(4, '0')} ${e.wallTime} +${String(e.perfMs).padStart(7, ' ')}ms ${delta} [${e.category}] ${e.event}${oldNew}${payload}`;
  }).join('\n');
}

export function subscribeStartupFlight(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStartupFlightSnapshot() {
  return events;
}

export function useStartupRenderTrace(
  component: string,
  inputs: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  const renderCountRef = useRef(0);
  const prevRef = useRef<Record<string, Jsonish> | null>(null);
  renderCountRef.current += 1;
  const normalizedInputs = useMemo(() => normalize(inputs) as Record<string, Jsonish>, [stableJson(inputs)]);
  useEffect(() => {
    const prev = prevRef.current;
    const changed: Record<string, Jsonish> = {};
    for (const [key, value] of Object.entries(normalizedInputs)) {
      if (!prev || stableJson(prev[key]) !== stableJson(value)) changed[key] = value;
    }
    if (!prev || Object.keys(changed).length > 0) {
      recordStartupFlight('RENDER TIMELINE', `${component} render`, {
        component,
        renderCount: renderCountRef.current,
        changedInputs: changed,
        ...extra,
      });
    }
    prevRef.current = normalizedInputs;
  });
}

export function useStartupMountTrace(
  component: string,
  payload: Record<string, unknown> = {},
) {
  useEffect(() => {
    recordStartupFlight('MOUNT TIMELINE', `${component} mount`, { component, ...payload });
    return () => recordStartupFlight('MOUNT TIMELINE', `${component} unmount`, { component, ...payload });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function StartupFlightRecorderOverlay() {
  const snapshot = useSyncExternalStore(subscribeStartupFlight, getStartupFlightSnapshot, getStartupFlightSnapshot);
  const text = useMemo(() => formatStartupFlightText(snapshot), [snapshot]);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inTray = useInDebugTray();

  useEffect(() => {
    recordStartupFlight('PHASE TIMELINE', '[AUDIT] Flight recorder initialized', {
      maxEvents: MAX_EVENTS,
      retentionPolicy: 'ring-buffer',
      mounted: true,
      version: BUILD_META.commitSha,
    });
  }, []);

  // Collapsed pill — sits inside the Debug Tray (or anchors bottom-right
  // when rendered as a floating fallback). Never covers header / admin.
  if (!expanded) {
    const pillStyle: CSSProperties = inTray
      ? { pointerEvents: 'auto', display: 'inline-block' }
      : {
          position: 'fixed',
          right: 8,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
          zIndex: 40,
          pointerEvents: 'auto',
        };
    return (
      <div style={pillStyle}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Expand Startup Flight Recorder"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'hsl(var(--muted))',
            color: 'hsl(var(--foreground))',
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
          🛫 SFR {snapshot.length} ▴
        </button>
      </div>
    );
  }

  // Expanded panel: anchored to bottom-right, grows UPWARD.
  const shellStyle: CSSProperties = {
    position: 'fixed',
    right: 8,
    left: 8,
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
    width: 'auto',
    maxWidth: 'min(96vw, 520px)',
    marginLeft: 'auto',
    zIndex: 40,
    maxHeight: '60dvh',
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    borderRadius: 8,
    boxShadow: '0 12px 30px hsl(var(--foreground) / 0.22)',
    pointerEvents: 'auto',
  };


  return (
    <section
      data-startup-flight-recorder=""
      className="border border-border bg-background/95 text-foreground backdrop-blur-sm"
      style={shellStyle}
      aria-label="Startup flight recorder"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="text-xs font-semibold">
            {expanded ? '▼' : '▶'} STARTUP FLIGHT RECORDER ({snapshot.length} / {MAX_EVENTS})
          </div>
          {expanded ? (
            <div className="text-[10px] text-muted-foreground">visible, selectable, copyable · temporary</div>
          ) : null}
        </button>
        {expanded ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="rounded border border-border bg-muted px-2 py-1 text-[10px] text-foreground"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  copiedAt = Date.now();
                  emit();
                } catch {
                  areaRef.current?.select();
                  document.execCommand('copy');
                }
              }}
            >
              {copiedAt ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              className="rounded border border-border bg-muted px-2 py-1 text-[10px] text-foreground"
              onClick={() => {
                const blob = new Blob([text], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `startup-flight-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              TXT
            </button>
            <button
              type="button"
              className="rounded border border-border bg-muted px-2 py-1 text-[10px] text-foreground"
              onClick={() => {
                const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `startup-flight-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              JSON
            </button>
            <button
              type="button"
              className="rounded border border-border bg-muted px-2 py-1 text-[10px] text-foreground"
              onClick={() => resetStartupFlight('overlay clear')}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>
      {expanded ? (
        <textarea
          ref={areaRef}
          readOnly
          value={text || '(waiting for startup events)'}
          className="h-full min-h-[220px] w-full resize-none bg-background p-2 font-mono text-[10px] leading-snug text-foreground outline-none"
        />
      ) : null}
    </section>
  );
}
