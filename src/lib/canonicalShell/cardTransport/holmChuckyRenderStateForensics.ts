/**
 * holmChuckyRenderStateForensics — READ-ONLY surgical instrumentation.
 *
 * Captures the *render-time* state of every Chucky card render so we
 * can determine whether cards regress to face-down after first reveal,
 * and whether announcement/win/result rendering switches the cards
 * into a different render branch that defaults to hidden/faceDown.
 *
 * NO React state writes. NO refs mutated. No behavior changes.
 * Only writes to its own module ring buffer + window snapshot.
 */

export type ChuckyRenderBranch =
  | 'NORMAL_CHUCKY_REVEAL'
  | 'CHUCKY_TABLED_PERSISTENCE'
  | 'ANNOUNCEMENT_BRANCH'
  | 'WIN_SEQUENCE_BRANCH'
  | 'RESULT_BRANCH'
  | 'FALLBACK_BRANCH'
  | 'HIDDEN_DEFAULT_BRANCH'
  | 'UNKNOWN_BRANCH';

export interface ChuckyRenderStateRecord {
  seq: number;
  timestamp: number;
  wall: string;
  handContextId: string | null;
  cardId: string | null;
  cardIndex: number;
  cardLabel: string | null;
  cardValue: string | null;
  cardSuit: string | null;
  roundStatus: string | null;
  phase: string | null;
  announcementShowing: boolean;
  winSequenceActive: boolean;
  isShowingAnnouncement: boolean;
  resultGateAllowed: boolean;
  serverRevealCount: number | null;
  visualRevealCount: number | null;
  cachedChuckyCardsRevealed: number | null;
  requiredRevealCount: number | null;
  visualRevealComplete: boolean;
  serverRevealComplete: boolean;
  renderBranch: ChuckyRenderBranch;
  stageOwner: string | null;
  cardOwner: string | null;
  propSource: string | null;
  inputHidden: boolean | null;
  inputFaceUp: boolean | null;
  outputHidden: boolean | null;
  outputFaceUp: boolean | null;
  actualPropIsHidden: boolean;
  actualPropFaceUp: boolean;
  previousActualPropIsHidden: boolean | null;
  previousActualPropFaceUp: boolean | null;
  reason: string | null;
  sourceFile: string;
  functionLabel: string;
  callsite: string;
  stack: string | null;
}

export interface ChuckyRenderStateViolation {
  seq: number;
  timestamp: number;
  wall: string;
  type:
    | 'HOLM_CHUCKY_CARD_FACE_REGRESSED_AFTER_REVEAL'
    | 'HOLM_CHUCKY_CARD_RENDER_BRANCH_CHANGED_AFTER_REVEAL'
    | 'HOLM_CHUCKY_CARD_RENDERED_FACE_DOWN_IN_WIN'
    | 'HOLM_CHUCKY_CARD_RENDERED_FACE_DOWN_IN_ANNOUNCEMENT'
    | 'HOLM_CHUCKY_CARD_RENDERED_FACE_DOWN_IN_RESULT'
    | 'HOLM_CHUCKY_CARD_RENDERED_FROM_FALLBACK_AFTER_REVEAL'
    | 'HOLM_CHUCKY_SERVER_COMPLETE_VISUAL_INCOMPLETE_RENDER'
    | 'HOLM_CHUCKY_WIN_BRANCH_BEFORE_VISUAL_COMPLETE'
    | 'HOLM_CHUCKY_ANNOUNCEMENT_BRANCH_BEFORE_VISUAL_COMPLETE';
  handContextId: string | null;
  cardId: string | null;
  cardIndex: number;
  payload: Record<string, unknown>;
}

const RING = 2000;
const VIOL_RING = 500;
const records: ChuckyRenderStateRecord[] = [];
const violations: ChuckyRenderStateViolation[] = [];

// Per-card memory across renders within a hand.
interface PerCardMemory {
  handContextId: string | null;
  hasEverRevealed: boolean;
  lastActualPropIsHidden: boolean | null;
  lastActualPropFaceUp: boolean | null;
  lastRenderBranch: ChuckyRenderBranch | null;
}
const cardMemory = new Map<string, PerCardMemory>(); // key = `${handContextId}#${cardIndex}`

let _seq = 0;
let _viol = 0;

