/**
 * Holm hand admission — physical-provenance gate.
 *
 * Hard PENDING boundary for the run-back/new-hand transport launch.
 * A new hand is "admitted" iff:
 *
 *   1. handContextId is non-null (we know what hand we are talking about),
 *   2. selfHandPayload matches the active HCI by physical provenance and
 *      has exactly the expected card count for this hand,
 *   3. communityPayload matches the active HCI by physical provenance.
 *
 * `source_version` is a server-issued coherent hand-payload revision
 * stamped IDENTICALLY on every card row in one provisioning/update
 * transaction (NOT a per-row counter). Older revisions for the same
 * HCI are rejected upstream; this hook only checks identity match and
 * size. The latest-accepted revision tracking lives in the fetch layer.
 *
 * The admission latch is per-HCI: each HCI admits exactly once. On the
 * admission edge, callers may fire the single
 *   resetForHand → beginDealForHand → beginWaveForHand
 * sequence. Before admission, callers MUST pass selfHand = null to the
 * orchestrator (never `[]`) so the PENDING sentinel suppresses any
 * resetForHand / beginDealForHand / beginWaveForHand / transport
 * dispatch for the new HCI.
 *
 * This hook does not fetch; it only gates. The caller owns the
 * HCI-bound dedupe of the fetch itself.
 */

import { useMemo, useRef } from 'react';

export interface HolmHandPayloadIdentity {
  /** Authoritative round id the payload was minted for. */
  roundId: string;
  /** Authoritative hand-context id the payload was minted for. */
  handContextId: string;
  /**
   * Coherent hand-payload revision: server-issued, stamped IDENTICALLY
   * on every card row in one provisioning/update transaction. Monotonic
   * for the tuple (player_id, round_id, handContextId).
   */
  sourceVersion: number;
}

export interface HolmSelfHandPayload extends HolmHandPayloadIdentity {
  /** Cards belonging to this admission revision (all from one source_version). */
  cards: ReadonlyArray<unknown>;
}

export interface HolmCommunityPayload extends HolmHandPayloadIdentity {
  /** Community cards visible at this revision. */
  cards: ReadonlyArray<unknown>;
}

export interface UseHolmHandAdmissionArgs {
  /** The current active hand-context id. Null while no hand is live. */
  handContextId: string | null;
  /** The authoritative expected hand size for this hand (Holm: cardsPerPlayer). */
  expectedHandSize: number;
  /** Structured self-hand payload, or null while pending. */
  selfHandPayload: HolmSelfHandPayload | null;
  /** Structured community payload, or null while pending. */
  communityPayload: HolmCommunityPayload | null;
}

export interface HolmHandAdmission {
  /** True iff the current HCI is fully admitted (safe to launch transport). */
  admitted: boolean;
  /**
   * First failing reason — for forensics. Undefined when admitted.
   * Stable string codes so they can be matched in HUD/pill output.
   */
  reason?:
    | 'NO_HCI'
    | 'SELF_PAYLOAD_NULL'
    | 'SELF_PAYLOAD_HCI_MISMATCH'
    | 'SELF_PAYLOAD_UNDERSIZED'
    | 'COMMUNITY_PAYLOAD_NULL'
    | 'COMMUNITY_PAYLOAD_HCI_MISMATCH';
  /**
   * The HCI on which this admission was first granted. Stable for the
   * lifetime of that HCI. Changes only when the HCI changes.
   */
  admittedHandContextId: string | null;
}

/**
 * Per-HCI admission latch.
 *
 * Returns `admitted = true` exactly once per distinct HCI, on the first
 * render where all admission predicates hold. Subsequent renders for the
 * same HCI continue to return true regardless of payload churn (the
 * underlying fetch layer is responsible for rejecting older revisions).
 *
 * On HCI change, the latch resets — the new HCI must pass admission
 * from scratch.
 */
export function useHolmHandAdmission({
  handContextId,
  expectedHandSize,
  selfHandPayload,
  communityPayload,
}: UseHolmHandAdmissionArgs): HolmHandAdmission {
  // Per-HCI latch. We remember the HCI at which we admitted so that
  // identity-only churn for the SAME HCI keeps returning admitted=true,
  // and any HCI change forces a clean re-admission.
  const admittedHciRef = useRef<string | null>(null);

  return useMemo<HolmHandAdmission>(() => {
    if (!handContextId) {
      // HCI cleared — drop any prior latch so the next HCI starts clean.
      admittedHciRef.current = null;
      return { admitted: false, reason: 'NO_HCI', admittedHandContextId: null };
    }

    // If the HCI changed under us, drop the prior latch.
    if (admittedHciRef.current && admittedHciRef.current !== handContextId) {
      admittedHciRef.current = null;
    }

    // If we already admitted this exact HCI, stay admitted regardless
    // of payload reference churn. Out-of-order revision protection is
    // owned by the fetch/acceptance layer, not by this latch.
    if (admittedHciRef.current === handContextId) {
      return { admitted: true, admittedHandContextId: handContextId };
    }

    if (!selfHandPayload) {
      return { admitted: false, reason: 'SELF_PAYLOAD_NULL', admittedHandContextId: null };
    }
    if (selfHandPayload.handContextId !== handContextId) {
      return {
        admitted: false,
        reason: 'SELF_PAYLOAD_HCI_MISMATCH',
        admittedHandContextId: null,
      };
    }
    if (selfHandPayload.cards.length !== expectedHandSize) {
      return {
        admitted: false,
        reason: 'SELF_PAYLOAD_UNDERSIZED',
        admittedHandContextId: null,
      };
    }
    if (!communityPayload) {
      return { admitted: false, reason: 'COMMUNITY_PAYLOAD_NULL', admittedHandContextId: null };
    }
    if (communityPayload.handContextId !== handContextId) {
      return {
        admitted: false,
        reason: 'COMMUNITY_PAYLOAD_HCI_MISMATCH',
        admittedHandContextId: null,
      };
    }

    // Edge — admit this HCI.
    admittedHciRef.current = handContextId;
    return { admitted: true, admittedHandContextId: handContextId };
  }, [handContextId, expectedHandSize, selfHandPayload, communityPayload]);
}

/**
 * Pure helper for the client acceptance rules at the fetch/subscription
 * boundary. Returns true iff a freshly arrived payload should be
 * admitted into client state for the given active HCI and the latest
 * accepted revision tracker.
 *
 * Rejection cases (return false):
 *   - active HCI is null
 *   - payload HCI / roundId does not match the active HCI
 *   - payload.sourceVersion is older than the latest accepted revision
 *     for this HCI
 *
 * Mixed-revision detection (rows of one assembled payload bearing
 * different source_version values) is the assembler's responsibility
 * upstream of this check.
 */
export function shouldAcceptHolmPayload(args: {
  activeHandContextId: string | null;
  activeRoundId: string | null;
  payload: HolmHandPayloadIdentity;
  latestAcceptedSourceVersionForHci: number | null;
}): boolean {
  const { activeHandContextId, activeRoundId, payload, latestAcceptedSourceVersionForHci } = args;
  if (!activeHandContextId) return false;
  if (payload.handContextId !== activeHandContextId) return false;
  if (activeRoundId != null && payload.roundId !== activeRoundId) return false;
  if (
    latestAcceptedSourceVersionForHci != null &&
    payload.sourceVersion < latestAcceptedSourceVersionForHci
  ) {
    return false;
  }
  return true;
}
