/**
 * holmWartimeForensics — INSTRUMENTATION ONLY.
 *
 * One repro must answer:
 *   1. Why community 3/4 reveal late (after all decisions / before Chucky deal).
 *   2. Why Chucky reveal waits on (a) allChuckySettled, (b) announcement,
 *      (c) arbitrary timeout, or (d) wrong handContext.
 *   3. Why TABLED_SELF persists or receives next-hand cards.
 *
 * Surfaces:
 *   window.__holmDealDbg.community
 *   window.__holmDealDbg.chucky
 *   window.__holmDealDbg.ownership
 *   window.__holmDealDbg.timelineEvents     (ring buffer, ≤300)
 *   window.__holmDealDbg.wartimeViolations  (ring buffer, ≤300)
 *
 * Plus explicit hooks (recordHolmTimelineEvent) for sites that already
 * own the state change (e.g. Chucky reveal stepper).
 *
 * NO logic changes. NO fixes. Pure forensics.
 */

import { getHolmDealDbgMeta, type HolmDealDbgMeta } from './holmDealDbg';
import {
  getHolmSoloOwnership,
  type HolmSoloRootRecord,
} from './holmSoloOwnership';

// ─── Types ────────────────────────────────────────────────────────────────

export type HolmTimelineEventName =
  | 'SOLO_DECLARED'
  | 'TABLED_SELF_MOUNT'
  | 'TABLED_SELF_UNMOUNT'
  | 'SELF_HAND_MOUNT'
  | 'SELF_HAND_UNMOUNT'
  | 'COMMUNITY_REVEAL_CARD_0'
  | 'COMMUNITY_REVEAL_CARD_1'
  | 'COMMUNITY_REVEAL_CARD_2'
  | 'COMMUNITY_REVEAL_CARD_3'
  | 'COMMUNITY_REHIDDEN'
  | 'ALL_PLAYER_DECISIONS_COMPLETE'
  | 'CHUCKY_DEAL_STARTED'
  | 'CHUCKY_CARD_SETTLED'
  | 'ALL_CHUCKY_SETTLED'
  | 'ANNOUNCEMENT_STARTED'
  | 'ANNOUNCEMENT_COMPLETED'
  | 'CHUCKY_REVEAL_STARTED'
  | 'CHUCKY_REVEAL_CARD_0'
  | 'CHUCKY_REVEAL_CARD_1'
  | 'CHUCKY_REVEAL_CARD_2'
  | 'CHUCKY_REVEAL_CARD_3'
  | 'CHUCKY_REVEAL_COMPLETED'
  | 'NEW_HAND_STARTED';

export interface HolmTimelineEvent {
  seq: number;
  t: number;          // performance.now()
  wall: string;       // ISO
  handContextId: string | null;
  event: HolmTimelineEventName | string;
  payload?: Record<string, unknown>;
}

export type HolmWartimeViolationType =
  | 'COMMUNITY_REHIDDEN'
  | 'COMMUNITY_REVEAL_LATE'
  | 'CHUCKY_REVEAL_DELAY'
  | 'CHUCKY_REVEAL_GATED_BY_ANNOUNCEMENT'
  | 'SELF_AND_TABLED_SIMULTANEOUS'
  | 'TABLED_SELF_NEXT_HAND';

export interface HolmWartimeViolation {
  seq: number;
  t: number;
  wall: string;
  type: HolmWartimeViolationType;
  handContextId: string | null;
  payload: Record<string, unknown>;
}

export interface HolmCommunityCardForensics {
  index: number;
  cardId: string | null;
  settled: boolean;
  domMounted: boolean;
  domVisible: boolean;
  faceUp: boolean;
  revealed: boolean;
  owner: string | null;
  firstRevealAt: number | null;
  lastFaceDownAt: number | null;
}

