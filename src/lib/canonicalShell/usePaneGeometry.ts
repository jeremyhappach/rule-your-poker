/**
 * usePaneGeometry — Wave 1 of the Responsive Geometry Contract.
 *
 * Read-only shell-owned geometry primitive describing the canonical
 * active-player content pane (HUD row 4) available to gameplay-published
 * pane content (Cards / Chat / Lobby / History tabs).
 *
 * Source of truth is the canonical CSS variable `--hud-h-pane` defined
 * in index.css (derived from `--shell-hud-h * --hud-r-pane`). Width is
 * measured from the actual pane DOM node (`[data-canonical-hud-pane]`)
 * when present; when absent, the hook falls back to viewport width so
 * downstream consumers can still compute a layout budget.
 *
 * Scope (Wave 1):
 *   - Expose intent: pane width / height / content-safe rect / bounds.
 *   - Zero game-specific assumptions.
 *   - No production consumer migrates in this wave.
 *
 * Ownership:
 *   height           → shell CSS token `--hud-h-pane` (HUD ratio share).
 *   width            → ShellHudGrid pane node measurement.
 *   content-safe     → identical to pane in Wave 1; padding belongs to
 *                      the shell and is reserved for future iteration
 *                      once a single canonical inset is declared.
 *
 * Discovered gap (documented, not patched in Wave 1):
 *   ShellHudGrid does not currently stamp `[data-canonical-hud-pane]`
 *   on its pane container. Until it does, this hook falls back to
 *   viewport-derived width + the CSS-token height. Stamping the pane
 *   node is a one-line shell change scheduled with Wave 2 wiring.
 */
import { useEffect, useMemo, useState } from 'react';

const PANE_SELECTOR = '[data-canonical-hud-pane]';

export interface PaneGeometry {
  /** Width of the active-player pane in CSS pixels. */
  width: number;
  /** Height of the active-player pane in CSS pixels. */
  height: number;
  /** Content-safe rectangle (pane-local). Wave 1 = full pane. */
  contentSafeWidth: number;
  contentSafeHeight: number;
  /** Resolved pane rectangle (pane-local). */
  paneBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** True once the pane has been measured at least once. */
  measured: boolean;
}

function readPaneHeightFromToken(): number {
  if (typeof window === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.height = 'var(--hud-h-pane)';
  probe.style.width = '0';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return h;
}

function findPane(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(PANE_SELECTOR);
}

export function usePaneGeometry(): PaneGeometry {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const node = findPane();
      if (node) {
        const rect = node.getBoundingClientRect();
        setSize(prev =>
          prev && prev.w === rect.width && prev.h === rect.height
            ? prev
            : { w: rect.width, h: rect.height },
        );
        return;
      }
      // Fallback: viewport width × CSS-token height.
      const w = window.innerWidth;
      const h = readPaneHeightFromToken();
      setSize(prev =>
        prev && prev.w === w && prev.h === h ? prev : { w, h },
      );
    };

    measure();

    const node = findPane();
    let ro: ResizeObserver | null = null;
    if (node && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(node);
    }

    const mo = new MutationObserver(() => measure());
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);

    return () => {
      cancelled = true;
      ro?.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return useMemo<PaneGeometry>(() => {
    if (!size) {
      return {
        width: 0,
        height: 0,
        contentSafeWidth: 0,
        contentSafeHeight: 0,
        paneBounds: { x: 0, y: 0, width: 0, height: 0 },
        measured: false,
      };
    }
    const { w, h } = size;
    return {
      width: w,
      height: h,
      contentSafeWidth: w,
      contentSafeHeight: h,
      paneBounds: { x: 0, y: 0, width: w, height: h },
      measured: true,
    };
  }, [size]);
}
