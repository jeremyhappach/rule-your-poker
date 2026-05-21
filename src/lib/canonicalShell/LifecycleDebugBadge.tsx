import { useLifecycleSnapshot } from './lifecycleDebug';
import { useGinMilestones, useGinLiveSnapshot } from '@/lib/ginStartupTrace';

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

export function LifecycleDebugBadge() {
  const snap = useLifecycleSnapshot();
  const milestones = useGinMilestones();
  const live = useGinLiveSnapshot();
  const entries = Object.entries(snap).sort(([a], [b]) => a.localeCompare(b));

  const milestoneMap = new Map(milestones.map(m => [m.label, m.dtMs]));

  return (
    <div
      style={{
        position: 'fixed',
        top: 4,
        right: 4,
        zIndex: 2147483647,
        maxWidth: 360,
        background: 'rgba(255,255,0,0.92)',
        color: '#000',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 10,
        lineHeight: 1.25,
        padding: '4px 6px',
        border: '1px solid #000',
        borderRadius: 4,
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
      }}
    >
      <div style={{ fontWeight: 700 }}>GIN STARTUP TIMELINE</div>
      {milestones.length === 0 ? (
        <div style={{ opacity: 0.6 }}>(no T0 yet)</div>
      ) : (
        milestones.map((m, i) => (
          <div key={i}>{m.label} +{m.dtMs}ms</div>
        ))
      )}

      <div style={{ fontWeight: 700, marginTop: 6 }}>COLD-START GATES</div>
      {GATE_LABELS.map(g => {
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
    </div>
  );
}
