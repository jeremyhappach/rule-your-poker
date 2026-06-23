/**
 * holmChuckyTeardownForensics — WARTIME FORENSICS ONLY.
 *
 * Goal: prove the exact writer/owner that destroys or resets the
 * Holm solo-Chucky VISUAL reveal state BEFORE the visible reveal
 * completes (cachedChuckyCardsRevealed < required).
 *
 * No behavior. No fixes. No clamps. Instrumentation only.
 *
 * Surfaces:
 *   window.__holmChuckyTeardownForensics
 *   recordHolmChuckyTeardownEvent(...)
 *   recordHolmChuckyTeardownViolation(...)
 *   setHolmChuckyTeardownContext(ctx)
 *   buildHolmChuckyTeardownForensicsText()
 *
 * Also appends summary events into window.__holmChuckyFullForensics
 * via recordChuckyForensic('violation' | 'persistence' | ...).
 */

import { recordHolmTimelineEvent } from './holmWartimeForensics';

// No dedicated wartime violation recorder is exported; route violations
// through recordHolmTimelineEvent with a VIOLATION_ prefix so they
// surface in the wartime ring AND in the categorized full-forensics
// 'violation' bucket (routed by name in holmChuckyFullForensics).
function recordHolmWartimeViolation(
  type: string,
  payload: Record<string, unknown>,
  handContextId: string | null,
): void {
  recordHolmTimelineEvent(type as never, payload, handContextId);
}
import { recordChuckyForensic, type ChuckyForensicCategory } from './holmChuckyFullForensics';

export type TeardownViolationType =
  | 'HOLM_SOLO_DESTROY_DURING_VISUAL_REVEAL'
  | 'HOLM_RESET_HAND_UI_CACHES_DURING_VISUAL_REVEAL'
  | 'HOLM_CHUCKY_CACHE_RESET_DURING_VISUAL_REVEAL'
  | 'HOLM_HAND_CONTEXT_NULL_DURING_VISUAL_REVEAL'
  | 'HOLM_PHASE_COMPLETED_DURING_VISUAL_REVEAL'
  | 'HOLM_ROUND_COMPLETED_DURING_VISUAL_REVEAL'
  | 'HOLM_ANNOUNCEMENT_STARTED_DURING_VISUAL_REVEAL'
  | 'HOLM_WIN_STARTED_DURING_VISUAL_REVEAL'
  | 'HOLM_NEXT_HAND_DETECTED_DURING_VISUAL_REVEAL'
  | 'HOLM_VISUAL_REVEAL_COUNT_REGRESSED'
  | 'HOLM_VISUAL_REVEAL_CACHE_DESTROYED_AFTER_SERVER_COMPLETE'
  | 'HOLM_SERVER_REVEAL_4_VISUAL_LT_4';

export interface TeardownContext {
  ts?: number;
  handContextId: string | null;
  phase: string | null;            // holm phase derived
  roundStatus: string | null;
  chuckyActive: boolean;
  cachedChuckyActive: boolean;
  cachedChuckyCardsLen: number;
  cachedChuckyCardsRevealed: number;
  cachedChuckyHandContextId: string | null;
  serverChuckyCardsRevealed: number;
  requiredRevealCount: number;
  announcementShowing: boolean;
  winSequenceActive: boolean;
  gameType: string | null;
  isSoloVsChucky: boolean;
}

export interface TeardownEvent {
  seq: number;
  ts: number;                       // performance.now
  wall: string;                     // ISO
  event: string;
  sourceFile: string;
  functionLabel: string;
  callsite: string;
  stack: string | null;
  reason: string;
  writer: string;
  reader: string;
  owner: string;
  prevHandContextId: string | null;
  nextHandContextId: string | null;
  prevPhase: string | null;
  nextPhase: string | null;
  prevRoundStatus: string | null;
  nextRoundStatus: string | null;
  prevChuckyActive: boolean;
  nextChuckyActive: boolean;
  prevCachedChuckyCardsLen: number;
  nextCachedChuckyCardsLen: number;
  prevCachedChuckyCardsRevealed: number;
  nextCachedChuckyCardsRevealed: number;
  serverChuckyCardsRevealed: number;
  requiredRevealCount: number;
  visualRevealComplete: boolean;
  announcementShowing: boolean;
  winSequenceActive: boolean;
  isViolation: boolean;
  violationType?: TeardownViolationType;
}

const RING = 1000;
const events: TeardownEvent[] = [];
const violations: TeardownEvent[] = [];

let _seq = 0;
let _liveCtx: TeardownContext | null = null;
let _prevCtx: TeardownContext | null = null;