export interface HolmCommunityForensics {
  handContextId: string | null;
  phase: string;
  wave: string | null;
  soloDeclared: boolean;
  communityExpected: number;
  communityDispatched: number;
  communitySettled: number;
  community0: HolmCommunityCardForensics;
  community1: HolmCommunityCardForensics;
  community2: HolmCommunityCardForensics;
  community3: HolmCommunityCardForensics;
  communityRevealPredicate: {
    phaseGate: boolean;
    waveGate: boolean;
    soloGate: boolean;
    chuckyGate: boolean;
    settledGate: boolean;
    finalVisible: boolean;
  };
  allPlayerDecisionsComplete: boolean;
}

export interface HolmChuckyCardForensics {
  index: number;
  cardId: string | null;
  dispatchAt: number | null;
  launchAt: number | null;
  arrivalAt: number | null;
  settleAt: number | null;
  domMounted: boolean;
  domVisible: boolean;
  faceUp: boolean;
  revealScheduledAt: number | null;
  revealStartedAt: number | null;
  revealCompletedAt: number | null;
}

export interface HolmChuckyForensics {
  handContextId: string | null;
  soloDeclared: boolean;
  phase: string;
  announcement: {
    visible: boolean;
    text: string | null;
    startedAt: number | null;
    completedAt: number | null;
  };
  chuckyExpected: number;
  chuckyDispatched: number;
  chuckySettled: number;
  cards: HolmChuckyCardForensics[];
  barriers: {
    allChuckySettledAt: number | null;
    announcementStartedAt: number | null;
    announcementCompletedAt: number | null;
    revealSequenceStartedAt: number | null;
  };
}

export interface HolmOwnershipRootForensics {
  root: 'SELF_HAND' | 'TABLED_SELF' | 'CHUCKY_TABLED' | 'COMMUNITY';
  mounted: boolean;
  cardIds: string[];
  handContextId: string | null;
  soloDeclared: boolean;
  phase: string;
  source: 'currentPlayerCards' | 'settledIds' | 'soloSnapshot' | 'other' | 'unknown';
}

export interface HolmOwnershipForensics {
  handContextId: string | null;
  soloDeclared: boolean;
  activeHandContextId: string | null;
  dealRuntimePhase: string;
  owners: {
    SELF_HAND: HolmOwnershipRootForensics;
    TABLED_SELF: HolmOwnershipRootForensics;
    CHUCKY_TABLED: HolmOwnershipRootForensics;
    COMMUNITY: HolmOwnershipRootForensics;
  };
}

// ─── Ring buffers ─────────────────────────────────────────────────────────

const RING = 300;

const timeline: HolmTimelineEvent[] = [];
const violations: HolmWartimeViolation[] = [];

let _seq = 0;
let _vseq = 0;

const listeners = new Set<() => void>();
function emit() { for (const l of listeners) { try { l(); } catch { /* noop */ } } }

