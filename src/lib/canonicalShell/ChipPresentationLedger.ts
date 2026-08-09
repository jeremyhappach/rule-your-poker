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

type EndpointKey = 'pot' | `player:${string}`;

interface TransferEndpoint {
  kind: 'pot' | 'player';
  playerId?: string;
}

interface TransferEntry {
  id: string;
  amount: number;
  from: TransferEndpoint;
  to: TransferEndpoint;
}

interface TransferBatch {
  id: string;
  game_id: string;
  cursor: number;
  reason: ChipTransportIntent['reason'];
  transfers: TransferEntry[];
  opening_balances: Record<EndpointKey, number>;
  closing_balances: Record<EndpointKey, number>;
}

interface PlayerSnapshot {
  chips: number;
  position: number;
  cursor: number | null;
}

interface RunningBatch {
  batch: TransferBatch;
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

function endpointKey(endpoint: TransferEndpoint): EndpointKey | null {
  if (endpoint.kind === 'pot') return 'pot';
  return endpoint.playerId ? `player:${endpoint.playerId}` : null;
}

function endpointRef(endpoint: TransferEndpoint, players: Map<string, PlayerSnapshot>): ChipEndpointRef | null {
  if (endpoint.kind === 'pot') return { kind: 'pot' };
  const player = endpoint.playerId ? players.get(endpoint.playerId) : null;
  return player ? { kind: 'seat', position: player.position } : null;
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeBatch(value: unknown, gameId: string): TransferBatch | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.game_id !== gameId || typeof row.id !== 'string') return null;
  const cursor = asNumber(row.cursor);
  if (cursor == null) return null;

  const values = (candidate: unknown): Record<EndpointKey, number> => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
    return Object.entries(candidate as Record<string, unknown>).reduce<Record<EndpointKey, number>>((acc, [key, raw]) => {
      const balance = asNumber(raw);
      if ((key === 'pot' || key.startsWith('player:')) && balance != null) {
        acc[key as EndpointKey] = balance;
      }
      return acc;
    }, {});
  };

  const transfers = Array.isArray(row.transfers) ? row.transfers.reduce<TransferEntry[]>((acc, raw) => {
    if (!raw || typeof raw !== 'object') return acc;
    const entry = raw as Record<string, unknown>;
    const amount = asNumber(entry.amount);
    const from = entry.from as TransferEndpoint | undefined;
    const to = entry.to as TransferEndpoint | undefined;
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
): ChipPresentationLedger {
  const [visibleBalances, setVisibleBalances] = useState<Map<EndpointKey, number>>(new Map());
  const playersRef = useRef(new Map<string, PlayerSnapshot>());
  const rawBalancesRef = useRef(new Map<EndpointKey, number>());
  const rawCursorsRef = useRef(new Map<EndpointKey, number>());
  const releasedCursorsRef = useRef(new Map<EndpointKey, number>());
  const seenBatchIdsRef = useRef(new Set<string>());
  const queuedRef = useRef<TransferBatch[]>([]);
  const runningRef = useRef(new Map<string, RunningBatch>());
  const activeEndpointsRef = useRef(new Map<EndpointKey, string>());
  const bootEventsRef = useRef<TransferBatch[]>([]);
  const hydratedRef = useRef(false);
  const disposedRef = useRef(false);

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

  const releaseOrContinueRef = useRef<(batch: TransferBatch) => void>(() => {});
  const startQueuedRef = useRef<() => void>(() => {});
  const abortBatchRef = useRef<(batchId: string) => void>(() => {});

  const finishBatch = useCallback((batchId: string) => {
    const running = runningRef.current.get(batchId);
    if (!running || running.cancelled) return;
    const { batch } = running;
    for (const key of Object.keys(batch.closing_balances) as EndpointKey[]) {
      writeVisible([[key, batch.closing_balances[key]]]);
    }
    runningRef.current.delete(batchId);
    for (const key of Object.keys(batch.opening_balances) as EndpointKey[]) {
      if (activeEndpointsRef.current.get(key) === batchId) activeEndpointsRef.current.delete(key);
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
  }, [refetchAuthoritative, writeVisible]);

  const startQueued = useCallback(() => {
    if (disposedRef.current) return;
    let progressed = true;
    while (progressed) {
      progressed = false;
      const sorted = [...queuedRef.current].sort((a, b) => a.cursor - b.cursor);
      for (const batch of sorted) {
        const endpoints = Object.keys(batch.opening_balances) as EndpointKey[];
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
          const intent: ChipTransportIntent = {
            id: entry.id,
            amount: entry.amount,
            from,
            to,
            reason: batch.reason,
            variant: batch.reason === 'win' || batch.reason === 'sweep'
              ? 'canonicalWinTransfer'
              : 'default',
            destinationReaction: batch.reason === 'win' || batch.reason === 'sweep'
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
              writeVisible([[toKey, opening - departed + arrived]]);
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

  const releaseOrContinue = useCallback((batch: TransferBatch) => {
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

  const acceptBatch = useCallback((batch: TransferBatch) => {
    if (seenBatchIdsRef.current.has(batch.id)) return;
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

  useEffect(() => {
    if (!gameId) return;
    disposedRef.current = false;
    hydratedRef.current = false;
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
        if (batch) seenBatchIdsRef.current.add(batch.id);
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