function now(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export function setHolmChuckyTeardownContext(ctx: TeardownContext): void {
  _prevCtx = _liveCtx;
  _liveCtx = { ...ctx, ts: now() };
  publishWindow();
}

export function getHolmChuckyTeardownContext(): TeardownContext | null {
  return _liveCtx;
}

function captureStack(skip = 2): string | null {
  try {
    const e = new Error();
    const lines = (e.stack || '').split('\n');
    return lines.slice(skip + 1, skip + 12).map((l) => l.trim()).join(' | ');
  } catch {
    return null;
  }
}

export interface TeardownRecordInput {
  event: string;
  sourceFile: string;
  functionLabel: string;
  callsite: string;
  reason: string;
  writer: string;
  reader?: string;
  owner?: string;
  /** Optional explicit next-context overrides (else inferred from live ctx). */
  nextOverride?: Partial<TeardownContext>;
  /** Pass true to force-record even if no live context exists. */
  force?: boolean;
}

function isVisualRevealIncomplete(ctx: TeardownContext): boolean {
  return (
    ctx.gameType === 'holm-game' &&
    ctx.cachedChuckyCardsLen > 0 &&
    ctx.cachedChuckyCardsRevealed < ctx.requiredRevealCount
  );
}

function classifyViolation(event: string, ctx: TeardownContext | null): TeardownViolationType | undefined {
  if (!ctx || !isVisualRevealIncomplete(ctx)) {
    // Even if reveal is complete, watch for server>visual divergence after teardown.
    if (
      ctx &&
      ctx.gameType === 'holm-game' &&
      ctx.serverChuckyCardsRevealed >= 4 &&
      ctx.cachedChuckyCardsRevealed < 4
    ) {
      return 'HOLM_SERVER_REVEAL_4_VISUAL_LT_4';
    }
    return undefined;
  }
  switch (event) {
    case 'soloDestroyOnHandChange':
      return 'HOLM_SOLO_DESTROY_DURING_VISUAL_REVEAL';
    case 'resetHandUiCaches':
      return 'HOLM_RESET_HAND_UI_CACHES_DURING_VISUAL_REVEAL';
    case 'cachedChuckyActiveGuardClear':
    case 'newGameCacheReset':
    case 'cachedChuckyCardsCleared':
      return 'HOLM_CHUCKY_CACHE_RESET_DURING_VISUAL_REVEAL';
    case 'handContextIdNull':
      return 'HOLM_HAND_CONTEXT_NULL_DURING_VISUAL_REVEAL';
    case 'phaseCompleted':
      return 'HOLM_PHASE_COMPLETED_DURING_VISUAL_REVEAL';
    case 'roundCompleted':
      return 'HOLM_ROUND_COMPLETED_DURING_VISUAL_REVEAL';
    case 'announcementStarted':
      return 'HOLM_ANNOUNCEMENT_STARTED_DURING_VISUAL_REVEAL';
    case 'winSequenceStarted':
      return 'HOLM_WIN_STARTED_DURING_VISUAL_REVEAL';
    case 'nextHandDetected':
      return 'HOLM_NEXT_HAND_DETECTED_DURING_VISUAL_REVEAL';
    default:
      return undefined;
  }
}

export function recordHolmChuckyTeardownEvent(input: TeardownRecordInput): TeardownEvent | null {
  const prev = _prevCtx ?? _liveCtx;
  const next = _liveCtx ? { ..._liveCtx, ...(input.nextOverride ?? {}) } : null;
  if (!next && !input.force) return null;
  const ctxForClassify = next ?? prev ?? null;
  const vType = classifyViolation(input.event, ctxForClassify);
  const entry: TeardownEvent = {
    seq: ++_seq,
    ts: now(),
    wall: new Date().toISOString(),
    event: input.event,
    sourceFile: input.sourceFile,
    functionLabel: input.functionLabel,
    callsite: input.callsite,
    stack: captureStack(2),
    reason: input.reason,
    writer: input.writer,
    reader: input.reader ?? '—',
    owner: input.owner ?? input.writer,
    prevHandContextId: prev?.handContextId ?? null,
    nextHandContextId: next?.handContextId ?? null,
    prevPhase: prev?.phase ?? null,
    nextPhase: next?.phase ?? null,
    prevRoundStatus: prev?.roundStatus ?? null,
    nextRoundStatus: next?.roundStatus ?? null,
    prevChuckyActive: !!prev?.chuckyActive,
    nextChuckyActive: !!next?.chuckyActive,
    prevCachedChuckyCardsLen: prev?.cachedChuckyCardsLen ?? 0,
    nextCachedChuckyCardsLen: next?.cachedChuckyCardsLen ?? 0,
    prevCachedChuckyCardsRevealed: prev?.cachedChuckyCardsRevealed ?? 0,
    nextCachedChuckyCardsRevealed: next?.cachedChuckyCardsRevealed ?? 0,
    serverChuckyCardsRevealed: next?.serverChuckyCardsRevealed ?? 0,
    requiredRevealCount: next?.requiredRevealCount ?? 0,
    visualRevealComplete:
      (next?.cachedChuckyCardsRevealed ?? 0) >= (next?.requiredRevealCount ?? 0) &&
      (next?.requiredRevealCount ?? 0) > 0,
    announcementShowing: !!next?.announcementShowing,
    winSequenceActive: !!next?.winSequenceActive,
    isViolation: !!vType,
    violationType: vType,
  };
  events.push(entry);
  while (events.length > RING) events.shift();

  // Mirror to full forensics so a single copy includes teardown timeline.
  const cat: ChuckyForensicCategory = vType ? 'violation' : 'persistence';
  recordChuckyForensic(
    cat,
    vType ?? `TEARDOWN_${input.event.toUpperCase()}`,
    {
      writer: entry.writer,
      reader: entry.reader,
      owner: entry.owner,
      reason: entry.reason,
      sourceFile: entry.sourceFile,
      functionLabel: entry.functionLabel,
      callsite: entry.callsite,
      prev: {
        handContextId: entry.prevHandContextId,
        phase: entry.prevPhase,
        roundStatus: entry.prevRoundStatus,
        chuckyActive: entry.prevChuckyActive,
        cachedChuckyCardsLen: entry.prevCachedChuckyCardsLen,
        cachedChuckyCardsRevealed: entry.prevCachedChuckyCardsRevealed,
      },
      next: {
        handContextId: entry.nextHandContextId,
        phase: entry.nextPhase,
        roundStatus: entry.nextRoundStatus,
        chuckyActive: entry.nextChuckyActive,
        cachedChuckyCardsLen: entry.nextCachedChuckyCardsLen,
        cachedChuckyCardsRevealed: entry.nextCachedChuckyCardsRevealed,
      },
      serverChuckyCardsRevealed: entry.serverChuckyCardsRevealed,
      requiredRevealCount: entry.requiredRevealCount,
      visualRevealComplete: entry.visualRevealComplete,
      announcementShowing: entry.announcementShowing,
      winSequenceActive: entry.winSequenceActive,
      stack: entry.stack,
    },
    entry.nextHandContextId ?? entry.prevHandContextId,
  );

  if (vType) {
    violations.push(entry);
    while (violations.length > RING) violations.shift();
    recordHolmWartimeViolation(
      vType,
      {
        writer: entry.writer,
        reason: entry.reason,
        callsite: entry.callsite,
        functionLabel: entry.functionLabel,
        sourceFile: entry.sourceFile,
        prevCachedChuckyCardsRevealed: entry.prevCachedChuckyCardsRevealed,
        nextCachedChuckyCardsRevealed: entry.nextCachedChuckyCardsRevealed,
        serverChuckyCardsRevealed: entry.serverChuckyCardsRevealed,
        requiredRevealCount: entry.requiredRevealCount,
        stack: entry.stack,
      },
      entry.nextHandContextId ?? entry.prevHandContextId,
    );
  } else {
    // Still surface as a timeline event for replay.
    recordHolmTimelineEvent(
      `HOLM_TEARDOWN_${input.event.toUpperCase()}`,
      {
        writer: entry.writer,
        reason: entry.reason,
        functionLabel: entry.functionLabel,
        sourceFile: entry.sourceFile,
        callsite: entry.callsite,
        prevCachedChuckyCardsRevealed: entry.prevCachedChuckyCardsRevealed,
        nextCachedChuckyCardsRevealed: entry.nextCachedChuckyCardsRevealed,
        serverChuckyCardsRevealed: entry.serverChuckyCardsRevealed,
        requiredRevealCount: entry.requiredRevealCount,
        visualRevealComplete: entry.visualRevealComplete,
      },
      entry.nextHandContextId ?? entry.prevHandContextId,
    );
  }

  publishWindow();
  return entry;
}

export function recordHolmChuckyTeardownViolation(
  type: TeardownViolationType,
  reason: string,
  extra: Record<string, unknown> = {},
): void {
  const ctx = _liveCtx;
  const entry: TeardownEvent = {
    seq: ++_seq,
    ts: now(),
    wall: new Date().toISOString(),
    event: type,
    sourceFile: String(extra.sourceFile ?? '—'),
    functionLabel: String(extra.functionLabel ?? '—'),
    callsite: String(extra.callsite ?? '—'),
    stack: captureStack(2),
    reason,
    writer: String(extra.writer ?? '—'),
    reader: String(extra.reader ?? '—'),
    owner: String(extra.owner ?? '—'),
    prevHandContextId: _prevCtx?.handContextId ?? null,
    nextHandContextId: ctx?.handContextId ?? null,
    prevPhase: _prevCtx?.phase ?? null,
    nextPhase: ctx?.phase ?? null,
    prevRoundStatus: _prevCtx?.roundStatus ?? null,
    nextRoundStatus: ctx?.roundStatus ?? null,
    prevChuckyActive: !!_prevCtx?.chuckyActive,
    nextChuckyActive: !!ctx?.chuckyActive,
    prevCachedChuckyCardsLen: _prevCtx?.cachedChuckyCardsLen ?? 0,
    nextCachedChuckyCardsLen: ctx?.cachedChuckyCardsLen ?? 0,
    prevCachedChuckyCardsRevealed: _prevCtx?.cachedChuckyCardsRevealed ?? 0,
    nextCachedChuckyCardsRevealed: ctx?.cachedChuckyCardsRevealed ?? 0,
    serverChuckyCardsRevealed: ctx?.serverChuckyCardsRevealed ?? 0,
    requiredRevealCount: ctx?.requiredRevealCount ?? 0,
    visualRevealComplete:
      (ctx?.cachedChuckyCardsRevealed ?? 0) >= (ctx?.requiredRevealCount ?? 0) &&
      (ctx?.requiredRevealCount ?? 0) > 0,
    announcementShowing: !!ctx?.announcementShowing,
    winSequenceActive: !!ctx?.winSequenceActive,
    isViolation: true,
    violationType: type,
  };
  events.push(entry);
  violations.push(entry);
  while (events.length > RING) events.shift();
  while (violations.length > RING) violations.shift();
  recordHolmWartimeViolation(type, { reason, ...extra, stack: entry.stack }, entry.nextHandContextId);
  recordChuckyForensic('violation', type, { reason, ...extra, stack: entry.stack }, entry.nextHandContextId);
  publishWindow();
}

// ─── Snapshot + window surface ───────────────────────────────────────────

export interface TeardownForensicsSnapshot {
  generatedAt: string;
  liveContext: TeardownContext | null;
  totals: { events: number; violations: number };
  events: TeardownEvent[];
  violations: TeardownEvent[];
}

export function getHolmChuckyTeardownForensics(): TeardownForensicsSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    liveContext: _liveCtx,
    totals: { events: events.length, violations: violations.length },
    events: events.slice(),
    violations: violations.slice(),
  };
}

