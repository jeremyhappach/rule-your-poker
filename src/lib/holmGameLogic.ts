import { supabase } from "@/integrations/supabase/client";
import {
  logRevealSequenceStep,
  logResolutionGate,
  resetHolmRevealTracker,
  type SequenceContext,
} from "./holmRevealInstrumentation";
import { createDeck, shuffleDeck, type Card, type Suit, type Rank, evaluateHand, formatHandRank, formatHandRankDetailed } from "./cardUtils";
import { getDisplayName } from "./botAlias";
import { getActiveHolmRoundWithGame } from "./holmRoundUtils";
import { logGameState, logAllDecisionsIn, logStatusChange } from "./gameStateDebugLog";
import { persistTransition } from "./persistSyncDebugEvent";
import { getHolmForcedWinner, getHolmForcedWinnerAsync } from "./holm/holmDebugOverrides";
import { settleHolmHand } from "./holmSettleHand";
import { toast } from "sonner";

/**
 * Visible, actionable surface for an authoritative settlement rejection.
 * The RPC is the only settlement owner: on rejection we perform NO client
 * financial fallback and NO status rewrite — authoritative state is left
 * untouched and the same idempotent call remains safe to retry.
 */
const reportHolmSettlementFailure = (branch: string, err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[HOLM SETTLE] ${branch} settlement RPC failed:`, err);
  toast.error('Hand settlement failed', {
    description: `${branch}: ${message}. No chips moved — the hand is unchanged. Retry the action or reload.`,
    duration: 15000,
  });
};

const HOLM_SHOWDOWN_TIMING_FALLBACK_MS = {
  afterTabled: 1500,
  preChucky: 1500,
  multiShowdown: 2000,
} as const;

type HolmShowdownTiming = typeof HOLM_SHOWDOWN_TIMING_FALLBACK_MS;

const toConfiguredHolmDelayMs = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10000
    ? parsed
    : fallback;
};

/**
 * Reads the same configurable presentation cadence used by the table. These
 * pauses govern when the next visual artifact becomes available; settlement
 * remains owned by the RPC path below.
 */
async function getHolmShowdownTiming(): Promise<HolmShowdownTiming> {
  const { data, error } = await supabase
    .from('game_defaults')
    .select('holm_after_tabled_delay_ms, holm_pre_chucky_delay_ms, holm_multi_showdown_delay_ms')
    .eq('game_type', 'holm')
    .maybeSingle();

  if (error || !data) {
    console.warn('[HOLM END] Falling back to default showdown presentation timings:', error?.message);
    return HOLM_SHOWDOWN_TIMING_FALLBACK_MS;
  }

  return {
    afterTabled: toConfiguredHolmDelayMs(
      data.holm_after_tabled_delay_ms,
      HOLM_SHOWDOWN_TIMING_FALLBACK_MS.afterTabled,
    ),
    preChucky: toConfiguredHolmDelayMs(
      data.holm_pre_chucky_delay_ms,
      HOLM_SHOWDOWN_TIMING_FALLBACK_MS.preChucky,
    ),
    multiShowdown: toConfiguredHolmDelayMs(
      data.holm_multi_showdown_delay_ms,
      HOLM_SHOWDOWN_TIMING_FALLBACK_MS.multiShowdown,
    ),
  };
}

/**
 * AUTHORITATIVE HOLM SETTLEMENT SEAM
 * ==================================
 * Every Holm terminal hand outcome — pussy-tax carryforward, Chucky pot match,
 * showdown award, partial-tie split, tie-break pot match and the dealer-game
 * ending Chucky final award — is settled by ONE server operation:
 * `public.holm_settle_hand` (see src/lib/holmSettleHand.ts).
 *
 * That RPC is the only owner of:
 *   - the stable settlement claim (partial unique index on
 *     game_results (dealer_game_id, hand_number) for holm terminal event kinds)
 *   - player chip mutations (signed delta map)
 *   - game_results rows
 *   - games.last_round_result / pot / awaiting_next_round / status
 *   - the post-payout session_player_snapshots row set
 *   - pending_session_end consumption, session_ended + session_ended_at
 *   - rounds completion / pot / chucky_active
 *
 * This module therefore contains NO increment_player_chips /
 * decrement_player_chips / recordGameResult / snapshotPlayerChips /
 * status='game_over' / status='session_ended' write on any terminal path. The
 * client computes business inputs and renders the outcome; it never authors
 * money or terminal status. There is deliberately NO client-side fallback —
 * a fallback is exactly what could double-settle.
 */

/**
 * The settlement claim is keyed on (dealer_game_id, hand_number). The RPC
 * locates the hand's round by that pair, so the dealer game id handed to it
 * must be the round's own — `games.current_game_uuid` is only a fallback for
 * rows written before dealer_game_id was populated on rounds.
 */
/**
 * Resolves the RPC settlement identity from the round row itself. The claim is
 * (dealer_game_id, hand_number); deriving hand_number from `games.total_hands`
 * (as the legacy writers did) can drift from `rounds.hand_number`, which would
 * both miss the claim index and mis-file the accounting row.
 */
async function resolveHolmSettlementIdentity(
  roundId: string,
  game: { current_game_uuid?: string | null; total_hands?: number | null },
): Promise<{ handNumber: number; dealerGameId: string }> {
  const { data } = await supabase
    .from('rounds')
    .select('hand_number, dealer_game_id')
    .eq('id', roundId)
    .maybeSingle();
  return {
    handNumber: data?.hand_number ?? game?.total_hands ?? 1,
    dealerGameId: resolveHolmDealerGameId(data ?? null, game),
  };
}

function resolveHolmDealerGameId(
  round: { dealer_game_id?: string | null } | null | undefined,
  game: { current_game_uuid?: string | null } | null | undefined,
): string {
  const id = round?.dealer_game_id ?? game?.current_game_uuid ?? null;
  if (!id) throw new Error('holm:settlement_missing_dealer_game_id');
  return id;
}

/**
 * Observe exact server-published Holm decision completion.
 * Decisions, turn position, deadline, and the completion marker are committed
 * together by holm_submit_decision; this client only starts presentation after
 * that exact-round marker is visible.
 */
export async function checkHolmRoundComplete(gameId: string) {
  const { game, round, error } = await getActiveHolmRoundWithGame(gameId);

  if (error || !game || !round) {
    console.warn('[HOLM CHECK] Active game/round unavailable', { gameId, error });
    return;
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('position, decision_locked, current_decision')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .order('position');

  if (playersError || !players?.length) {
    console.warn('[HOLM CHECK] Active players unavailable', { gameId, playersError });
    return;
  }

  const allDecided = players.every(
    player => player.decision_locked && player.current_decision !== null,
  );
  if (!allDecided) {
    console.log('[HOLM CHECK] Decisions remain; server owns the next turn');
    return;
  }

  if (round.status === 'processing' || round.status === 'showdown' || round.status === 'completed') {
    return;
  }

  if (!game.all_decisions_in || game.all_decisions_in_round_id !== round.id) {
    console.warn('[HOLM CHECK] Exact-round completion was not published by the server; refusing client repair');
    return;
  }

  await logAllDecisionsIn(gameId, round.id, true, 'holmGameLogic:checkHolmRoundComplete', {
    player_decisions: players.map(player => ({
      position: player.position,
      decision: player.current_decision,
      locked: player.decision_locked,
    })),
    round_status: round.status,
  });

  await endHolmRound(gameId);
}


/** Result of the authoritative first-hand bootstrap. */
export type HolmInitialHandStartResult = {
  outcome: 'started' | 'already-started' | 'rejected';
  reason?: string;
  round_id?: string;
  dealer_game_id?: string;
  hand_number?: number;
  buck_position?: number;
  pot?: number;
  deduped?: boolean;
};

/**
 * Authoritative first-hand bootstrap. The RPC locks the game row and owns the
 * ante, deal, round/card inserts, and game-pointer publication atomically.
 * Duplicate and delayed callers receive the same first-round identity.
 */
export async function startHolmInitialHand(
  gameId: string,
): Promise<HolmInitialHandStartResult> {
  const { data, error } = await supabase.rpc('start_holm_initial_hand', {
    _game_id: gameId,
    _skip_ante_collection: false,
  });

  if (error) {
    throw new Error(`Holm initial-hand RPC failed: ${error.message}`);
  }

  const result = (data ?? {}) as HolmInitialHandStartResult;
  if (result.outcome !== 'started' && result.outcome !== 'already-started') {
    throw new Error(`Holm initial-hand RPC rejected: ${result.reason ?? 'unknown reason'}`);
  }

  if (result.outcome === 'started') {
    persistTransition(gameId, 'holm', 1, 'hand-start', {
      buckPosition: result.buck_position ?? null,
      pot: result.pot ?? null,
      firstHand: true,
      atomic: true,
    });
  }

  console.log('[HOLM] Initial hand RPC complete', result);
  return result;
}

/**
 * Handle end of Holm round
 * - Reveal all 4 community cards immediately
 * - Deal Chucky if only one player stayed
 * - Wait before evaluation
 */
export async function endHolmRound(gameId: string) {
  console.log('[HOLM END] ========== Starting endHolmRound for game:', gameId, '==========');

  // DEBUG LOG: endHolmRound called (fire-and-forget)
  logGameState({
    gameId,
    eventType: 'END_HOLM_ROUND_CALLED',
    sourceLocation: 'holmGameLogic:endHolmRound:entry',
    details: { timestamp: new Date().toISOString() },
  });

  // ARCHITECTURAL STANDARD: Use centralized round-fetching utility
  const { game, round, error: fetchError } = await getActiveHolmRoundWithGame(gameId);

  if (fetchError || !game) {
    console.log('[HOLM END] ERROR: Game not found:', fetchError);
    return;
  }

  console.log('[HOLM END] Game data:', {
    current_round: game.current_round,
    pot: game.pot,
    status: game.status
  });

  if (!round) {
    console.log('[HOLM END] ERROR: No rounds found for game');
    return;
  }
  
  const dealerGameId = (game as any).current_game_uuid as string | null | undefined;
  
  // DEBUG LOG: endHolmRound with full context (fire-and-forget)
  logGameState({
    gameId,
    dealerGameId,
    roundId: round.id,
    eventType: 'END_HOLM_ROUND_CALLED',
    gameStatus: game.status,
    roundStatus: round.status,
    allDecisionsIn: game.all_decisions_in,
    currentRound: game.current_round,
    totalHands: game.total_hands,
    sourceLocation: 'holmGameLogic:endHolmRound:context',
    details: {
      round_hand_number: round.hand_number,
      round_round_number: round.round_number,
      community_cards_revealed: round.community_cards_revealed,
      chucky_active: round.chucky_active,
    },
  });
  
  console.log('[HOLM END] Using most recent round for dealer game:', {
    dealerGameId,
    round_id: round.id,
    hand_number: round.hand_number,
    round_number: round.round_number,
    game_current_round: game.current_round,
  });

  // A dedicated presentation fallback lease keeps disconnected multi-player
  // showdowns recoverable without ever overloading the gameplay decision timer.
  const roundCommunityRevealed = round.community_cards_revealed ?? 0;
  if (round.status === 'showdown' && roundCommunityRevealed < 4) {
    const observedFallbackAt = round.presentation_fallback_at ?? null;
    const observedFallbackEpoch = observedFallbackAt ? Date.parse(observedFallbackAt) : Number.NaN;
    if (Number.isFinite(observedFallbackEpoch) && observedFallbackEpoch > Date.now()) {
      return;
    }

    const recoveryLease = new Date(Date.now() + 30_000).toISOString();
    let recoveryClaimQuery = supabase
      .from('rounds')
      .update({ presentation_fallback_at: recoveryLease, decision_deadline: null })
      .eq('id', round.id)
      .eq('status', 'showdown')
      .or('community_cards_revealed.is.null,community_cards_revealed.lt.4');

    recoveryClaimQuery = observedFallbackAt
      ? recoveryClaimQuery.eq('presentation_fallback_at', observedFallbackAt)
      : recoveryClaimQuery.is('presentation_fallback_at', null);

    const { data: recoveryClaim, error: recoveryClaimError } = await recoveryClaimQuery.select();
    if (recoveryClaimError || !recoveryClaim?.length) {
      return;
    }

    let communityCards: Card[] = [];
    try {
      const rawCommunity = round.community_cards;
      const parsedCommunity = typeof rawCommunity === 'string'
        ? JSON.parse(rawCommunity)
        : rawCommunity;
      if (Array.isArray(parsedCommunity)) {
        communityCards = parsedCommunity.map((card: any) => ({
          suit: (card.suit || card.Suit) as Suit,
          rank: String(card.rank || card.Rank).toUpperCase() as Rank,
        }));
      }
    } catch (parseError) {
      console.error('[HOLM END] Unable to parse recovery community cards', parseError);
    }

    const [{ data: players }, { data: allPlayerCardsData }] = await Promise.all([
      supabase
        .from('players')
        .select('*, profiles(username)')
        .eq('game_id', gameId)
        .eq('status', 'active')
        .eq('sitting_out', false)
        .order('position'),
      supabase
        .from('player_cards')
        .select('*, players!inner(*, profiles(username))')
        .eq('round_id', round.id),
    ]);

    const stayedPlayers = (players ?? []).filter((player: any) => player.current_decision === 'stay');
    try {
      if (stayedPlayers.length < 2) {
        console.error('[HOLM END] Recovery invariant failed: multi-player showdown has fewer than two stayers');
        return;
      }

      const seatedUserIds = (players ?? []).map((player: any) => player.user_id);
      const stayedPlayerIds = stayedPlayers.map((player: any) => player.id);
      await supabase
        .from('player_cards')
        .update({ visible_to_user_ids: seatedUserIds, is_public: true })
        .eq('round_id', round.id)
        .in('player_id', stayedPlayerIds);

      await handleMultiPlayerShowdown(
        gameId,
        round.id,
        stayedPlayers,
        communityCards,
        game,
        round.pot || game.pot || 0,
        allPlayerCardsData ?? [],
      );
    } finally {
      await supabase
        .from('rounds')
        .update({ presentation_fallback_at: null, decision_deadline: null })
        .eq('id', round.id)
        .eq('presentation_fallback_at', recoveryLease);
    }
    return;
  }

  // Guard: Prevent multiple simultaneous calls.
  // NOTE: We no longer exit early on round.status === 'showdown' because we have an explicit
  // showdown recovery path above.
  if (round.status === 'completed' || round.status === 'processing' || round.chucky_active) {
    console.log('[HOLM END] Round already being processed or completed, skipping', {
      status: round.status,
      chucky_active: round.chucky_active
    });
    return;
  }

  // CRITICAL ATOMIC GUARD: Atomically mark round as 'processing' to prevent concurrent calls
  // This is the PRIMARY guard against double-charging - only the first call to successfully
  // transition from 'betting' to 'processing' will proceed
  const capturedRoundId = round.id;
  const capturedRoundNumber = round.round_number;
  // CRITICAL: Also capture hand_number for game_results recording - NOT round_number
  // In Holm, round_number is ALWAYS 1, but hand_number increments each match
  const capturedHandNumber = round.hand_number ?? 1;
  console.log('[HOLM END] Attempting atomic lock on round:', capturedRoundId, 'round_number:', capturedRoundNumber, 'hand_number:', capturedHandNumber);
  
  const { data: lockResult, error: lockError } = await supabase
    .from('rounds')
    .update({ status: 'processing' })
    .eq('id', capturedRoundId)
    .eq('status', 'betting') // ATOMIC GUARD: Only succeeds if still in 'betting' status
    .select();
    
  if (lockError || !lockResult || lockResult.length === 0) {
    console.log('[HOLM END] ⚠️ ATOMIC GUARD: Another client already acquired lock on this round, skipping');
    return;
  }
  console.log('[HOLM END] ✅ Successfully acquired atomic lock on round (status -> processing)');
  
  // DEBUG LOG: Round status changed to processing (fire-and-forget)
  logStatusChange(gameId, capturedRoundId, game.status, 'processing', 'holmGameLogic:endHolmRound:atomicLock', {
    round_number: capturedRoundNumber,
    previous_status: 'betting',
  });

  console.log('[HOLM END] Round data:', {
    id: capturedRoundId,
    status: 'processing (just set)',
    community_cards_revealed: round.community_cards_revealed,
    chucky_active: round.chucky_active
  });

  // Extract community cards for later use - ensure proper parsing from JSON
  let communityCards: Card[] = [];
  try {
    const rawCommunity = round.community_cards;
    if (Array.isArray(rawCommunity)) {
      communityCards = rawCommunity.map((c: any) => ({
        suit: (c.suit || c.Suit) as Suit,
        rank: String(c.rank || c.Rank).toUpperCase() as Rank
      }));
    } else if (typeof rawCommunity === 'string') {
      const parsed = JSON.parse(rawCommunity);
      communityCards = parsed.map((c: any) => ({
        suit: (c.suit || c.Suit) as Suit,
        rank: String(c.rank || c.Rank).toUpperCase() as Rank
      }));
    }
  } catch (e) {
    console.error('[HOLM END] ERROR parsing community cards:', e);
  }
  console.log('[HOLM END] Community cards:', communityCards.map(c => `${c.rank}${c.suit}`).join(' '));

  // Get all players and their decisions
  // CRITICAL: Only fetch players who are ACTIVE AND NOT SITTING OUT
  // This ensures we don't count sitting-out bots or observers in our stayed/folded calculations
  const { data: players } = await supabase
    .from('players')
    .select('*, profiles(username)')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .eq('sitting_out', false)
    .order('position');

  if (!players || players.length === 0) {
    console.log('[HOLM END] ERROR: No active, non-sitting-out players found');
    return;
  }

  // CRITICAL FIX: Fetch ALL player cards NOW, BEFORE any delays or status changes
  // This prevents race conditions where cards get deleted/modified during delays
  console.log('[HOLM END] ⚠️ FETCHING ALL PLAYER CARDS IMMEDIATELY (before any delays) ⚠️');
  
  // DIAGNOSTIC: Capture exact game state at moment of card fetch
  const { data: diagGame } = await supabase.from('games').select('all_decisions_in, status, current_game_uuid').eq('id', gameId).single();
  const { data: diagRound } = await supabase.from('rounds').select('status, id, dealer_game_id').eq('id', round.id).single();
  console.log('[HOLM DIAG] Game state at card fetch:', JSON.stringify(diagGame));
  console.log('[HOLM DIAG] Round state at card fetch:', JSON.stringify(diagRound));
  
  // DIAGNOSTIC: Also try a raw count query WITHOUT the players join to isolate if the issue is RLS on player_cards or the join
  const { data: rawCardCount, error: rawCountError } = await supabase
    .from('player_cards')
    .select('id, player_id')
    .eq('round_id', round.id);
  console.log('[HOLM DIAG] Raw player_cards count (no join):', rawCardCount?.length ?? 'ERROR', rawCountError?.message ?? '');
  console.log('[HOLM DIAG] Raw player_cards IDs:', rawCardCount?.map(pc => pc.player_id) ?? []);
  
  const { data: allPlayerCardsData, error: cardsError } = await supabase
    .from('player_cards')
    .select('*, players!inner(*, profiles(username))')
    .eq('round_id', round.id);
  
  if (cardsError) {
    console.error('[HOLM END] ERROR fetching player cards:', cardsError);
  }
  
  console.log('[HOLM END] Cached player cards count (with join):', allPlayerCardsData?.length || 0);
  console.log('[HOLM DIAG] MISMATCH?', (rawCardCount?.length ?? 0) !== (allPlayerCardsData?.length ?? 0) ? '⚠️ YES - join is filtering!' : 'No');
  
  // Write diagnostic to DB for post-mortem analysis
  logGameState({
    gameId,
    dealerGameId: game.current_game_uuid,
    roundId: round.id,
    eventType: 'SHOWDOWN_START',
    gameStatus: diagGame?.status,
    roundStatus: diagRound?.status,
    allDecisionsIn: diagGame?.all_decisions_in,
    sourceLocation: 'holmGameLogic:CARD_FETCH_DIAGNOSTIC',
    details: {
      rawCardCount: rawCardCount?.length ?? -1,
      joinedCardCount: allPlayerCardsData?.length ?? -1,
      rawPlayerIds: rawCardCount?.map(pc => pc.player_id) ?? [],
      joinedPlayerIds: allPlayerCardsData?.map(pc => pc.player_id) ?? [],
      cardsError: cardsError?.message ?? null,
      rawCountError: rawCountError?.message ?? null,
    },
  });
  
  allPlayerCardsData?.forEach(pc => {
    const playerData = pc.players as any;
    const cards = pc.cards as any[];
    console.log(`[HOLM END] Cached cards for ${playerData?.profiles?.username}: ${cards?.map((c: any) => `${c.rank}${c.suit}`).join(' ')}`);
  });

  const stayedPlayers = players.filter(p => p.current_decision === 'stay');
  const activePlayers = players.filter(p => p.status === 'active' && !p.sitting_out);

  persistTransition(gameId, 'holm', round.hand_number ?? 0, 'showdown-start', {
    roundId: round.id,
    stayedCount: stayedPlayers.length,
    activeCount: activePlayers.length,
    pot: round.pot || game.pot || 0,
    communityRevealed: round.community_cards_revealed ?? 0,
  });

  console.log('[HOLM END] ⚠️ PLAYER ID DEBUG ⚠️');
  console.log('[HOLM END] Game ID:', gameId);
  console.log('[HOLM END] Round ID:', round.id);
  players.forEach(p => {
    console.log(`[HOLM END] Player: ${p.profiles?.username} | ID: ${p.id} | position: ${p.position} | decision: ${p.current_decision}`);
  });
  console.log('[HOLM END] Stayed players:');
  stayedPlayers.forEach(p => {
    console.log(`[HOLM END]   - ${p.profiles?.username} | ID: ${p.id}`);
  });

  console.log('[HOLM END] Player decisions:', {
    total: players.length,
    stayed: stayedPlayers.length,
    folded: players.length - stayedPlayers.length,
    stayedPositions: stayedPlayers.map(p => p.position)
  });

  // Exact-round completion makes an empty decision cohort impossible. Release
  // only the presentation claim so a clean retry is possible; never rewrite
  // the server-owned completion marker from the browser.
  const playersWithDecision = players.filter(p => p.current_decision === 'stay' || p.current_decision === 'fold');
  if (playersWithDecision.length === 0 && activePlayers.length > 0) {
    console.error('[HOLM END] Exact-round completion invariant failed: no player decisions exist');
    await supabase
      .from('rounds')
      .update({ status: 'betting' })
      .eq('id', capturedRoundId)
      .eq('status', 'processing');
    return;
  }

  // Case 1: Everyone folded - pussy tax
  if (stayedPlayers.length === 0) {
    console.log('[HOLM END] ⚠️⚠️⚠️ Case 1: Everyone folded, applying pussy tax ⚠️⚠️⚠️');
    console.log('[HOLM END] PUSSY TAX DEBUG - Round ID:', capturedRoundId, 'Round Number:', capturedRoundNumber);
    const pussyTaxEnabled = game.pussy_tax_enabled ?? true;
    const pussyTaxAmount = pussyTaxEnabled ? (game.pussy_tax_value || 1) : 0;
    
    console.log('[HOLM END] PUSSY TAX DEBUG - Enabled:', pussyTaxEnabled, 'Amount:', pussyTaxAmount);
    console.log('[HOLM END] PUSSY TAX DEBUG - Active players:', activePlayers.map(p => ({ id: p.id, position: p.position, chips: p.chips })));
    
    // ── AUTHORITATIVE SETTLEMENT (server-owned) ───────────────────────────
    // `holm_settle_hand` applies the pussy-tax chip deltas, records the hand
    // result under the stable claim identity (dealer_game_id, hand_number),
    // carries the pot forward and completes the round — atomically. No client
    // chip / result / pot / status write remains on this path.
    const totalTaxCollected = pussyTaxAmount * activePlayers.length;
    const newPot = (game.pot || 0) + totalTaxCollected;
    const resultMessage = pussyTaxAmount > 0
      ? `Pussy Tax!`
      : 'Everyone folded! No penalty.';

    console.log('[HOLM END] Pussy tax - old pot:', game.pot, 'tax collected:', totalTaxCollected, 'new pot:', newPot);

    const pussyTaxDeltas: Record<string, number> = {};
    if (pussyTaxAmount > 0) {
      for (const p of activePlayers) pussyTaxDeltas[p.id] = -pussyTaxAmount;
    }

    try {
      await settleHolmHand({
        gameId,
        dealerGameId: resolveHolmDealerGameId(round, game),
        handNumber: capturedHandNumber,
        eventKind: 'pussy_tax_carryforward',
        potFinal: newPot,
        awaitingNextRound: true,
        lastRoundResult: resultMessage,
        chipDeltas: pussyTaxDeltas,
        winningHandDescription: 'Everyone folded - Pussy Tax applied',
        winnerPlayerId: null,
        winnerUsername: 'Pussy Tax',
        isChopped: false,
        potWon: 0,
        markRoundCompleted: true,
        roundPot: newPot,
      });
    } catch (err) {
      reportHolmSettlementFailure('Pussy-tax carryforward', err);
      return;
    }

    console.log('[HOLM END] Pussy tax case completed with new pot:', newPot);
    return;
  }

  // For both single player vs Chucky and multi-player showdown,
  // we reveal the hidden community cards AFTER exposing player cards

  // Case 2: Only one player stayed - play against Chucky
  if (stayedPlayers.length === 1) {
    console.log('[HOLM END] Case 2: Single player vs Chucky');
    const showdownTiming = await getHolmShowdownTiming();
    
    // Fetch all players for bot alias calculation
    const { data: allPlayersForAlias } = await supabase
      .from('players')
      .select('user_id, is_bot, created_at')
      .eq('game_id', gameId);
    const aliasPlayersList = allPlayersForAlias || [];
    
    const player = stayedPlayers[0];
    const playerUsername = getDisplayName(aliasPlayersList, player, player.profiles?.username || player.user_id);

    // ── Holm reveal-sequence instrumentation: reset + init ───
    const revealCtx: SequenceContext = {
      gameId,
      roundId: capturedRoundId,
      handNumber: capturedHandNumber,
      stayerPlayerId: player.id,
    };
    resetHolmRevealTracker(gameId, capturedHandNumber);
    logRevealSequenceStep(revealCtx, {
      sequenceStep: 'init-solo-vs-chucky',
      revealPhase: 'idle',
      revealTriggerReason: 'init',
      communityRevealed: round.community_cards_revealed ?? 2,
      chuckyRevealed: 0,
      chuckyTotal: game.chucky_cards || 4,
    });

    // The exact decision transaction already published all_decisions_in for
    // this round. The client has no completion-marker write on this path.
    console.log('[HOLM END] Step 1: Exposing player cards...');

    // The canonical table also waits for the actual tabled-card landing;
    // this is the matching server-side availability delay.
    console.log('[HOLM END] Step 2: configured delay for card exposure:', showdownTiming.afterTabled, 'ms');
    await new Promise(resolve => setTimeout(resolve, showdownTiming.afterTabled));
    
    // Step 3: Reveal the 2 hidden community cards
    console.log('[HOLM END] Step 3: Revealing hidden community cards...');
    await supabase
      .from('rounds')
      .update({ community_cards_revealed: 4 })
      .eq('id', capturedRoundId);

    logRevealSequenceStep(revealCtx, {
      sequenceStep: 'community-3-and-4',
      revealPhase: 'community-revealing',
      revealTriggerReason: 'community-update',
      communityRevealed: 4,
      chuckyRevealed: 0,
      chuckyTotal: game.chucky_cards || 4,
    });
    
    // Brief pause to allow UI to update with community cards
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 4: Show player's hand rank
    const { data: playerCardsData } = await supabase
      .from('player_cards')
      .select('*')
      .eq('player_id', player.id)
      .eq('round_id', round.id)
      .single();

    let playerEval: any = null;
    let playerCards: Card[] = [];
    if (playerCardsData) {
      playerCards = playerCardsData.cards as unknown as Card[];
      const playerAllCards = [...playerCards, ...communityCards];
      playerEval = evaluateHand(playerAllCards, false);
      
      // Get detailed hand description with card values
      const handDescription = formatHandRankDetailed(playerAllCards, false);
      console.log('[HOLM END] Step 4: Player has:', handDescription);
      
      // Publish only the exact-hand presentation string. Lifecycle flags remain
      // owned by settlement/continuation transactions.
      await supabase
        .from('games')
        .update({ last_round_result: `${playerUsername} has ${handDescription}` })
        .eq('id', gameId)
        .eq('current_game_uuid', resolveHolmDealerGameId(round, game))
        .eq('all_decisions_in_round_id', round.id);
    }
    
    // The canonical table guarantees the visible announcement hold before
    // admitting Chucky. Keep the server's availability cadence aligned.
    console.log('[HOLM END] Step 5: configured pre-Chucky delay:', showdownTiming.preChucky, 'ms');
    await new Promise(resolve => setTimeout(resolve, showdownTiming.preChucky));
    
    // Deal Chucky's cards from remaining deck (exclude community cards and player cards)
    console.log('[HOLM END] Now dealing Chucky cards...');
    
    // Get all player cards for this round to exclude from Chucky's deck
    const { data: allPlayerCards } = await supabase
      .from('player_cards')
      .select('cards')
      .eq('round_id', round.id);
    
    // Collect all used cards
    const usedCards = new Set<string>();
    
    // Add community cards
    communityCards.forEach(card => {
      usedCards.add(`${card.suit}-${card.rank}`);
    });
    
    // Add all player cards
    if (allPlayerCards) {
      allPlayerCards.forEach(pc => {
        const cards = pc.cards as unknown as Card[];
        cards.forEach(card => {
          usedCards.add(`${card.suit}-${card.rank}`);
        });
      });
    }
    
    console.log('[HOLM END] Used cards to exclude:', usedCards.size);
    
    // Create deck excluding used cards
    const fullDeck = createDeck();
    const availableCards = fullDeck.filter(card => !usedCards.has(`${card.suit}-${card.rank}`));
    const shuffledAvailable = shuffleDeck(availableCards);
    
    const chuckyCardCount = game.chucky_cards || 4;
    const chuckyCards = shuffledAvailable.slice(0, chuckyCardCount);

    console.log('[HOLM END] Chucky dealt', chuckyCardCount, 'cards:', chuckyCards);

    // Store all Chucky's cards but don't reveal any yet
    await supabase
      .from('rounds')
      .update({ 
        chucky_cards: chuckyCards as any,
        chucky_active: true,
        chucky_cards_revealed: 0
      })
      .eq('id', capturedRoundId);

    // VISIBILITY: Only the STAYED player's cards should be public in solo vs Chucky
    // Folded players' cards must remain hidden
    // Fire-and-forget: visibility update is for history only
    const seatedUserIds = players.map(p => p.user_id);
    const soloPlayerId = stayedPlayers[0].id;
    console.log('[HOLM END] Setting card visibility for solo player only:', soloPlayerId);
    supabase
      .from('player_cards')
      .update({ visible_to_user_ids: seatedUserIds, is_public: true })
      .eq('round_id', capturedRoundId)
      .eq('player_id', soloPlayerId)
      .then(({ error }) => { if (error) console.error('[HOLM END] is_public update error:', error); });

    console.log('[HOLM END] Chucky cards stored, revealing one at a time with suspense...');

    logRevealSequenceStep(revealCtx, {
      sequenceStep: 'pre-chucky-pause',
      revealPhase: 'pre-chucky-pause',
      revealTriggerReason: 'sequence-pause-start',
      communityRevealed: 4,
      chuckyRevealed: 0,
      chuckyTotal: chuckyCardCount,
    });

    // Reveal Chucky's cards one at a time with suspenseful delays
    // Wrapped in try-catch to ensure all cards get revealed even if individual updates fail
    try {
      for (let i = 1; i <= chuckyCardCount; i++) {
        // Determine delay based on card position
        let delay: number;
        if (i === chuckyCardCount) {
          // Final card - 3 second delay for maximum suspense
          delay = 3000;
          console.log('[HOLM END] Building suspense for FINAL card...');
        } else if (i === chuckyCardCount - 1) {
          // Next-to-last card - 1.5 second delay
          delay = 1500;
          console.log('[HOLM END] Building suspense for next-to-last card...');
        } else {
          // Earlier cards - quick 300ms reveal
          delay = 300;
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        const { error: revealError } = await supabase
          .from('rounds')
          .update({ chucky_cards_revealed: i })
          .eq('id', capturedRoundId);
        
        if (revealError) {
          console.error('[HOLM END] Error revealing card', i, ':', revealError);
        }
        console.log('[HOLM END] Revealed Chucky card', i, 'of', chuckyCardCount);

        logRevealSequenceStep(revealCtx, {
          sequenceStep: `chucky-${i}`,
          revealPhase: i === chuckyCardCount ? 'chucky-complete' : 'chucky-revealing',
          revealTriggerReason: 'chucky-update',
          communityRevealed: 4,
          chuckyRevealed: i,
          chuckyTotal: chuckyCardCount,
          extra: { delayBeforeMs: delay, dbWriteError: revealError?.message ?? null },
        });
      }
    } catch (revealLoopError) {
      console.error('[HOLM END] Chucky reveal loop failed:', revealLoopError);
      // Force reveal all cards to prevent stuck state
      await supabase
        .from('rounds')
        .update({ chucky_cards_revealed: chuckyCardCount })
        .eq('id', capturedRoundId);
      console.log('[HOLM END] Force-revealed all', chuckyCardCount, 'Chucky cards after error');

      logRevealSequenceStep(revealCtx, {
        sequenceStep: 'chucky-force-reveal',
        revealPhase: 'chucky-complete',
        revealTriggerReason: 'force-reveal',
        communityRevealed: 4,
        chuckyRevealed: chuckyCardCount,
        chuckyTotal: chuckyCardCount,
        extra: { error: String(revealLoopError) },
      });
    }
    
    console.log('[HOLM END] All Chucky cards revealed');

    // Keep hand description visible - it will be replaced by result announcement after comparison
    // 2-second delay so players can compare hands before result
    console.log('[HOLM END] Pausing 2 seconds for players to compare hands...');
    logRevealSequenceStep(revealCtx, {
      sequenceStep: 'pre-resolution-pause',
      revealPhase: 'pre-resolution-pause',
      revealTriggerReason: 'sequence-pause-start',
      communityRevealed: 4,
      chuckyRevealed: chuckyCardCount,
      chuckyTotal: chuckyCardCount,
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Use round.pot as the authoritative pot value (game.pot may be stale)
    const roundPot = round.pot || game.pot || 0;
    try {
      logResolutionGate(revealCtx, 'winner-announcement-start', { roundPot });
      await handleChuckyShowdown(gameId, capturedRoundId, player, communityCards, game, chuckyCards, roundPot);
      logResolutionGate(revealCtx, 'hand-resolution-complete', { roundPot });
    } catch (error) {
      console.error('[HOLM END] ERROR in handleChuckyShowdown:', error);
      toast.error('Holm showdown halted', {
        description: 'No result was fabricated and the hand did not advance. Reload to retry the authoritative hand.',
        duration: 15000,
      });
    }
    return;
  }

  // Case 3: Multiple players stayed - showdown (no Chucky)
  console.log('[HOLM END] Case 3: Multi-player showdown (no Chucky)');
  const showdownTiming = await getHolmShowdownTiming();
  
  // DEBUG LOG: Showdown start (fire-and-forget)
  logGameState({
    gameId,
    dealerGameId: game.current_game_uuid,
    roundId: capturedRoundId,
    eventType: 'SHOWDOWN_START',
    gameStatus: game.status,
    roundStatus: 'processing', // about to become 'showdown'
    allDecisionsIn: true,
    sourceLocation: 'holmGameLogic:endHolmRound:case3-multiplayerShowdown',
    details: {
      stayed_count: stayedPlayers.length,
      stayed_positions: stayedPlayers.map(p => p.position),
      community_cards_revealed: round.community_cards_revealed,
    },
  });
  
  // Player cards are already visible to their owners, but now expose them to everyone
  // by marking the round as "showdown" phase - the UI will handle showing all cards
  console.log('[HOLM END] Exposing player cards for showdown - setting status to showdown...');
  
  // SET STATUS TO SHOWDOWN (from 'processing') so UI reveals player cards.
  // presentation_fallback_at is a presentation-only lease; gameplay deadlines
  // remain null after the final decision transaction clears them.
  const showdownFallbackAt = new Date(Date.now() + 30_000).toISOString();
  const { error: showdownStatusError } = await supabase
    .from('rounds')
    .update({
      status: 'showdown',
      decision_deadline: null,
      presentation_fallback_at: showdownFallbackAt,
    })
    .eq('id', capturedRoundId)
    .eq('status', 'processing');

  if (showdownStatusError) {
    console.error('[HOLM END] Failed to publish multi-player showdown presentation', showdownStatusError);
    return;
  }
  
  // VISIBILITY: Only STAYED players' cards should be public at showdown
  // Folded players' cards must remain hidden
  // Fire-and-forget: visibility update is for history only
  const seatedUserIds = players.map(p => p.user_id);
  const stayedPlayerIds = stayedPlayers.map(p => p.id);
  console.log('[HOLM END] Setting card visibility for stayed players only:', stayedPlayerIds.length, 'of', players.length);
  supabase
    .from('player_cards')
    .update({ visible_to_user_ids: seatedUserIds, is_public: true })
    .eq('round_id', capturedRoundId)
    .in('player_id', stayedPlayerIds)
    .then(({ error }) => { if (error) console.error('[HOLM END] is_public update error:', error); });
  
  // The canonical table begins this same configured pause only after the
  // exposed cards have painted locally, so all viewers receive the full read time.
  console.log('[HOLM END] Waiting configured multi-player showdown delay:', showdownTiming.multiShowdown, 'ms');
  await new Promise(resolve => setTimeout(resolve, showdownTiming.multiShowdown));
  
  // Now reveal the 2 hidden community cards (cards 3 and 4)
  console.log('[HOLM END] Revealing hidden community cards...');
  
  // Use round.pot as the authoritative pot value (game.pot may be stale)
  const roundPot = round.pot || game.pot || 0;
  
  // CRITICAL: Pass the cached cards (fetched at START of endHolmRound) to avoid race conditions
  try {
    await handleMultiPlayerShowdown(gameId, capturedRoundId, stayedPlayers, communityCards, game, roundPot, allPlayerCardsData || []);
  } finally {
    await supabase
      .from('rounds')
      .update({ presentation_fallback_at: null, decision_deadline: null })
      .eq('id', capturedRoundId)
      .eq('presentation_fallback_at', showdownFallbackAt);
  }
}

/**
 * Handle showdown against Chucky (ghost player)
 */
async function handleChuckyShowdown(
  gameId: string, 
  roundId: string, 
  player: any, 
  communityCards: Card[],
  game: any,
  chuckyCards: Card[],
  roundPot: number
) {
  console.log('[HOLM SHOWDOWN] ========== Starting Chucky showdown ==========');
  console.log('[HOLM SHOWDOWN] Player:', player.id, 'position:', player.position);
  console.log('[HOLM SHOWDOWN] Chucky cards:', chuckyCards);
  console.log('[HOLM SHOWDOWN] Community cards:', communityCards);
  console.log('[HOLM SHOWDOWN] Round pot (authoritative):', roundPot, 'game.pot:', game.pot);

  // Fetch all players for bot alias calculation
  const { data: allPlayers } = await supabase
    .from('players')
    .select('user_id, is_bot, created_at')
    .eq('game_id', gameId);
  const playersList = allPlayers || [];

  // Get player's cards (use limit(1) to handle potential duplicates gracefully)
  const { data: playerCardsArray, error: cardsError } = await supabase
    .from('player_cards')
    .select('*')
    .eq('player_id', player.id)
    .eq('round_id', roundId)
    // Deterministic ordering without timestamps (avoid created_at ordering)
    .order('id', { ascending: true })
    .limit(1);

  if (cardsError || !playerCardsArray || playerCardsArray.length === 0) {
    console.log('[HOLM SHOWDOWN] ERROR: Player cards not found or error:', cardsError);
    return;
  }
  
  const playerCardsData = playerCardsArray[0];

  // CRITICAL: Ensure cards are properly parsed from JSON
  let playerCards: Card[] = [];
  try {
    const rawCards = playerCardsData.cards;
    if (Array.isArray(rawCards)) {
      playerCards = rawCards.map((c: any) => ({
        suit: (c.suit || c.Suit) as Suit,
        rank: String(c.rank || c.Rank) as Rank
      }));
    } else if (typeof rawCards === 'string') {
      const parsed = JSON.parse(rawCards);
      playerCards = parsed.map((c: any) => ({
        suit: (c.suit || c.Suit) as Suit,
        rank: String(c.rank || c.Rank) as Rank
      }));
    }
  } catch (e) {
    console.error('[HOLM SHOWDOWN] ERROR parsing player cards:', e, playerCardsData.cards);
    return;
  }
  
  // CRITICAL DEBUG: Log raw card data to diagnose evaluation issues
  console.log('[HOLM SHOWDOWN] ========== RAW CARD DATA ==========');
  console.log('[HOLM SHOWDOWN] Player cards RAW:', JSON.stringify(playerCards));
  console.log('[HOLM SHOWDOWN] Player cards type:', typeof playerCardsData.cards, Array.isArray(playerCardsData.cards));
  console.log('[HOLM SHOWDOWN] Chucky cards RAW:', JSON.stringify(chuckyCards));
  console.log('[HOLM SHOWDOWN] Community cards RAW:', JSON.stringify(communityCards));
  
  // Log card strings for human readability
  const playerCardStr = playerCards.map(c => `${c.rank}${c.suit}`).join(' ');
  const chuckyCardStr = chuckyCards.map(c => `${c.rank}${c.suit}`).join(' ');
  const communityCardStr = communityCards.map(c => `${c.rank}${c.suit}`).join(' ');
  console.log('[HOLM SHOWDOWN] Player cards:', playerCardStr);
  console.log('[HOLM SHOWDOWN] Chucky cards:', chuckyCardStr);
  console.log('[HOLM SHOWDOWN] Community cards:', communityCardStr);

  // Evaluate hands (best 5 from 4 player + 4 community for player, best 5 from X chucky + 4 community for chucky)
  const playerAllCards = [...playerCards, ...communityCards];
  const chuckyAllCards = [...chuckyCards, ...communityCards];

  const playerAllStr = playerAllCards.map(c => `${c.rank}${c.suit}`).join(' ');
  const chuckyAllStr = chuckyAllCards.map(c => `${c.rank}${c.suit}`).join(' ');
  console.log('[HOLM SHOWDOWN] Player ALL cards (hand + community):', playerAllStr);
  console.log('[HOLM SHOWDOWN] Chucky ALL cards (chucky + community):', chuckyAllStr);

  console.log('[HOLM SHOWDOWN] ========== EVALUATING PLAYER ==========');
  const playerEval = evaluateHand(playerAllCards, false); // No wild cards in Holm
  console.log('[HOLM SHOWDOWN] ========== EVALUATING CHUCKY ==========');
  const chuckyEval = evaluateHand(chuckyAllCards, false); // No wild cards in Holm

  // Get detailed hand descriptions
  const playerHandDesc = formatHandRankDetailed(playerAllCards, false);
  const chuckyHandDesc = formatHandRankDetailed(chuckyAllCards, false);

  console.log('[HOLM SHOWDOWN] ========== COMPARISON ==========');
  console.log('[HOLM SHOWDOWN] Player:', playerHandDesc, '| rank:', playerEval.rank, '| value:', playerEval.value);
  console.log('[HOLM SHOWDOWN] Chucky:', chuckyHandDesc, '| rank:', chuckyEval.rank, '| value:', chuckyEval.value);
  console.log('[HOLM SHOWDOWN] Player value > Chucky value?', playerEval.value, '>', chuckyEval.value, '=', playerEval.value > chuckyEval.value);

  const naturalPlayerWins = playerEval.value > chuckyEval.value;
  // ADMIN DEBUG: Result override (post-reveal only — handleHolmGameEnd
  // awaits the full Chucky reveal sequence before invoking this).
  // Authoritative async read avoids cache-hydration races.
  const forced = (await getHolmForcedWinnerAsync()) ?? getHolmForcedWinner();
  const playerWins = forced === 'player' ? true : forced === 'chucky' ? false : naturalPlayerWins;
  if (forced) {
    console.log('[HOLM SHOWDOWN] *** ADMIN OVERRIDE active:', forced, '(natural would be', naturalPlayerWins ? 'PLAYER' : 'CHUCKY', ')');
    try {
      const w = window as unknown as { __holmForcedWinnerLast?: unknown };
      w.__holmForcedWinnerLast = {
        forced,
        naturalPlayerWins,
        finalPlayerWins: playerWins,
        at: new Date().toISOString(),
      };
    } catch { /* noop */ }
  }

  console.log('[HOLM SHOWDOWN] *** WINNER:', playerWins ? 'PLAYER' : 'CHUCKY', '***');
  
  // Get player display name (bot alias for bots, username for humans)
  const playerUsername = getDisplayName(playersList, player, player.profiles?.username || player.user_id);

  if (playerWins) {
    console.log('[HOLM SHOWDOWN] Player wins! Pot:', roundPot);
    // Player beats Chucky - award pot, GAME OVER (Holm game ends when you beat Chucky)
    // Note: Holm game doesn't use legs system
    
    // ── AUTHORITATIVE TERMINAL SETTLEMENT (server-owned) ─────────────────
    // Chucky final award: the dealer game ends here. The RPC claims the
    // settlement, awards the pot, records the result, resets transient player
    // state, captures the POST-PAYOUT chip snapshot, then chooses game_over vs
    // session_ended from pending_session_end (stamping session_ended_at and
    // clearing the flag) — all in one transaction. If every browser vanishes
    // the instant this call is made, terminal truth is still complete.
    const playerChipChanges: Record<string, number> = {};
    playerChipChanges[player.id] = roundPot;

    const identity = await resolveHolmSettlementIdentity(roundId, game);

    console.log('[HOLM SHOWDOWN] *** PLAYER BEAT CHUCKY! Settling authoritatively. ***');
    try {
      const settled = await settleHolmHand({
        gameId,
        dealerGameId: identity.dealerGameId,
        handNumber: identity.handNumber,
        eventKind: 'chucky_final_award',
        potFinal: 0,
        awaitingNextRound: false,
        // Pot amount stays embedded for the celebration component to parse.
        lastRoundResult: `${playerUsername} beat Chucky with ${playerHandDesc}!|||POT:${roundPot}`,
        chipDeltas: playerChipChanges,
        winningHandDescription: playerHandDesc,
        winnerPlayerId: player.id,
        winnerUsername: playerUsername,
        isChopped: false,
        potWon: roundPot,
        // Keep Chucky's cards visible during the result announcement.
        markRoundCompleted: true,
        clearChuckyActive: false,
        resetPlayerStates: true,
      });
      console.log('[HOLM SHOWDOWN] Terminal settlement disposition:', settled.terminalDisposition);
    } catch (err) {
      reportHolmSettlementFailure('Chucky final award', err);
      return;
    }

    // NOTE: Dealer rotation is NOT done here - it's done in handleGameOverComplete
    // AFTER evaluating player states (waiting → active, sit_out_next_hand → sitting_out, etc.)
    // game_over_at is deliberately left NULL by the RPC on the ordinary
    // game_over path: it remains the existing auto-proceed handshake stamped
    // once the local celebration finishes (or by the cron backstop).
    console.log('[HOLM SHOWDOWN] NOT rotating dealer here - will be done in handleGameOverComplete after player state evaluation');
    return;
  } else {
    // Check if it's a tie (player equals Chucky) vs Chucky actually winning
    const isTie = playerEval.value === chuckyEval.value;
    console.log('[HOLM SHOWDOWN] Chucky wins!', isTie ? '(TIE - Chucky wins ties)' : '(Chucky has better hand)');
    
    // Chucky wins - player matches pot (capped)
    const potMatchAmount = game.pot_max_enabled 
      ? Math.min(roundPot, game.pot_max_value) 
      : roundPot;

    console.log('[HOLM SHOWDOWN] Pot match calculation:', {
      pot_max_enabled: game.pot_max_enabled,
      pot_max_value: game.pot_max_value,
      roundPot,
      potMatchAmount
    });

    const newPot = roundPot + potMatchAmount;

    console.log('[HOLM SHOWDOWN] Pot update - old:', roundPot, 'adding:', potMatchAmount, 'new:', newPot);

    // Always include `. -$amount` suffix so the frontend player→pot
    // transport producer (Game.tsx singleLossMatch regex) fires for both
    // tie-and-lose and clean-loss branches.
    const resultMessage = isTie 
      ? `Ya tie but ya lose! Chucky beat ${playerUsername} with ${chuckyHandDesc}. -$${potMatchAmount}`
      : `Chucky beat ${playerUsername} with ${chuckyHandDesc}. -$${potMatchAmount}`;

    // ── AUTHORITATIVE SETTLEMENT (server-owned) ──────────────────────────
    // Chucky beat the lone stayer: the hand terminates but the dealer game
    // continues. One transaction applies the pot match, records the accounting
    // row under the stable claim, carries the new pot and completes the round
    // (hiding Chucky), exactly as the legacy writes did.
    const potMatchChipChanges: Record<string, number> = {};
    potMatchChipChanges[player.id] = -potMatchAmount;

    const lossIdentity = await resolveHolmSettlementIdentity(roundId, game);
    try {
      await settleHolmHand({
        gameId,
        dealerGameId: lossIdentity.dealerGameId,
        handNumber: lossIdentity.handNumber,
        eventKind: 'chucky_loss_pot_match',
        potFinal: newPot,
        awaitingNextRound: true, // Let frontend detect and animate
        lastRoundResult: resultMessage,
        chipDeltas: potMatchChipChanges,
        winningHandDescription: isTie
          ? 'Tie - player matches pot'
          : `Chucky beat player with ${chuckyHandDesc}`,
        winnerPlayerId: null, // no winner - this is a pot match
        winnerUsername: 'Chucky Win',
        isChopped: false,
        potWon: 0, // money going INTO the pot
        // The completed Chucky-loss round is the authoritative source for the
        // reveal and loss transport. Keep it visible until the client starts
        // the next hand; proceed_to_next_holm_hand owns the subsequent reset.
        markRoundCompleted: true,
        clearChuckyActive: false,
      });
    } catch (err) {
      reportHolmSettlementFailure('Chucky pot match', err);
      return;
    }

    // Frontend will handle the animation and transition via awaiting_next_round
    console.log('[HOLM SHOWDOWN] Chucky won - awaiting_next_round set, frontend will handle transition');
    return;
  }

}

/**
 * Handle showdown between multiple players
 * CRITICAL: cachedPlayerCards is fetched at START of endHolmRound to prevent race conditions
 */
async function handleMultiPlayerShowdown(
  gameId: string,
  roundId: string,
  stayedPlayers: any[],
  communityCards: Card[],
  game: any,
  roundPot: number,
  cachedPlayerCards: any[]  // Cards fetched BEFORE any delays in endHolmRound
) {
  console.log('[HOLM MULTI] ========== handleMultiPlayerShowdown ==========');
  console.log('[HOLM MULTI] gameId:', gameId);
  console.log('[HOLM MULTI] roundId:', roundId);
  console.log('[HOLM MULTI] PASSED stayedPlayers count:', stayedPlayers.length);
  console.log('[HOLM MULTI] CACHED player cards count:', cachedPlayerCards.length);
  stayedPlayers.forEach(p => {
    console.log(`[HOLM MULTI] PASSED Stayed player: ${p.profiles?.username} | ID: ${p.id} | position: ${p.position}`);
  });
  cachedPlayerCards.forEach(pc => {
    const playerData = pc.players as any;
    const cards = pc.cards as any[];
    console.log(`[HOLM MULTI] CACHED cards for ${playerData?.profiles?.username}: ${cards?.map((c: any) => `${c.rank}${c.suit}`).join(' ')}`);
  });
  console.log('[HOLM MULTI] roundPot:', roundPot, 'game.pot:', game.pot);

  // Fetch all players for bot alias calculation
  const { data: allPlayers } = await supabase
    .from('players')
    .select('user_id, is_bot, created_at')
    .eq('game_id', gameId);
  const playersList = allPlayers || [];

  // Status already set to 'showdown' and 3-second delay already completed in endHolmRound
  // Now reveal the 2 hidden community cards (cards 3 and 4)
  console.log('[HOLM MULTI] Revealing hidden community cards (3 and 4)...');
  await supabase
    .from('rounds')
    .update({ community_cards_revealed: 4 })
    .eq('id', roundId);

  // Step 4: Wait 3 more seconds for players to see final hands
  console.log('[HOLM MULTI] Waiting 3 seconds for players to see final hands...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('[HOLM MULTI] Evaluating hands using CACHED cards (fetched before delays)...');

  // CRITICAL: Filter cachedPlayerCards to only include players who stayed
  // cachedPlayerCards contains ALL player cards for the round (including folded players)
  // stayedPlayers contains only players who have current_decision='stay'
  const stayedPlayerIds = new Set(stayedPlayers.map(p => p.id));
  console.log('[HOLM MULTI] stayedPlayerIds:', Array.from(stayedPlayerIds));
  
  let cardsOfStayedPlayers = cachedPlayerCards.filter(pc => stayedPlayerIds.has(pc.player_id));
  
  console.log('[HOLM MULTI] CACHED cards count (all):', cachedPlayerCards.length);
  console.log('[HOLM MULTI] FILTERED to stayed players:', cardsOfStayedPlayers.length);
  
  // CRITICAL GUARD: If cached cards don't cover all stayed players, re-fetch directly.
  // This can happen if the initial fetch was affected by RLS timing (all_decisions_in
  // not yet visible) or a transient issue during the showdown delay.
  if (cardsOfStayedPlayers.length < stayedPlayers.length) {
    console.warn('[HOLM MULTI] ⚠️ CARD MISMATCH: have cards for', cardsOfStayedPlayers.length, 'but', stayedPlayers.length, 'stayed. Re-fetching...');
    const { data: refetchedCards } = await supabase
      .from('player_cards')
      .select('*, players!inner(*, profiles(username))')
      .eq('round_id', roundId);
    
    if (refetchedCards && refetchedCards.length > 0) {
      cardsOfStayedPlayers = refetchedCards.filter(pc => stayedPlayerIds.has(pc.player_id));
      console.log('[HOLM MULTI] Re-fetched cards, now have:', cardsOfStayedPlayers.length, 'for stayed players');
    }
  }
  
  // Log if cards are still missing after re-fetch, but DO NOT abort.
  // The 0===0 tie-breaker guard downstream prevents false Chucky deals even with empty data.
  if (cardsOfStayedPlayers.length === 0) {
    console.warn('[HOLM MULTI] ⚠️ WARNING: No cards found for stayed players after re-fetch. Evaluation may be incomplete.');
    console.warn('[HOLM MULTI] cachedPlayerCards IDs:', cachedPlayerCards.map(pc => pc.player_id));
    console.warn('[HOLM MULTI] stayedPlayerIds:', Array.from(stayedPlayerIds));
  }
  
  cardsOfStayedPlayers.forEach(pc => {
    const playerData = pc.players as any;
    const cards = pc.cards as any[];
    console.log(`[HOLM MULTI] Stayed player ${playerData?.profiles?.username} | ID: ${pc.player_id} | Cards: ${cards?.map((c: any) => `${c.rank}${c.suit}`).join(' ')}`);
  });

  // Get current round number for debug data
  const { data: currentRoundData } = await supabase
    .from('rounds')
    .select('round_number')
    .eq('id', roundId)
    .single();
  
  const currentRoundNumber = currentRoundData?.round_number || 0;

  // CRITICAL: Use cardsOfStayedPlayers (derived from player_cards join) instead of passed-in stayedPlayers
  // This ensures player_id values match exactly with the cards stored for this round
  const evaluations = cardsOfStayedPlayers.map((cardRecord) => {
    const playerData = cardRecord.players as any;
    const username = playerData?.profiles?.username || 'unknown';
    
    console.log(`[HOLM MULTI] Evaluating cards for: ${username} | ID: ${cardRecord.player_id}`);
    
    // Parse cards directly from the card record (guaranteed to match)
    const rawCards = (cardRecord.cards as unknown as any[]) || [];
    const playerCards: Card[] = rawCards.map(c => ({
      suit: (c.suit || c.Suit || '') as Suit,
      rank: String(c.rank || c.Rank || '').toUpperCase() as Rank
    })).filter(c => c.suit && c.rank);
    
    console.log(`[HOLM MULTI] ${username}: ${playerCards.length} cards from record`);
    
    if (playerCards.length !== 4) {
      console.error(`[HOLM MULTI] ⚠️ INVALID CARD COUNT for ${username}: expected 4, got ${playerCards.length}`);
    }
    
    const allCards = [...playerCards, ...communityCards];
    console.log(`[HOLM MULTI] ${username} total cards for eval: ${allCards.length} (${playerCards.length} player + ${communityCards.length} community)`);
    
    const evaluation = evaluateHand(allCards, false); // No wild cards in Holm
    
    console.log(`[HOLM MULTI] ${username} hand: ${playerCards.map(c => `${c.rank}${c.suit}`).join(' ')} | eval: rank=${evaluation.rank} value=${evaluation.value}`);

    return {
      player: {
        id: cardRecord.player_id,
        position: playerData?.position,
        chips: playerData?.chips || 0,
        profiles: playerData?.profiles,
        user_id: playerData?.user_id,
        is_bot: playerData?.is_bot || false
      },
      evaluation,
      cards: playerCards
    };
  });

  // Debug: Log each player's evaluation with detailed hand description
  console.log('[HOLM MULTI] ========== HAND EVALUATIONS (RAW DATA) ==========');
  console.log('[HOLM MULTI] Community cards RAW:', JSON.stringify(communityCards));
  console.log('[HOLM MULTI] Community cards:', communityCards.map(c => `${c.rank}${c.suit}`).join(' '));
  console.log('[HOLM MULTI] Community cards count:', communityCards.length);
  
  // Log evaluations - NO re-evaluation, just use stored values
  evaluations.forEach(e => {
    const playerName = e.player.profiles?.username || e.player.user_id;
    const playerCardStr = e.cards.map(c => `${c.rank}${c.suit}`).join(' ');
    const allCardStr = [...e.cards, ...communityCards].map(c => `${c.rank}${c.suit}`).join(' ');
    const handDesc = formatHandRankDetailed([...e.cards, ...communityCards], false);
    
    console.log(`[HOLM MULTI] ${playerName}: cards=[${playerCardStr}] all=[${allCardStr}] hand=${handDesc} rank=${e.evaluation.rank} value=${e.evaluation.value}`);
  });

  // Build debug data for each player before finding winner
  const debugEvaluations = evaluations.map(e => {
    const playerName = e.player.profiles?.username || e.player.user_id.substring(0, 8);
    const playerCardStr = e.cards.map(c => `${c.rank}${c.suit}`).join(' ');
    const allCards = [...e.cards, ...communityCards];
    const handDesc = formatHandRankDetailed(allCards, false);
    return {
      name: playerName,
      playerId: e.player.id,
      cards: playerCardStr,
      cardCount: e.cards.length,
      handDesc: handDesc,
      value: e.evaluation.value,
      rank: e.evaluation.rank
    };
  });

  // Find winner(s)
  const maxValue = Math.max(...evaluations.map(e => e.evaluation.value));
  console.log('[HOLM MULTI] Max evaluation value:', maxValue);
  
  // CRITICAL DEBUG: Log all player values to help identify why ties happen
  console.log('[HOLM MULTI] ===== ALL PLAYER VALUES (TIE DEBUG) =====');
  evaluations.forEach(e => {
    const name = e.player.profiles?.username || e.player.user_id;
    const playerCardStr = e.cards.map(c => `${c.rank}${c.suit}`).join(' ');
    const allCardsStr = [...e.cards, ...communityCards].map(c => `${c.rank}${c.suit}`).join(' ');
    console.log(`[HOLM MULTI] ${name}: cards=[${playerCardStr}] all=[${allCardsStr}] rank=${e.evaluation.rank} value=${e.evaluation.value} isMax=${e.evaluation.value === maxValue}`);
  });
  
  const winners = evaluations.filter(e => e.evaluation.value === maxValue);
  const losers = evaluations.filter(e => e.evaluation.value < maxValue);
  
  // CRITICAL: Enhanced tie detection logging to catch miscalculations
  if (winners.length > 1) {
    console.error('[HOLM MULTI] ⚠️⚠️⚠️ TIE DETECTED - CHECK FOR EVALUATION BUG ⚠️⚠️⚠️');
    console.error('[HOLM MULTI] Tied player count:', winners.length);
    winners.forEach((w, i) => {
      const name = w.player.profiles?.username || w.player.user_id;
      const playerCardStr = w.cards.map(c => `${c.rank}${c.suit}`).join(' ');
      const allCards = [...w.cards, ...communityCards];
      const allCardStr = allCards.map(c => `${c.rank}${c.suit}`).join(' ');
      const handDesc = formatHandRankDetailed(allCards, false);
      console.error(`[HOLM MULTI] TIE ${i+1}: ${name}`);
      console.error(`[HOLM MULTI]   Player cards: ${playerCardStr}`);
      console.error(`[HOLM MULTI]   All cards: ${allCardStr}`);
      console.error(`[HOLM MULTI]   Hand: ${handDesc}`);
      console.error(`[HOLM MULTI]   Rank: ${w.evaluation.rank}`);
      console.error(`[HOLM MULTI]   Value: ${w.evaluation.value}`);
    });
    // Also log what hand rank type each has for easier debugging
    const handTypes = winners.map(w => w.evaluation.rank);
    const uniqueTypes = [...new Set(handTypes)];
    if (uniqueTypes.length > 1) {
      console.error(`[HOLM MULTI] ❌ BUG DETECTED: Different hand types are tied! Types: ${uniqueTypes.join(', ')}`);
    }
  } else {
    console.log('[HOLM MULTI] Single winner - no tie');
  }
  console.log('[HOLM MULTI] Winners count:', winners.length, 'Losers count:', losers.length);

  if (winners.length === 1) {
    const winner = winners[0];
    const winnerUsername = getDisplayName(playersList, winner.player, winner.player.profiles?.username || winner.player.user_id);
    
    // Winner takes ONLY the pot
    console.log('[HOLM MULTI] Winner', winnerUsername, 'takes pot:', roundPot);

    // Losers match the pot (capped) - this becomes the NEW pot for next hand
    const potMatchAmount = game.pot_max_enabled 
      ? Math.min(roundPot, game.pot_max_value) 
      : roundPot;
    
    console.log('[HOLM MULTI] Losers pay potMatchAmount:', potMatchAmount, '(becomes new pot)');

    const newPot = losers.length * potMatchAmount;

    // Set pot to losers' matched amount (no re-anting in Holm)
    console.log('[HOLM MULTI] New pot from losers match:', newPot);
    
    // Winner takes pot, losers pay into new pot - both legs of the transfer
    // travel as ONE signed delta map so the settlement is zero-sum atomically.
    const chipChanges: Record<string, number> = {};
    chipChanges[winner.player.id] = roundPot; // Winner gains pot
    for (const loser of losers) {
      chipChanges[loser.player.id] = -potMatchAmount; // Losers pay pot match
    }
    
    // Get detailed hand description for winner (for result message)
    const winnerAllCards = [...winner.cards, ...communityCards];
    const winnerHandDesc = formatHandRankDetailed(winnerAllCards, false);
    
    // Build debug data object to embed in result message
    const debugData = {
      roundId: roundId,
      roundNumber: currentRoundNumber,
      communityCards: communityCards.map(c => `${c.rank}${c.suit}`).join(' '),
      evaluations: debugEvaluations,
      winnerId: winner.player.id,
      winnerName: winnerUsername,
      maxValue: maxValue
    };
    
    // Embed debug JSON after the result message with a delimiter
    // Include both pot (winner takes) and matchAmount (losers pay) for animation coordination
    const loserIds = losers.map(l => l.player.id).join(',');
    const resultWithDebug = `${winnerUsername} won with ${winnerHandDesc}|||WINNER:${winner.player.id}|||LOSERS:${loserIds}|||POT:${roundPot}|||MATCH:${potMatchAmount}|||DEBUG:${JSON.stringify(debugData)}`;

    // ── AUTHORITATIVE SETTLEMENT (server-owned) ──────────────────────────
    const showdownIdentity = await resolveHolmSettlementIdentity(roundId, game);
    try {
      await settleHolmHand({
        gameId,
        dealerGameId: showdownIdentity.dealerGameId,
        handNumber: showdownIdentity.handNumber,
        eventKind: 'showdown_final_award',
        potFinal: newPot,
        awaitingNextRound: true,
        lastRoundResult: resultWithDebug,
        chipDeltas: chipChanges,
        winningHandDescription: `Won showdown (continues vs Chucky)`,
        winnerPlayerId: winner.player.id,
        winnerUsername,
        isChopped: false,
        potWon: roundPot,
        markRoundCompleted: true, // hides the timer, as before
      });
      console.log('[HOLM MULTI] Settled showdown authoritatively, pot=', newPot);
    } catch (err) {
      reportHolmSettlementFailure('Multi-player showdown', err);
      return;
    }
    return;
  } else if (losers.length > 0) {
    // PARTIAL TIE: Multiple winners but there are also losers
    // Winners split the pot, losers match the pot, do NOT proceed with Chucky
    console.log('[HOLM PARTIAL TIE] Partial tie detected. Winners split pot, losers match. No Chucky.');
    console.log('[HOLM PARTIAL TIE] Winners:', winners.length, 'Losers:', losers.length);
    
    // Winners split the pot
    const splitAmount = Math.floor(roundPot / winners.length);
    const winnerNames: string[] = [];
    
    for (const winner of winners) {
      winnerNames.push(getDisplayName(playersList, winner.player, winner.player.profiles?.username || winner.player.user_id));
    }
    
    console.log('[HOLM PARTIAL TIE] Winners each get:', splitAmount);
    
    // Losers match the pot (capped) - this becomes the NEW pot for next hand
    const potMatchAmount = game.pot_max_enabled 
      ? Math.min(roundPot, game.pot_max_value) 
      : roundPot;
    
    console.log('[HOLM PARTIAL TIE] Losers pay potMatchAmount:', potMatchAmount, '(becomes new pot)');
    
    const newPot = losers.length * potMatchAmount;
    console.log('[HOLM PARTIAL TIE] New pot from losers match:', newPot);
    
    // Get detailed hand description for winners
    const winnerAllCards = [...winners[0].cards, ...communityCards];
    const winnerHandDesc = formatHandRankDetailed(winnerAllCards, false);
    
    // Winners split pot, losers pay pot match - one signed delta map, one txn.
    const chipChanges: Record<string, number> = {};
    for (const winner of winners) {
      chipChanges[winner.player.id] = splitAmount; // Each winner gains split
    }
    for (const loser of losers) {
      chipChanges[loser.player.id] = -potMatchAmount; // Losers pay pot match
    }
    
    // Build debug data object to embed in result message
    const debugData = {
      roundId: roundId,
      roundNumber: currentRoundNumber,
      communityCards: communityCards.map(c => `${c.rank}${c.suit}`).join(' '),
      evaluations: debugEvaluations,
      winnerIds: winners.map(w => w.player.id),
      winnerNames: winnerNames,
      maxValue: maxValue
    };
    
    // Embed debug JSON after the result message with a delimiter
    // Include both pot (winners split) and matchAmount (losers pay) for animation coordination
    const loserIds = losers.map(l => l.player.id).join(',');
    const winnerIds = winners.map(w => w.player.id).join(',');
    const resultWithDebug = `${winnerNames.join(' and ')} tied and split the pot with ${winnerHandDesc}|||WINNERS:${winnerIds}|||LOSERS:${loserIds}|||POT:${roundPot}|||MATCH:${potMatchAmount}|||DEBUG:${JSON.stringify(debugData)}`;

    // ── AUTHORITATIVE SETTLEMENT (server-owned) ──────────────────────────
    const tieIdentity = await resolveHolmSettlementIdentity(roundId, game);
    try {
      await settleHolmHand({
        gameId,
        dealerGameId: tieIdentity.dealerGameId,
        handNumber: tieIdentity.handNumber,
        eventKind: 'partial_tie_final_award',
        potFinal: newPot,
        awaitingNextRound: true,
        lastRoundResult: resultWithDebug,
        chipDeltas: chipChanges,
        winningHandDescription: `Tied and split pot (continues vs Chucky)`,
        winnerPlayerId: null, // multiple winners - no single winner
        winnerUsername: winnerNames.join(' and '),
        isChopped: true, // is_chopped = true for partial tie
        potWon: roundPot,
        markRoundCompleted: true, // hides the timer, as before
      });
      console.log('[HOLM PARTIAL TIE] Settled authoritatively, pot=', newPot);
    } catch (err) {
      reportHolmSettlementFailure('Partial-tie showdown', err);
      return;
    }
    return;
  } else {
    // FULL TIE: ALL players tied - they must all face Chucky
    console.log('[HOLM TIE] Full tie detected (all players tied). Tied players must face Chucky.');
    
    // CRITICAL GUARD: If evaluations/winners is empty, this is NOT a real tie — it's a data
    // integrity issue (e.g., cachedPlayerCards didn't match stayedPlayerIds due to a race
    // condition). Abort instead of incorrectly dealing Chucky.
    if (winners.length === 0) {
      console.error('[HOLM TIE] ❌ BUG: evaluations/winners is EMPTY — this is NOT a real tie. Aborting Chucky deal.');
      console.error('[HOLM TIE] cardsOfStayedPlayers count:', cardsOfStayedPlayers.length, 'cachedPlayerCards count:', cachedPlayerCards.length);
      console.error('[HOLM TIE] stayedPlayerIds:', Array.from(stayedPlayerIds));
      
      toast.error('Holm hand evaluation failed', {
        description: 'The hand was left unchanged and did not advance. Reload to retry it.',
        duration: 15000,
      });
      return;
    }
    
    // Deal Chucky cards (4 cards for Holm game) - EXCLUDE used cards
    // Get all player cards for this round to exclude from Chucky's deck
    const { data: allPlayerCardsForChucky } = await supabase
      .from('player_cards')
      .select('cards')
      .eq('round_id', roundId);
    
    // Collect all used cards
    const usedCards = new Set<string>();
    
    // Add community cards
    communityCards.forEach(card => {
      usedCards.add(`${card.suit}-${card.rank}`);
    });
    
    // Add all player cards
    if (allPlayerCardsForChucky) {
      allPlayerCardsForChucky.forEach(pc => {
        const cards = pc.cards as unknown as Card[];
        cards.forEach(card => {
          usedCards.add(`${card.suit}-${card.rank}`);
        });
      });
    }
    
    // Create deck excluding used cards
    const fullDeck = createDeck();
    const availableCards = fullDeck.filter(card => !usedCards.has(`${card.suit}-${card.rank}`));
    const shuffledAvailable = shuffleDeck(availableCards);
    
    const chuckyCardCount = game.chucky_cards || 4;
    const chuckyCards = shuffledAvailable.slice(0, chuckyCardCount);
    
    console.log('[HOLM TIE] Dealt Chucky:', chuckyCards);
    
    // Reveal Chucky cards gradually with 3 second delay
    await supabase
      .from('rounds')
      .update({ 
        chucky_cards: chuckyCards as any,
        chucky_cards_revealed: 0,
        chucky_active: true
      })
      .eq('id', roundId);
    
    // Reveal Chucky cards one by one
    for (let revealed = 1; revealed <= chuckyCardCount; revealed++) {
      await new Promise(resolve => setTimeout(resolve, 600));
      await supabase
        .from('rounds')
        .update({ chucky_cards_revealed: revealed })
        .eq('id', roundId);
    }
    
    // Wait 3 seconds for players to see all cards
    console.log('[HOLM TIE] Waiting 3 seconds for players to view cards...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Evaluate each tied player against Chucky
    const chuckyAllCards = [...chuckyCards, ...communityCards];
    const chuckyEval = evaluateHand(chuckyAllCards, false);
    const chuckyHandDesc = formatHandRankDetailed(chuckyAllCards, false);
    
    console.log('[HOLM TIE] Chucky hand:', chuckyHandDesc, 'value:', chuckyEval.value);
    
    const playersBeatChucky = winners.filter(w => w.evaluation.value > chuckyEval.value);
    const playersTieChucky = winners.filter(w => w.evaluation.value === chuckyEval.value);
    const playersLoseToChucky = winners.filter(w => w.evaluation.value <= chuckyEval.value);
    
    console.log('[HOLM TIE] Players beat Chucky:', playersBeatChucky.length, 'Players tie Chucky:', playersTieChucky.length, 'Players lose:', playersLoseToChucky.length);
    
    if (playersBeatChucky.length === 0) {
      // All tied players lost to or tied with Chucky - they all match pot (capped)
      // CRITICAL: Guard against 0-length arrays — (0 === 0) would falsely report "all tied"
      const allTiedWithChucky = playersTieChucky.length > 0 && playersTieChucky.length === playersLoseToChucky.length;
      console.log('[HOLM TIE] Chucky beats/ties all players, roundPot:', roundPot, 'allTiedWithChucky:', allTiedWithChucky);
      
      const potMatchAmount = game.pot_max_enabled 
        ? Math.min(roundPot, game.pot_max_value) 
        : roundPot;
      
      console.log('[HOLM TIE] Each loser pays potMatchAmount:', potMatchAmount);
      
      const loserIds = playersLoseToChucky.map(l => l.player.id);
      const loserNames = playersLoseToChucky.map(l => getDisplayName(playersList, l.player, l.player.profiles?.username || l.player.user_id));
      
      const totalMatched = playersLoseToChucky.length * potMatchAmount;
      
      console.log('[HOLM TIE] Total matched from all losers:', totalMatched, '(', playersLoseToChucky.length, 'players)');
      
      const newPot = roundPot + totalMatched;
      
      // Player-to-pot transaction: one signed delta map, settled atomically.
      const chipChanges: Record<string, number> = {};
      for (const loser of playersLoseToChucky) {
        chipChanges[loser.player.id] = -potMatchAmount;
      }
      
      // Always include `$X added to pot` so the frontend player→pot transport
      // producer (Game.tsx tieBreakMatch regex) fires for both branches.
      const resultMessage = allTiedWithChucky 
        ? `Ya tie but ya lose! ${loserNames.join(' and ')} lose to Chucky's ${chuckyHandDesc}. $${totalMatched} added to pot.`
        : `Tie broken by Chucky! ${loserNames.join(' and ')} lose to Chucky's ${chuckyHandDesc}. $${totalMatched} added to pot.`;
      
      // ── AUTHORITATIVE SETTLEMENT (server-owned) ────────────────────────
      // p_round_pot carries the pot onto the ACTIVE round row by id — never by
      // round_number, which is shared across game types and cycles in 3-5-7.
      const tbIdentity = await resolveHolmSettlementIdentity(roundId, game);
      try {
        await settleHolmHand({
          gameId,
          dealerGameId: tbIdentity.dealerGameId,
          handNumber: tbIdentity.handNumber,
          eventKind: 'chucky_tiebreak_pot_match',
          potFinal: newPot,
          roundPot: newPot,
          awaitingNextRound: true,
          lastRoundResult: resultMessage,
          chipDeltas: chipChanges,
          winningHandDescription: allTiedWithChucky
            ? 'Tie - all match pot'
            : `Chucky beat tied players with ${chuckyHandDesc}`,
          winnerPlayerId: null, // no winner - Chucky won
          winnerUsername: 'Chucky Win (Tie Breaker)',
          isChopped: false,
          potWon: 0, // money going INTO the pot
        });
        console.log('[HOLM TIE] Settled tie-break pot match authoritatively, pot=', newPot);
      } catch (err) {
        reportHolmSettlementFailure('Chucky tie-break pot match', err);
        return;
      }
      return;
    } else {
      // Some (or all) tied players beat Chucky - GAME ENDS, Chucky lost
      console.log('[HOLM TIE] Players beat Chucky - GAME OVER');
      
      // Winners split the pot
      const splitAmount = Math.floor(roundPot / playersBeatChucky.length);
      const winnerNames: string[] = [];
      const winnerIds: string[] = [];
      
      for (const winner of playersBeatChucky) {
        winnerNames.push(getDisplayName(playersList, winner.player, winner.player.profiles?.username || winner.player.user_id));
        winnerIds.push(winner.player.id);
      }
      
      // If there are losers to Chucky, they still pay - but game ends regardless
      const potMatchAmount = game.pot_max_enabled 
        ? Math.min(roundPot, game.pot_max_value) 
        : roundPot;
      
      const winnerAllCards = [...playersBeatChucky[0].cards, ...communityCards];
      const winnerHandDesc = formatHandRankDetailed(winnerAllCards, false);
      
      // ACCOUNTING: winners AND losers in one signed map, so the settlement
      // sums to zero inside a single transaction.
      const playerChipChanges: Record<string, number> = {};
      for (const winner of playersBeatChucky) {
        playerChipChanges[winner.player.id] = splitAmount;
      }
      for (const loser of playersLoseToChucky) {
        playerChipChanges[loser.player.id] = -potMatchAmount;
      }
      
      console.log('[HOLM TIE] Settling terminal tie-break with balanced chip changes:', playerChipChanges);
      
      // ── AUTHORITATIVE TERMINAL SETTLEMENT (server-owned) ───────────────
      // Awards, accounting row, player-state reset, POST-PAYOUT snapshot, pot
      // and buck clear, round completion and the game_over vs session_ended
      // choice all happen in ONE transaction. game_over_at stays NULL on the
      // ordinary path so the existing frontend celebration handshake still
      // stamps it; the RPC only stamps session_ended_at when the session was
      // already flagged to end.
      const tbWinIdentity = await resolveHolmSettlementIdentity(roundId, game);
      try {
        const settled = await settleHolmHand({
          gameId,
          dealerGameId: tbWinIdentity.dealerGameId,
          handNumber: tbWinIdentity.handNumber,
          eventKind: 'chucky_final_award',
          potFinal: 0,
          awaitingNextRound: false, // game is over, not awaiting next round
          lastRoundResult: `${winnerNames.join(' and ')} beat Chucky!|||POT:${roundPot}`,
          chipDeltas: playerChipChanges,
          winningHandDescription: winnerHandDesc,
          winnerPlayerId: playersBeatChucky[0].player.id,
          winnerUsername: winnerNames.join(' and '),
          isChopped: playersBeatChucky.length > 1,
          potWon: roundPot,
          markRoundCompleted: true,
          clearChuckyActive: true,
          resetPlayerStates: true,
        });
        console.log('[HOLM TIE] Terminal settlement disposition:', settled.terminalDisposition);
      } catch (err) {
        reportHolmSettlementFailure('Chucky final award (tie-break)', err);
        return;
      }
      
      // NOTE: Dealer rotation is NOT done here - it's done in handleGameOverComplete
      // AFTER evaluating player states (waiting → active, sit_out_next_hand → sitting_out, etc.)
      console.log('[HOLM TIE] Game over - Chucky was beaten by tied players (dealer rotation deferred)');
      return; // Early return - game is over
    }
  }

}

