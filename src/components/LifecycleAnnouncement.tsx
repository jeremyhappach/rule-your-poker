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
  const plate = (
    <div className="w-full h-full flex items-center justify-center bg-poker-gold/95 backdrop-blur-sm px-4 shadow-xl border-y-2 border-poker-gold animate-scale-in overflow-hidden">
      <p className="text-sm font-bold text-background text-center leading-tight truncate">
        {title}
        {subtitle && (
          <span className="text-[11px] font-semibold opacity-80 ml-2">
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
