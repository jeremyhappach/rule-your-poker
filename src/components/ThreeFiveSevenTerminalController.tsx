/**
 * ThreeFiveSevenTerminalController
 *
 * SLICE 3 (this file): ACTIVE for `descriptor.source === 'instant-357'`.
 * Normal-win remains owned by the legacy path unchanged.
 *
 * When mounted with an instant-357 descriptor the controller becomes the
 * exclusive owner of the 3-5-7-specific PRELUDE for that terminal
 * generation:
 *
 *   announcement
 *     → wait for real deal-settled signal (DealRuntime.dealSettled)
 *     → ThreeFiveSevenProofCardsAnimation (descriptor.proofCards)
 *     → hadAuthoritativeLegs ? SweepTheLegsAnimation : skip
 *     → enterCanonical357TerminalPresentation(...)
 *     → existing canonical downstream pipeline (UNCHANGED)
 *
 * After canonical handoff the controller stops sequencing progression
 * but keeps rendering the announcement plate and the settled proof
 * cards until the descriptor rotates.
 *
 * Everything downstream of `enterCanonical357TerminalPresentation`
 * (pot destination, confetti, bounce, completion, dealer-game
 * advancement) remains owned by MobileGameTable's canonical path.
 *
 * The controller reports ownership up to MobileGameTable so the three
 * legacy instant-win prelude arm sites can early-return with a
 * `357.terminal.controller.legacy_prelude_suppressed` diagnostic.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Terminal357Descriptor,
} from "@/lib/threeFiveSeven/terminalDescriptor";
import { isSameTerminal357Descriptor } from "@/lib/threeFiveSeven/terminalDescriptor";
import { useDealRuntime } from "@/lib/canonicalShell/cardTransport/DealRuntime";
import { LifecycleAnnouncement } from "@/components/LifecycleAnnouncement";
import { SweepTheLegsAnimation } from "@/components/SweepTheLegsAnimation";
import { ThreeFiveSevenProofCardsAnimation } from "@/components/ThreeFiveSevenProofCardsAnimation";
import { emit357RuntimeDiag } from "@/lib/threeFiveSeven/runtimeDiag";

export interface CanonicalTerminal357EntryInput {
  gameId: string | null;
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number | null;
  handContextId: string | null;
  terminalResultIdentity: string;
  terminalGenerationId: string;
  winnerId: string;
  winnerPosition: number;
}

export interface ThreeFiveSevenTerminalControllerProps {
  /** Immutable descriptor produced by Game.tsx. `null` when no terminal
   *  event is active. Never mutated in place. */
  descriptor: Terminal357Descriptor | null;
  /** Fired when the controller acquires or releases prelude ownership
   *  for an instant-357 generation. Parent uses this to short-circuit
   *  every legacy instant-win prelude arm site. Passed the active
   *  `terminalGenerationId`, or `null` on release. Only ever populated
   *  when `descriptor.source === 'instant-357'`. */
  onOwnershipChange: (activeGenerationId: string | null) => void;
  /** Called exactly once per active instant-357 generation, after the
   *  optional Sweep-the-Legs step completes (or is skipped). The parent
   *  wraps its `enterCanonical357TerminalPresentation` helper. */
  onEnterCanonical: (input: CanonicalTerminal357EntryInput) => void;
}

type ControllerPhase =
  | "idle"
  | "announce_wait_deal_settled"
  | "proof_cards"
  | "sweep_legs"
  | "handoff_pending"
  | "post_handoff";

