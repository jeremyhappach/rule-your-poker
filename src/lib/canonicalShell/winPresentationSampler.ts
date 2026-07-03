/**
 * CANONICAL_WIN_PRESENTATION_LEDGER — transfer-artifact & active-hand samplers.
 *
 * Instrumentation-only. Auto-arms per winAttemptId at canonical
 * sequence start for 3-5-7 / Horses / SCC; disarms explicitly on
 * transfer-complete + bounce-complete, or after a hard deadline.
 *
 * Emits proof for:
 *   A. Which DOM node actually receives the bounce (transfer artifact
 *      vs. seat-cluster chip disc) and whether the transferred chip is
 *      still mounted at arrival / through bounce completion.
 *   B. Whether the winner's active-hand fan is mutated during the win
 *      sequence (size/scale/stage/geometry/remount/node loss).
 */

import {
  recordWinPresentationEvent,
  recordWinPresentationViolation,
  type WinAttemptIdentity,
} from './winPresentationLedger';

const SAMPLE_INTERVAL_MS = 66;   // ~15 FPS is enough to detect deltas
const MAX_LIFETIME_MS = 8000;    // hard ceiling per arm

interface Rect {
  x: number; y: number; w: number; h: number;
}

interface TransferSnapshot {
  found: boolean;
  key: string | null;
  owner: string | null;
  connected: boolean;
  rect: Rect | null;
  transform: string | null;
  scaleApprox: number | null;
  opacity: number | null;
  animationName: string | null;
}

interface CardSnapshot {
  index: number;
  rect: Rect;
  transform: string;
}

interface ActiveHandSnapshot {
  found: boolean;
  handKey: string | null;
  cardCount: number;
  stageRect: Rect | null;
  wrapperTransform: string | null;
  cards: CardSnapshot[];
  ancestorsTransform: string[];
}

interface ArmedSampler {
  identity: WinAttemptIdentity;
  owner: string;
  source: string;
  winnerPosition: number;
  selfPlayerId: string | null;
  isWinnerClient: boolean;
  triggerId: string | null;
  baselineTransfer: TransferSnapshot | null;
  baselineHand: ActiveHandSnapshot | null;
  lastTransfer: TransferSnapshot | null;
  lastHand: ActiveHandSnapshot | null;
  intervalId: number;
  timeoutId: number;
  landRecorded: boolean;
  disarmed: boolean;
  startPerf: number;
  sampleCount: number;
}

const armed = new Map<string, ArmedSampler>();

function toRect(r: DOMRectReadOnly | DOMRect | null): Rect | null {
  if (!r) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function readScale(transform: string): number | null {
  if (!transform || transform === 'none') return 1;
  const m = /matrix\(([^)]+)\)/.exec(transform);
  if (m) {
    const parts = m[1].split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 4 && !Number.isNaN(parts[0])) return parts[0];
  }
  const s = /scale\(([-0-9.]+)/.exec(transform);
  if (s) return parseFloat(s[1]);
  return null;
}

function collectAncestorTransforms(el: HTMLElement): string[] {
  const out: string[] = [];
  let p: HTMLElement | null = el.parentElement;
  let hops = 0;
  while (p && hops < 12) {
    const t = getComputedStyle(p).transform;
    if (t && t !== 'none') out.push(t);
    p = p.parentElement;
    hops++;
  }
  return out;
}

function snapshotTransfer(triggerId: string | null): TransferSnapshot {
  if (typeof document === 'undefined') {
    return { found: false, key: null, owner: null, connected: false, rect: null, transform: null, scaleApprox: null, opacity: null, animationName: null };
  }
  const sel = triggerId
    ? `[data-win-transfer-artifact="${CSS.escape(triggerId)}"]`
    : `[data-win-transfer-artifact]`;
  const outer = document.querySelector(sel) as HTMLElement | null;
  if (!outer) {
    return { found: false, key: triggerId, owner: null, connected: false, rect: null, transform: null, scaleApprox: null, opacity: null, animationName: null };
  }
  const inner = outer.querySelector('[data-win-transfer-artifact-inner]') as HTMLElement | null;
  const measured = inner ?? outer;
  const cs = getComputedStyle(measured);
  return {
    found: true,
    key: outer.getAttribute('data-win-transfer-artifact'),
    owner: outer.getAttribute('data-win-transfer-owner'),
    connected: measured.isConnected,
    rect: toRect(measured.getBoundingClientRect()),
    transform: cs.transform,
    scaleApprox: readScale(cs.transform),
    opacity: parseFloat(cs.opacity),
    animationName: cs.animationName || null,
  };
}

