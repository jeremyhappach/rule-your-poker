import { useLifecycleSnapshot } from './lifecycleDebug';
import { useGinMilestones } from '@/lib/ginStartupTrace';

/**
 * Temporary fixed badge showing Game.tsx lifecycle facts during the
 * Gin cold-start audit. Always visible (overrides HIDE_DEBUG_UI) so we
 * can observe state during the actual black-screen window.
 *
 * Also renders the Gin startup timeline (T0 + milestone deltas) so the
 * critical-path bottleneck is visible in-app without DevTools.
 */
export function LifecycleDebugBadge() {
  const snap = useLifecycleSnapshot();
  const milestones = useGinMilestones();
  const entries = Object.entries(snap).sort(([a], [b]) => a.localeCompare(b));
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
          <div key={i}>
            {m.label} +{m.dtMs}ms
          </div>
        ))
      )}
      <div style={{ fontWeight: 700, marginTop: 6 }}>LIFECYCLE DEBUG</div>
      {entries.map(([k, v]) => (
        <div key={k}>{k}={String(v)}</div>
      ))}
    </div>
  );
}