export const ThreeFiveSevenTerminalController = ({
  descriptor,
  onOwnershipChange,
  onEnterCanonical,
}: ThreeFiveSevenTerminalControllerProps) => {
  const deal = useDealRuntime();
  const dealSettled = !!deal?.dealSettled;

  const activeGenIdRef = useRef<string | null>(null);
  const handedOffForGenRef = useRef<string | null>(null);
  const dealSettledEmittedForGenRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<ControllerPhase>("idle");
  const [phaseForGenId, setPhaseForGenId] = useState<string | null>(null);

  const isInstant357 =
    descriptor != null && descriptor.source === "instant-357";
  const activeGenId = isInstant357 ? descriptor!.terminalGenerationId : null;

  // ── Generation lifecycle ────────────────────────────────────────────
  useEffect(() => {
    // Descriptor gone or not instant-357 → release ownership.
    if (!isInstant357 || !descriptor) {
      if (activeGenIdRef.current != null) {
        emit357RuntimeDiag("controller_ownership_released", {
          gameId: null,
          terminalResultIdentity: null,
        }, {
          previousGenerationId: activeGenIdRef.current,
          reason: descriptor ? "source_not_instant_357" : "descriptor_cleared",
        });
        activeGenIdRef.current = null;
        onOwnershipChange(null);
        setPhase("idle");
        setPhaseForGenId(null);
      }
      return;
    }
    const genId = descriptor.terminalGenerationId;
    if (activeGenIdRef.current === genId) return;
    // New generation — acquire ownership, reset prelude state.
    activeGenIdRef.current = genId;
    handedOffForGenRef.current = null;
    dealSettledEmittedForGenRef.current = null;
    setPhaseForGenId(genId);
    setPhase("announce_wait_deal_settled");
    emit357RuntimeDiag("controller_ownership_acquired", {
      gameId: descriptor.gameId,
      dealerGameId: descriptor.dealerGameId,
      roundId: descriptor.roundId,
      handNumber: descriptor.handNumber,
      terminalResultIdentity: descriptor.terminalResultIdentity,
      winnerPlayerId: descriptor.winnerId,
    }, {
      terminalGenerationId: genId,
      hadAuthoritativeLegs: descriptor.hadAuthoritativeLegs,
      proofCardsCount: descriptor.proofCards?.length ?? 0,
      handContextId: descriptor.handContextId,
    });
    emit357RuntimeDiag("controller_state_transition", {
      gameId: descriptor.gameId,
      terminalResultIdentity: descriptor.terminalResultIdentity,
    }, { terminalGenerationId: genId, from: "idle", to: "announce_wait_deal_settled" });
    onOwnershipChange(genId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptor, isInstant357]);

  // ── Wait for real deal-settled ──────────────────────────────────────
  useEffect(() => {
    if (!isInstant357 || !descriptor) return;
    if (phase !== "announce_wait_deal_settled") return;
    if (phaseForGenId !== descriptor.terminalGenerationId) return;
    if (!dealSettled) return;
    if (dealSettledEmittedForGenRef.current !== descriptor.terminalGenerationId) {
      dealSettledEmittedForGenRef.current = descriptor.terminalGenerationId;
      emit357RuntimeDiag("controller_deal_settled_signal", {
        gameId: descriptor.gameId,
        terminalResultIdentity: descriptor.terminalResultIdentity,
      }, {
        terminalGenerationId: descriptor.terminalGenerationId,
        dealHandContextId: deal?.handContextId ?? null,
      });
    }
    // If proof cards are unavailable, skip the proof-card step entirely
    // rather than mounting the animation with an empty array (which
    // never fires onComplete and would black-hole the terminal).
    const hasProofCards =
      Array.isArray(descriptor.proofCards) && descriptor.proofCards.length === 3;
    if (!hasProofCards) {
      emit357RuntimeDiag("controller_proof_cards_skipped", {
        gameId: descriptor.gameId,
        terminalResultIdentity: descriptor.terminalResultIdentity,
        winnerPlayerId: descriptor.winnerId,
      }, {
        terminalGenerationId: descriptor.terminalGenerationId,
        reason: "proof_cards_missing_or_incomplete",
        proofCardsCount: descriptor.proofCards?.length ?? 0,
        hadAuthoritativeLegs: descriptor.hadAuthoritativeLegs,
      });
      if (descriptor.hadAuthoritativeLegs) {
        emit357RuntimeDiag("controller_state_transition", {
          gameId: descriptor.gameId,
          terminalResultIdentity: descriptor.terminalResultIdentity,
        }, {
          terminalGenerationId: descriptor.terminalGenerationId,
          from: "announce_wait_deal_settled",
          to: "sweep_legs",
        });
        setPhase("sweep_legs");
      } else {
        enterCanonicalNow("sweep_legs_skipped");
      }
      return;
    }
    emit357RuntimeDiag("controller_state_transition", {
      gameId: descriptor.gameId,
      terminalResultIdentity: descriptor.terminalResultIdentity,
    }, {
      terminalGenerationId: descriptor.terminalGenerationId,
      from: "announce_wait_deal_settled",
      to: "proof_cards",
    });
    setPhase("proof_cards");
  }, [dealSettled, phase, phaseForGenId, descriptor, isInstant357, deal?.handContextId]);

  // ── Enter canonical downstream after prelude ends ───────────────────
  const enterCanonicalNow = (
    reason: "proof_cards_complete" | "sweep_legs_complete" | "sweep_legs_skipped",
  ) => {
    if (!descriptor) return;
    const genId = descriptor.terminalGenerationId;
    if (handedOffForGenRef.current === genId) return;
    handedOffForGenRef.current = genId;
    emit357RuntimeDiag("controller_canonical_handoff", {
      gameId: descriptor.gameId,
      dealerGameId: descriptor.dealerGameId,
      roundId: descriptor.roundId,
      handNumber: descriptor.handNumber,
      terminalResultIdentity: descriptor.terminalResultIdentity,
      winnerPlayerId: descriptor.winnerId,
    }, {
      terminalGenerationId: genId,
      reason,
      handContextId: descriptor.handContextId,
      winnerPosition: descriptor.winnerPosition,
    });
    emit357RuntimeDiag("controller_state_transition", {
      gameId: descriptor.gameId,
      terminalResultIdentity: descriptor.terminalResultIdentity,
    }, { terminalGenerationId: genId, from: phase, to: "post_handoff" });
    setPhase("post_handoff");
    onEnterCanonical({
      gameId: descriptor.gameId,
      dealerGameId: descriptor.dealerGameId,
      roundId: descriptor.roundId,
      handNumber: descriptor.handNumber,
      handContextId: descriptor.handContextId,
      terminalResultIdentity: descriptor.terminalResultIdentity,
      terminalGenerationId: genId,
      winnerId: descriptor.winnerId,
      winnerPosition: descriptor.winnerPosition,
    });
  };

  const proofCardsGenerationKey = useMemo(
    () => descriptor?.terminalGenerationId ?? "none",
    [descriptor?.terminalGenerationId],
  );

  // Render nothing when not owning an instant-357 generation. Legacy
  // path handles normal-win untouched.
  if (!isInstant357 || !descriptor) {
    // Keep import alive for downstream type-checking.
    void isSameTerminal357Descriptor;
    return null;
  }

  const announcementTitle = `${descriptor.winnerName} sweeps the pot and legs with 3-5-7!`;
  const showAnnouncement = phase !== "idle";
  const showProofCards =
    phase === "proof_cards" ||
    phase === "sweep_legs" ||
    phase === "handoff_pending" ||
    phase === "post_handoff";
  const showSweep = phase === "sweep_legs";

  return (
    <>
      {showAnnouncement && (
        <div className="absolute inset-x-0 top-4 z-40 flex justify-center pointer-events-none px-4">
          <div className="max-w-md w-full">
            <LifecycleAnnouncement title={announcementTitle} />
          </div>
        </div>
      )}

      <ThreeFiveSevenProofCardsAnimation
        show={showProofCards}
        cards={descriptor.proofCards ?? []}
        winnerPosition={descriptor.winnerPosition}
        generationKey={proofCardsGenerationKey}
        onComplete={() => {
          if (phase !== "proof_cards") return;
          emit357RuntimeDiag("controller_proof_cards_complete", {
            gameId: descriptor.gameId,
            terminalResultIdentity: descriptor.terminalResultIdentity,
            winnerPlayerId: descriptor.winnerId,
          }, {
            terminalGenerationId: descriptor.terminalGenerationId,
            hadAuthoritativeLegs: descriptor.hadAuthoritativeLegs,
          });
          if (descriptor.hadAuthoritativeLegs) {
            emit357RuntimeDiag("controller_state_transition", {
              gameId: descriptor.gameId,
              terminalResultIdentity: descriptor.terminalResultIdentity,
            }, {
              terminalGenerationId: descriptor.terminalGenerationId,
              from: "proof_cards",
              to: "sweep_legs",
            });
            setPhase("sweep_legs");
          } else {
            emit357RuntimeDiag("controller_sweep_legs_skipped", {
              gameId: descriptor.gameId,
              terminalResultIdentity: descriptor.terminalResultIdentity,
            }, { terminalGenerationId: descriptor.terminalGenerationId });
            enterCanonicalNow("sweep_legs_skipped");
          }
        }}
      />

      <SweepTheLegsAnimation
        show={showSweep}
        onComplete={() => {
          if (phase !== "sweep_legs") return;
          emit357RuntimeDiag("controller_sweep_legs_complete", {
            gameId: descriptor.gameId,
            terminalResultIdentity: descriptor.terminalResultIdentity,
          }, { terminalGenerationId: descriptor.terminalGenerationId });
          enterCanonicalNow("sweep_legs_complete");
        }}
      />
    </>
  );
};