function snapshotActiveHand(selfPlayerId: string | null, isWinnerClient: boolean): ActiveHandSnapshot {
  // Only capture active-hand geometry on the winner's client. On
  // losers/observers/bot seats the local viewer's active-hand pane is
  // either empty or unrelated to the winner, so treating those zero-card
  // snapshots as evidence of a winner-hand regression is a false signal.
  if (!isWinnerClient || typeof document === 'undefined' || !selfPlayerId) {
    return { found: false, handKey: null, cardCount: 0, stageRect: null, wrapperTransform: null, cards: [], ancestorsTransform: [] };
  }
  const stage = document.querySelector(
    `[data-card-anchor="hand-${CSS.escape(selfPlayerId)}"]`,
  ) as HTMLElement | null;
  if (!stage) {
    return { found: false, handKey: `hand-${selfPlayerId}`, cardCount: 0, stageRect: null, wrapperTransform: null, cards: [], ancestorsTransform: [] };
  }
  const stageCS = getComputedStyle(stage);
  const cardEls = Array.from(
    stage.querySelectorAll<HTMLElement>('[data-card-index], [data-playing-card], [data-card-back], [data-card-front]'),
  );
  const cards: CardSnapshot[] = cardEls.slice(0, 12).map((el, i) => {
    const cs = getComputedStyle(el);
    return {
      index: i,
      rect: toRect(el.getBoundingClientRect())!,
      transform: cs.transform,
    };
  });
  return {
    found: true,
    handKey: `hand-${selfPlayerId}`,
    cardCount: cards.length,
    stageRect: toRect(stage.getBoundingClientRect()),
    wrapperTransform: stageCS.transform,
    cards,
    ancestorsTransform: collectAncestorTransforms(stage),
  };
}

function rectDelta(a: Rect | null, b: Rect | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.max(
    Math.abs(a.w - b.w),
    Math.abs(a.h - b.h),
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
  );
}

function classifyBounceTarget(winnerPosition: number, triggerId: string | null): {
  target: 'transfer-artifact' | 'seat-cluster-chip-disc' | 'other' | 'none';
  seatDiscHasBounce: boolean;
  transferArtifactHasBounce: boolean;
  transferArtifactPresent: boolean;
} {
  if (typeof document === 'undefined') {
    return { target: 'none', seatDiscHasBounce: false, transferArtifactHasBounce: false, transferArtifactPresent: false };
  }
  const seatDisc =
    (document.querySelector(`[data-chip-reaction-target="${winnerPosition}"]`) as HTMLElement | null) ??
    (document.querySelector(`[data-chip-center="${winnerPosition}"]`) as HTMLElement | null);
  const artSel = triggerId
    ? `[data-win-transfer-artifact="${CSS.escape(triggerId)}"]`
    : `[data-win-transfer-artifact]`;
  const artifactOuter = document.querySelector(artSel) as HTMLElement | null;
  const artifactInner = artifactOuter
    ? (artifactOuter.querySelector('[data-win-transfer-artifact-inner]') as HTMLElement | null) ?? artifactOuter
    : null;

  const hasBounce = (el: HTMLElement | null): boolean => {
    if (!el) return false;
    const anim = getComputedStyle(el).animationName || '';
    if (anim.includes('__chipDestBounce')) return true;
    // Inline style shorthand may set the animation name outside computed
    // getters (e.g. via setProperty with !important).
    return (el.style.animation || '').includes('__chipDestBounce');
  };

  const seatDiscHasBounce = hasBounce(seatDisc);
  const transferArtifactHasBounce = hasBounce(artifactInner) || hasBounce(artifactOuter);

  const target: 'transfer-artifact' | 'seat-cluster-chip-disc' | 'other' | 'none' =
    transferArtifactHasBounce
      ? 'transfer-artifact'
      : seatDiscHasBounce
        ? 'seat-cluster-chip-disc'
        : (artifactOuter ? 'other' : 'none');

  return {
    target,
    seatDiscHasBounce,
    transferArtifactHasBounce,
    transferArtifactPresent: !!artifactOuter,
  };
}


export interface ArmWinSamplerArgs {
  identity: WinAttemptIdentity;
  owner: string; // '357' | 'horses' | 'scc'
  source: string;
  winnerPosition: number;
  selfPlayerId: string | null;
  triggerId: string | null;
}

