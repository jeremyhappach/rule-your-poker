/**
 * CanonicalSeatFrame — P9.1.
 *
 * Visual chrome wrapper for an occupied seat. Per architectural guardrail
 * (user-stated in P9.1 approval): this component MUST remain a chrome
 * wrapper only.
 *
 * It MUST NOT accumulate gameplay-layout assumptions about:
 *   - stack positioning
 *   - dealer button offsets
 *   - buck / leg indicator spacing
 *   - per-game seat internals
 *
 * Shell owns seat chrome. Gameplay owns seat contents.
 *
 * Wave 1 (P9.1) defines the primitive and exposes a data attribute so
 * future visual unification waves can style consistently. Aggressive
 * wiring into per-seat absolute-positioned subtrees is deferred to a
 * dedicated seat-chrome wave to avoid layout regressions.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CanonicalSeatFrameProps {
  children: ReactNode;
  position: number;
  isActive?: boolean;
  isFolded?: boolean;
  isOut?: boolean;
  className?: string;
}

export function CanonicalSeatFrame({
  children,
  position,
  isActive = false,
  isFolded = false,
  isOut = false,
  className,
}: CanonicalSeatFrameProps) {
  return (
    <div
      data-canonical-seat-frame=""
      data-seat-position={position}
      data-seat-active={isActive ? "true" : undefined}
      data-seat-folded={isFolded ? "true" : undefined}
      data-seat-out={isOut ? "true" : undefined}
      className={cn("relative", className)}
    >
      {children}
    </div>
  );
}
