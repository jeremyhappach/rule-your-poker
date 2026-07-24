/**
 * ThreeFiveSevenTerminalController
 *
 * Presentation sequencer for the normalized 3-5-7 terminal path.
 * Mounted INSIDE MobileGameTable's table surface — never as a parent-tree
 * controller. Reads the immutable Terminal357Descriptor produced by
 * Game.tsx and (in later slices) drives:
 *
 *   - Persistent LifecycleAnnouncement (no TTL)
 *   - Source-specific prelude:
 *       normal-win  → existing LegEarnedAnimation(isWinningLeg=true)
 *       instant-357 → ThreeFiveSevenProofCardsAnimation (overlay copies)
 *   - Shared terminal path:
 *       hadAuthoritativeLegs ? SweepTheLegsAnimation : skip
 *       → canonical PotToPlayerAnimation + winner confetti
 *       → canonical completion → dealer-game advancement
 *
 * Slice 1 (this file): INERT. Renders null. Accepts the descriptor prop
 * so the wiring surface is complete and Game.tsx + MobileGameTable
 * typecheck against the final controller signature. No behavior yet.
 * The old bespoke instant-win path continues to run untouched.
 *
 * A dev-only diagnostic effect logs when a descriptor is received so
 * the Slice 1 smoke can confirm Game.tsx is populating it correctly.
 */

import { useEffect, useRef } from "react";
import type { Terminal357Descriptor } from "@/lib/threeFiveSeven/terminalDescriptor";
import { isSameTerminal357Descriptor } from "@/lib/threeFiveSeven/terminalDescriptor";

export interface ThreeFiveSevenTerminalControllerProps {
  /** Immutable descriptor produced by Game.tsx. `null` when no terminal
   *  event is active. Never mutated in place; the parent replaces the
   *  reference on identity change. */
  descriptor: Terminal357Descriptor | null;
}

export const ThreeFiveSevenTerminalController = ({
  descriptor,
}: ThreeFiveSevenTerminalControllerProps) => {
  const lastGenIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!descriptor) {
      if (lastGenIdRef.current !== null) {
        console.log("[357 TERMINAL CTRL] descriptor cleared", {
          previousGenId: lastGenIdRef.current,
        });
        lastGenIdRef.current = null;
      }
      return;
    }
    if (descriptor.terminalGenerationId === lastGenIdRef.current) return;
    lastGenIdRef.current = descriptor.terminalGenerationId;
    console.log("[357 TERMINAL CTRL] descriptor received (Slice 1 inert)", {
      source: descriptor.source,
      terminalGenerationId: descriptor.terminalGenerationId,
      winnerId: descriptor.winnerId,
      winnerName: descriptor.winnerName,
      winnerPosition: descriptor.winnerPosition,
      dealerGameId: descriptor.dealerGameId,
      roundId: descriptor.roundId,
      handNumber: descriptor.handNumber,
      handContextId: descriptor.handContextId,
      terminalResultIdentity: descriptor.terminalResultIdentity,
      targetLegs: descriptor.targetLegs,
      proofCardsCount: descriptor.proofCards?.length ?? 0,
      hadAuthoritativeLegs: descriptor.hadAuthoritativeLegs,
      playersAtHandStart: descriptor.playersAtHandStart ?? null,
    });
  }, [descriptor]);

  // Slice 1 is behaviorally inert. Downstream slices will render the
  // announcement plate, prelude, and shared-path children here.
  void isSameTerminal357Descriptor; // keep import alive for later slices
  return null;
};
