/**
 * ChipPresentationLedger
 *
 * Database batches own the visual lifetime of a financial transfer.  Raw
 * player/pot rows are only a reconciliation source: once their cursor says a
 * batch touched an endpoint they cannot change its display until the batch has
 * departed, arrived, settled, and been reconciled to a fresh authoritative
 * read.  No local balance is ever used as financial truth.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ChipEndpointRef, ChipTransportIntent } from './GameplaySlotContract';

export type ChipPresentationEndpointKey = 'pot' | `player:${string}`;
type EndpointKey = ChipPresentationEndpointKey;

export interface ChipPresentationEndpoint {
  kind: 'pot' | 'player';
  playerId?: string;
}

export interface ChipPresentationTransfer {
  id: string;
  amount: number;
  from: ChipPresentationEndpoint;
  to: ChipPresentationEndpoint;
}

export interface ChipPresentationBatch {
  id: string;
  game_id: string;
  cursor: number;
  reason: ChipTransportIntent['reason'];
  transfers: ChipPresentationTransfer[];
  /** Sparse: a batch includes only the endpoints it actually touches. */
  opening_balances: Partial<Record<EndpointKey, number>>;
  closing_balances: Partial<Record<EndpointKey, number>>;
}

/**
 * A game may delay the *start* of a committed financial presentation until
 * its prerequisite presentation stage is visibly complete. The ledger keeps
 * ownership of each touched endpoint at its authoritative opening balance
 * while admission is closed; this never delays or changes settlement.
 */
export type ChipPresentationAdmission = (batch: ChipPresentationBatch) => boolean;

/**
 * Presentation-only terminal handoff. Fires once only after every rendered
 * transfer in an admitted immutable batch has settled; it is never fired for
 * an abandoned endpoint or a reconnect baseline.
 */
export type ChipPresentationBatchSettled = (batch: ChipPresentationBatch) => void;

/**
 * A visible endpoint mutation emitted by the same ledger boundary that updates
 * its displayed balance. This is presentation-only: the immutable batch
 * remains the financial source of truth.
 */
export interface ChipPresentationBalanceDelta {
  /** Stable across remounts: batch + transfer/residual + endpoint boundary. */
  id: string;
  batchId: string;
  cursor: number;
  endpoint: ChipPresentationEndpoint;
  /** Resolved canonical seat for a player endpoint, when still present. */
  position?: number;
  /** Signed visible change: negative on departure, positive on arrival. */
  amount: number;
  boundary: 'departed' | 'arrived' | 'settled';
  reason: ChipTransportIntent['reason'];
}

export type ChipPresentationBalanceDeltaHandler = (
  delta: ChipPresentationBalanceDelta,
) => void;

/** Clears transient labels when a batch loses presentation ownership. */
export type ChipPresentationBalanceDeltaAbandonHandler = (batchId: string) => void;

interface PlayerSnapshot {
  chips: number;
  position: number;
  cursor: number | null;
}

interface RunningBatch {
  batch: ChipPresentationBatch;
  departed: Set<string>;
  arrived: Set<string>;
  settled: Set<string>;
  cancelled: boolean;
}

export interface LedgerDispatchOptions {
  onDeparted?: () => void;
  onArrived?: () => void;
  onSettled?: () => void;
  onDropped?: () => void;
}

export interface ChipPresentationLedgerTransport {
  dispatch: (intent: ChipTransportIntent, options?: LedgerDispatchOptions) => boolean;
  cancel: (intentId: string) => void;
}

export interface ChipPresentationLedger {
  playerBalance: (playerId: string | null | undefined, fallback: number) => number;
  potBalance: (fallback: number) => number;
}

function endpointKey(endpoint: ChipPresentationEndpoint): EndpointKey | null {
  if (endpoint.kind === 'pot') return 'pot';
  return endpoint.playerId ? `player:${endpoint.playerId}` : null;
}

function endpointRef(endpoint: ChipPresentationEndpoint, players: Map<string, PlayerSnapshot>): ChipEndpointRef | null {
  if (endpoint.kind === 'pot') return { kind: 'pot' };
  const player = endpoint.playerId ? players.get(endpoint.playerId) : null;
  return player ? { kind: 'seat', position: player.position } : null;
}

function endpointFromKey(key: EndpointKey): ChipPresentationEndpoint {
  if (key === 'pot') return { kind: 'pot' };
  return { kind: 'player', playerId: key.slice('player:'.length) };
}