/**
 * Proceed to next Holm hand (always uses round 1, just resets state)
 */
export type HolmNextHandResult = {
  outcome: 'started' | 'already-started' | 'rejected';
  reason?: string;
  round_id?: string;
  dealer_game_id?: string;
  hand_number?: number;
  buck_position?: number;
  pot?: number;
  deduped?: boolean;
};

export async function proceedToNextHolmRound(
  gameId: string,
  expectedRoundId: string,
): Promise<HolmNextHandResult> {
  const { data, error } = await supabase.rpc('proceed_to_next_holm_hand', {
    p_game_id: gameId,
    p_expected_round_id: expectedRoundId,
  });

  if (error) {
    throw new Error(`Holm next-hand RPC failed: ${error.message}`);
  }

  const result = (data ?? {}) as HolmNextHandResult;
  if (result.outcome !== 'started' && result.outcome !== 'already-started') {
    throw new Error(`Holm next-hand RPC rejected: ${result.reason ?? 'unknown reason'}`);
  }

  if (result.outcome === 'started') {
    persistTransition(gameId, 'holm', result.hand_number ?? 1, 'hand-start', {
      roundId: result.round_id ?? null,
      buckPosition: result.buck_position ?? null,
      pot: result.pot ?? null,
      firstHand: false,
      atomic: true,
    });
  }

  console.log('[HOLM NEXT] Atomic successor-hand result', result);
  return result;
}
