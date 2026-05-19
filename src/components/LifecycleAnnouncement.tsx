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
    <div className="bg-gradient-to-br from-poker-felt to-poker-felt-dark rounded p-2 border-2 border-poker-gold shadow-xl animate-scale-in">
      <p className="text-sm font-bold text-poker-gold text-center px-2 leading-tight">
        {title}
      </p>
      {subtitle && (
        <p className="text-[10px] text-amber-200/80 text-center px-2 mt-0.5 leading-tight">
          {subtitle}
        </p>
      )}
    </div>
  );

  if (!overlay) return plate;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
      {plate}
    </div>
  );
};