/** Net amount carried by immutable flights for one endpoint in this batch. */
export function transferDeltaForEndpoint(batch: ChipPresentationBatch, key: EndpointKey): number {
  return batch.transfers.reduce((sum, transfer) => {
    const fromKey = endpointKey(transfer.from);
    const toKey = endpointKey(transfer.to);
    return sum + (toKey === key ? transfer.amount : 0) - (fromKey === key ? transfer.amount : 0);
  }, 0);
}

/**
 * Change not represented by a rendered flight. This is intentionally derived
 * from the authoritative opening/closing pair, never from unmatched_deltas.
 */
export function residualDeltaForEndpoint(batch: ChipPresentationBatch, key: EndpointKey): number {
  return (batch.closing_balances[key] ?? 0)
    - (batch.opening_balances[key] ?? 0)
    - transferDeltaForEndpoint(batch, key);
}

/**
 * Player-to-pot flights in one batch use the zero-stagger default transport,
 * so their common pot landing is one visible receipt. This deliberately uses
 * immutable batch topology rather than a game-specific reason: antes, bets,
 * and multi-sender transfers all share the same presentation boundary.
 */
export function aggregatesConcurrentPotArrival(
  batch: ChipPresentationBatch,
  key: EndpointKey,
): boolean {
  const inbound = batch.transfers.filter((transfer) => endpointKey(transfer.to) === key);
  return key === 'pot' && inbound.length > 1
    && inbound.every((transfer) => transfer.from.kind === 'player');
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function shouldRecoverCommittedCursor(input: {
  gameId: string | null | undefined;
  hydrated: boolean;
  disposed: boolean;
  cursor: number;
  known: boolean;
  recovering: boolean;
}): boolean {
  return !!input.gameId
    && input.hydrated
    && !input.disposed
    && input.cursor > 0
    && !input.known
    && !input.recovering;
}

function normalizeBatch(value: unknown, gameId: string): ChipPresentationBatch | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.game_id !== gameId || typeof row.id !== 'string') return null;
  const cursor = asNumber(row.cursor);
  if (cursor == null) return null;

  const values = (candidate: unknown): Partial<Record<EndpointKey, number>> => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
    return Object.entries(candidate as Record<string, unknown>).reduce<Partial<Record<EndpointKey, number>>>((acc, [key, raw]) => {
      const balance = asNumber(raw);
      if ((key === 'pot' || key.startsWith('player:')) && balance != null) {
        acc[key as EndpointKey] = balance;
      }
      return acc;
    }, {});
  };

  const transfers = Array.isArray(row.transfers) ? row.transfers.reduce<ChipPresentationTransfer[]>((acc, raw) => {
    if (!raw || typeof raw !== 'object') return acc;
    const entry = raw as Record<string, unknown>;
    const amount = asNumber(entry.amount);
    const from = entry.from as ChipPresentationEndpoint | undefined;
    const to = entry.to as ChipPresentationEndpoint | undefined;
    if (
      typeof entry.id === 'string' && amount != null && amount > 0 &&
      (from?.kind === 'pot' || from?.kind === 'player') &&
      (to?.kind === 'pot' || to?.kind === 'player')
    ) {
      acc.push({ id: entry.id, amount, from, to });
    }
    return acc;
  }, []) : [];

  const reason = ['ante', 'bet', 'win', 'leg', 'sweep', 'transfer'].includes(String(row.reason))
    ? String(row.reason) as ChipTransportIntent['reason']
    : 'transfer';

  return {
    id: row.id,
    game_id: gameId,
    cursor,
    reason,
    transfers,
    opening_balances: values(row.opening_balances),
    closing_balances: values(row.closing_balances),
  };
}

/**
 * This hook intentionally lives under the transport provider.  Its queue is
 * endpoint-aware: unrelated batches start together, while a second batch that
 * touches an occupied endpoint waits for the first closing value rather than
 * overwriting it with an independent absolute snapshot.
 */
