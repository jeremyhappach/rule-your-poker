/**
 * 3-5-7 Wartime — public emit API.
 *
 * Every event is envelope-wrapped, sequence-allocated synchronously,
 * then handed to the async sink. Callers MUST NEVER await.
 *
 * Emit only on meaningful boundaries (see coverage manifest). Do NOT
 * call from render for unchanged values — this is enforced by
 * convention; the sink's queue depth counter surfaces abuse.
 */

import { BUILD_IDENTITY } from '@/lib/buildIdentity';
import { allocSequence, ensureWartimeSession, makeEventId } from './session';
import { enqueue } from './sink';
import { getSourceSite } from './sourceSites';

export interface WartimeIdentity {
  gameId?: string | null;
  dealerGameId?: string | null;
  roundId?: string | null;
  handNumber?: number | null;
  handContextId?: string | null;
  terminalResultIdentity?: string | null;
  currentPlayerId?: string | null;
  currentPlayerPosition?: number | null;
  dealerPlayerId?: string | null;
  dealerPosition?: number | null;
}

export interface WartimeOwner {
  componentType?: string | null;
  componentInstanceId?: string | null;
  parentComponentInstanceId?: string | null;
  diagnosticReactKey?: string | null;
  renderEpoch?: number | null;
}

export interface WartimeEmit {
  eventName: string;
  sourceSiteId: string;
  identity?: WartimeIdentity;
  owner?: WartimeOwner;
  payload?: Record<string, unknown>;
  causedByEventId?: string | null;
  /** Set true only for stale-callback / duplicate-owner / invariant */
  captureStack?: boolean;
}

export function emitWartime(input: WartimeEmit): string {
  const site = getSourceSite(input.sourceSiteId);
  const sessionId = ensureWartimeSession();
  const seq = allocSequence();
  const eventId = makeEventId();

  const envelope = {
    wartimeSessionId: sessionId,
    eventId,
    eventSequence: seq,
    timestampEpochMs: Date.now(),
    performanceNowMs:
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : null,
    buildSha: BUILD_IDENTITY.buildSha,
    bundleFilename: BUILD_IDENTITY.bundleFilename || null,
    // identity
    gameId: input.identity?.gameId ?? null,
    dealerGameId: input.identity?.dealerGameId ?? null,
    roundId: input.identity?.roundId ?? null,
    handNumber: input.identity?.handNumber ?? null,
    handContextId: input.identity?.handContextId ?? null,
    terminalResultIdentity: input.identity?.terminalResultIdentity ?? null,
    currentPlayerId: input.identity?.currentPlayerId ?? null,
    currentPlayerPosition: input.identity?.currentPlayerPosition ?? null,
    dealerPlayerId: input.identity?.dealerPlayerId ?? null,
    dealerPosition: input.identity?.dealerPosition ?? null,
    // owner
    componentType: input.owner?.componentType ?? null,
    componentInstanceId: input.owner?.componentInstanceId ?? null,
    parentComponentInstanceId: input.owner?.parentComponentInstanceId ?? null,
    diagnosticReactKey: input.owner?.diagnosticReactKey ?? null,
    renderEpoch: input.owner?.renderEpoch ?? null,
    // source site
    sourceSiteId: input.sourceSiteId,
    sourceFile: site?.file ?? null,
    sourceFunction: site?.fn ?? null,
    sourceLine: site?.line ?? null,
    sourceSiteRegistered: !!site,
    causedByEventId: input.causedByEventId ?? null,
    stack: input.captureStack ? captureStack() : null,
  };

  const fullPayload: Record<string, unknown> = { ...envelope, ...(input.payload ?? {}) };

  enqueue({
    event_type: `357.wartime.${input.eventName}`,
    payload: fullPayload,
    sequence: seq,
    game_id: input.identity?.gameId ?? null,
    round_id: input.identity?.roundId ?? null,
  });

  return eventId;
}

function captureStack(): string | null {
  try {
    return new Error('wartime-stack').stack ?? null;
  } catch {
    return null;
  }
}