export function subscribeHolmWartime(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getHolmTimelineEvents(): HolmTimelineEvent[] {
  return timeline;
}

export function getHolmWartimeViolations(): HolmWartimeViolation[] {
  return violations;
}

export function recordHolmTimelineEvent(
  event: HolmTimelineEventName | string,
  payload?: Record<string, unknown>,
  handContextId: string | null = null,
): void {
  // Dedupe identical consecutive events (same name + handCtx + JSON payload)
  // so reveal/per-frame churn doesn't blow the buffer.
  const last = timeline[timeline.length - 1];
  const payloadKey = payload ? safeStringify(payload) : '';
  if (last && last.event === event && last.handContextId === handContextId) {
    const lastKey = last.payload ? safeStringify(last.payload) : '';
    if (lastKey === payloadKey) return;
  }
  timeline.push({
    seq: ++_seq,
    t: nowPerf(),
    wall: new Date().toISOString(),
    handContextId,
    event,
    payload,
  });
  while (timeline.length > RING) timeline.shift();
  publish();
  emit();
}

function recordViolation(
  type: HolmWartimeViolationType,
  handContextId: string | null,
  payload: Record<string, unknown>,
): void {
  // Dedupe identical violation for same handContextId within 250ms.
  const now = nowPerf();
  for (let i = violations.length - 1; i >= 0 && violations.length - i < 12; i--) {
    const v = violations[i];
    if (v.type === type && v.handContextId === handContextId && now - v.t < 250) return;
  }
  violations.push({
    seq: ++_vseq,
    t: now,
    wall: new Date().toISOString(),
    type,
    handContextId,
    payload,
  });
  while (violations.length > RING) violations.shift();
  emit();
}

// ─── Per-tick forensic computation ────────────────────────────────────────

interface WartimeMemory {
  handContextId: string | null;
  soloDeclaredAnnounced: boolean;
  selfHandMounted: boolean;
  tabledSelfMounted: boolean;
  communityFaceUp: [boolean, boolean, boolean, boolean];
  communityFirstRevealAt: [number | null, number | null, number | null, number | null];
  communityLastFaceDownAt: [number | null, number | null, number | null, number | null];
  chuckyFirstSettleAt: Map<string, number>;
  chuckyAllSettledAt: number | null;
  chuckyDealStarted: boolean;
  chuckyExpectedCount: number;
  chuckySettledCount: number;
  chuckyFaceUp: boolean[];
  chuckyRevealStartedAt: number | null;
  chuckyRevealCompletedAt: number | null;
  chuckyPerCardRevealAt: (number | null)[];
  announcementVisible: boolean;
  announcementStartedAt: number | null;
  announcementCompletedAt: number | null;
  announcementText: string | null;
  allPlayerDecisionsComplete: boolean;
  lateRevealReported: boolean;
  delayReported: boolean;
}

const mem: WartimeMemory = freshMem(null);

function freshMem(handCtx: string | null): WartimeMemory {
  return {
    handContextId: handCtx,
    soloDeclaredAnnounced: false,
    selfHandMounted: false,
    tabledSelfMounted: false,
    communityFaceUp: [false, false, false, false],
    communityFirstRevealAt: [null, null, null, null],
    communityLastFaceDownAt: [null, null, null, null],
    chuckyFirstSettleAt: new Map(),
    chuckyAllSettledAt: null,
    chuckyDealStarted: false,
    chuckyExpectedCount: 0,
    chuckySettledCount: 0,
    chuckyFaceUp: [],
    chuckyRevealStartedAt: null,
    chuckyRevealCompletedAt: null,
    chuckyPerCardRevealAt: [],
    announcementVisible: false,
    announcementStartedAt: null,
    announcementCompletedAt: null,
    announcementText: null,
    allPlayerDecisionsComplete: false,
    lateRevealReported: false,
    delayReported: false,
  };
}

function resetMemForNewHand(handCtx: string | null) {
  const keys = Object.keys(mem) as (keyof WartimeMemory)[];
  const next = freshMem(handCtx);
  for (const k of keys) (mem as unknown as Record<string, unknown>)[k] = (next as unknown as Record<string, unknown>)[k];
}

interface OwnershipDomScan {
  selfHandCardIds: string[];
  tabledSelfCardIds: string[];
  chuckyTabledCardIds: string[];
  communityCardIds: string[];
}

function scanOwnershipDom(): OwnershipDomScan {
  const out: OwnershipDomScan = {
    selfHandCardIds: [],
    tabledSelfCardIds: [],
    chuckyTabledCardIds: [],
    communityCardIds: [],
  };
  if (typeof document === 'undefined') return out;

  const all = document.querySelectorAll<HTMLElement>('[data-holm-card-id]');
  for (const el of Array.from(all)) {
    const id = el.dataset.holmCardId;
    if (!id) continue;
    const renderer = (el.dataset.holmRenderer || '').toLowerCase();
    const component = (el.dataset.holmComponent || '').toLowerCase();
    const tag = `${renderer} ${component}`;
    if (id.includes('#community-')) out.communityCardIds.push(id);
    else if (id.includes('#chucky-')) out.chuckyTabledCardIds.push(id);
    else if (tag.includes('tabled') || tag.includes('lone')) out.tabledSelfCardIds.push(id);
    else if (tag.includes('hand') || tag.includes('player')) out.selfHandCardIds.push(id);
  }

  // Self hand tray (PlayerHand) doesn't carry data-holm-card-id; infer count.
  const trayNodes = document.querySelectorAll<HTMLElement>(
    '[data-holm-active-hand-region] [data-playing-card-root], [data-holm-active-hand-region] [data-canonical-card-back]',
  );
  if (trayNodes.length > 0) {
    // We don't know real ids; tag them with sentinel keys but mark mounted via length.
    for (let i = 0; i < trayNodes.length; i++) {
      const sentinel = `tray#${i}`;
      out.selfHandCardIds.push(sentinel);
    }
  }
  return out;
}

function announcementScan(): { visible: boolean; text: string | null } {
  if (typeof document === 'undefined') return { visible: false, text: null };
  const el = document.querySelector<HTMLElement>('[data-canonical-announcement-content]');
  if (!el) return { visible: false, text: null };
  const cs = window.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const visible =
    cs.display !== 'none' &&
    cs.visibility !== 'hidden' &&
    Number(cs.opacity || '1') > 0 &&
    r.width > 0 &&
    r.height > 0;
  return { visible, text: visible ? (el.textContent || '').trim() || null : null };
}

function cardFaceUp(cardId: string): { domMounted: boolean; faceUp: boolean; visible: boolean; owner: string | null } {
  if (typeof document === 'undefined') return { domMounted: false, faceUp: false, visible: false, owner: null };
  const node = document.querySelector<HTMLElement>(`[data-holm-card-id="${CSS.escape(cardId)}"]`);
  if (!node) return { domMounted: false, faceUp: false, visible: false, owner: null };
  // Face-up iff a PlayingCard root exists in the subtree (not a card-back).
  const face = !!node.querySelector('[data-playing-card-root]') || node.matches('[data-playing-card-root]');
  const cs = window.getComputedStyle(node);
  const r = node.getBoundingClientRect();
  const vis =
    cs.display !== 'none' &&
    cs.visibility !== 'hidden' &&
    Number(cs.opacity || '1') > 0 &&
    r.width > 0 &&
    r.height > 0;
  return { domMounted: true, faceUp: face, visible: vis, owner: node.dataset.holmRenderer || null };
}

/**
 * Called once per rAF tick by HolmDealDbgPanel.
 * Detects state transitions and emits timeline events + violations.
 * Also publishes the {community, chucky, ownership} payloads onto
 * window.__holmDealDbg.
 */
export function holmWartimeTick(): {
  community: HolmCommunityForensics;
  chucky: HolmChuckyForensics;
  ownership: HolmOwnershipForensics;
} {
  const meta = getHolmDealDbgMeta();
  const handCtx = meta.handContextId;
  const phase = String(meta.phase);

  if (mem.handContextId !== handCtx) {
    if (handCtx) recordHolmTimelineEvent('NEW_HAND_STARTED', { phase, prev: mem.handContextId }, handCtx);
    resetMemForNewHand(handCtx);
  }

  // ── Solo flip
  if (meta.soloDeclared && !mem.soloDeclaredAnnounced) {
    mem.soloDeclaredAnnounced = true;
    recordHolmTimelineEvent('SOLO_DECLARED', { phase }, handCtx);
  }

  // ── Community forensics
  const settledSet = new Set(meta.settledIds);
  const commCards: HolmCommunityCardForensics[] = [];
  for (let i = 0; i < 4; i++) {
    const cardId = handCtx ? `${handCtx}#community-${i}` : null;
    const faceData = cardId ? cardFaceUp(cardId) : { domMounted: false, faceUp: false, visible: false, owner: null };
    const settled = cardId ? settledSet.has(cardId) : false;
    const prevFace = mem.communityFaceUp[i];
    if (faceData.faceUp && !prevFace) {
      mem.communityFirstRevealAt[i] = mem.communityFirstRevealAt[i] ?? nowPerf();
      mem.communityFaceUp[i] = true;
      recordHolmTimelineEvent(`COMMUNITY_REVEAL_CARD_${i}` as HolmTimelineEventName, { cardId }, handCtx);
    } else if (!faceData.faceUp && prevFace) {
      mem.communityFaceUp[i] = false;
      mem.communityLastFaceDownAt[i] = nowPerf();
      recordHolmTimelineEvent('COMMUNITY_REHIDDEN', { cardId, index: i, phase }, handCtx);
      recordViolation('COMMUNITY_REHIDDEN', handCtx, {
        index: i,
        cardId,
        phase,
        wave: meta.wave,
        firstRevealAt: mem.communityFirstRevealAt[i],
      });
    }
    commCards.push({
      index: i,
      cardId,
      settled,
      domMounted: faceData.domMounted,
      domVisible: faceData.visible,
      faceUp: faceData.faceUp,
      revealed: !!mem.communityFirstRevealAt[i],
      owner: faceData.owner,
      firstRevealAt: mem.communityFirstRevealAt[i],
      lastFaceDownAt: mem.communityLastFaceDownAt[i],
    });
  }

  // ── Announcement scan
  const ann = announcementScan();
  if (ann.visible && !mem.announcementVisible) {
    mem.announcementVisible = true;
    mem.announcementStartedAt = nowPerf();
    mem.announcementText = ann.text;
    recordHolmTimelineEvent('ANNOUNCEMENT_STARTED', { text: ann.text }, handCtx);
  } else if (!ann.visible && mem.announcementVisible) {
    mem.announcementVisible = false;
    mem.announcementCompletedAt = nowPerf();
    recordHolmTimelineEvent('ANNOUNCEMENT_COMPLETED', { text: mem.announcementText }, handCtx);
  }

  // ── Chucky forensics
  mem.chuckyExpectedCount = meta.chuckyExpected;
  mem.chuckySettledCount = meta.chuckySettled;
  // Detect chucky deal started
  if (!mem.chuckyDealStarted && meta.chuckyExpected > 0 && meta.chuckyDispatched > 0) {
    mem.chuckyDealStarted = true;
    // Infer ALL_PLAYER_DECISIONS_COMPLETE: chucky deal begins only after all
    // player decisions have resolved. Mark inference explicitly.
    if (!mem.allPlayerDecisionsComplete) {
      mem.allPlayerDecisionsComplete = true;
      recordHolmTimelineEvent('ALL_PLAYER_DECISIONS_COMPLETE', {
        inferredFrom: 'chucky_deal_started',
        communitySettled: meta.communitySettled,
      }, handCtx);
    }
    recordHolmTimelineEvent('CHUCKY_DEAL_STARTED', {
      expected: meta.chuckyExpected,
      dispatched: meta.chuckyDispatched,
    }, handCtx);
  }
  const chuckyCards: HolmChuckyCardForensics[] = [];
  for (let i = 0; i < Math.max(meta.chuckyExpected, 0); i++) {
    const cardId = handCtx ? `${handCtx}#chucky-${i}` : null;
    const faceData = cardId ? cardFaceUp(cardId) : { domMounted: false, faceUp: false, visible: false, owner: null };
    if (cardId && settledSet.has(cardId) && !mem.chuckyFirstSettleAt.has(cardId)) {
      mem.chuckyFirstSettleAt.set(cardId, nowPerf());
      recordHolmTimelineEvent('CHUCKY_CARD_SETTLED', { cardId, index: i }, handCtx);
    }
    if (mem.chuckyFaceUp[i] !== faceData.faceUp) {
      mem.chuckyFaceUp[i] = faceData.faceUp;
      if (faceData.faceUp) {
        mem.chuckyPerCardRevealAt[i] = mem.chuckyPerCardRevealAt[i] ?? nowPerf();
        recordHolmTimelineEvent(`CHUCKY_REVEAL_CARD_${i}` as HolmTimelineEventName, { cardId }, handCtx);
      }
    }
    chuckyCards.push({
      index: i,
      cardId,
      dispatchAt: null,
      launchAt: null,
      arrivalAt: null,
      settleAt: cardId ? mem.chuckyFirstSettleAt.get(cardId) ?? null : null,
      domMounted: faceData.domMounted,
      domVisible: faceData.visible,
      faceUp: faceData.faceUp,
      revealScheduledAt: null,
      revealStartedAt: mem.chuckyPerCardRevealAt[i] ?? null,
      revealCompletedAt: mem.chuckyPerCardRevealAt[i] ?? null,
    });
  }
  if (
    mem.chuckyAllSettledAt == null &&
    meta.chuckyExpected > 0 &&
    meta.chuckySettled >= meta.chuckyExpected
  ) {
    mem.chuckyAllSettledAt = nowPerf();
    recordHolmTimelineEvent('ALL_CHUCKY_SETTLED', {
      expected: meta.chuckyExpected,
      settled: meta.chuckySettled,
    }, handCtx);
  }
  const anyChuckyFaceUp = mem.chuckyFaceUp.some(Boolean);
  if (anyChuckyFaceUp && mem.chuckyRevealStartedAt == null) {
    mem.chuckyRevealStartedAt = nowPerf();
    recordHolmTimelineEvent('CHUCKY_REVEAL_STARTED', {
      announcementVisible: mem.announcementVisible,
      announcementStartedAt: mem.announcementStartedAt,
      allChuckySettledAt: mem.chuckyAllSettledAt,
    }, handCtx);
    // Detect CHUCKY_REVEAL_DELAY / CHUCKY_REVEAL_GATED_BY_ANNOUNCEMENT
    if (!mem.delayReported && mem.chuckyAllSettledAt != null) {
      const delayMs = mem.chuckyRevealStartedAt - mem.chuckyAllSettledAt;
      if (delayMs > 250) {
        mem.delayReported = true;
        recordViolation('CHUCKY_REVEAL_DELAY', handCtx, {
          delayMs: Math.round(delayMs),
          allChuckySettledAt: mem.chuckyAllSettledAt,
          revealSequenceStartedAt: mem.chuckyRevealStartedAt,
          announcementVisible: mem.announcementVisible,
          announcementStartedAt: mem.announcementStartedAt,
          announcementCompletedAt: mem.announcementCompletedAt,
        });
        if (
          mem.announcementStartedAt != null &&
          mem.announcementStartedAt < mem.chuckyRevealStartedAt
        ) {
          recordViolation('CHUCKY_REVEAL_GATED_BY_ANNOUNCEMENT', handCtx, {
            delayMs: Math.round(delayMs),
            announcementStartedAt: mem.announcementStartedAt,
            announcementCompletedAt: mem.announcementCompletedAt,
            revealSequenceStartedAt: mem.chuckyRevealStartedAt,
          });
        }
      }
    }
  }
  if (
    mem.chuckyRevealCompletedAt == null &&
    mem.chuckyExpectedCount > 0 &&
    mem.chuckyFaceUp.filter(Boolean).length >= mem.chuckyExpectedCount
  ) {
    mem.chuckyRevealCompletedAt = nowPerf();
    recordHolmTimelineEvent('CHUCKY_REVEAL_COMPLETED', {
      expected: mem.chuckyExpectedCount,
    }, handCtx);
  }

  // ── COMMUNITY_REVEAL_LATE detection
  const allDecisions = mem.allPlayerDecisionsComplete;
  const c2Vis = commCards[2].faceUp;
  const c3Vis = commCards[3].faceUp;
  const allCommSettled =
    settledSet.has(`${handCtx}#community-0`) &&
    settledSet.has(`${handCtx}#community-1`) &&
    settledSet.has(`${handCtx}#community-2`) &&
    settledSet.has(`${handCtx}#community-3`);
  if (allDecisions && allCommSettled && (!c2Vis || !c3Vis) && !mem.lateRevealReported) {
    mem.lateRevealReported = true;
    recordViolation('COMMUNITY_REVEAL_LATE', handCtx, {
      phase,
      wave: meta.wave,
      soloDeclared: meta.soloDeclared,
      community2Visible: c2Vis,
      community3Visible: c3Vis,
      communityRevealPredicate: {
        phaseGate: phase === 'GAMEPLAY',
        waveGate: meta.wave !== 'hands',
        soloGate: meta.soloDeclared,
        chuckyGate: mem.chuckyDealStarted,
        settledGate: allCommSettled,
        finalVisible: c2Vis && c3Vis,
      },
    });
  }

  // ── Ownership forensics
  const soloReg = getHolmSoloOwnership();
  const dom = scanOwnershipDom();
  const mkRoot = (root: 'SELF_HAND' | 'TABLED_SELF' | 'CHUCKY_TABLED' | 'COMMUNITY', cardIds: string[]): HolmOwnershipRootForensics => {
    const rec: HolmSoloRootRecord | undefined = soloReg[root];
    return {
      root,
      mounted: cardIds.length > 0 || !!rec?.mounted,
      cardIds: cardIds.length > 0 ? cardIds : (rec?.cardIds ?? []),
      handContextId: rec?.handContextId ?? handCtx,
      soloDeclared: rec?.soloDeclared ?? meta.soloDeclared,
      phase: rec?.phase ?? phase,
      source: 'unknown',
    };
  };
  const ownership: HolmOwnershipForensics = {
    handContextId: handCtx,
    soloDeclared: meta.soloDeclared,
    activeHandContextId: handCtx,
    dealRuntimePhase: phase,
    owners: {
      SELF_HAND: mkRoot('SELF_HAND', dom.selfHandCardIds),
      TABLED_SELF: mkRoot('TABLED_SELF', dom.tabledSelfCardIds),
      CHUCKY_TABLED: mkRoot('CHUCKY_TABLED', dom.chuckyTabledCardIds),
      COMMUNITY: mkRoot('COMMUNITY', dom.communityCardIds),
    },
  };

  // Timeline: TABLED_SELF mount/unmount
  if (ownership.owners.TABLED_SELF.mounted !== mem.tabledSelfMounted) {
    mem.tabledSelfMounted = ownership.owners.TABLED_SELF.mounted;
    recordHolmTimelineEvent(
      mem.tabledSelfMounted ? 'TABLED_SELF_MOUNT' : 'TABLED_SELF_UNMOUNT',
      { cardIds: ownership.owners.TABLED_SELF.cardIds, phase, soloDeclared: meta.soloDeclared },
      handCtx,
    );
  }
  if (ownership.owners.SELF_HAND.mounted !== mem.selfHandMounted) {
    mem.selfHandMounted = ownership.owners.SELF_HAND.mounted;
    recordHolmTimelineEvent(
      mem.selfHandMounted ? 'SELF_HAND_MOUNT' : 'SELF_HAND_UNMOUNT',
      { cardIds: ownership.owners.SELF_HAND.cardIds, phase },
      handCtx,
    );
  }

  if (ownership.owners.SELF_HAND.mounted && ownership.owners.TABLED_SELF.mounted) {
    recordViolation('SELF_AND_TABLED_SIMULTANEOUS', handCtx, {
      selfHandCardIds: ownership.owners.SELF_HAND.cardIds,
      tabledSelfCardIds: ownership.owners.TABLED_SELF.cardIds,
      source: 'dom-scan',
      phase,
      wave: meta.wave,
    });
  }

  const tabledHand = ownership.owners.TABLED_SELF.handContextId;
  if (
    ownership.owners.TABLED_SELF.mounted &&
    tabledHand != null &&
    handCtx != null &&
    tabledHand === handCtx &&
    phase === 'DEALING'
  ) {
    recordViolation('TABLED_SELF_NEXT_HAND', handCtx, {
      tabledSelfCardIds: ownership.owners.TABLED_SELF.cardIds,
      selfHandCardIds: ownership.owners.SELF_HAND.cardIds,
      mountedBefore: tabledHand !== handCtx ? 'previous-hand' : 'same-hand-but-dealing',
      phase,
    });
  }

  const community: HolmCommunityForensics = {
    handContextId: handCtx,
    phase,
    wave: meta.wave,
    soloDeclared: meta.soloDeclared,
    communityExpected: meta.communityExpected,
    communityDispatched: meta.communityDispatched,
    communitySettled: meta.communitySettled,
    community0: commCards[0],
    community1: commCards[1],
    community2: commCards[2],
    community3: commCards[3],
    communityRevealPredicate: {
      phaseGate: phase === 'GAMEPLAY',
      waveGate: meta.wave !== 'hands',
      soloGate: meta.soloDeclared,
      chuckyGate: mem.chuckyDealStarted,
      settledGate: allCommSettled,
      finalVisible: commCards.every((c) => c.faceUp),
    },
    allPlayerDecisionsComplete: mem.allPlayerDecisionsComplete,
  };

  const chucky: HolmChuckyForensics = {
    handContextId: handCtx,
    soloDeclared: meta.soloDeclared,
    phase,
    announcement: {
      visible: mem.announcementVisible,
      text: mem.announcementText,
      startedAt: mem.announcementStartedAt,
      completedAt: mem.announcementCompletedAt,
    },
    chuckyExpected: meta.chuckyExpected,
    chuckyDispatched: meta.chuckyDispatched,
    chuckySettled: meta.chuckySettled,
    cards: chuckyCards,
    barriers: {
      allChuckySettledAt: mem.chuckyAllSettledAt,
      announcementStartedAt: mem.announcementStartedAt,
      announcementCompletedAt: mem.announcementCompletedAt,
      revealSequenceStartedAt: mem.chuckyRevealStartedAt,
    },
  };

  publishExtras({ community, chucky, ownership, meta });
  return { community, chucky, ownership };
}

// ─── Publication ──────────────────────────────────────────────────────────

type W = typeof window & {
  __holmDealDbg?: Record<string, unknown>;
};

function publish() {
  if (typeof window === 'undefined') return;
  const w = window as W;
  if (!w.__holmDealDbg) w.__holmDealDbg = {};
  (w.__holmDealDbg as Record<string, unknown>).timelineEvents = timeline;
  (w.__holmDealDbg as Record<string, unknown>).wartimeViolations = violations;
}

function publishExtras(payload: {
  community: HolmCommunityForensics;
  chucky: HolmChuckyForensics;
  ownership: HolmOwnershipForensics;
  meta: HolmDealDbgMeta;
}) {
  if (typeof window === 'undefined') return;
  const w = window as W;
  if (!w.__holmDealDbg) w.__holmDealDbg = {};
  const dbg = w.__holmDealDbg as Record<string, unknown>;
  dbg.wartimeCommunity = payload.community;
  dbg.wartimeChucky = payload.chucky;
  dbg.wartimeOwnership = payload.ownership;
  dbg.timelineEvents = timeline;
  dbg.wartimeViolations = violations;
}

// ─── Utils ────────────────────────────────────────────────────────────────

function nowPerf(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}
