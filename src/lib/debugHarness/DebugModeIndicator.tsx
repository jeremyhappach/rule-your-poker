/**
 * DebugModeIndicator — global fixed banner that makes it impossible to
 * unknowingly play rigged games.
 *
 * Renders ONLY when Global Debug Mode is ON. Lists each game_type that
 * currently has a non-'none' harness armed, with its profile label.
 *
 * Mounted at the App root so it is visible across every route (lobby,
 * Game, debug pages).
 */

import { useEffect, useState } from 'react';
import {
  ensureHarnessCacheLoaded,
  getConfiguredHarnessCached,
  isGlobalDebugModeCached,
  subscribeGlobalDebugMode,
  subscribeHarnessCache,
} from './runtimeCache';
import { DEBUG_HARNESS_REGISTRY, getHarnessProfile } from './profiles';

export function DebugModeIndicator() {
  const [enabled, setEnabled] = useState<boolean>(isGlobalDebugModeCached());
  const [, force] = useState(0);

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

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483646,
        background: 'hsl(0 84% 45%)',
        color: 'hsl(0 0% 100%)',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        lineHeight: 1.3,
        padding: '4px 10px',
        textAlign: 'center',
        letterSpacing: '0.05em',
        fontWeight: 700,
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
      }}
    >
      ⚠ DEBUG MODE ACTIVE
      {armed.length > 0 && (
        <span style={{ fontWeight: 500, marginLeft: 8, opacity: 0.95 }}>
          — {armed.map((a) => `${labelForGameType(a.gameType)}: ${a.label}`).join(' · ')}
        </span>
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
