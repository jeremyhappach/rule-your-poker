import { HIDE_DEBUG_UI } from '@/lib/debugUIVisibility';
import { useState } from 'react';
import { useLifecycleSnapshot } from './lifecycleDebug';
import {
  useGinMilestones,
  useGinLiveSnapshot,
  getGinTimelineText,
} from '@/lib/ginStartupTrace';

const GATE_LABELS = [
  'desiredIdentity non-null',
  'readyToMountProp=true',
  'surfaceReady=true',
  'slot.MOUNT active',
  'GinRummyGameTable mounted',
] as const;

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.length > 40 ? v.slice(0, 8) + '…' + v.slice(-6) : v;
  return String(v);
}

/**
 * Visible overlay disabled for clean runtime validation.
 * Re-enable by setting SHOW_GIN_TIMELINE_OVERLAY = true, or via
 *   localStorage.setItem('ptp_show_gin_timeline', '1')
 * Underlying instrumentation (ginTrace, lifecycleDebug, copy/export plumbing)
 * is intentionally preserved.
 */
const SHOW_GIN_TIMELINE_OVERLAY = false;

function isOverlayEnabled(): boolean {
  if (SHOW_GIN_TIMELINE_OVERLAY) return true;
  try {
    if (window.localStorage.getItem('ptp_show_gin_timeline') === '1') return true;
  } catch { /* */ }
  try {
    if (new URLSearchParams(window.location.search).get('gin_timeline') === '1') return true;
  } catch { /* */ }
  return false;
}

export function LifecycleDebugBadge() {
  if (!isOverlayEnabled()) return null;
  const snap = useLifecycleSnapshot();
  const milestones = useGinMilestones();
  const live = useGinLiveSnapshot();
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const entries = Object.entries(snap).sort(([a], [b]) => a.localeCompare(b));
  const milestoneMap = new Map(milestones.map((m) => [m.label, m.dtMs]));

  const lastMs = milestones.length > 0 ? milestones[milestones.length - 1].dtMs : null;

  const handleCopy = async () => {
    const text = [
      '=== GIN STARTUP TIMELINE ===',
      getGinTimelineText(),
      '',
      '=== LIVE VALUES ===',
      `desiredIdentity=${fmt(live.desiredIdentity)}`,
      `mountedIdentity=${fmt(live.mountedIdentity)}`,
      `readyToMountProp=${fmt(live.readyToMountProp)}`,
      `surfaceReady=${fmt(live.surfaceReady)}`,
      `readyToMount=${fmt(live.readyToMount)}`,
      `phase=${fmt(live.phase)}`,
      `readinessScope=${fmt(live.readinessScope)}`,
      `dealerGameId=${fmt(live.dealerGameId)}`,
      `current_game_uuid=${fmt(live.currentGameUuid)}`,
      `currentRound.id=${fmt(live.currentRoundId)}`,
      `currentRound.dealer_game_id=${fmt(live.currentRoundDealerGameId)}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Fallback: select via prompt
      try {
        window.prompt('Copy timeline:', text);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 4,
        right: 4,
        zIndex: 2147483646,
        maxWidth: 380,
        background: 'rgba(255,255,0,0.92)',
        color: '#000',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 10,
        lineHeight: 1.25,
        padding: '4px 6px',
        border: '1px solid #000',
        borderRadius: 4,
        whiteSpace: 'pre-wrap',
        pointerEvents: 'auto',
      }}
    >
      {/* Header bar: always visible, clickable. Copy button stays clickable. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
            color: '#000',
            padding: 0,
            fontWeight: 700,
          }}
        >
          {expanded ? '▼' : '▶'} GIN TIMELINE{' '}
          <span style={{ fontWeight: 400, opacity: 0.7 }}>
            ({milestones.length} ev{lastMs != null ? `, +${lastMs}ms` : ''})
          </span>
        </button>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy timeline"
          style={{
            background: '#000',
            color: '#ffeb3b',
            border: 'none',
            borderRadius: 3,
            padding: '2px 6px',
            cursor: 'pointer',
            font: 'inherit',
            fontWeight: 700,
          }}
        >
          {copied ? '✓' : '⧉ copy'}
        </button>
      </div>

      {expanded && (
        <>
          <div style={{ fontWeight: 700, marginTop: 4 }}>STARTUP TIMELINE</div>
          {milestones.length === 0 ? (
            <div style={{ opacity: 0.6 }}>(no T0 yet)</div>
          ) : (
            milestones.map((m, i) => (
              <div key={i}>{m.label} +{m.dtMs}ms</div>
            ))
          )}

          <div style={{ fontWeight: 700, marginTop: 6 }}>COLD-START GATES</div>
          {GATE_LABELS.map((g) => {
            const dt = milestoneMap.get(g);
            return (
              <div key={g}>
                {dt != null ? '✓' : '·'} {g} {dt != null ? `+${dt}ms` : '(pending)'}
              </div>
            );
          })}

          <div style={{ fontWeight: 700, marginTop: 6 }}>LIVE VALUES</div>
          <div>desiredIdentity={fmt(live.desiredIdentity)}</div>
          <div>mountedIdentity={fmt(live.mountedIdentity)}</div>
          <div>readyToMountProp={fmt(live.readyToMountProp)}</div>
          <div>surfaceReady={fmt(live.surfaceReady)}</div>
          <div>readyToMount={fmt(live.readyToMount)}</div>
          <div>phase={fmt(live.phase)}</div>
          <div>readinessScope={fmt(live.readinessScope)}</div>
          <div>dealerGameId={fmt(live.dealerGameId)}</div>
          <div>current_game_uuid={fmt(live.currentGameUuid)}</div>
          <div>currentRound.id={fmt(live.currentRoundId)}</div>
          <div>currentRound.dealer_game_id={fmt(live.currentRoundDealerGameId)}</div>

          <div style={{ fontWeight: 700, marginTop: 6 }}>LIFECYCLE DEBUG</div>
          {entries.map(([k, v]) => (
            <div key={k}>{k}={String(v)}</div>
          ))}
        </>
      )}
    </div>
  );
}