export function armWinPresentationSampler(args: ArmWinSamplerArgs): void {
  if (typeof window === 'undefined') return;
  const key = args.identity.winAttemptId;
  if (!key || armed.has(key)) return;

  const isWinnerClient =
    !!args.identity.localViewerId &&
    !!args.identity.winnerPlayerId &&
    args.identity.localViewerId === args.identity.winnerPlayerId;

  const baselineTransfer = snapshotTransfer(args.triggerId);
  const baselineHand = snapshotActiveHand(args.selfPlayerId, isWinnerClient);

  recordWinPresentationEvent({
    identity: args.identity, name: 'transfer-artifact-baseline',
    source: args.source, owner: args.owner,
    payload: { snapshot: baselineTransfer, triggerId: args.triggerId },
  });
  recordWinPresentationEvent({
    identity: args.identity, name: 'active-hand-baseline',
    source: args.source, owner: args.owner,
    payload: { selfPlayerId: args.selfPlayerId, snapshot: baselineHand, isWinnerClient },
  });

  const state: ArmedSampler = {
    identity: args.identity,
    owner: args.owner,
    source: args.source,
    winnerPosition: args.winnerPosition,
    selfPlayerId: args.selfPlayerId,
    isWinnerClient,
    triggerId: args.triggerId,
    baselineTransfer,
    baselineHand,
    lastTransfer: baselineTransfer,
    lastHand: baselineHand,
    intervalId: 0,
    timeoutId: 0,
    landRecorded: false,
    disarmed: false,
    startPerf: performance.now(),
    sampleCount: 0,
  };

  state.intervalId = window.setInterval(() => tickSampler(key), SAMPLE_INTERVAL_MS);
  state.timeoutId = window.setTimeout(() => disarmWinPresentationSampler(key, 'deadline'), MAX_LIFETIME_MS);
  armed.set(key, state);
}

function tickSampler(key: string): void {
  const s = armed.get(key);
  if (!s || s.disarmed) return;
  s.sampleCount++;

  const transfer = snapshotTransfer(s.triggerId);
  const hand = snapshotActiveHand(s.selfPlayerId, s.isWinnerClient);

  // Sample throttling: emit every ~4 ticks OR on meaningful change.
  const transferChanged =
    (s.lastTransfer?.found ?? false) !== transfer.found ||
    rectDelta(s.lastTransfer?.rect ?? null, transfer.rect) > 4 ||
    (s.lastTransfer?.opacity ?? 1) !== transfer.opacity;
  const handChanged =
    (s.lastHand?.cardCount ?? -1) !== hand.cardCount ||
    (s.lastHand?.handKey ?? null) !== hand.handKey ||
    rectDelta(s.lastHand?.stageRect ?? null, hand.stageRect) > 2;

  if (transferChanged || s.sampleCount % 4 === 0) {
    recordWinPresentationEvent({
      identity: s.identity, name: 'transfer-artifact-sample',
      source: s.source, owner: s.owner,
      payload: { t: performance.now() - s.startPerf, snapshot: transfer },
    });
  }
  if (handChanged || s.sampleCount % 4 === 0) {
    recordWinPresentationEvent({
      identity: s.identity, name: 'active-hand-sample',
      source: s.source, owner: s.owner,
      payload: { t: performance.now() - s.startPerf, snapshot: hand },
    });
  }

  // Detect active-hand mutations (invariant checks)
  if (s.baselineHand?.found) {
    if (!hand.found) {
      recordWinPresentationViolation(s.identity, 'WIN_ACTIVE_HAND_NODE_LOST', s.source, {
        selfPlayerId: s.selfPlayerId, at: 'sample',
      });
    } else {
      if (hand.handKey !== s.baselineHand.handKey || hand.cardCount !== s.baselineHand.cardCount) {
        recordWinPresentationViolation(s.identity, 'WIN_ACTIVE_HAND_REMOUNT', s.source, {
          before: { handKey: s.baselineHand.handKey, cardCount: s.baselineHand.cardCount },
          after: { handKey: hand.handKey, cardCount: hand.cardCount },
        });
      }
      if (rectDelta(s.baselineHand.stageRect, hand.stageRect) > 2) {
        recordWinPresentationViolation(s.identity, 'WIN_ACTIVE_HAND_STAGE_CHANGED_DURING_CELLY', s.source, {
          before: s.baselineHand.stageRect, after: hand.stageRect,
        });
      }
      // Card-size shrink: compare first-card width.
      const baseCardW = s.baselineHand.cards[0]?.rect?.w ?? null;
      const nowCardW = hand.cards[0]?.rect?.w ?? null;
      if (baseCardW != null && nowCardW != null && nowCardW + 1 < baseCardW) {
        recordWinPresentationViolation(s.identity, 'WIN_ACTIVE_HAND_SIZE_SHRINK', s.source, {
          baselineCardWidth: baseCardW, currentCardWidth: nowCardW,
          delta: nowCardW - baseCardW,
        });
      }
      if (hand.wrapperTransform !== s.baselineHand.wrapperTransform) {
        recordWinPresentationViolation(s.identity, 'WIN_ACTIVE_HAND_GEOMETRY_RECOMPUTE', s.source, {
          before: s.baselineHand.wrapperTransform, after: hand.wrapperTransform,
        });
      }
    }
  }

  // Detect approximate transfer land: artifact reached ~90%+ of the way
  // to the winner destination, still mounted, or just unmounted.
  if (!s.landRecorded && s.baselineTransfer?.found) {
    const winnerEndpoint =
      (typeof document !== 'undefined'
        ? (document.querySelector(`[data-chip-reaction-target="${s.winnerPosition}"]`) as HTMLElement | null) ??
          (document.querySelector(`[data-chip-center="${s.winnerPosition}"]`) as HTMLElement | null)
        : null);
    const dest = winnerEndpoint ? toRect(winnerEndpoint.getBoundingClientRect()) : null;
    if (transfer.rect && dest) {
      const dx = Math.abs(transfer.rect.x - dest.x);
      const dy = Math.abs(transfer.rect.y - dest.y);
      if (dx < 24 && dy < 24) {
        s.landRecorded = true;
        recordWinPresentationEvent({
          identity: s.identity, name: 'transfer-artifact-land',
          source: s.source, owner: s.owner,
          payload: { transferRect: transfer.rect, destRect: dest, dx, dy },
        });
      }
    }
  }

  s.lastTransfer = transfer;
  s.lastHand = hand;
}