function publishWindow(): void {
  if (typeof window === 'undefined') return;
  try {
    (window as unknown as { __holmChuckyTeardownForensics?: TeardownForensicsSnapshot }).__holmChuckyTeardownForensics =
      getHolmChuckyTeardownForensics();
  } catch { /* noop */ }
}

export function buildHolmChuckyTeardownForensicsText(): string {
  const snap = getHolmChuckyTeardownForensics();
  const lines: string[] = [];
  lines.push('# HOLM CHUCKY TEARDOWN FORENSICS');
  lines.push(`generatedAt=${snap.generatedAt}`);
  lines.push(`liveContext=${safeJson(snap.liveContext)}`);
  lines.push(`totals=${safeJson(snap.totals)}`);
  lines.push('');
  lines.push(`--- VIOLATIONS (${snap.violations.length}) ---`);
  for (const e of snap.violations) lines.push(fmtEntry(e));
  lines.push('');
  lines.push(`--- ALL TEARDOWN EVENTS (${snap.events.length}) ---`);
  for (const e of snap.events) lines.push(fmtEntry(e));
  return lines.join('\n');
}

function fmtEntry(e: TeardownEvent): string {
  return (
    `#${e.seq} t=${e.ts.toFixed(1)} ${e.wall} ${e.isViolation ? '⛔' : '·'} ${e.violationType ?? e.event}\n` +
    `   writer=${e.writer} owner=${e.owner} reader=${e.reader}\n` +
    `   src=${e.sourceFile} fn=${e.functionLabel} call=${e.callsite}\n` +
    `   reason=${e.reason}\n` +
    `   hc:${e.prevHandContextId}→${e.nextHandContextId} phase:${e.prevPhase}→${e.nextPhase} rs:${e.prevRoundStatus}→${e.nextRoundStatus}\n` +
    `   chuckyActive:${e.prevChuckyActive}→${e.nextChuckyActive} cardsLen:${e.prevCachedChuckyCardsLen}→${e.nextCachedChuckyCardsLen} revealed:${e.prevCachedChuckyCardsRevealed}→${e.nextCachedChuckyCardsRevealed}\n` +
    `   server.revealed=${e.serverChuckyCardsRevealed} required=${e.requiredRevealCount} visualComplete=${e.visualRevealComplete} announce=${e.announcementShowing} win=${e.winSequenceActive}\n` +
    `   stack=${e.stack ?? '—'}`
  );
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return '"[unserializable]"'; }
}

// Eagerly publish on module load.
if (typeof window !== 'undefined') {
  try { publishWindow(); } catch { /* noop */ }
}
