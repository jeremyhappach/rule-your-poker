/**
 * LifecycleAnnouncement — shared lifecycle messaging plate.
 *
 * Thin shared component used by game surfaces to render transient
 * lifecycle/status messaging ("Awaiting ante decisions...", "Preparing
 * hand...", "Observing — waiting for hand to start...") with a
 * consistent visual treatment across games.
 *
 * Scope:
 * - Pure presentational. No timers, no auto-advance, no game coupling.
 * - Intended to be the single shared surface for lifecycle plates so
 *   games stop cloning the same JSX block per file.
 *
 * NOT in scope (queued as a dedicated follow-on architecture wave —
 * "Canonical lifecycle announcement ownership"):
 * - Shell-owned announcement overlay portal (ShellOverlayMounts.tsx
 *   `announcement` slot is still scaffolding).
 * - Visual-contract lifecycle intent emitted from useGameStateSync.
 * - Migration of DealerAnnouncement, Holm/357/Cribbage local plates,
 *   and other per-game announcement clones onto a shell-driven pipeline.
 *
 * This component exists so P9.4 (Gin visual migration) does not have to
 * propagate a Gin-local cloned plate while staying within its
 * visual-only guardrail.
 */

import type { ReactNode } from "react";
import { useLifecycleMount } from "@/lib/canonicalShell/lifecycleDebug";

interface LifecycleAnnouncementProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** When true, render as full-bleed overlay (absolute inset-0). Default false — caller positions. */
  overlay?: boolean;
}

export const LifecycleAnnouncement = ({
  title,
  subtitle,
  overlay = false,
}: LifecycleAnnouncementProps) => {
  useLifecycleMount('LifecycleAnnouncement', {
    titlePreview: typeof title === 'string' ? title.slice(0, 64) : '(node)',
    overlay,
  });
  const plate = (
    <div className="w-full backdrop-blur-sm rounded-md px-3 py-1 shadow-xl border-2 border-amber-900 animate-scale-in overflow-hidden" style={{ background: 'hsl(var(--baby-blue) / 0.95)' }}>
      <p className="text-slate-900 font-bold text-base sm:text-lg leading-tight text-center truncate">
        {title}
        {subtitle && (
          <span className="text-xs sm:text-sm font-semibold opacity-80 ml-2">
            {subtitle}
          </span>
        )}
      </p>
    </div>
  );


  if (!overlay) return plate;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
      {plate}
    </div>
  );
};
