/**
 * DebugTray — single canonical container for all debug surfaces.
 *
 * - Pinned to the bottom of the viewport (above iOS browser toolbar via
 *   safe-area-inset-bottom).
 * - Container is `pointer-events: none` so invisible space cannot block
 *   gameplay touches. Each pill / expanded panel is `pointer-events: auto`.
 * - Flex row aligned to the bottom-end so collapsed pills sit on a single
 *   line and expanded panels grow UPWARD without ever covering the shell
 *   header or admin controls.
 *
 * Owns layout only. Each child pill remains responsible for its own
 * instrumentation, recorder behavior, and event capture — UI consolidation
 * only, no functional changes.
 */

import { createContext, useContext, type ReactNode } from 'react';

const DebugTrayContext = createContext<boolean>(false);

export function useInDebugTray(): boolean {
  return useContext(DebugTrayContext);
}

export function DebugTray({ children }: { children: ReactNode }) {
  return (
    <div
      data-debug-tray=""
      aria-label="Debug tray"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
        padding: '0 6px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        gap: 6,
        flexWrap: 'wrap',
        zIndex: 40,
        pointerEvents: 'none',
      }}
    >
      <DebugTrayContext.Provider value={true}>
        {children}
      </DebugTrayContext.Provider>
    </div>
  );
}
