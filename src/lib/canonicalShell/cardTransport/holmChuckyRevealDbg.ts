/**
 * holmChuckyRevealDbg — WAR-TIME VISUAL Chucky reveal forensics.
 *
 * INSTRUMENTATION ONLY. NO LOGIC CHANGES.
 *
 * The wartime forensics module records *transport / settled* events.
 * The remaining mystery is the VISUAL reveal pipeline:
 *
 *   all 4 chucky cards land  →  pause  →  announcement  →  rapid reveal
 *
 * Those visible flips are owned by the inline Chucky card renderer in
 * MobileGameTable. This module captures the timestamps that the DOM
 * components actually emit when they flip from face-down to face-up.
 *
 * Surfaces:
 *   window.__holmChuckyRevealDbg = {
 *     handContextId,
 *     cards: { 'chucky-0': ChuckyVisualCardRecord, ... },
 *     barriers: { allChuckySettledAt, announcementStartedAt,
 *                 announcementCompletedAt, revealSequenceScheduledAt,
 *                 revealSequenceStartedAt, revealSequenceCompletedAt },
 *     violations: ChuckyVisualViolation[]
 *   }
 *
 * Events emitted into holmWartimeForensics.timelineEvents:
 *   VISUAL_CHUCKY_FLIP_START
 *   VISUAL_CHUCKY_FACEUP
 *   VISUAL_CHUCKY_FLIP_COMPLETE
 *
 * Violations:
 *   CHUCKY_VISUAL_REVEAL_DELAY
 *     fired if VISUAL_CHUCKY_FLIP_START > allChuckySettledAt + 250ms
 *   CHUCKY_VISUAL_REVEAL_GATED_BY_ANNOUNCEMENT
 *     fired if announcementCompletedAt < VISUAL_CHUCKY_FLIP_START
 *     and delayMs > 250
 */

import { useEffect, useRef } from 'react';
import { recordHolmTimelineEvent } from './holmWartimeForensics';

export interface ChuckyVisualCardRecord {
  cardId: string;                       // `${handContextId}#chucky-${index}`
  index: number;
  handContextId: string | null;
  dealSettledAt: number | null;         // hint from upstream (optional)
  domMountedAt: number | null;
  firstFaceDownAt: number | null;
  flipAnimationStartedAt: number | null;
  faceUpCommittedAt: number | null;
  flipAnimationCompletedAt: number | null;
  renderer: string | null;
  owner: string | null;
  phase: string | null;
  announcementVisible: boolean;
  announcementText: string | null;
}

export interface ChuckyVisualBarriers {
  allChuckySettledAt: number | null;
  announcementStartedAt: number | null;
  announcementCompletedAt: number | null;
  revealSequenceScheduledAt: number | null;
  revealSequenceStartedAt: number | null;
  revealSequenceCompletedAt: number | null;
}

export type ChuckyVisualViolationType =
  | 'CHUCKY_VISUAL_REVEAL_DELAY'
  | 'CHUCKY_VISUAL_REVEAL_GATED_BY_ANNOUNCEMENT';

export interface ChuckyVisualViolation {
  seq: number;
  t: number;
  wall: string;
  type: ChuckyVisualViolationType;
  handContextId: string | null;
  payload: Record<string, unknown>;
}

interface State {
  handContextId: string | null;
  cards: Map<string, ChuckyVisualCardRecord>;
  barriers: ChuckyVisualBarriers;
  violations: ChuckyVisualViolation[];
  vseq: number;
}

function freshState(handContextId: string | null): State {
  return {
    handContextId,
    cards: new Map(),
    barriers: {
      allChuckySettledAt: null,
      announcementStartedAt: null,
      announcementCompletedAt: null,
      revealSequenceScheduledAt: null,
      revealSequenceStartedAt: null,
      revealSequenceCompletedAt: null,
    },
    violations: [],
    vseq: 0,
  };
}

const STATE: State = freshState(null);

type W = typeof window & {
  __holmChuckyRevealDbg?: {
    handContextId: string | null;
    cards: Record<string, ChuckyVisualCardRecord>;
    barriers: ChuckyVisualBarriers;
    violations: ChuckyVisualViolation[];
  };
};

