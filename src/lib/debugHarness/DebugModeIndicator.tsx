/**
 * DebugModeIndicator — compact pill in the Debug Tray that shows whether
 * any debug harnesses are armed. Collapsed by default; tap to expand the
 * full list of active harnesses.
 *
 * UI-only consolidation — no harness behavior changes.
 */

// Removed from DebugTray to free space; component kept in case re-enabled later.

import { useEffect, useState } from 'react';
import {
  ensureHarnessCacheLoaded,
  getConfiguredHarnessCached,
  isGlobalDebugModeCached,
  subscribeGlobalDebugMode,
  subscribeHarnessCache,
} from './runtimeCache';
import { DEBUG_HARNESS_REGISTRY, getHarnessProfile } from './profiles';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';

export function DebugModeIndicator() {
  const [enabled, setEnabled] = useState<boolean>(isGlobalDebugModeCached());
  const [, force] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const inTray = useInDebugTray();

  useEffect(() => {
    void ensureHarnessCacheLoaded();
    const u1 = subscribeGlobalDebugMode(setEnabled);
    const u2 = subscribeHarnessCache(() => force((n) => n + 1));
    return () => {
      u1();
      u2();
    };
  }, []);

  if (!enabled) return null;

  const armed = Object.keys(DEBUG_HARNESS_REGISTRY)
    .map((gt) => {
      const id = getConfiguredHarnessCached(gt);
      if (!id || id === 'none') return null;
      return { gameType: gt, label: getHarnessProfile(gt, id).label };
    })
    .filter((x): x is { gameType: string; label: string } => !!x);

  const count = armed.length;
  const summary = count === 0 ? 'HARNESS ON' : `${count}H`;

  // Floating fallback when something mounts the indicator outside the tray.
  const outerStyle: React.CSSProperties = inTray
    ? { pointerEvents: 'auto', display: 'inline-block' }
    : {
        position: 'fixed',
        right: 8,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
        zIndex: 2147483647,
        pointerEvents: 'auto',
      };

  return (
    <div role="status" aria-live="polite" style={outerStyle}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: 'hsl(0 84% 45%)',
          color: 'hsl(0 0% 100%)',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          padding: '4px 8px',
          borderRadius: 999,
          border: '1px solid hsl(0 84% 30%)',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
          whiteSpace: 'nowrap',
        }}
        title={expanded ? 'Collapse harness list' : 'Show active harnesses'}
      >
        🧪 {summary}
        {expanded ? ' ▾' : ''}
      </button>
      {expanded && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            bottom: 'calc(100% + 4px)',
            minWidth: 220,
            maxWidth: 'min(80vw, 360px)',
            background: 'hsl(0 0% 10%)',
            color: 'hsl(0 0% 100%)',
            border: '1px solid hsl(0 84% 45%)',
            borderRadius: 6,
            padding: '6px 8px',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 10,
            lineHeight: 1.4,
            boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontWeight: 700, color: 'hsl(0 84% 65%)', marginBottom: 4 }}>
            ⚠ DEBUG MODE ACTIVE
          </div>
          {armed.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Global Debug Mode ON · no harness armed</div>
          ) : (
            armed.map((a) => (
              <div key={a.gameType}>
                <span style={{ opacity: 0.7 }}>{labelForGameType(a.gameType)}:</span>{' '}
                <span style={{ fontWeight: 600 }}>{a.label}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function labelForGameType(gt: string): string {
  switch (gt) {
    case 'cribbage':
      return 'Cribbage';
    case 'gin-rummy':
      return 'Gin Rummy';
    case 'yahtzee':
      return 'Yahtzee';
    case 'holm':
      return 'Holm';
    case '3-5-7':
      return '3-5-7';
    case 'horses':
      return 'Horses';
    case 'ship-captain-crew':
      return 'SCC';
    default:
      return gt;
  }
}
