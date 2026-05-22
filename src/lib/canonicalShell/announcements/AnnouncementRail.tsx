/**
 * AnnouncementRail — canonical HUD-level mount point for the
 * CanonicalAnnouncementLayer.
 *
 * Ownership contract:
 *   - PersistentTableShell wraps children with `AnnouncementRailProvider`,
 *     which exposes a `setNode` callback and tracks the registered DOM
 *     node.
 *   - The HUD chrome (Game.tsx mobile/desktop header area) renders
 *     `<AnnouncementRailSlot />` exactly once, in the dedicated
 *     announcement strip ABOVE the gameplay surface. This is a real
 *     layout slot — not a CSS overlay — so the announcement participates
 *     in HUD flow and never sits on top of the felt/table geometry.
 *   - `CanonicalAnnouncementLayer` portals its content into the
 *     registered node. If no slot is mounted, the layer renders
 *     nothing — there is no shell/table fallback overlay.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface AnnouncementRailContextValue {
  node: HTMLDivElement | null;
  setNode: (node: HTMLDivElement | null) => void;
}

const AnnouncementRailContext = createContext<AnnouncementRailContextValue | null>(null);

export function AnnouncementRailProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  return (
    <AnnouncementRailContext.Provider value={{ node, setNode }}>
      {children}
    </AnnouncementRailContext.Provider>
  );
}

export function useAnnouncementRailNode(): HTMLDivElement | null {
  const ctx = useContext(AnnouncementRailContext);
  return ctx?.node ?? null;
}

/**
 * AnnouncementRailSlot — concrete DOM mount point. Place in HUD chrome
 * above the gameplay surface. The element reserves no visual space
 * until an announcement renders into it.
 */
export function AnnouncementRailSlot() {
  const ctx = useContext(AnnouncementRailContext);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctx) return;
    ctx.setNode(ref.current);
    return () => ctx.setNode(null);
  }, [ctx]);

  return (
    <div
      ref={ref}
      data-canonical-announcement-rail=""
      aria-live="polite"
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    />
  );
}
