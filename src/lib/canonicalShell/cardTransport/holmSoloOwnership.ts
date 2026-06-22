/**
 * holmSoloOwnership — WAR-TIME ownership root registry for Holm solo.
 *
 * Tracks which presentation "roots" are mounted at any moment:
 *   - SELF_HAND       (viewer's PlayerHand in bottom tray)
 *   - TABLED_SELF     (viewer's cards rendered on the felt as tabled)
 *   - CHUCKY_TABLED   (Chucky's tabled card pile)
 *   - COMMUNITY       (community card stage)
 *
 * Invariant during SOLO_DECLARED → CHUCKY_REVEAL → SHOWDOWN:
 *   SELF_HAND XOR TABLED_SELF for the viewer's card ids.
 *   If both mount simultaneously, record SOLO_DOUBLE_OWNERSHIP.
 *
 * WAR-TIME stage-persistence additions:
 *   - Emits TABLED_SELF_MOUNT/UNMOUNT, CHUCKY_STAGE_MOUNT/UNMOUNT,
 *     COMMUNITY_STAGE_MOUNT/UNMOUNT into the Holm timeline.
 *   - Emits SOLO_SHOWDOWN_STAGE_DESTROYED when TABLED_SELF or
 *     CHUCKY_TABLED unmounts during any phase that is NOT
 *     NEXT_HAND_PRE_DEAL / GAMEPLAY-pre-solo.
 *
 * NO logic changes. Pure instrumentation.
 */

import { recordHolmTimelineEvent } from './holmWartimeForensics';

export type HolmSoloRoot =
  | 'SELF_HAND'
  | 'TABLED_SELF'
  | 'CHUCKY_TABLED'
  | 'COMMUNITY';

export interface HolmSoloRootRecord {
  root: HolmSoloRoot;
  mounted: boolean;
  cardIds: string[];
  handContextId: string | null;
  soloDeclared: boolean;
  phase: string;
  updatedAt: number;
}

export interface HolmSoloOwnershipViolation {
  type: 'SOLO_DOUBLE_OWNERSHIP' | 'SOLO_SHOWDOWN_STAGE_DESTROYED';
  root?: HolmSoloRoot;
  phase?: string;
  handContextId: string | null;
  soloDeclared: boolean;
  selfHandCardIds?: string[];
  tabledSelfCardIds?: string[];
  overlap?: string[];
  at: number;
}

type W = typeof window & {
  __holmSoloOwnership?: Record<string, HolmSoloRootRecord>;
  __holmSoloOwnershipViolations?: HolmSoloOwnershipViolation[];
  __holmStageRenderSeq?: number;
};

const CAP = 200;

// Phases during which TABLED_SELF and CHUCKY_TABLED MUST persist.
// Unmount during any of these = SOLO_SHOWDOWN_STAGE_DESTROYED.
const PROTECTED_PHASES = new Set<string>([
  'SOLO_DECLARED',
  'CHUCKY_DEAL',
  'CHUCKY_REVEAL',
  'RESULT_ANNOUNCEMENT',
  'SHOWDOWN',
  'WIN_SEQUENCE',
  'PLAYER_TO_POT',
]);

function bag(): Record<string, HolmSoloRootRecord> {
  if (typeof window === 'undefined') return {};
  const w = window as W;
  if (!w.__holmSoloOwnership) w.__holmSoloOwnership = {};
  return w.__holmSoloOwnership;
}

function viol(): HolmSoloOwnershipViolation[] {
  if (typeof window === 'undefined') return [];
  const w = window as W;
  if (!w.__holmSoloOwnershipViolations) w.__holmSoloOwnershipViolations = [];
  return w.__holmSoloOwnershipViolations;
}

function nextRenderSeq(): number {
  if (typeof window === 'undefined') return 0;
  const w = window as W;
  w.__holmStageRenderSeq = (w.__holmStageRenderSeq ?? 0) + 1;
  return w.__holmStageRenderSeq;
}

function stageEventName(root: HolmSoloRoot, mounting: boolean): string | null {
  switch (root) {
    case 'TABLED_SELF':
      return mounting ? 'TABLED_SELF_MOUNT' : 'TABLED_SELF_UNMOUNT';
    case 'CHUCKY_TABLED':
      return mounting ? 'CHUCKY_STAGE_MOUNT' : 'CHUCKY_STAGE_UNMOUNT';
    case 'COMMUNITY':
      return mounting ? 'COMMUNITY_STAGE_MOUNT' : 'COMMUNITY_STAGE_UNMOUNT';
    default:
      return null;
  }
}

