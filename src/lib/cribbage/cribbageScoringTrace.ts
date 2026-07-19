/**
 * Persistent Cribbage scoring diagnostics.
 *
 * Always-on, event-driven, deduplicated. Writes directly to
 * `debug_events` (bypassing the URL/localStorage flag used by
 * debugEventLogger) whenever a tracked scoring value or owner
 * changes. Never writes on every render — a fingerprint gate
 * suppresses no-op re-renders and rapid duplicates.
 *
 * Consumers must derive every field from existing production
 * values (`cribbageState`, pegboard `playerStates`, and
 * `countingScoreOverrides`). This file MUST NOT introduce new
 * gameplay data.
 */

import { supabase } from '@/integrations/supabase/client';
import { getClientId } from '@/lib/clientContext';

export interface CribbageScoringTraceInput {
  gameId: string | null | undefined;
  dealerGameId: string | null | undefined;
  roundId: string | null | undefined;
  handNumber: number | null | undefined;
  cribbagePhase: string | null | undefined;
  viewerPlayerId: string | null | undefined;
  currentTurnPlayerId?: string | null;
  peggingCount?: number | null;
  /** Seated humans only — {playerId → displayName}. */
  seatedHumans: Record<string, string>;
  /** Authoritative pegScore per playerId (from `cribbageState.playerStates`). */
  authoritativeScores: Record<string, number>;
  /** Rail-rendered pegScore per playerId (pre-override). */
  railScores: Record<string, number>;
  /** `countingScoreOverrides` value (raw). null when no animation. */
  countingScoreOverrides: Record<string, number> | null;
}

interface PerPlayerSnapshot {
  authScore: number;
  railScore: number;
  displayScore: number;
  animationTarget: number | null;
}

interface LastState {
  fingerprint: string;
  perPlayer: Record<string, PerPlayerSnapshot>;
  animationOwner: 'counting-overrides' | null;
  handNumber: number | null;
  roundId: string | null;
}

type EventKind =
  | 'cribbage_score_authoritative_changed'
  | 'cribbage_score_display_changed'
  | 'cribbage_score_expected_transient'
  | 'cribbage_score_unexpected_mismatch'
  | 'cribbage_score_overshoot'
  | 'cribbage_score_regressed'
  | 'cribbage_score_reconciled';

const lastByGame = new Map<string, LastState>();
const recentEmitKeys = new Map<string, number>();
const DEDUP_WINDOW_MS = 750;

function shouldEmit(key: string): boolean {
  const now = Date.now();
  const prev = recentEmitKeys.get(key);
  if (prev && now - prev < DEDUP_WINDOW_MS) return false;
  recentEmitKeys.set(key, now);
  // Occasional cleanup
  if (recentEmitKeys.size > 200) {
    for (const [k, ts] of recentEmitKeys) {
      if (now - ts > DEDUP_WINDOW_MS * 4) recentEmitKeys.delete(k);
    }
  }
  return true;
}

function writeEvent(
  input: CribbageScoringTraceInput,
  eventType: EventKind,
  payload: Record<string, unknown>,
): void {
  if (!input.gameId) return;
  const dedupKey = `${input.gameId}:${eventType}:${JSON.stringify(payload.players ?? payload.playerId ?? '')}:${input.handNumber ?? ''}`;
  if (!shouldEmit(dedupKey)) return;

  const enriched = {
    clientId: getClientId(),
    dealerGameId: input.dealerGameId ?? null,
    handNumber: input.handNumber ?? null,
    cribbagePhase: input.cribbagePhase ?? null,
    currentTurnPlayerId: input.currentTurnPlayerId ?? null,
    peggingCount: input.peggingCount ?? null,
    seatedHumans: input.seatedHumans,
    ...payload,
  };

  supabase
    .from('debug_events' as never)
    .insert({
      game_id: input.gameId,
      round_id: input.roundId ?? null,
      user_id: input.viewerPlayerId ?? null,
      client_role: 'observer',
      event_type: eventType,
      payload: enriched,
    } as never)
    .then(({ error }: { error: unknown }) => {
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[cribbage_score_trace] write failed:', (error as { message?: string })?.message);
      }
    });
}

/**
 * Call from a render or effect. Compares against the last snapshot
 * for this gameId and emits one or more scoring events only when a
 * tracked value or owner changes.
 */