function nowPerf(): number {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function pushViolation(
  v: Omit<ChuckyRenderStateViolation, 'seq' | 'timestamp' | 'wall'>,
): void {
  const entry: ChuckyRenderStateViolation = {
    ...v,
    seq: ++_viol,
    timestamp: nowPerf(),
    wall: new Date().toISOString(),
  };
  violations.push(entry);
  while (violations.length > VIOL_RING) violations.shift();
}

export interface ChuckyRenderStateInput {
  handContextId: string | null;
  cardIndex: number;
  card: { rank?: string; suit?: string } | null;
  roundStatus: string | null;
  phase: string | null;
  isShowingAnnouncement: boolean;
  holmWinPotTriggerActive: boolean;
  resultGateAllowed: boolean;
  awaitingNextRound: boolean;
  lastRoundResultPresent: boolean;
  serverRevealCount: number | null;
  cachedChuckyCardsRevealed: number;
  requiredRevealCount: number | null;
  // Source-of-cards info — which branch supplied the cards array?
  cardsCameFromLive: boolean;       // cachedChuckyCards present
  cardsCameFromSticky: boolean;     // fell back to chuckyStageStickyRef
  // The actual props the card is being rendered with right now.
  actualPropIsHidden: boolean;
  actualPropFaceUp: boolean;
  // Optional reason annotation if caller has one.
  reason?: string | null;
}

function classifyRenderBranch(i: ChuckyRenderStateInput): ChuckyRenderBranch {
  // Priority: most-specific first — answer asks "did announcement/win
  // switch into a different render branch?"
  if (i.holmWinPotTriggerActive) return 'WIN_SEQUENCE_BRANCH';
  if (i.isShowingAnnouncement) return 'ANNOUNCEMENT_BRANCH';
  if (i.awaitingNextRound && i.lastRoundResultPresent) return 'RESULT_BRANCH';
  if (!i.cardsCameFromLive && i.cardsCameFromSticky) return 'CHUCKY_TABLED_PERSISTENCE';
  if (i.cardsCameFromLive) return 'NORMAL_CHUCKY_REVEAL';
  if (!i.cardsCameFromLive && !i.cardsCameFromSticky) return 'FALLBACK_BRANCH';
  return 'UNKNOWN_BRANCH';
}

export function recordChuckyRenderState(i: ChuckyRenderStateInput): void {
  const key = `${i.handContextId ?? '∅'}#${i.cardIndex}`;
  let mem = cardMemory.get(key);
  if (!mem || mem.handContextId !== i.handContextId) {
    mem = {
      handContextId: i.handContextId,
      hasEverRevealed: false,
      lastActualPropIsHidden: null,
      lastActualPropFaceUp: null,
      lastRenderBranch: null,
    };
    cardMemory.set(key, mem);
  }

  const branch = classifyRenderBranch(i);
  const cardLabel = i.card?.rank != null && i.card?.suit != null
    ? `${i.card.rank}${i.card.suit}`
    : null;
  const cardId = i.handContextId
    ? `${i.handContextId}#chucky-${i.cardIndex}`
    : `∅#chucky-${i.cardIndex}`;

  const serverRevealComplete =
    i.serverRevealCount != null && i.requiredRevealCount != null
      ? i.serverRevealCount >= i.requiredRevealCount
      : false;
  const visualRevealComplete =
    i.requiredRevealCount != null
      ? i.cachedChuckyCardsRevealed >= i.requiredRevealCount
      : false;

  const rec: ChuckyRenderStateRecord = {
    seq: ++_seq,
    timestamp: nowPerf(),
    wall: new Date().toISOString(),
    handContextId: i.handContextId,
    cardId,
    cardIndex: i.cardIndex,
    cardLabel,
    cardValue: i.card?.rank ?? null,
    cardSuit: i.card?.suit ?? null,
    roundStatus: i.roundStatus,
    phase: i.phase,
    announcementShowing: i.isShowingAnnouncement,
    winSequenceActive: i.holmWinPotTriggerActive,
    isShowingAnnouncement: i.isShowingAnnouncement,
    resultGateAllowed: i.resultGateAllowed,
    serverRevealCount: i.serverRevealCount,
    visualRevealCount: i.cachedChuckyCardsRevealed,
    cachedChuckyCardsRevealed: i.cachedChuckyCardsRevealed,
    requiredRevealCount: i.requiredRevealCount,
    visualRevealComplete,
    serverRevealComplete,
    renderBranch: branch,
    stageOwner: 'MobileGameTable.holmChuckyStage',
    cardOwner: 'cachedChuckyCardsRevealed',
    propSource: i.cardsCameFromLive
      ? 'cachedChuckyCards'
      : i.cardsCameFromSticky
        ? 'chuckyStageStickyRef'
        : 'none',
    inputHidden: !i.actualPropFaceUp,
    inputFaceUp: i.actualPropFaceUp,
    outputHidden: i.actualPropIsHidden,
    outputFaceUp: i.actualPropFaceUp,
    actualPropIsHidden: i.actualPropIsHidden,
    actualPropFaceUp: i.actualPropFaceUp,
    previousActualPropIsHidden: mem.lastActualPropIsHidden,
    previousActualPropFaceUp: mem.lastActualPropFaceUp,
    reason: i.reason ?? null,
    sourceFile: 'src/components/MobileGameTable.tsx',
    functionLabel: 'holmChuckyStage.map.cardRender',
    callsite: 'MobileGameTable.tsx:holmChuckyStage',
    stack: captureStack(),
  };
  records.push(rec);
  while (records.length > RING) records.shift();

  // ── Violations ──────────────────────────────────────────────────────
  // 1. Face regression after first reveal within same hand.
  if (mem.hasEverRevealed && !i.actualPropFaceUp) {
    pushViolation({
      type: 'HOLM_CHUCKY_CARD_FACE_REGRESSED_AFTER_REVEAL',
      handContextId: i.handContextId,
      cardId,
      cardIndex: i.cardIndex,
      payload: {
        previousFaceUp: mem.lastActualPropFaceUp,
        previousBranch: mem.lastRenderBranch,
        branch,
        renderSeq: rec.seq,
      },
    });
  }

  // 2. Render branch changed after first reveal.
  if (
    mem.hasEverRevealed &&
    mem.lastRenderBranch != null &&
    mem.lastRenderBranch !== branch
  ) {
    pushViolation({
      type: 'HOLM_CHUCKY_CARD_RENDER_BRANCH_CHANGED_AFTER_REVEAL',
      handContextId: i.handContextId,
      cardId,
      cardIndex: i.cardIndex,
      payload: {
        previousBranch: mem.lastRenderBranch,
        branch,
        actualPropFaceUp: i.actualPropFaceUp,
        renderSeq: rec.seq,
      },
    });
  }

  // 3. Face-down in WIN.
  if (i.holmWinPotTriggerActive && !i.actualPropFaceUp) {
    pushViolation({
      type: 'HOLM_CHUCKY_CARD_RENDERED_FACE_DOWN_IN_WIN',
      handContextId: i.handContextId,
      cardId,
      cardIndex: i.cardIndex,
      payload: { branch, renderSeq: rec.seq },
    });
  }
  // 4. Face-down in announcement.
  if (i.isShowingAnnouncement && !i.actualPropFaceUp) {
    pushViolation({
      type: 'HOLM_CHUCKY_CARD_RENDERED_FACE_DOWN_IN_ANNOUNCEMENT',
      handContextId: i.handContextId,
      cardId,
      cardIndex: i.cardIndex,
      payload: { branch, renderSeq: rec.seq },
    });
  }
  // 5. Face-down in result.
  if (i.awaitingNextRound && i.lastRoundResultPresent && !i.actualPropFaceUp) {
    pushViolation({
      type: 'HOLM_CHUCKY_CARD_RENDERED_FACE_DOWN_IN_RESULT',
      handContextId: i.handContextId,
      cardId,
      cardIndex: i.cardIndex,
      payload: { branch, renderSeq: rec.seq },
    });
  }
  // 6. Rendered from fallback (sticky) after first reveal — proves stage owner swap.
  if (
    mem.hasEverRevealed &&
    !i.cardsCameFromLive &&
    i.cardsCameFromSticky
  ) {
    pushViolation({
      type: 'HOLM_CHUCKY_CARD_RENDERED_FROM_FALLBACK_AFTER_REVEAL',
      handContextId: i.handContextId,
      cardId,
      cardIndex: i.cardIndex,
      payload: { branch, renderSeq: rec.seq },
    });
  }
  // 7. Server reveal complete but visual incomplete on this render.
  if (serverRevealComplete && !visualRevealComplete) {
    pushViolation({
      type: 'HOLM_CHUCKY_SERVER_COMPLETE_VISUAL_INCOMPLETE_RENDER',
      handContextId: i.handContextId,
      cardId,
      cardIndex: i.cardIndex,
      payload: {
        serverRevealCount: i.serverRevealCount,
        visualRevealCount: i.cachedChuckyCardsRevealed,
        requiredRevealCount: i.requiredRevealCount,
        branch,
        renderSeq: rec.seq,
      },
    });
  }
  // 8. Win branch entered before visual complete.
  if (i.holmWinPotTriggerActive && !visualRevealComplete) {
    pushViolation({
      type: 'HOLM_CHUCKY_WIN_BRANCH_BEFORE_VISUAL_COMPLETE',
      handContextId: i.handContextId,
      cardId,
      cardIndex: i.cardIndex,
      payload: {
        visualRevealCount: i.cachedChuckyCardsRevealed,
        requiredRevealCount: i.requiredRevealCount,
        branch,
        renderSeq: rec.seq,
      },
    });
  }
  // 9. Announcement branch entered before visual complete.
  if (i.isShowingAnnouncement && !visualRevealComplete) {
    pushViolation({
      type: 'HOLM_CHUCKY_ANNOUNCEMENT_BRANCH_BEFORE_VISUAL_COMPLETE',
      handContextId: i.handContextId,
      cardId,
      cardIndex: i.cardIndex,
      payload: {
        visualRevealCount: i.cachedChuckyCardsRevealed,
        requiredRevealCount: i.requiredRevealCount,
        branch,
        renderSeq: rec.seq,
      },
    });
  }

  // Update memory AFTER violations evaluated.
  if (i.actualPropFaceUp) mem.hasEverRevealed = true;
  mem.lastActualPropIsHidden = i.actualPropIsHidden;
  mem.lastActualPropFaceUp = i.actualPropFaceUp;
  mem.lastRenderBranch = branch;

  publishWindow();
}

function captureStack(): string | null {
  try {
    const e = new Error();
    return (e.stack ?? '').split('\n').slice(2, 8).join('\n');
  } catch {
    return null;
  }
}

export interface ChuckyRenderStateSnapshot {
  generatedAt: string;
  totals: { records: number; violations: number };
  byBranch: Record<ChuckyRenderBranch, number>;
  records: ChuckyRenderStateRecord[];
  violations: ChuckyRenderStateViolation[];
}

export function getChuckyRenderStateForensics(): ChuckyRenderStateSnapshot {
  const byBranch: Record<ChuckyRenderBranch, number> = {
    NORMAL_CHUCKY_REVEAL: 0,
    CHUCKY_TABLED_PERSISTENCE: 0,
    ANNOUNCEMENT_BRANCH: 0,
    WIN_SEQUENCE_BRANCH: 0,
    RESULT_BRANCH: 0,
    FALLBACK_BRANCH: 0,
    HIDDEN_DEFAULT_BRANCH: 0,
    UNKNOWN_BRANCH: 0,
  };
  for (const r of records) byBranch[r.renderBranch]++;
  return {
    generatedAt: new Date().toISOString(),
    totals: { records: records.length, violations: violations.length },
    byBranch,
    records: records.slice(),
    violations: violations.slice(),
  };
}

function publishWindow(): void {
  if (typeof window === 'undefined') return;
  try {
    (window as unknown as { __holmChuckyRenderStateForensics?: ChuckyRenderStateSnapshot })
      .__holmChuckyRenderStateForensics = getChuckyRenderStateForensics();
  } catch {
    /* noop */
  }
}

export function buildChuckyRenderStateForensicsText(): string {
  const snap = getChuckyRenderStateForensics();
  const lines: string[] = [];
  lines.push('# HOLM CHUCKY RENDER STATE FORENSICS');
  lines.push(`generatedAt=${snap.generatedAt}`);
  lines.push(`totals=${JSON.stringify(snap.totals)}`);
  lines.push(`byBranch=${JSON.stringify(snap.byBranch)}`);
  lines.push('');
  lines.push(`--- VIOLATIONS (${snap.violations.length}) ---`);
  for (const v of snap.violations) {
    lines.push(
      `#${v.seq} t=${v.timestamp.toFixed(1)} hc=${v.handContextId ?? '—'} card=${v.cardId} idx=${v.cardIndex} ${v.type} ${safe(v.payload)}`,
    );
  }
  lines.push('');
  lines.push(`--- RECORDS (${snap.records.length}) ---`);
  for (const r of snap.records) {
    lines.push(
      `#${r.seq} t=${r.timestamp.toFixed(1)} hc=${r.handContextId ?? '—'} idx=${r.cardIndex} label=${r.cardLabel ?? '—'} ` +
      `branch=${r.renderBranch} propSrc=${r.propSource} ` +
      `actualHidden=${r.actualPropIsHidden} actualFaceUp=${r.actualPropFaceUp} ` +
      `prevHidden=${r.previousActualPropIsHidden} prevFaceUp=${r.previousActualPropFaceUp} ` +
      `phase=${r.phase ?? '—'} roundStatus=${r.roundStatus ?? '—'} ` +
      `ann=${r.announcementShowing} win=${r.winSequenceActive} resultGate=${r.resultGateAllowed} ` +
      `srvRev=${r.serverRevealCount} visRev=${r.visualRevealCount}/${r.requiredRevealCount ?? '—'} ` +
      `srvDone=${r.serverRevealComplete} visDone=${r.visualRevealComplete}`,
    );
  }
  return lines.join('\n');
}

function safe(v: unknown): string {
  try { return JSON.stringify(v); } catch { return '"[unserializable]"'; }
}

if (typeof window !== 'undefined') {
  try { publishWindow(); } catch { /* noop */ }
}
