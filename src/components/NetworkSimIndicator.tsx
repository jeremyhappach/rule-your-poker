/**
 * Compact debug-tray pill for Network Simulation status.
 * Collapsed by default; tap to expand a read-only mode summary.
 *
 * UI-only consolidation — no simulation logic changes.
 */
import { useState } from 'react';
import { useNetworkSim } from '@/hooks/useNetworkSim';
import { NETWORK_SIM_MODE_LABELS } from '@/lib/networkSim';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';

const MODE_ORDER: Array<{ key: string; label: string }> = [
  { key: 'off', label: 'OFF' },
  { key: 'moderate', label: 'Moderate Lag' },
  { key: 'heavy', label: 'Heavy Lag' },
  { key: 'reorder', label: 'Reorder / Burst' },
  { key: 'cross_country', label: 'Cross-Country' },
];

function shortMode(mode: string): string {
  switch (mode) {
    case 'moderate':
      return 'MOD';
    case 'heavy':
      return 'HVY';
    case 'reorder':
      return 'ROR';
    case 'cross_country':
      return 'XCO';
    default:
      return mode.toUpperCase().slice(0, 3);
  }
}

export function NetworkSimIndicator() {
  const { mode, loggingEnabled } = useNetworkSim();
  const [expanded, setExpanded] = useState(false);
  const inTray = useInDebugTray();

  if (!expanded) {
    const pillStyle: React.CSSProperties = inTray
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
          title="Expand Network Simulation details"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            background: 'hsl(0 84% 45%)',
            color: '#fff',
            border: '1px solid hsl(0 84% 30%)',
            borderRadius: 999,
            padding: '4px 8px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
            whiteSpace: 'nowrap',
          }}
        >
          📶 {shortMode(mode)}
        </button>
      </div>
    );
  }

  const shellStyle: React.CSSProperties = {
    position: 'fixed',
    right: 8,
    left: 8,
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
    width: 'auto',
    maxWidth: 'min(96vw, 320px)',
    marginLeft: 'auto',
    zIndex: 2147483647,
    maxHeight: '70dvh',
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    borderRadius: 8,
    boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
    pointerEvents: 'auto',
  };

  return (
    <section
      data-network-sim-panel=""
      style={shellStyle}
      className="border border-border bg-background/95 text-foreground backdrop-blur-sm"
      aria-label="Network simulation details"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="text-xs font-semibold">▼ NETWORK SIMULATION</div>
        </button>
        <button
          type="button"
          className="rounded border border-border bg-muted px-2 py-1 text-[10px] text-foreground"
          onClick={() => setExpanded(false)}
        >
          Close
        </button>
      </div>

      <div className="px-2 py-1" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>
        <div className="mb-1" style={{ fontWeight: 700, color: 'hsl(0 84% 65%)' }}>
          Mode: {NETWORK_SIM_MODE_LABELS[mode]}
        </div>
        {loggingEnabled && (
          <div className="mb-1" style={{ color: 'hsl(0 84% 65%)' }}>
            Logging enabled
          </div>
        )}
        <div className="mt-1 space-y-0.5">
          {MODE_ORDER.map((m) => {
            const active = m.key === mode;
            return (
              <div
                key={m.key}
                className={`rounded px-1.5 py-0.5 ${active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}
              >
                {active ? '● ' : '○ '}{m.label}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