function publish() {
  if (typeof window === 'undefined') return;
  const w = window as W;
  const cards: Record<string, ChuckyVisualCardRecord> = {};
  for (const [k, v] of STATE.cards.entries()) cards[k] = v;
  w.__holmChuckyRevealDbg = {
    handContextId: STATE.handContextId,
    cards,
    barriers: STATE.barriers,
    violations: STATE.violations,
  };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function ensureHand(handContextId: string | null) {
  if (STATE.handContextId !== handContextId) {
    STATE.handContextId = handContextId;
    STATE.cards = new Map();
    STATE.barriers = {
      allChuckySettledAt: null,
      announcementStartedAt: null,
      announcementCompletedAt: null,
      revealSequenceScheduledAt: null,
      revealSequenceStartedAt: null,
      revealSequenceCompletedAt: null,
    };
    STATE.violations = [];
    STATE.vseq = 0;
  }
}

function ensureCard(handContextId: string | null, index: number): ChuckyVisualCardRecord {
  ensureHand(handContextId);
  const cardId = `${handContextId}#chucky-${index}`;
  let rec = STATE.cards.get(cardId);
  if (!rec) {
    rec = {
      cardId,
      index,
      handContextId,
      dealSettledAt: null,
      domMountedAt: null,
      firstFaceDownAt: null,
      flipAnimationStartedAt: null,
      faceUpCommittedAt: null,
      flipAnimationCompletedAt: null,
      renderer: null,
      owner: null,
      phase: null,
      announcementVisible: false,
      announcementText: null,
    };
    STATE.cards.set(cardId, rec);
  }
  return rec;
}

function recordViolation(
  type: ChuckyVisualViolationType,
  handContextId: string | null,
  payload: Record<string, unknown>,
) {
  // Dedupe inside 250ms / same hand / same type.
  const t = now();
  for (let i = STATE.violations.length - 1; i >= 0 && STATE.violations.length - i < 8; i--) {
    const v = STATE.violations[i];
    if (v.type === type && v.handContextId === handContextId && t - v.t < 250) return;
  }
  STATE.violations.push({
    seq: ++STATE.vseq,
    t,
    wall: new Date().toISOString(),
    type,
    handContextId,
    payload,
  });
  while (STATE.violations.length > 200) STATE.violations.shift();
  publish();
}

// ── Public recording API ──────────────────────────────────────────

export function chuckyVisualResetForHand(handContextId: string | null) {
  ensureHand(handContextId);
  publish();
}

export function chuckyVisualMarkDealSettled(handContextId: string | null, index: number, t = now()) {
  const rec = ensureCard(handContextId, index);
  if (rec.dealSettledAt == null) rec.dealSettledAt = t;
  publish();
}

export function chuckyVisualMarkAllSettled(handContextId: string | null, t = now()) {
  ensureHand(handContextId);
  if (STATE.barriers.allChuckySettledAt == null) STATE.barriers.allChuckySettledAt = t;
  publish();
}

export function chuckyVisualMarkAnnouncement(
  handContextId: string | null,
  visible: boolean,
  text: string | null,
  t = now(),
) {
  ensureHand(handContextId);
  if (visible && STATE.barriers.announcementStartedAt == null) STATE.barriers.announcementStartedAt = t;
  if (!visible && STATE.barriers.announcementStartedAt != null && STATE.barriers.announcementCompletedAt == null) {
    STATE.barriers.announcementCompletedAt = t;
  }
  for (const rec of STATE.cards.values()) {
    rec.announcementVisible = visible;
    rec.announcementText = text;
  }
  publish();
}

export function chuckyVisualMarkRevealSequenceScheduled(handContextId: string | null, t = now()) {
  ensureHand(handContextId);
  if (STATE.barriers.revealSequenceScheduledAt == null) STATE.barriers.revealSequenceScheduledAt = t;
  publish();
}

export function chuckyVisualMarkDomMounted(
  handContextId: string | null,
  index: number,
  meta?: { renderer?: string | null; owner?: string | null; phase?: string | null },
  t = now(),
) {
  const rec = ensureCard(handContextId, index);
  if (rec.domMountedAt == null) rec.domMountedAt = t;
  if (meta?.renderer && !rec.renderer) rec.renderer = meta.renderer;
  if (meta?.owner && !rec.owner) rec.owner = meta.owner;
  if (meta?.phase) rec.phase = meta.phase;
  publish();
}

export function chuckyVisualMarkFaceDown(handContextId: string | null, index: number, t = now()) {
  const rec = ensureCard(handContextId, index);
  if (rec.firstFaceDownAt == null) rec.firstFaceDownAt = t;
  publish();
}

export function chuckyVisualMarkFlipStart(handContextId: string | null, index: number, t = now()) {
  const rec = ensureCard(handContextId, index);
  if (rec.flipAnimationStartedAt != null) return;
  rec.flipAnimationStartedAt = t;
  if (STATE.barriers.revealSequenceStartedAt == null) STATE.barriers.revealSequenceStartedAt = t;
  recordHolmTimelineEvent('VISUAL_CHUCKY_FLIP_START', {
    cardId: rec.cardId,
    index,
    allChuckySettledAt: STATE.barriers.allChuckySettledAt,
    announcementStartedAt: STATE.barriers.announcementStartedAt,
    announcementCompletedAt: STATE.barriers.announcementCompletedAt,
    announcementVisible: rec.announcementVisible,
  }, handContextId);

  // Detect delay vs allChuckySettledAt.
  const settledAt = STATE.barriers.allChuckySettledAt;
  if (settledAt != null) {
    const delayMs = t - settledAt;
    if (delayMs > 250) {
      recordViolation('CHUCKY_VISUAL_REVEAL_DELAY', handContextId, {
        cardId: rec.cardId,
        index,
        delayMs: Math.round(delayMs),
        allChuckySettledAt: settledAt,
        flipAnimationStartedAt: t,
        announcementVisible: rec.announcementVisible,
        announcementStartedAt: STATE.barriers.announcementStartedAt,
        announcementCompletedAt: STATE.barriers.announcementCompletedAt,
      });
      const annCompleted = STATE.barriers.announcementCompletedAt;
      if (annCompleted != null && annCompleted < t && delayMs > 250) {
        recordViolation('CHUCKY_VISUAL_REVEAL_GATED_BY_ANNOUNCEMENT', handContextId, {
          cardId: rec.cardId,
          index,
          delayMs: Math.round(delayMs),
          announcementStartedAt: STATE.barriers.announcementStartedAt,
          announcementCompletedAt: annCompleted,
          flipAnimationStartedAt: t,
        });
      }
    }
  }
  publish();
}

export function chuckyVisualMarkFaceUp(handContextId: string | null, index: number, t = now()) {
  const rec = ensureCard(handContextId, index);
  if (rec.faceUpCommittedAt == null) rec.faceUpCommittedAt = t;
  recordHolmTimelineEvent('VISUAL_CHUCKY_FACEUP', { cardId: rec.cardId, index }, handContextId);
  publish();
}

export function chuckyVisualMarkFlipComplete(handContextId: string | null, index: number, t = now()) {
  const rec = ensureCard(handContextId, index);
  if (rec.flipAnimationCompletedAt == null) rec.flipAnimationCompletedAt = t;
  // Mark sequence complete if every record has a completion stamp.
  const all = Array.from(STATE.cards.values());
  if (all.length > 0 && all.every((r) => r.flipAnimationCompletedAt != null)) {
    if (STATE.barriers.revealSequenceCompletedAt == null) STATE.barriers.revealSequenceCompletedAt = t;
  }
  recordHolmTimelineEvent('VISUAL_CHUCKY_FLIP_COMPLETE', { cardId: rec.cardId, index }, handContextId);
  publish();
}

// ── React instrumenter for an individual Chucky slot ──────────────
/**
 * Drop one of these inside the inline Chucky card renderer. It tracks
 * mount, face-down → face-up transitions, and animation completion
 * timing. NO visual output.
 */
export function ChuckyVisualCardInstrumenter({
  handContextId,
  index,
  isRevealed,
  renderer = 'MobileGameTable.holmChuckyStage',
  owner = 'cachedChuckyCardsRevealed',
  phase = null,
  flipAnimationMs = 300,
  cachedChuckyCardsRevealed = null,
  cachedChuckyCardsCount = null,
}: {
  handContextId: string | null;
  index: number;
  isRevealed: boolean;
  renderer?: string | null;
  owner?: string | null;
  phase?: string | null;
  flipAnimationMs?: number;
  cachedChuckyCardsRevealed?: number | null;
  cachedChuckyCardsCount?: number | null;
}) {
  const lastRevealedRef = useRef<boolean | null>(null);
  const lastReadRef = useRef<string | null>(null);
  // Mount.
  useEffect(() => {
    chuckyVisualMarkDomMounted(handContextId, index, { renderer, owner, phase });
  }, [handContextId, index, renderer, owner, phase]);

  // WAR-TIME: CHUCKY_RENDERER_READ — emit once per meaningful change so
  // we can prove what the renderer actually consumed per card.
  useEffect(() => {
    const shouldBeFaceUp =
      cachedChuckyCardsRevealed != null ? index < cachedChuckyCardsRevealed : isRevealed;
    const key = `${handContextId}|${index}|${cachedChuckyCardsRevealed}|${isRevealed}|${shouldBeFaceUp}`;
    if (lastReadRef.current === key) return;
    lastReadRef.current = key;
    recordHolmTimelineEvent('CHUCKY_RENDERER_READ', {
      handContextId,
      cachedChuckyCardsRevealed,
      cachedChuckyCardsCount,
      cardIndex: index,
      shouldBeFaceUp,
      actualFaceUp: isRevealed,
      renderer,
      owner,
      phase,
      mismatch: shouldBeFaceUp !== isRevealed,
    }, handContextId);
  }, [handContextId, index, isRevealed, cachedChuckyCardsRevealed, cachedChuckyCardsCount, renderer, owner, phase]);

  // Face-down tick (only when first rendered as cardback).
  useEffect(() => {
    if (!isRevealed) chuckyVisualMarkFaceDown(handContextId, index);
  }, [handContextId, index, isRevealed]);

  // Transition tracking.
  useEffect(() => {
    if (lastRevealedRef.current === null) {
      lastRevealedRef.current = isRevealed;
      return;
    }
    if (!lastRevealedRef.current && isRevealed) {
      const t = now();
      chuckyVisualMarkFlipStart(handContextId, index, t);
      chuckyVisualMarkFaceUp(handContextId, index, t);
      const handle = window.setTimeout(() => {
        chuckyVisualMarkFlipComplete(handContextId, index);
      }, flipAnimationMs);
      lastRevealedRef.current = isRevealed;
      return () => window.clearTimeout(handle);
    }
    lastRevealedRef.current = isRevealed;
  }, [handContextId, index, isRevealed, flipAnimationMs]);

  return null;
}

publish();
