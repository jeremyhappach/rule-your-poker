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
 * NO logic changes. Pure instrumentation.
 *
 * Globals (devtools):
 *   window.__holmSoloOwnership            → Record<root, RootRecord>
 *   window.__holmSoloOwnershipViolations  → Violation[]
 */

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
  type: 'SOLO_DOUBLE_OWNERSHIP';
  handContextId: string | null;
  soloDeclared: boolean;
  selfHandCardIds: string[];
  tabledSelfCardIds: string[];
  overlap: string[];
  at: number;
}

type W = typeof window & {
  __holmSoloOwnership?: Record<string, HolmSoloRootRecord>;
  __holmSoloOwnershipViolations?: HolmSoloOwnershipViolation[];
};

const CAP = 200;

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