export function recordHolmSoloRoot(rec: Omit<HolmSoloRootRecord, 'updatedAt'>): void {
  if (typeof window === 'undefined') return;
  const b = bag();
  b[rec.root] = { ...rec, updatedAt: performance.now() };
  // Detect SELF_HAND ⨉ TABLED_SELF overlap.
  const sh = b['SELF_HAND'];
  const ts = b['TABLED_SELF'];
  if (sh?.mounted && ts?.mounted) {
    const shSet = new Set(sh.cardIds);
    const overlap = ts.cardIds.filter((c) => shSet.has(c));
    if (overlap.length > 0 || (sh.cardIds.length > 0 && ts.cardIds.length > 0)) {
      const vs = viol();
      vs.push({
        type: 'SOLO_DOUBLE_OWNERSHIP',
        handContextId: rec.handContextId,
        soloDeclared: rec.soloDeclared,
        selfHandCardIds: sh.cardIds,
        tabledSelfCardIds: ts.cardIds,
        overlap,
        at: performance.now(),
      });
      while (vs.length > CAP) vs.shift();
    }
  }
}

export function clearHolmSoloRoot(root: HolmSoloRoot, handContextId: string | null): void {
  if (typeof window === 'undefined') return;
  const b = bag();
  const prev = b[root];
  if (!prev) return;
  b[root] = {
    root,
    mounted: false,
    cardIds: [],
    handContextId,
    soloDeclared: prev.soloDeclared,
    phase: prev.phase,
    updatedAt: performance.now(),
  };
}

export function getHolmSoloOwnership(): Record<string, HolmSoloRootRecord> {
  return bag();
}

export function getHolmSoloOwnershipViolations(): HolmSoloOwnershipViolation[] {
  return viol();
}

// ── React registrar ────────────────────────────────────────────────
import { useEffect, useRef } from 'react';

export function HolmSoloRootRegistrar({
  root,
  mounted,
  cardIds,
  handContextId,
  soloDeclared,
  phase,
  caller,
}: {
  root: HolmSoloRoot;
  mounted: boolean;
  cardIds: string[];
  handContextId: string | null;
  soloDeclared: boolean;
  phase: string;
  caller?: string;
}) {
  const key = cardIds.join(',');
  // Track latest phase so the cleanup callback can fire violations with the
  // phase active at unmount time (not the phase from the deps that triggered
  // cleanup, which may already be stale by one render).
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const handContextRef = useRef(handContextId);
  handContextRef.current = handContextId;
  const soloRef = useRef(soloDeclared);
  soloRef.current = soloDeclared;
  const callerRef = useRef(caller);
  callerRef.current = caller;

  useEffect(() => {
    recordHolmSoloRoot({ root, mounted, cardIds, handContextId, soloDeclared, phase });
    const mountEvt = stageEventName(root, true);
    if (mountEvt) {
      recordHolmTimelineEvent(
        mountEvt,
        {
          handContextId,
          phase,
          owner: root,
          caller: caller ?? 'unknown',
          reason: 'EFFECT_MOUNT',
          cardIds,
          renderSeq: nextRenderSeq(),
          soloDeclared,
        },
        handContextId,
      );
    }
    return () => {
      const livePhase = phaseRef.current;
      const liveHand = handContextRef.current;
      const liveSolo = soloRef.current;
      const liveCaller = callerRef.current;
      clearHolmSoloRoot(root, liveHand);
      const unmountEvt = stageEventName(root, false);
      if (unmountEvt) {
        recordHolmTimelineEvent(
          unmountEvt,
          {
            handContextId: liveHand,
            phase: livePhase,
            owner: root,
            caller: liveCaller ?? 'unknown',
            reason: 'EFFECT_CLEANUP',
            cardIds,
            renderSeq: nextRenderSeq(),
            soloDeclared: liveSolo,
          },
          liveHand,
        );
      }
      // SOLO_SHOWDOWN_STAGE_DESTROYED — TABLED_SELF / CHUCKY_TABLED must
      // never disappear while in protected phases. COMMUNITY also persists
      // through these phases; record but do not mark same violation.
      if (
        (root === 'TABLED_SELF' || root === 'CHUCKY_TABLED') &&
        PROTECTED_PHASES.has(livePhase) &&
        liveSolo
      ) {
        const vs = viol();
        vs.push({
          type: 'SOLO_SHOWDOWN_STAGE_DESTROYED',
          root,
          phase: livePhase,
          handContextId: liveHand,
          soloDeclared: liveSolo,
          at: performance.now(),
        });
        while (vs.length > CAP) vs.shift();
        recordHolmTimelineEvent(
          'SOLO_SHOWDOWN_STAGE_DESTROYED',
          {
            root,
            phase: livePhase,
            handContextId: liveHand,
            caller: liveCaller ?? 'unknown',
            reason: 'unmount-in-protected-phase',
            cardIds,
            renderSeq: nextRenderSeq(),
          },
          liveHand,
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, mounted, key, handContextId, soloDeclared, phase]);
  return null;
}