export function useChipPresentationLedger(
  gameId: string | null | undefined,
  transport: ChipPresentationLedgerTransport,
  canStartBatch: ChipPresentationAdmission = () => true,
  admissionVersion = 0,
  onBatchSettled: ChipPresentationBatchSettled = () => {},
  onBalanceDelta: ChipPresentationBalanceDeltaHandler = () => {},
  onBalanceDeltasAbandoned: ChipPresentationBalanceDeltaAbandonHandler = () => {},
): ChipPresentationLedger {
  const [visibleBalances, setVisibleBalances] = useState<Map<EndpointKey, number>>(new Map());
  const playersRef = useRef(new Map<string, PlayerSnapshot>());
  const rawBalancesRef = useRef(new Map<EndpointKey, number>());
  const rawCursorsRef = useRef(new Map<EndpointKey, number>());
  const releasedCursorsRef = useRef(new Map<EndpointKey, number>());
  const seenBatchIdsRef = useRef(new Set<string>());
  const knownBatchCursorsRef = useRef(new Set<number>());
  const recoveringBatchCursorsRef = useRef(new Set<number>());
  const queuedRef = useRef<ChipPresentationBatch[]>([]);
  const runningRef = useRef(new Map<string, RunningBatch>());
  const activeEndpointsRef = useRef(new Map<EndpointKey, string>());
  const bootEventsRef = useRef<ChipPresentationBatch[]>([]);
  const hydratedRef = useRef(false);
  const disposedRef = useRef(false);
  const canStartBatchRef = useRef(canStartBatch);
  canStartBatchRef.current = canStartBatch;
  const onBatchSettledRef = useRef(onBatchSettled);
  onBatchSettledRef.current = onBatchSettled;
  const onBalanceDeltaRef = useRef(onBalanceDelta);
  onBalanceDeltaRef.current = onBalanceDelta;
  const onBalanceDeltasAbandonedRef = useRef(onBalanceDeltasAbandoned);
  onBalanceDeltasAbandonedRef.current = onBalanceDeltasAbandoned;
  const emittedBalanceDeltaIdsRef = useRef(new Set<string>());
  const recoverCommittedCursorRef = useRef<(cursor: number) => void>(() => {});

  const emitBalanceDelta = useCallback((delta: ChipPresentationBalanceDelta) => {
    if (!Number.isFinite(delta.amount) || delta.amount === 0) return;
    if (emittedBalanceDeltaIdsRef.current.has(delta.id)) return;
    emittedBalanceDeltaIdsRef.current.add(delta.id);
    onBalanceDeltaRef.current(delta);
  }, []);

  const writeVisible = useCallback((updates: Iterable<[EndpointKey, number]>) => {
    setVisibleBalances((previous) => {
      const next = new Map(previous);
      for (const [key, balance] of updates) next.set(key, balance);
      return next;
    });
  }, []);

  const setRawPlayer = useCallback((row: Record<string, unknown>) => {
    const id = typeof row.id === 'string' ? row.id : null;
    const chips = asNumber(row.chips);
    const position = asNumber(row.position);
    if (!id || chips == null || position == null) return;
    const key = `player:${id}` as EndpointKey;
    const cursor = asNumber(row.chip_transfer_cursor);
    playersRef.current.set(id, { chips, position, cursor });
    rawBalancesRef.current.set(key, chips);
    if (cursor != null) rawCursorsRef.current.set(key, cursor);

    // A row without a newer cursor is safe to display.  A row with a newer
    // cursor is deliberately held until its matching immutable batch starts.
    const released = releasedCursorsRef.current.get(key) ?? 0;
    if (!hydratedRef.current || cursor == null || cursor <= released) {
      writeVisible([[key, chips]]);
    } else {
      // Endpoint rows and immutable batches commit together, but Realtime may
      // deliver their events independently. A newer endpoint cursor is an
      // exact, durable cue to recover that one missing batch by identity.
      recoverCommittedCursorRef.current(cursor);
    }
  }, [writeVisible]);

  const setRawPot = useCallback((row: Record<string, unknown>) => {
    const pot = asNumber(row.pot);
    if (pot == null) return;
    const cursor = asNumber(row.pot_transfer_cursor);
    rawBalancesRef.current.set('pot', pot);
    if (cursor != null) rawCursorsRef.current.set('pot', cursor);
    const released = releasedCursorsRef.current.get('pot') ?? 0;
    if (!hydratedRef.current || cursor == null || cursor <= released) {
      writeVisible([['pot', pot]]);
    } else {
      recoverCommittedCursorRef.current(cursor);
    }
  }, [writeVisible]);

  const refetchAuthoritative = useCallback(async () => {
    if (!gameId) return;
    const client = supabase as any;
    const [{ data: playerRows }, { data: gameRow }] = await Promise.all([
      client.from('players').select('id, chips, position, chip_transfer_cursor').eq('game_id', gameId),
      client.from('games').select('pot, pot_transfer_cursor').eq('id', gameId).maybeSingle(),
    ]);
    for (const row of playerRows ?? []) setRawPlayer(row as Record<string, unknown>);
    if (gameRow) setRawPot(gameRow as Record<string, unknown>);
  }, [gameId, setRawPlayer, setRawPot]);

  const releaseOrContinueRef = useRef<(batch: ChipPresentationBatch) => void>(() => {});
  const startQueuedRef = useRef<() => void>(() => {});
  const abortBatchRef = useRef<(batchId: string) => void>(() => {});

  const finishBatch = useCallback((batchId: string) => {
    const running = runningRef.current.get(batchId);
    if (!running || running.cancelled) return;
    const { batch } = running;
    for (const key of Object.keys(batch.closing_balances) as EndpointKey[]) {
      writeVisible([[key, batch.closing_balances[key]]]);
      // Transfers already emitted their departure/arrival deltas. Only publish
      // the authoritative residual here (for example a zero-flight 3-5-7
      // leg-reserve credit), never the table's broad `unmatched_deltas` map.
      const residual = residualDeltaForEndpoint(batch, key);
      if (residual !== 0) {
        const endpoint = endpointFromKey(key);
        const ref = endpointRef(endpoint, playersRef.current);
        emitBalanceDelta({
          id: `${batch.id}:settled:${key}`,
          batchId: batch.id,
          cursor: batch.cursor,
          endpoint,
          position: ref?.kind === 'seat' ? ref.position : undefined,
          amount: residual,
          boundary: 'settled',
          reason: batch.reason,
        });
      }
    }
    runningRef.current.delete(batchId);
    for (const key of Object.keys(batch.opening_balances) as EndpointKey[]) {
      if (activeEndpointsRef.current.get(key) === batchId) activeEndpointsRef.current.delete(key);
    }

    // Financial presentation is visibly complete at this edge. Games may
    // advance their non-financial terminal phase from it, but only after the
    // database batch's actual flight has settled.
    try {
      onBatchSettledRef.current(batch);
    } catch (error) {
      // A game phase callback must never strand ledger ownership after the
      // financial presentation already settled.
      console.warn('[canonical-shell] chip batch-settled callback threw', error);
    }

    // This fetch is the release barrier.  A cursor by itself is never enough:
    // raw realtime rows can be early or late.  If the request fails, the
    // closing value remains presentation-owned until a later raw row proves a
    // cursor at or beyond the batch.
    void refetchAuthoritative()
      .then(() => releaseOrContinueRef.current(batch))
      .catch(() => {
        startQueuedRef.current();
      });
  }, [emitBalanceDelta, refetchAuthoritative, writeVisible]);

  const startQueued = useCallback(() => {
    if (disposedRef.current) return;
    let progressed = true;
    while (progressed) {
      progressed = false;
      const sorted = [...queuedRef.current].sort((a, b) => a.cursor - b.cursor);
      for (const batch of sorted) {
        const endpoints = Object.keys(batch.opening_balances) as EndpointKey[];
        // A gated predecessor still owns its endpoints at the opening value.
        // Do not let a later batch launch across one of those endpoints, or
        // independent absolute openings could visually overtake each other.
        const hasQueuedPredecessorOnEndpoint = sorted.some((candidate) =>
          candidate.cursor < batch.cursor &&
          Object.keys(candidate.opening_balances).some((key) => endpoints.includes(key as EndpointKey)),
        );
        if (hasQueuedPredecessorOnEndpoint) continue;
        // A delayed visual sequence (for example, Holm community/Chucky
        // reveal) may defer the flight. The raw authoritative rows remain
        // ledger-owned at their opening values until this gate opens.
        if (!canStartBatchRef.current(batch)) continue;
        if (endpoints.some((key) => activeEndpointsRef.current.has(key))) continue;
        queuedRef.current = queuedRef.current.filter((candidate) => candidate.id !== batch.id);
        for (const key of endpoints) {
          activeEndpointsRef.current.set(key, batch.id);
          writeVisible([[key, batch.opening_balances[key]]]);
        }

        const running: RunningBatch = {
          batch,
          departed: new Set(),
          arrived: new Set(),
          settled: new Set(),
          cancelled: false,
        };
        runningRef.current.set(batch.id, running);

        const entryTotal = batch.transfers.length;
        if (entryTotal === 0) {
          finishBatch(batch.id);
          progressed = true;
          break;
        }

        for (const entry of batch.transfers) {
          const fromKey = endpointKey(entry.from);
          const toKey = endpointKey(entry.to);
          const from = endpointRef(entry.from, playersRef.current);
          const to = endpointRef(entry.to, playersRef.current);
          if (!fromKey || !toKey || !from || !to) {
            abortBatchRef.current(batch.id);
            break;
          }
          // Database journal reasons are intentionally financial rather than
          // presentational: terminal payouts from Cribbage, Gin, and Yahtzee
          // are all recorded as `transfer`. Every player-bound movement is
          // nevertheless an award at the canonical transport boundary, so
          // select its win flight from immutable endpoint topology instead.
          const isRecipientAward = entry.to.kind === 'player';
          const intent: ChipTransportIntent = {
            id: entry.id,
            amount: entry.amount,
            from,
            to,
            reason: batch.reason,
            variant: isRecipientAward
              ? 'canonicalWinTransfer'
              : 'default',
            destinationReaction: isRecipientAward
              ? { pulse: true }
              : undefined,
          };
          const accepted = transport.dispatch(intent, {
            onDeparted: () => {
              const active = runningRef.current.get(batch.id);
              if (!active || active.cancelled || active.departed.has(entry.id)) return;
              active.departed.add(entry.id);
              const opening = batch.opening_balances[fromKey];
              const departed = batch.transfers
                .filter((candidate) => endpointKey(candidate.from) === fromKey && active.departed.has(candidate.id))
                .reduce((sum, candidate) => sum + candidate.amount, 0);
              const arrived = batch.transfers
                .filter((candidate) => endpointKey(candidate.to) === fromKey && active.arrived.has(candidate.id))
                .reduce((sum, candidate) => sum + candidate.amount, 0);
              writeVisible([[fromKey, opening - departed + arrived]]);
              emitBalanceDelta({
                id: `${batch.id}:${entry.id}:departed:${fromKey}`,
                batchId: batch.id,
                cursor: batch.cursor,
                endpoint: entry.from,
                position: from.kind === 'seat' ? from.position : undefined,
                amount: -entry.amount,
                boundary: 'departed',
                reason: batch.reason,
              });
            },
            onArrived: () => {
              const active = runningRef.current.get(batch.id);
              if (!active || active.cancelled || active.arrived.has(entry.id)) return;
              active.arrived.add(entry.id);
              const opening = batch.opening_balances[toKey];
              const departed = batch.transfers
                .filter((candidate) => endpointKey(candidate.from) === toKey && active.departed.has(candidate.id))
                .reduce((sum, candidate) => sum + candidate.amount, 0);
              const arrived = batch.transfers
                .filter((candidate) => endpointKey(candidate.to) === toKey && active.arrived.has(candidate.id))
                .reduce((sum, candidate) => sum + candidate.amount, 0);
              // Concurrent player-to-pot flights arrive as one receipt. Keep
              // the pot at its opening value until every inbound chip lands,
              // then make one composed balance change and one +$total label.
              const inboundToEndpoint = batch.transfers.filter(
                (candidate) => endpointKey(candidate.to) === toKey,
              );
              const aggregatePotArrival = aggregatesConcurrentPotArrival(batch, toKey);
              if (
                aggregatePotArrival &&
                !inboundToEndpoint.every((candidate) => active.arrived.has(candidate.id))
              ) {
                return;
              }
              writeVisible([[toKey, opening - departed + arrived]]);
              emitBalanceDelta({
                id: aggregatePotArrival
                  ? `${batch.id}:arrived:${toKey}:aggregate`
                  : `${batch.id}:${entry.id}:arrived:${toKey}`,
                batchId: batch.id,
                cursor: batch.cursor,
                endpoint: entry.to,
                position: to.kind === 'seat' ? to.position : undefined,
                amount: aggregatePotArrival
                  ? inboundToEndpoint.reduce((sum, candidate) => sum + candidate.amount, 0)
                  : entry.amount,
                boundary: 'arrived',
                reason: batch.reason,
              });
            },
            onSettled: () => {
              const active = runningRef.current.get(batch.id);
              if (!active || active.cancelled || active.settled.has(entry.id)) return;
              active.settled.add(entry.id);
              if (active.settled.size === entryTotal) finishBatch(batch.id);
            },
            onDropped: () => abortBatchRef.current(batch.id),
          });
          if (!accepted) abortBatchRef.current(batch.id);
        }
        progressed = true;
        break;
      }
    }
  }, [finishBatch, transport, writeVisible]);
  startQueuedRef.current = startQueued;

  // Admission may open after the immutable batch is already queued. Recheck
  // without waiting for another realtime row; it is not a financial event.
  useEffect(() => {
    startQueuedRef.current();
  }, [admissionVersion]);

  const releaseOrContinue = useCallback((batch: ChipPresentationBatch) => {
    const endpoints = Object.keys(batch.opening_balances) as EndpointKey[];
    // Start an overlapping committed successor before releasing this endpoint.
    // Its opening value is the predecessor's closing value, so no raw snapshot
    // can appear between the two transfers.
    startQueuedRef.current();
    for (const key of endpoints) {
      if (activeEndpointsRef.current.has(key)) continue;
      const rawCursor = rawCursorsRef.current.get(key) ?? 0;
      if (rawCursor === batch.cursor) {
        releasedCursorsRef.current.set(key, rawCursor);
        const raw = rawBalancesRef.current.get(key);
        if (raw != null) writeVisible([[key, raw]]);
      }
    }
  }, [writeVisible]);
  releaseOrContinueRef.current = releaseOrContinue;

  const abortBatch = useCallback((batchId: string) => {
    const running = runningRef.current.get(batchId);
    if (!running || running.cancelled) return;
    running.cancelled = true;
    onBalanceDeltasAbandonedRef.current(batchId);
    for (const entry of running.batch.transfers) transport.cancel(entry.id);
    runningRef.current.delete(batchId);
    for (const key of Object.keys(running.batch.opening_balances) as EndpointKey[]) {
      if (activeEndpointsRef.current.get(key) === batchId) activeEndpointsRef.current.delete(key);
    }
    // There is no replay after a lost endpoint.  Reconciliation goes directly
    // to the database's latest value and the batch id stays seen forever.
    void refetchAuthoritative().finally(() => {
      if (disposedRef.current) return;
      startQueuedRef.current();
      for (const key of Object.keys(running.batch.closing_balances) as EndpointKey[]) {
        if (activeEndpointsRef.current.has(key)) continue;
        const raw = rawBalancesRef.current.get(key);
        if (raw != null) writeVisible([[key, raw]]);
        releasedCursorsRef.current.set(key, rawCursorsRef.current.get(key) ?? running.batch.cursor);
      }
    });
  }, [refetchAuthoritative, transport, writeVisible]);
  abortBatchRef.current = abortBatch;

  const acceptBatch = useCallback((batch: ChipPresentationBatch) => {
    if (seenBatchIdsRef.current.has(batch.id)) return;
    knownBatchCursorsRef.current.add(batch.cursor);
    const endpoints = Object.keys(batch.opening_balances) as EndpointKey[];
    // A reconnect may deliver an INSERT that was already fully settled while
    // this client was away.  Its raw rows are our new baseline, not a cue to
    // replay financial motion.
    if (endpoints.length > 0 && endpoints.every((key) =>
      (releasedCursorsRef.current.get(key) ?? 0) >= batch.cursor &&
      (rawCursorsRef.current.get(key) ?? 0) >= batch.cursor,
    )) {
      seenBatchIdsRef.current.add(batch.id);
      return;
    }
    seenBatchIdsRef.current.add(batch.id);
    queuedRef.current.push(batch);
    startQueuedRef.current();
  }, []);

  const recoverCommittedCursor = useCallback((cursor: number) => {
    if (!shouldRecoverCommittedCursor({
      gameId,
      hydrated: hydratedRef.current,
      disposed: disposedRef.current,
      cursor,
      known: knownBatchCursorsRef.current.has(cursor),
      recovering: recoveringBatchCursorsRef.current.has(cursor),
    })) return;

    recoveringBatchCursorsRef.current.add(cursor);
    const client = supabase as any;
    void (async () => {
      try {
        const { data } = await client
          .from('gameplay_transfer_batches')
          .select('*')
          .eq('game_id', gameId)
          .eq('cursor', cursor)
          .maybeSingle();
        if (disposedRef.current || !data) return;
        const batch = normalizeBatch(data, gameId);
        if (batch) acceptBatch(batch);
      } catch (error) {
        console.warn('[canonical-shell] exact chip batch cursor recovery failed', {
          gameId,
          cursor,
          error,
        });
      } finally {
        recoveringBatchCursorsRef.current.delete(cursor);
      }
    })();
  }, [acceptBatch, gameId]);
  recoverCommittedCursorRef.current = recoverCommittedCursor;

  useEffect(() => {
    if (!gameId) return;
    disposedRef.current = false;
    hydratedRef.current = false;
    emittedBalanceDeltaIdsRef.current.clear();
    knownBatchCursorsRef.current.clear();
    recoveringBatchCursorsRef.current.clear();
    const client = supabase as any;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const receiveBatch = (payload: { new?: unknown }) => {
      const batch = normalizeBatch(payload.new, gameId);
      if (!batch) return;
      if (!hydratedRef.current) {
        bootEventsRef.current.push(batch);
      } else {
        acceptBatch(batch);
      }
    };

    const abandon = () => {
      // Disconnect/unmount is never a pause.  Remove each moving chip, throw
      // away queued batches, and make the next display a direct authoritative
      // reconciliation.  No settlement effect is replayed after recovery.
      for (const running of runningRef.current.values()) {
        running.cancelled = true;
        onBalanceDeltasAbandonedRef.current(running.batch.id);
        for (const entry of running.batch.transfers) transport.cancel(entry.id);
      }
      runningRef.current.clear();
      activeEndpointsRef.current.clear();
      queuedRef.current = [];
      void refetchAuthoritative().finally(() => {
        if (disposedRef.current) return;
        for (const [key, raw] of rawBalancesRef.current) {
          writeVisible([[key, raw]]);
          releasedCursorsRef.current.set(key, rawCursorsRef.current.get(key) ?? 0);
        }
      });
    };

    channel = client
      .channel(`chip-presentation:${gameId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'gameplay_transfer_batches', filter: `game_id=eq.${gameId}`,
      }, receiveBatch)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}`,
      }, (payload: { new?: Record<string, unknown> }) => setRawPlayer(payload.new ?? {}))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}`,
      }, (payload: { new?: Record<string, unknown> }) => setRawPot(payload.new ?? {}))
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          abandon();
        } else if (status === 'SUBSCRIBED' && hydratedRef.current) {
          abandon();
        }
      });

    void (async () => {
      const [{ data: batchRows }, { data: playerRows }, { data: gameRow }] = await Promise.all([
        client.from('gameplay_transfer_batches').select('*').eq('game_id', gameId),
        client.from('players').select('id, chips, position, chip_transfer_cursor').eq('game_id', gameId),
        client.from('games').select('pot, pot_transfer_cursor').eq('id', gameId).maybeSingle(),
      ]);
      if (disposedRef.current) return;

      // Existing rows are history, including reconnect history: baseline them
      // directly and never replay their financial effects.
      for (const row of batchRows ?? []) {
        const batch = normalizeBatch(row, gameId);
        if (batch) {
          seenBatchIdsRef.current.add(batch.id);
          knownBatchCursorsRef.current.add(batch.cursor);
        }
      }
      for (const row of playerRows ?? []) setRawPlayer(row as Record<string, unknown>);
      if (gameRow) setRawPot(gameRow as Record<string, unknown>);
      for (const [key, cursor] of rawCursorsRef.current) releasedCursorsRef.current.set(key, cursor);
      hydratedRef.current = true;

      const buffered = bootEventsRef.current;
      bootEventsRef.current = [];
      for (const batch of buffered) acceptBatch(batch);
    })().catch(() => {
      // A failed bootstrap is a reconciliation-only state.  We never guess or
      // replay effects; the next subscription/browse event can establish a
      // fresh authoritative baseline.
      hydratedRef.current = true;
    });

    return () => {
      disposedRef.current = true;
      abandon();
      if (channel) void client.removeChannel(channel);
    };
  }, [acceptBatch, gameId, refetchAuthoritative, setRawPlayer, setRawPot, transport, writeVisible]);

  return useMemo<ChipPresentationLedger>(() => ({
    playerBalance: (playerId, fallback) => {
      if (!playerId) return fallback;
      return visibleBalances.get(`player:${playerId}` as EndpointKey)
        ?? rawBalancesRef.current.get(`player:${playerId}` as EndpointKey)
        ?? fallback;
    },
    potBalance: (fallback) => visibleBalances.get('pot') ?? rawBalancesRef.current.get('pot') ?? fallback,
  }), [visibleBalances]);
}