export function traceCribbageScoring(input: CribbageScoringTraceInput): void {
  if (!input.gameId) return;
  const playerIds = Object.keys(input.seatedHumans);
  if (playerIds.length === 0) return;

  const animationOwner: 'counting-overrides' | null =
    input.countingScoreOverrides ? 'counting-overrides' : null;

  const perPlayer: Record<string, PerPlayerSnapshot> = {};
  for (const pid of playerIds) {
    const authScore = Number(input.authoritativeScores[pid] ?? 0);
    const railScore = Number(input.railScores[pid] ?? 0);
    const override = input.countingScoreOverrides?.[pid];
    const displayScore = typeof override === 'number' ? override : railScore;
    const animationTarget = typeof override === 'number' ? authScore : null;
    perPlayer[pid] = { authScore, railScore, displayScore, animationTarget };
  }

  // Fingerprint gate — skip when nothing tracked has changed.
  const fingerprint = JSON.stringify({
    a: animationOwner,
    r: input.roundId ?? null,
    h: input.handNumber ?? null,
    p: perPlayer,
  });
  const prev = lastByGame.get(input.gameId);
  if (prev && prev.fingerprint === fingerprint) return;

  lastByGame.set(input.gameId, {
    fingerprint,
    perPlayer,
    animationOwner,
    handNumber: input.handNumber ?? null,
    roundId: input.roundId ?? null,
  });

  const handChanged =
    !prev ||
    prev.handNumber !== (input.handNumber ?? null) ||
    prev.roundId !== (input.roundId ?? null);

  // ── Per-player diffs ──
  const authChanges: Array<Record<string, unknown>> = [];
  const displayChanges: Array<Record<string, unknown>> = [];
  const expectedTransient: Array<Record<string, unknown>> = [];
  const unexpectedMismatch: Array<Record<string, unknown>> = [];
  const overshoots: Array<Record<string, unknown>> = [];
  const regressed: Array<Record<string, unknown>> = [];
  const reconciled: Array<Record<string, unknown>> = [];

  for (const pid of playerIds) {
    const curr = perPlayer[pid];
    const previous = prev?.perPlayer[pid];
    const name = input.seatedHumans[pid];

    // Authoritative change
    if (previous && previous.authScore !== curr.authScore) {
      authChanges.push({
        playerId: pid,
        name,
        prev: previous.authScore,
        next: curr.authScore,
        delta: curr.authScore - previous.authScore,
      });
    }

    // Displayed change
    if (previous && previous.displayScore !== curr.displayScore) {
      displayChanges.push({
        playerId: pid,
        name,
        prev: previous.displayScore,
        next: curr.displayScore,
        delta: curr.displayScore - previous.displayScore,
        owner: animationOwner,
      });

      // Regression (display went DOWN, not caused by hand boundary)
      if (curr.displayScore < previous.displayScore && !handChanged) {
        regressed.push({
          playerId: pid,
          name,
          prev: previous.displayScore,
          next: curr.displayScore,
          authScore: curr.authScore,
        });
      }
    }

    // Display vs authoritative
    if (curr.displayScore !== curr.authScore) {
      const target = curr.animationTarget;
      const startForRange = previous?.displayScore ?? curr.railScore;
      const inTransientRange =
        animationOwner === 'counting-overrides' &&
        target !== null &&
        ((curr.displayScore >= Math.min(startForRange, target) &&
          curr.displayScore <= Math.max(startForRange, target)));

      if (inTransientRange) {
        expectedTransient.push({
          playerId: pid,
          name,
          display: curr.displayScore,
          auth: curr.authScore,
          target,
          owner: animationOwner,
        });
      } else {
        unexpectedMismatch.push({
          playerId: pid,
          name,
          display: curr.displayScore,
          auth: curr.authScore,
          rail: curr.railScore,
          target,
          owner: animationOwner,
        });
      }

      // Overshoot — display beyond both auth and animationTarget
      const ceiling = target !== null ? Math.max(curr.authScore, target) : curr.authScore;
      if (curr.displayScore > ceiling) {
        overshoots.push({
          playerId: pid,
          name,
          display: curr.displayScore,
          auth: curr.authScore,
          target,
          owner: animationOwner,
        });
      }
    } else if (previous && previous.displayScore !== previous.authScore) {
      // Was mismatched; now equal → reconciled.
      reconciled.push({
        playerId: pid,
        name,
        score: curr.displayScore,
      });
    }
  }

  if (authChanges.length)
    writeEvent(input, 'cribbage_score_authoritative_changed', { players: authChanges });
  if (displayChanges.length)
    writeEvent(input, 'cribbage_score_display_changed', { players: displayChanges, owner: animationOwner });
  if (expectedTransient.length)
    writeEvent(input, 'cribbage_score_expected_transient', { players: expectedTransient });
  if (unexpectedMismatch.length)
    writeEvent(input, 'cribbage_score_unexpected_mismatch', { players: unexpectedMismatch });
  if (overshoots.length)
    writeEvent(input, 'cribbage_score_overshoot', { players: overshoots });
  if (regressed.length)
    writeEvent(input, 'cribbage_score_regressed', { players: regressed });
  if (reconciled.length)
    writeEvent(input, 'cribbage_score_reconciled', { players: reconciled });
}

/** Optional cleanup; call on route teardown. */
export function clearCribbageScoringTraceForGame(gameId: string): void {
  lastByGame.delete(gameId);
}
