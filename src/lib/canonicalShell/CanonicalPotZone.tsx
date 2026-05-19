/**
 * CanonicalPotZone — P9.1.
 *
 * Shared visual chrome for the central pot pill. Wraps caller-provided
 * pot value text so the *visible* pot zone (the gold-bordered pill) is
 * defined in one place across Holm + 3-5-7, while the pot value itself
 * stays owned by gameplay state (MobileGameTable's displayedPot pipeline).
 *
 * The shell's canonical pot anchor (`data-canonical-shell-pot-anchor`)
 * still lives on PersistentTableShell. This component additionally carries
 * the legacy `data-pot-anchor` attribute so existing chip-transport
 * resolvers (P8 wave) land on the actual visible pot zone — strictly
 * better than landing on the invisible shell-root centroid.
 *
 * Pure presentation. No state, no per-game branching beyond size tokens.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CanonicalPotZoneProps {
  children: ReactNode;
  size?: "compact" | "regular" | "prominent";
  isTablet?: boolean;
  isDesktop?: boolean;
  className?: string;
}

export function CanonicalPotZone({
  children,
  size = "regular",
  isTablet = false,
  isDesktop = false,
  className,
}: CanonicalPotZoneProps) {
  const paddingClass =
    size === "compact"
      ? isTablet
        ? "px-5 py-2"
        : "px-3 py-1"
      : size === "prominent"
      ? isTablet
        ? "px-10 py-4"
        : isDesktop
        ? "px-8 py-3"
        : "px-5 py-1.5"
      : isTablet
      ? "px-10 py-4"
      : "px-8 py-3";

  return (
    <div
      data-canonical-pot-zone=""
      data-pot-anchor=""
      className={cn(
        "relative bg-black/70 backdrop-blur-sm rounded-full border border-poker-gold/60",
        paddingClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