export function disarmWinPresentationSampler(winAttemptId: string, reason: string = 'complete'): void {
  const s = armed.get(winAttemptId);
  if (!s) return;
  s.disarmed = true;
  if (s.intervalId) window.clearInterval(s.intervalId);
  if (s.timeoutId) window.clearTimeout(s.timeoutId);

  const finalTransfer = snapshotTransfer(s.triggerId);
  const finalHand = snapshotActiveHand(s.selfPlayerId);
  const bounceInfo = classifyBounceTarget(s.winnerPosition, s.triggerId);

  recordWinPresentationEvent({
    identity: s.identity, name: 'bounce-target-classified',
    source: s.source, owner: s.owner,
    payload: {
      reason,
      target: bounceInfo.target,
      seatDiscHasBounce: bounceInfo.seatDiscHasBounce,
      transferArtifactHasBounce: bounceInfo.transferArtifactHasBounce,
      transferArtifactPresent: bounceInfo.transferArtifactPresent,
    },
  });

  // Only flag as violation when a bounce actually landed on the seat
  // chip disc (canonical contract requires bounce on the transferred
  // artifact). Mere presence of a seat disc is expected and benign.
  if (bounceInfo.seatDiscHasBounce && !bounceInfo.transferArtifactHasBounce) {
    recordWinPresentationViolation(s.identity, 'WIN_BOUNCE_APPLIED_TO_SEAT_CHIP_DISC', s.source, {
      winnerPosition: s.winnerPosition, target: bounceInfo.target,
    });
  }

  recordWinPresentationEvent({
    identity: s.identity, name: 'transfer-artifact-teardown',
    source: s.source, owner: s.owner,
    payload: {
      reason,
      final: finalTransfer,
      baseline: s.baselineTransfer,
      sampleCount: s.sampleCount,
    },
  });
  recordWinPresentationEvent({
    identity: s.identity, name: 'active-hand-teardown',
    source: s.source, owner: s.owner,
    payload: {
      reason,
      final: finalHand,
      baseline: s.baselineHand,
    },
  });

  // Transfer-artifact bounce contract checks.
  if (s.baselineTransfer?.found) {
    if (!s.landRecorded) {
      recordWinPresentationViolation(s.identity, 'WIN_TRANSFER_ARTIFACT_MISSING_AT_ARRIVAL', s.source, {
        reason: 'no-land-recorded', triggerId: s.triggerId,
      });
    }
    if (!finalTransfer.found) {
      recordWinPresentationViolation(s.identity, 'WIN_TRANSFER_ARTIFACT_UNMOUNTED_BEFORE_BOUNCE', s.source, {
        triggerId: s.triggerId,
      });
    } else {
      // If the transfer artifact is still mounted at bounce time, verify
      // that a visual delta (scale/transform) beyond the transport
      // trajectory was actually applied to IT (not just the seat disc).
      const bounceApplied =
        (finalTransfer.animationName ?? '').includes('__chipDestBounce');
      if (!bounceApplied) {
        recordWinPresentationViolation(s.identity, 'WIN_TRANSFER_ARTIFACT_BOUNCE_NOT_APPLIED', s.source, {
          finalAnimation: finalTransfer.animationName, triggerId: s.triggerId,
        });
      }
      const baseScale = s.baselineTransfer.scaleApprox ?? 1;
      const finalScale = finalTransfer.scaleApprox ?? 1;
      if (Math.abs(finalScale - baseScale) < 0.05 && !bounceApplied) {
        recordWinPresentationViolation(s.identity, 'WIN_TRANSFER_ARTIFACT_ZERO_VISUAL_DELTA', s.source, {
          baseScale, finalScale,
        });
      }
    }
  }

  armed.delete(winAttemptId);
}

export function isWinPresentationSamplerArmed(winAttemptId: string): boolean {
  return armed.has(winAttemptId);
}
