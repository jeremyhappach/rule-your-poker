import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Card utilities for server-side Holm round start
interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string;
}

function createDeck(): Card[] {
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Holm hand evaluation (simplified for server-side use - no wild cards)
const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

function evaluateHolmHand(cards: Card[]): { rank: string; value: number } {
  if (cards.length === 0) return { rank: 'high-card', value: 0 };
  
  // Normalize cards
  const validCards = cards.map(c => ({
    suit: c.suit,
    rank: String(c.rank).toUpperCase()
  })).filter(c => RANK_VALUES[c.rank] !== undefined);
  
  if (validCards.length === 0) return { rank: 'high-card', value: 0 };
  
  const sortedCards = [...validCards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  
  // Count ranks
  const rankCounts: Record<string, number> = {};
  validCards.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
  
  const groups = Object.entries(rankCounts)
    .sort((a, b) => b[1] - a[1] || RANK_VALUES[b[0]] - RANK_VALUES[a[0]]);
  
  const bestRank = groups[0]?.[0];
  const bestCount = groups[0]?.[1] || 0;
  const secondRank = groups[1]?.[0];
  const secondCount = groups[1]?.[1] || 0;
  
  // Check for flush
  const suitCounts: Record<string, number> = {};
  validCards.forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  const isFlush = maxSuitCount >= 5;
  
  // Check for straight
  const uniqueValues = [...new Set(validCards.map(c => RANK_VALUES[c.rank]))].sort((a, b) => b - a);
  let isStraight = false;
  let straightHigh = 0;
  
  for (let start = 14; start >= 5; start--) {
    let hasAll = true;
    for (let i = 0; i < 5; i++) {
      if (!uniqueValues.includes(start - i)) {
        hasAll = false;
        break;
      }
    }
    if (hasAll) {
      isStraight = true;
      straightHigh = start;
      break;
    }
  }
  
  // Check for wheel (A-2-3-4-5)
  if (!isStraight && uniqueValues.includes(14) && uniqueValues.includes(2) && 
      uniqueValues.includes(3) && uniqueValues.includes(4) && uniqueValues.includes(5)) {
    isStraight = true;
    straightHigh = 5;
  }
  
  // Check for straight flush
  if (isFlush && isStraight) {
    const flushSuit = Object.entries(suitCounts).find(([_, count]) => count >= 5)?.[0];
    const flushCards = validCards.filter(c => c.suit === flushSuit);
    const flushValues = [...new Set(flushCards.map(c => RANK_VALUES[c.rank]))].sort((a, b) => b - a);
    
    for (let start = 14; start >= 5; start--) {
      let hasAll = true;
      for (let i = 0; i < 5; i++) {
        if (!flushValues.includes(start - i)) {
          hasAll = false;
          break;
        }
      }
      if (hasAll) {
        return { rank: 'straight-flush', value: 8000000000 + start };
      }
    }
    // Check wheel in flush
    if (flushValues.includes(14) && flushValues.includes(2) && flushValues.includes(3) &&
        flushValues.includes(4) && flushValues.includes(5)) {
      return { rank: 'straight-flush', value: 8000000000 + 5 };
    }
  }
  
  // Four of a kind
  if (bestCount >= 4) {
    return { rank: 'four-of-a-kind', value: 7000000000 + RANK_VALUES[bestRank] * 100 };
  }
  
  // Full house
  if (bestCount >= 3 && secondCount >= 2) {
    return { rank: 'full-house', value: 6000000000 + RANK_VALUES[bestRank] * 100 + RANK_VALUES[secondRank] };
  }
  
  // Flush
  if (isFlush) {
    const flushSuit = Object.entries(suitCounts).find(([_, count]) => count >= 5)?.[0];
    const flushCards = validCards.filter(c => c.suit === flushSuit)
      .sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    return { rank: 'flush', value: 5000000000 + RANK_VALUES[flushCards[0].rank] * 100 };
  }
  
  // Straight
  if (isStraight) {
    return { rank: 'straight', value: 4000000000 + straightHigh };
  }
  
  // Three of a kind
  if (bestCount >= 3) {
    return { rank: 'three-of-a-kind', value: 3000000000 + RANK_VALUES[bestRank] * 100 };
  }
  
  // Two pair
  const pairs = groups.filter(([_, count]) => count >= 2);
  if (pairs.length >= 2) {
    const highPair = RANK_VALUES[pairs[0][0]];
    const lowPair = RANK_VALUES[pairs[1][0]];
    return { rank: 'two-pair', value: 2000000000 + highPair * 100 + lowPair };
  }
  
  // Pair
  if (bestCount >= 2) {
    return { rank: 'pair', value: 1000000000 + RANK_VALUES[bestRank] * 100 };
  }
  
  // High card
  return { rank: 'high-card', value: RANK_VALUES[sortedCards[0].rank] };
}

// ============== HORSES DICE GAME EVALUATION ==============
interface HorsesDiceValue {
  value: number; // 1-6
  isHeld: boolean;
}

interface HorsesHandResult {
  rank: number;
  description: string;
  ofAKindCount: number;
  highValue: number;
}

function evaluateHorsesHand(dice: HorsesDiceValue[]): HorsesHandResult {
  const values = dice.map(d => d.value);
  
  // Count each value (1-6)
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  values.forEach(v => counts[v]++);
  
  const wildCount = counts[1]; // 1s are wild
  
  // Special case: Five 1s (pure wilds) - best hand
  if (wildCount === 5) {
    return {
      rank: 100,
      description: "5 1s (Wilds!)",
      ofAKindCount: 5,
      highValue: 1,
    };
  }
  
  // For each non-wild value (6 down to 2), calculate best possible of-a-kind
  let bestOfAKind = 0;
  let bestValue = 0;
  
  for (let value = 6; value >= 2; value--) {
    const totalWithWilds = counts[value] + wildCount;
    if (totalWithWilds > bestOfAKind) {
      bestOfAKind = totalWithWilds;
      bestValue = value;
    } else if (totalWithWilds === bestOfAKind && value > bestValue) {
      bestValue = value;
    }
  }
  
  bestOfAKind = Math.min(bestOfAKind, 5);
  
  let rank: number;
  let description: string;
  
  if (bestOfAKind >= 2) {
    rank = (bestOfAKind * 10) + bestValue;
    description = `${bestOfAKind} ${bestValue}s`;
  } else {
    const highCard = Math.max(...values.filter(v => v !== 1), 0) || Math.max(...values);
    rank = 10 + highCard;
    description = `${highCard} high`;
  }
  
  return { rank, description, ofAKindCount: bestOfAKind, highValue: bestValue || Math.max(...values) };
}

function rollHorsesDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function completeHorsesHand(dice: HorsesDiceValue[], rollsRemaining: number): HorsesDiceValue[] {
  let currentDice = [...dice];
  let rolls = rollsRemaining;
  
  // Roll all remaining rolls, holding nothing (simple server-side completion)
  while (rolls > 0) {
    currentDice = currentDice.map(die => ({
      value: die.isHeld ? die.value : rollHorsesDie(),
      isHeld: die.isHeld,
    }));
    rolls--;
  }
  
  // Mark all as held when complete
  return currentDice.map(d => ({ ...d, isHeld: true }));
}

// ============== 3-5-7 HAND EVALUATION (with wild cards) ==============
function evaluate357Hand(cards: Card[], roundNumber: number): { rank: string; value: number } {
  if (cards.length === 0) return { rank: 'high-card', value: 0 };
  
  // Determine wild rank based on round (Round 1 = 3, Round 2 = 5, Round 3 = 7)
  const wildRank = roundNumber === 1 ? '3' : roundNumber === 2 ? '5' : '7';
  
  // Normalize cards and identify wilds
  const validCards = cards.map(c => ({
    suit: c.suit,
    rank: String(c.rank).toUpperCase()
  })).filter(c => RANK_VALUES[c.rank] !== undefined);
  
  if (validCards.length === 0) return { rank: 'high-card', value: 0 };
  
  const wildCount = validCards.filter(c => c.rank === wildRank).length;
  const nonWilds = validCards.filter(c => c.rank !== wildRank);
  
  // Count non-wild ranks
  const rankCounts: Record<string, number> = {};
  nonWilds.forEach(c => { rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1; });
  
  // For flush/straight calculations, we need to consider wild substitution
  // Count suits among non-wilds
  const suitCounts: Record<string, number> = {};
  nonWilds.forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  
  // Best flush suit (wilds can fill in)
  const maxSuitCount = Math.max(...Object.values(suitCounts), 0) + wildCount;
  const isFlush = maxSuitCount >= 5 && validCards.length >= 5;
  
  // Check for straight (with wilds filling gaps)
  const uniqueValues = [...new Set(nonWilds.map(c => RANK_VALUES[c.rank]))].sort((a, b) => b - a);
  let isStraight = false;
  let straightHigh = 0;
  
  for (let start = 14; start >= 5; start--) {
    let gaps = 0;
    for (let i = 0; i < 5; i++) {
      if (!uniqueValues.includes(start - i)) {
        gaps++;
      }
    }
    if (gaps <= wildCount && validCards.length >= 5) {
      isStraight = true;
      straightHigh = start;
      break;
    }
  }
  
  // Check for wheel (A-2-3-4-5) with wilds
  if (!isStraight && validCards.length >= 5) {
    const wheelVals = [14, 2, 3, 4, 5];
    const missing = wheelVals.filter(v => !uniqueValues.includes(v)).length;
    if (missing <= wildCount) {
      isStraight = true;
      straightHigh = 5;
    }
  }
  
  // Calculate best of-a-kind with wilds
  const groups = Object.entries(rankCounts)
    .sort((a, b) => b[1] - a[1] || RANK_VALUES[b[0]] - RANK_VALUES[a[0]]);
  
  const bestNonWildRank = groups[0]?.[0];
  const bestNonWildCount = groups[0]?.[1] || 0;
  const secondRank = groups[1]?.[0];
  const secondCount = groups[1]?.[1] || 0;
  
  // Best of-a-kind is natural count + wilds
  const bestOfAKind = bestNonWildCount + wildCount;
  
  // Straight flush check
  if (isFlush && isStraight && validCards.length >= 5) {
    return { rank: 'straight-flush', value: 8000000000 + straightHigh };
  }
  
  // Five of a kind (only possible with wilds)
  if (bestOfAKind >= 5) {
    return { rank: 'five-of-a-kind', value: 9000000000 + RANK_VALUES[bestNonWildRank] * 100 };
  }
  
  // Four of a kind
  if (bestOfAKind >= 4) {
    return { rank: 'four-of-a-kind', value: 7000000000 + RANK_VALUES[bestNonWildRank] * 100 };
  }
  
  // Full house (3 + 2, considering wilds can help one group)
  if (bestNonWildCount + wildCount >= 3 && secondCount >= 2) {
    return { rank: 'full-house', value: 6000000000 + RANK_VALUES[bestNonWildRank] * 100 + (RANK_VALUES[secondRank] || 0) };
  }
  if (bestNonWildCount >= 3 && secondCount + wildCount >= 2) {
    return { rank: 'full-house', value: 6000000000 + RANK_VALUES[bestNonWildRank] * 100 + (RANK_VALUES[secondRank] || 0) };
  }
  
  // Flush
  if (isFlush) {
    const flushSuit = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const flushCards = nonWilds.filter(c => c.suit === flushSuit)
      .sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
    const highCard = flushCards[0]?.rank || 'A';
    return { rank: 'flush', value: 5000000000 + RANK_VALUES[highCard] * 100 };
  }
  
  // Straight
  if (isStraight) {
    return { rank: 'straight', value: 4000000000 + straightHigh };
  }
  
  // Three of a kind
  if (bestOfAKind >= 3) {
    return { rank: 'three-of-a-kind', value: 3000000000 + RANK_VALUES[bestNonWildRank] * 100 };
  }
  
  // Two pair (wilds can help make second pair)
  const pairs = groups.filter(([_, count]) => count >= 2);
  if (pairs.length >= 2) {
    const highPair = RANK_VALUES[pairs[0][0]];
    const lowPair = RANK_VALUES[pairs[1][0]];
    return { rank: 'two-pair', value: 2000000000 + highPair * 100 + lowPair };
  }
  if (pairs.length === 1 && wildCount >= 2) {
    const highPair = RANK_VALUES[pairs[0][0]];
    // Wilds form second pair at highest available
    const highestOther = Math.max(...nonWilds.filter(c => c.rank !== pairs[0][0]).map(c => RANK_VALUES[c.rank]), 2);
    return { rank: 'two-pair', value: 2000000000 + highPair * 100 + highestOther };
  }
  
  // Pair
  if (bestOfAKind >= 2) {
    return { rank: 'pair', value: 1000000000 + RANK_VALUES[bestNonWildRank] * 100 };
  }
  
  // High card
  const sortedCards = [...validCards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  return { rank: 'high-card', value: RANK_VALUES[sortedCards[0].rank] };
}

// ============== SCC DICE GAME EVALUATION ==============
interface SCCDie {
  value: number;
  isHeld: boolean;
  isSCC: boolean;
  sccType?: 'ship' | 'captain' | 'crew';
}

interface SCCHandResult {
  rank: number;
  description: string;
  isQualified: boolean;
  cargoSum: number;
}

function evaluateSCCHand(dice: SCCDie[]): SCCHandResult {
  const hasShip = dice.some(d => d.sccType === 'ship');
  const hasCaptain = dice.some(d => d.sccType === 'captain');
  const hasCrew = dice.some(d => d.sccType === 'crew');
  
  if (!hasShip || !hasCaptain || !hasCrew) {
    return { rank: 0, description: "NQ", isQualified: false, cargoSum: 0 };
  }
  
  const cargoDice = dice.filter(d => !d.isSCC);
  const cargoSum = cargoDice.reduce((sum, d) => sum + d.value, 0);
  
  return { rank: cargoSum, description: `${cargoSum}`, isQualified: true, cargoSum };
}

function rollSCCDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function completeSCCHand(dice: SCCDie[], rollsRemaining: number): SCCDie[] {
  let currentDice = [...dice];
  let rolls = rollsRemaining;
  let hasShip = dice.some(d => d.sccType === 'ship');
  let hasCaptain = dice.some(d => d.sccType === 'captain');
  let hasCrew = dice.some(d => d.sccType === 'crew');
  
  while (rolls > 0) {
    // Roll non-held dice
    currentDice = currentDice.map(die => ({
      ...die,
      value: die.isHeld ? die.value : rollSCCDie(),
    }));
    
    // Auto-freeze logic for SCC sequence
    if (!hasShip) {
      const shipIndex = currentDice.findIndex(d => d.value === 6 && !d.isSCC);
      if (shipIndex !== -1) {
        currentDice[shipIndex].isHeld = true;
        currentDice[shipIndex].isSCC = true;
        currentDice[shipIndex].sccType = 'ship';
        hasShip = true;
      }
    }
    
    if (hasShip && !hasCaptain) {
      const captainIndex = currentDice.findIndex(d => d.value === 5 && !d.isSCC);
      if (captainIndex !== -1) {
        currentDice[captainIndex].isHeld = true;
        currentDice[captainIndex].isSCC = true;
        currentDice[captainIndex].sccType = 'captain';
        hasCaptain = true;
      }
    }
    
    if (hasShip && hasCaptain && !hasCrew) {
      const crewIndex = currentDice.findIndex(d => d.value === 4 && !d.isSCC);
      if (crewIndex !== -1) {
        currentDice[crewIndex].isHeld = true;
        currentDice[crewIndex].isSCC = true;
        currentDice[crewIndex].sccType = 'crew';
        hasCrew = true;
      }
    }
    
    rolls--;
  }
  
  return currentDice.map(d => ({ ...d, isHeld: true }));
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type DeadlineDebugSource = 'client' | 'cron' | 'debug-ui' | 'unknown';

type DeadlineDebugSnapshot = {
  nowIso: string;
  source: DeadlineDebugSource;
  requestId: string | null;
  debugLabel: string | null;
  game: any;
  deadlines: {
    config: any;
    ante: any;
    roundDecision: any;
    gameOver: any;
  };
  staleness: {
    configDeadlineStale: boolean;
    anteDeadlineStale: boolean;
    roundDecisionDeadlineStale: boolean;
    anyExpiredDeadline: boolean;
  };
  counts: {
    humansActive: number;
    humansTotal: number;
    botsTotal: number;
  };
  players: any[];
  rounds: any[];
};

// Helper to log sitting_out/sit_out_next_hand changes for debugging
async function logSittingOutChange(
  supabase: any,
  playerId: string,
  userId: string,
  gameId: string,
  username: string | null,
  isBot: boolean,
  fieldChanged: 'sitting_out' | 'sit_out_next_hand',
  oldValue: boolean,
  newValue: boolean,
  reason: string,
  sourceLocation: string,
  additionalContext?: Record<string, unknown>
): Promise<void> {
  // Skip logging for bots
  if (isBot) return;
  // Only log if value is changing
  if (oldValue === newValue) return;

  try {
    await supabase
      .from('sitting_out_debug_log')
      .insert({
        player_id: playerId,
        user_id: userId,
        game_id: gameId,
        username: username || null,
        is_bot: isBot,
        field_changed: fieldChanged,
        old_value: oldValue,
        new_value: newValue,
        reason,
        source_location: sourceLocation,
        additional_context: additionalContext || null,
      });
  } catch (e) {
    console.error('[ENFORCE] Failed to log sitting out change:', e);
  }
}

function describeDeadline(deadlineIso: string | null | undefined, now: Date) {
  if (!deadlineIso) {
    return { iso: null, msFromNow: null, isExpired: false };
  }

  const t = new Date(deadlineIso).getTime();
  const msFromNow = t - now.getTime();
  return {
    iso: deadlineIso,
    msFromNow,
    isExpired: msFromNow <= 0,
  };
}

async function collectDeadlineDebug(
  supabase: any,
  gameId: string,
  game: any,
  now: Date,
  source: DeadlineDebugSource,
  requestId: string | null,
  debugLabel: string | null
): Promise<DeadlineDebugSnapshot> {
  const nowIso = now.toISOString();

  const { data: players } = await supabase
    .from('players')
    .select(
      'id,user_id,is_bot,position,status,created_at,waiting,sitting_out,sit_out_next_hand,stand_up_next_hand,ante_decision,current_decision,decision_locked,auto_fold,auto_ante'
    )
    .eq('game_id', gameId);

  const { data: rounds } = await supabase
    .from('rounds')
    .select('id,round_number,status,decision_deadline,current_turn_position,hand_number,created_at')
    .eq('game_id', gameId)
    .order('created_at', { ascending: false })
    .limit(5);

  const config = describeDeadline(game?.config_deadline ?? null, now);
  const ante = describeDeadline(game?.ante_decision_deadline ?? null, now);

  const currentRound = (rounds ?? []).find((r: any) => r.round_number === game?.current_round) ?? null;
  const roundDecision = describeDeadline(currentRound?.decision_deadline ?? null, now);
  const gameOver = describeDeadline(game?.game_over_at ? new Date(new Date(game.game_over_at).getTime() + 8000).toISOString() : null, now);

  const isConfigPhase = game?.status === 'dealer_selection' || game?.status === 'configuring' || game?.status === 'game_selection';
  const isAntePhase = game?.status === 'ante_decision';
  const isBettingPhase = game?.status === 'in_progress' || game?.status === 'betting';

  const configDeadlineStale = !!game?.config_deadline && !isConfigPhase;
  const anteDeadlineStale = !!game?.ante_decision_deadline && !isAntePhase;
  const roundDecisionDeadlineStale = !!currentRound?.decision_deadline && !isBettingPhase;

  const playersArr = players ?? [];
  const humansTotal = playersArr.filter((p: any) => !p.is_bot).length;
  const botsTotal = playersArr.filter((p: any) => p.is_bot).length;
  const humansActive = playersArr.filter((p: any) => !p.is_bot && p.status === 'active' && !p.sitting_out).length;

  const anyExpiredDeadline = [config, ante, roundDecision, gameOver].some((d: any) => d?.isExpired);

  return {
    nowIso,
    source,
    requestId,
    debugLabel,
    game,
    deadlines: { config, ante, roundDecision, gameOver },
    staleness: {
      configDeadlineStale,
      anteDeadlineStale,
      roundDecisionDeadlineStale,
      anyExpiredDeadline,
    },
    counts: {
      humansActive,
      humansTotal,
      botsTotal,
    },
    players: playersArr,
    rounds: rounds ?? [],
  };
}
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    // Prefer service role key for bypassing RLS, fallback to anon key
    const keyToUse = serviceRoleKey || anonKey;

    console.log('[ENFORCE] Init', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!serviceRoleKey,
      hasAnonKey: !!anonKey,
      serviceRoleKeyLen: serviceRoleKey?.length || 0,
      anonKeyLen: anonKey?.length || 0,
    });

    // Early exit if env vars not ready (can happen during cold start)
    if (!supabaseUrl || !keyToUse || keyToUse.length === 0) {
      console.error('[ENFORCE] Missing required env vars:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!keyToUse,
        keyLen: keyToUse?.length || 0,
      });
      return new Response(JSON.stringify({
        error: 'Backend configuration missing - env vars not available',
        retry: true,
      }), {
        status: 503, // Service Unavailable - tells client to retry
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, keyToUse);

    let body: any;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error('[ENFORCE] Failed to parse request body:', parseErr);
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const gameId: string | undefined = body?.gameId;
    const debug: boolean = body?.debug === true;
    const auditOnly: boolean = body?.auditOnly === true;
    const source: DeadlineDebugSource = (body?.source ?? 'unknown') as DeadlineDebugSource;
    const requestId: string | null = typeof body?.requestId === 'string' ? body.requestId : null;
    const debugLabel: string | null = typeof body?.debugLabel === 'string' ? body.debugLabel : null;

    console.log('[ENFORCE] Received', { gameId, source, requestId, debug, auditOnly, debugLabel, gameIdType: typeof gameId });
    
    if (!gameId) {
      return new Response(JSON.stringify({ error: 'gameId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    let actionsTaken: string[] = [];

    // Fetch game data
    console.log('[ENFORCE] Querying game:', gameId);
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .maybeSingle();

    console.log('[ENFORCE] Game query result:', {
      found: !!game,
      error: gameError?.message || null,
      errorCode: (gameError as any)?.code || null,
      gameStatus: (game as any)?.status || null,
    });

    // Treat "game not found" as a SUCCESS response so clients don't surface 404s.
    const notFoundCode = (gameError as any)?.code;
    const notFoundMsg = String(gameError?.message ?? '').toLowerCase();
    const isNotFound = !game || notFoundCode === 'PGRST116' || notFoundMsg.includes('0 rows');

    if (isNotFound) {
      return new Response(JSON.stringify({
        success: true,
        gameMissing: true,
        retry: false,
        gameId,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (gameError) {
      const msg = String(gameError.message ?? '');
      const lower = msg.toLowerCase();
      const isTransient =
        lower.includes('typeerror') ||
        lower.includes('econnreset') ||
        lower.includes('connection reset') ||
        lower.includes('sendrequest') ||
        lower.includes('client error') ||
        lower.includes('timeout') ||
        lower.includes('network');

      console.error('[ENFORCE] Game query failed:', { gameId, error: gameError, isTransient });

      return new Response(JSON.stringify({
        error: 'Temporary backend error',
        retry: true,
        gameId,
        dbError: gameError?.message || null,
        dbCode: (gameError as any)?.code || null,
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Collect debug snapshot early so we can see game/player state BEFORE any enforcement.
    let debugSnapshot: DeadlineDebugSnapshot | null = null;
    if (debug || auditOnly) {
      try {
        debugSnapshot = await collectDeadlineDebug(supabase, gameId, game, now, source, requestId, debugLabel);
        console.log('[DEADLINE-AUDIT]', JSON.stringify({
          gameId,
          ...debugSnapshot,
        }, null, 2));
      } catch (e) {
        console.error('[DEADLINE-AUDIT] Failed to collect debug snapshot', { gameId, source, requestId, error: String(e) });
      }
    }

    // Audit-only mode: return snapshot without mutating anything.
    if (auditOnly) {
      return new Response(JSON.stringify({
        success: true,
        auditOnly: true,
        gameId,
        gameStatus: game.status,
        isPaused: !!game.is_paused,
        actionsTaken: [],
        debugSnapshot,
        source,
        requestId,
        debugLabel,
        timestamp: nowIso,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 0. HANDLE STALE PAUSED GAMES (paused for >4 hours should be ended)
    // EXCEPTION: Real money games can be paused indefinitely - do NOT auto-end them
    // This check runs BEFORE the normal "skip paused games" logic
    const PAUSED_STALE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
    if (game.is_paused) {
      const gameUpdatedAt = new Date(game.updated_at);
      const staleMs = now.getTime() - gameUpdatedAt.getTime();
      const isRealMoney = game.real_money === true;
      
      console.log('[ENFORCE] Checking stale paused game:', {
        gameId,
        updatedAt: game.updated_at,
        staleMs,
        timeoutMs: PAUSED_STALE_TIMEOUT_MS,
        isStale: staleMs > PAUSED_STALE_TIMEOUT_MS,
        isRealMoney,
      });
      
      // Only clean up stale PLAY MONEY paused games - real money games stay paused indefinitely
      if (staleMs > PAUSED_STALE_TIMEOUT_MS && !isRealMoney) {
        console.log('[ENFORCE] Paused PLAY MONEY game is STALE (>4 hours), ending session:', gameId);
        
        // End the session regardless of history (paused games with active play should always have history)
        await supabase
          .from('games')
          .update({
            status: 'session_ended',
            pending_session_end: false,
            session_ended_at: nowIso,
            game_over_at: nowIso,
            is_paused: false,
            config_deadline: null,
            ante_decision_deadline: null,
            config_complete: false,
          })
          .eq('id', gameId);
        
        actionsTaken.push('Stale paused play-money game (>4h): session ended');
        
        return new Response(JSON.stringify({
          success: true,
          actionsTaken,
          gameStatus: 'session_ended',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Not stale - skip all deadline enforcement for paused games
      // This is critical - deadlines freeze when paused, resume when unpaused
      console.log('[ENFORCE] Game is paused (not stale), skipping deadline enforcement for game', gameId);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Game is paused, no deadlines enforced',
        actionsTaken: [],
        gameStatus: game.status,
        isPaused: true,
        debugSnapshot,
        source,
        requestId,
        debugLabel,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 0-GLOBAL. BOT-ONLY GAME CHECK: End session immediately if no humans remain at all
    // This is a check that prevents zombie bot-only games from running indefinitely.
    // IMPORTANT: We now check ONLY for humans who are NOT sitting_out. We do NOT check 
    // the round-level 'status' field (active/folded/betting) because that changes during
    // a hand. A human who folded this round is still participating in the session.
    // The ONLY way a game becomes "bot-only" is if all humans have sitting_out=true.
    if (game.status === 'in_progress' || game.status === 'betting' || game.status === 'ante_decision') {
      const { data: allPlayers } = await supabase
        .from('players')
        .select('id, user_id, is_bot, sitting_out, status, auto_fold')
        .eq('game_id', gameId);
      
      // A human is "present" if they exist and are NOT sitting out
      // We explicitly do NOT check 'status' because that's round-specific
      const presentHumans = (allPlayers || []).filter((p: any) => 
        !p.is_bot && 
        !p.sitting_out
      );
      
      // Bots that are not sitting out
      const presentBots = (allPlayers || []).filter((p: any) => 
        p.is_bot && 
        !p.sitting_out
      );
      
      console.log('[ENFORCE] Bot-only check:', {
        gameId,
        status: game.status,
        presentHumans: presentHumans.length,
        presentBots: presentBots.length,
        totalPlayers: allPlayers?.length || 0,
        humanDetails: presentHumans.map((p: any) => ({ id: p.id?.slice(0,8), status: p.status, auto_fold: p.auto_fold })),
      });
      
      // ONLY end session if there are ZERO present humans AND there are bots
      // This is much more conservative - a human with auto_fold=true but sitting_out=false
      // is still present and the session should continue
      if (presentHumans.length === 0 && presentBots.length > 0) {
        console.log('[ENFORCE] ⚠️ BOT-ONLY GAME DETECTED - all humans are sitting_out, ending session:', gameId);
        
        // End the session
        await supabase
          .from('games')
          .update({
            status: 'session_ended',
            pending_session_end: false,
            session_ended_at: nowIso,
            game_over_at: nowIso,
            config_deadline: null,
            ante_decision_deadline: null,
            awaiting_next_round: false,
          })
          .eq('id', gameId);
        
        actionsTaken.push('Bot-only game detected: All humans sitting_out, session ended');
        
        return new Response(JSON.stringify({
          success: true,
          actionsTaken,
          gameStatus: 'session_ended',
          reason: 'bot_only_game',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // NOTE: The "all humans sitting out" check is now handled above via presentHumans.length === 0
      // We removed the redundant "allHumansAFK" check since sitting_out is the ONLY criteria now.
    }

    // 0-GLOBAL-B. DEGENERATE GAME STATE CHECK: Detect repeated "everyone folded" rounds
    // This catches cases where all players are on auto_fold or bankrupt, leading to
    // endless rounds where everyone folds, pot grows, but game never resolves.
    // Check if last N consecutive hands all resulted in "everyone folded"
    if (game.status === 'in_progress') {
      const CONSECUTIVE_FOLDS_THRESHOLD = 5; // End if 5+ consecutive hands with no winner
      
      const { data: recentResults } = await supabase
        .from('game_results')
        .select('winner_player_id, winning_hand_description')
        .eq('game_id', gameId)
        .order('hand_number', { ascending: false })
        .limit(CONSECUTIVE_FOLDS_THRESHOLD);
      
      if (recentResults && recentResults.length >= CONSECUTIVE_FOLDS_THRESHOLD) {
        // Check if ALL recent results have no winner (everyone folded)
        const allEveryoneFolded = recentResults.every((r: any) => 
          r.winner_player_id === null && 
          (r.winning_hand_description?.toLowerCase().includes('everyone folded') || 
           r.winning_hand_description?.toLowerCase().includes('pussy tax'))
        );
        
        if (allEveryoneFolded) {
          console.log('[ENFORCE] ⚠️ DEGENERATE GAME STATE - Last', CONSECUTIVE_FOLDS_THRESHOLD, 'hands all had everyone folding, ending session:', gameId);
          
          await supabase
            .from('games')
            .update({
              status: 'session_ended',
              pending_session_end: false,
              session_ended_at: nowIso,
              game_over_at: nowIso,
              config_deadline: null,
              ante_decision_deadline: null,
              awaiting_next_round: false,
            })
            .eq('id', gameId);
          
          actionsTaken.push(`Degenerate game state: ${CONSECUTIVE_FOLDS_THRESHOLD} consecutive hands with everyone folding, session ended`);
          
          return new Response(JSON.stringify({
            success: true,
            actionsTaken,
            gameStatus: 'session_ended',
            reason: 'degenerate_game_state',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // 0. HANDLE STALE dealer_selection GAMES (no config_deadline yet, but stuck)
    // Games in dealer_selection that have been idle for >60 seconds should be cleaned up.
    // The dealer_selection phase should complete within seconds (the spinning animation).
    if (game.status === 'dealer_selection' && !game.config_deadline) {
      const gameCreatedAt = new Date(game.created_at);
      const gameUpdatedAt = new Date(game.updated_at);
      const staleSince = Math.max(gameCreatedAt.getTime(), gameUpdatedAt.getTime());
      const staleMs = now.getTime() - staleSince;
      const DEALER_SELECTION_TIMEOUT_MS = 60000; // 60 seconds
      
      console.log('[ENFORCE] Checking stale dealer_selection game:', {
        gameId,
        updatedAt: game.updated_at,
        staleMs,
        timeoutMs: DEALER_SELECTION_TIMEOUT_MS,
        isStale: staleMs > DEALER_SELECTION_TIMEOUT_MS,
      });
      
      if (staleMs > DEALER_SELECTION_TIMEOUT_MS) {
        console.log('[ENFORCE] dealer_selection game is STALE, cleaning up:', gameId);
        
        // Fetch players to check session history
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        // Re-fetch game to get latest total_hands
        const { data: freshGame } = await supabase
          .from('games')
          .select('total_hands')
          .eq('id', gameId)
          .maybeSingle();
        
        const totalHands = (freshGame?.total_hands ?? 0) as number;
        
        // Also check game_results as backup
        const { count: resultsCount } = await supabase
          .from('game_results')
          .select('id', { count: 'exact', head: true })
          .eq('game_id', gameId);
        
        const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
        
        console.log('[ENFORCE] Stale dealer_selection session check:', { totalHands, resultsCount, hasHistory });
        
        if (!hasHistory) {
          // Delete empty session (FK-safe order)
          const { data: roundRows } = await supabase
            .from('rounds')
            .select('id')
            .eq('game_id', gameId);
          
          const roundIds = (roundRows ?? []).map((r: any) => r.id).filter(Boolean);
          
          if (roundIds.length > 0) {
            await supabase.from('player_cards').delete().in('round_id', roundIds);
          }
          
          await supabase.from('chip_stack_emoticons').delete().eq('game_id', gameId);
          await supabase.from('chat_messages').delete().eq('game_id', gameId);
          await supabase.from('rounds').delete().eq('game_id', gameId);
          await supabase.from('players').delete().eq('game_id', gameId);
          await supabase.from('games').delete().eq('id', gameId);
          
          actionsTaken.push('Stale dealer_selection: No history, deleted empty session');
        } else {
          await supabase
            .from('games')
            .update({
              status: 'session_ended',
              pending_session_end: false,
              session_ended_at: nowIso,
              game_over_at: nowIso,
              config_deadline: null,
              ante_decision_deadline: null,
              config_complete: false,
            })
            .eq('id', gameId);
          
          actionsTaken.push('Stale dealer_selection: Has history, session ended');
        }
        
        return new Response(JSON.stringify({
          success: true,
          actionsTaken,
          gameStatus: hasHistory ? 'session_ended' : 'deleted',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 0b. HANDLE STALE "waiting" GAMES (no activity for extended period)
    // Games stuck in "waiting" status (waiting for more players) for >2 hours should be cleaned up.
    const WAITING_GAME_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
    if (game.status === 'waiting') {
      const gameUpdatedAt = new Date(game.updated_at);
      const staleMs = now.getTime() - gameUpdatedAt.getTime();
      
      console.log('[ENFORCE] Checking stale waiting game:', {
        gameId,
        updatedAt: game.updated_at,
        staleMs,
        timeoutMs: WAITING_GAME_TIMEOUT_MS,
        isStale: staleMs > WAITING_GAME_TIMEOUT_MS,
      });
      
      if (staleMs > WAITING_GAME_TIMEOUT_MS) {
        console.log('[ENFORCE] waiting game is STALE (>2 hours), cleaning up:', gameId);
        
        // Re-fetch game to get latest total_hands
        const { data: freshGame } = await supabase
          .from('games')
          .select('total_hands')
          .eq('id', gameId)
          .maybeSingle();
        
        const totalHands = (freshGame?.total_hands ?? 0) as number;
        
        // Also check game_results as backup
        const { count: resultsCount } = await supabase
          .from('game_results')
          .select('id', { count: 'exact', head: true })
          .eq('game_id', gameId);
        
        const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
        
        console.log('[ENFORCE] Stale waiting session check:', { totalHands, resultsCount, hasHistory });
        
        if (!hasHistory) {
          // Delete empty session (FK-safe order)
          const { data: roundRows } = await supabase
            .from('rounds')
            .select('id')
            .eq('game_id', gameId);
          
          const roundIds = (roundRows ?? []).map((r: any) => r.id).filter(Boolean);
          
          if (roundIds.length > 0) {
            await supabase.from('player_cards').delete().in('round_id', roundIds);
          }
          
          await supabase.from('chip_stack_emoticons').delete().eq('game_id', gameId);
          await supabase.from('chat_messages').delete().eq('game_id', gameId);
          await supabase.from('rounds').delete().eq('game_id', gameId);
          await supabase.from('players').delete().eq('game_id', gameId);
          await supabase.from('games').delete().eq('id', gameId);
          
          actionsTaken.push('Stale waiting game (>2h): No history, deleted empty session');
        } else {
          await supabase
            .from('games')
            .update({
              status: 'session_ended',
              pending_session_end: false,
              session_ended_at: nowIso,
              game_over_at: nowIso,
              config_deadline: null,
              ante_decision_deadline: null,
              config_complete: false,
            })
            .eq('id', gameId);
          
          actionsTaken.push('Stale waiting game (>2h): Has history, session ended');
        }
        
        return new Response(JSON.stringify({
          success: true,
          actionsTaken,
          gameStatus: hasHistory ? 'session_ended' : 'deleted',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 0c. HANDLE STALE "in_progress" GAMES (no decision_deadline and no activity for extended period)
    // Games stuck in "in_progress" without any decision deadlines for >2 hours should be cleaned up.
    const IN_PROGRESS_STALE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
    if (game.status === 'in_progress') {
      // Fetch current round to check for decision deadline
      const { data: currentRound } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .eq('round_number', game.current_round ?? 0)
        .maybeSingle();
      
      const hasDecisionDeadline = !!currentRound?.decision_deadline;
      
      if (!hasDecisionDeadline) {
        const gameUpdatedAt = new Date(game.updated_at);
        const staleMs = now.getTime() - gameUpdatedAt.getTime();
        
        console.log('[ENFORCE] Checking stale in_progress game (no deadline):', {
          gameId,
          updatedAt: game.updated_at,
          staleMs,
          timeoutMs: IN_PROGRESS_STALE_TIMEOUT_MS,
          isStale: staleMs > IN_PROGRESS_STALE_TIMEOUT_MS,
          hasDecisionDeadline,
        });
        
        if (staleMs > IN_PROGRESS_STALE_TIMEOUT_MS) {
          console.log('[ENFORCE] in_progress game is STALE (>2h, no deadline), cleaning up:', gameId);
          
          // Re-fetch game to get latest total_hands
          const { data: freshGame } = await supabase
            .from('games')
            .select('total_hands')
            .eq('id', gameId)
            .maybeSingle();
          
          const totalHands = (freshGame?.total_hands ?? 0) as number;
          
          // Also check game_results as backup
          const { count: resultsCount } = await supabase
            .from('game_results')
            .select('id', { count: 'exact', head: true })
            .eq('game_id', gameId);
          
          const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
          
          console.log('[ENFORCE] Stale in_progress session check:', { totalHands, resultsCount, hasHistory });
          
          // For in_progress games, they usually have history, so end the session
          await supabase
            .from('games')
            .update({
              status: 'session_ended',
              pending_session_end: false,
              session_ended_at: nowIso,
              game_over_at: nowIso,
              config_deadline: null,
              ante_decision_deadline: null,
              config_complete: false,
            })
            .eq('id', gameId);
          
          actionsTaken.push('Stale in_progress game (>2h, no deadline): session ended');
          
          return new Response(JSON.stringify({
            success: true,
            actionsTaken,
            gameStatus: 'session_ended',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // 1. ENFORCE CONFIG DEADLINE (dealer setup timeout)
    // Check if config_deadline has expired for games in config phase
    if ((game.status === 'dealer_selection' || game.status === 'configuring' || game.status === 'game_selection') && game.config_deadline) {
      const configDeadline = new Date(game.config_deadline);
      const msUntilDeadline = configDeadline.getTime() - now.getTime();
      
      console.log('[ENFORCE] Config deadline check:', {
        gameId,
        status: game.status,
        configDeadline: game.config_deadline,
        now: nowIso,
        msUntilDeadline,
        isExpired: msUntilDeadline <= 0,
      });
      
      if (msUntilDeadline <= 0) {
        console.log('[ENFORCE] Config deadline EXPIRED for game', gameId, { 
          deadline: game.config_deadline, 
          now: nowIso, 
          expiredByMs: Math.abs(msUntilDeadline),
        });
        
        // Find dealer player
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);

        const dealerPlayer = players?.find(p => p.position === game.dealer_position);

        if (dealerPlayer) {
          // Log this status change for debugging (before the update)
          await logSittingOutChange(
            supabase,
            dealerPlayer.id,
            dealerPlayer.user_id,
            gameId,
            null, // We don't have username in this query
            dealerPlayer.is_bot,
            'sitting_out',
            dealerPlayer.sitting_out,
            true,
            'Dealer timed out during config phase (edge function enforcement)',
            'enforce-deadlines/index.ts:config_deadline',
            { dealer_position: game.dealer_position, config_deadline: game.config_deadline }
          );

          // Mark dealer as sitting out
          await supabase
            .from('players')
            .update({ sitting_out: true, waiting: false })
            .eq('id', dealerPlayer.id);

          // Respect allow_bot_dealers
          const { data: gameDefaults } = await supabase
            .from('game_defaults')
            .select('allow_bot_dealers')
            .eq('game_type', 'holm')
            .maybeSingle();

          const allowBotDealers = (gameDefaults as any)?.allow_bot_dealers ?? false;

          // If no active humans remain, end/delete the session (based on game history)
          const remainingActiveHumans = (players ?? []).filter((p: any) =>
            !p.is_bot &&
            !p.sitting_out &&
            p.id !== dealerPlayer.id
          );

          if (remainingActiveHumans.length < 1) {
            // Re-fetch game to get latest total_hands (avoid stale data race condition)
            const { data: freshGame } = await supabase
              .from('games')
              .select('total_hands')
              .eq('id', gameId)
              .maybeSingle();
            
            const totalHands = (freshGame?.total_hands ?? 0) as number;
            
            // Also check game_results as backup - if any results exist, session has history
            const { count: resultsCount } = await supabase
              .from('game_results')
              .select('id', { count: 'exact', head: true })
              .eq('game_id', gameId);
            
            const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;
            
            console.log('[ENFORCE] Config timeout session check:', { totalHands, resultsCount, hasHistory });

            if (!hasHistory) {
              // Delete empty session (FK-safe order)
              const { data: roundRows } = await supabase
                .from('rounds')
                .select('id')
                .eq('game_id', gameId);

              const roundIds = (roundRows ?? []).map((r: any) => r.id).filter(Boolean);

              if (roundIds.length > 0) {
                await supabase.from('player_cards').delete().in('round_id', roundIds);
              }

              await supabase.from('chip_stack_emoticons').delete().eq('game_id', gameId);
              await supabase.from('chat_messages').delete().eq('game_id', gameId);
              await supabase.from('rounds').delete().eq('game_id', gameId);
              await supabase.from('players').delete().eq('game_id', gameId);
              await supabase.from('games').delete().eq('id', gameId);

              actionsTaken.push('Config timeout: No active humans and no history, deleted empty session');
            } else {
              await supabase
                .from('games')
                .update({
                  // Terminal state: do NOT allow the session to continue when the only human dealer timed out
                  status: 'session_ended',
                  pending_session_end: false,
                  session_ended_at: nowIso,
                  game_over_at: nowIso,
                  // Clear any config/ante deadlines so clients can't "resume" countdowns
                  config_deadline: null,
                  ante_decision_deadline: null,
                  config_complete: false,
                })
                .eq('id', gameId);

              actionsTaken.push('Config timeout: Only human dealer; session ended (has history)');
            }

            return new Response(JSON.stringify({
              success: true,
              actionsTaken,
              gameStatus: 'deleted_or_game_over',
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Count remaining eligible dealers (non-sitting-out, excluding the timed-out dealer)
          const eligibleDealers = players?.filter((p: any) =>
            !p.sitting_out &&
            p.id !== dealerPlayer.id &&
            (allowBotDealers || !p.is_bot)
          ) || [];

          if (eligibleDealers.length >= 1) {
            // Rotate dealer to next eligible player
            const sortedEligible = eligibleDealers.sort((a: any, b: any) => a.position - b.position);
            const currentDealerIdx = sortedEligible.findIndex((p: any) => p.position > game.dealer_position);
            const nextDealer = currentDealerIdx >= 0
              ? sortedEligible[currentDealerIdx]
              : sortedEligible[0];

            // Calculate new config deadline (30 seconds from now)
            const newConfigDeadline = new Date(Date.now() + 30000).toISOString();

            await supabase
              .from('games')
              .update({
                dealer_position: nextDealer.position,
                config_deadline: newConfigDeadline,
              })
              .eq('id', gameId);

            actionsTaken.push(`Config timeout: Dealer ${dealerPlayer.position} sat out, rotated to ${nextDealer.position}`);
          } else {
            // Not enough eligible dealers - return to waiting_for_players status
            await supabase
              .from('games')
              .update({
                status: 'waiting_for_players',
                config_deadline: null,
                config_complete: false,
              })
              .eq('id', gameId);

            actionsTaken.push('Config timeout: No eligible dealers, returning to waiting_for_players');
          }
        }
      }
    }

    // 2. ENFORCE ANTE DECISION DEADLINE
    if (game.status === 'ante_decision' && game.ante_decision_deadline) {
      const anteDeadline = new Date(game.ante_decision_deadline);
      if (now > anteDeadline) {
        console.log('[ENFORCE] Ante deadline expired for game', gameId);
        
        // Find all players
        const { data: players } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        // Find undecided players (no ante_decision yet) and auto-sit them out
        const undecidedPlayers = players?.filter(p => !p.ante_decision && !p.sitting_out) || [];
        
        if (undecidedPlayers.length > 0) {
          // Log each human player's status change for debugging
          for (const player of undecidedPlayers) {
            await logSittingOutChange(
              supabase,
              player.id,
              player.user_id,
              gameId,
              null,
              player.is_bot,
              'sitting_out',
              player.sitting_out,
              true,
              'Player did not respond to ante decision in time (edge function enforcement)',
              'enforce-deadlines/index.ts:ante_deadline',
              { ante_decision_deadline: game.ante_decision_deadline }
            );
          }

          const undecidedIds = undecidedPlayers.map(p => p.id);
          
          await supabase
            .from('players')
            .update({
              ante_decision: 'sit_out',
              sitting_out: true,
              waiting: false,
            })
            .in('id', undecidedIds);
          
          actionsTaken.push(`Ante timeout: Auto-sat-out ${undecidedIds.length} undecided players`);
        }
        
        // Re-fetch players after updates
        const { data: freshPlayers } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        // Count how many players successfully anted up
        const antedUpPlayers = freshPlayers?.filter(p => p.ante_decision === 'ante_up' && !p.sitting_out) || [];
        
        console.log('[ENFORCE] After ante timeout: anted_up=', antedUpPlayers.length, 'total=', freshPlayers?.length);
        
        if (antedUpPlayers.length >= 2) {
          // Enough players to start - transition game to in_progress
          // The client will detect this and call startHolmRound
          await supabase
            .from('games')
            .update({
              ante_decision_deadline: null,
              // Don't change status here - let the client handle the transition
              // to avoid race conditions with startHolmRound
            })
            .eq('id', gameId);
          
          actionsTaken.push(`Ante timeout: ${antedUpPlayers.length} players anted up, ready to start`);
        } else if (antedUpPlayers.length < 2) {
          // Not enough players - return to waiting_for_players
          // Check if dealer is still active (not sitting out)
          const currentDealer = freshPlayers?.find(p => p.position === game.dealer_position);
          const dealerIsActive = currentDealer && !currentDealer.sitting_out;
          
          if (!dealerIsActive) {
            // Dealer timed out - rotate to next eligible dealer
            const eligibleDealers = freshPlayers?.filter(p => 
              !p.is_bot && 
              !p.sitting_out
            ).sort((a, b) => a.position - b.position) || [];
            
            if (eligibleDealers.length >= 1) {
              // Find next dealer clockwise from current position
              const currentPos = game.dealer_position || 1;
              const higherPositions = eligibleDealers.filter(p => p.position > currentPos);
              const nextDealer = higherPositions.length > 0 
                ? higherPositions[0] 
                : eligibleDealers[0];
              
              await supabase
                .from('games')
                .update({
                  status: 'waiting_for_players',
                  ante_decision_deadline: null,
                  dealer_position: nextDealer.position,
                })
                .eq('id', gameId);
              
              actionsTaken.push(`Ante timeout: Dealer sat out, rotated to position ${nextDealer.position}, returning to waiting`);
            } else {
              // No eligible dealers at all
              await supabase
                .from('games')
                .update({
                  status: 'waiting_for_players',
                  ante_decision_deadline: null,
                })
                .eq('id', gameId);
              
              actionsTaken.push('Ante timeout: No active players, returning to waiting_for_players');
            }
          } else {
            // Dealer is still active but not enough players
            await supabase
              .from('games')
              .update({
                status: 'waiting_for_players',
                ante_decision_deadline: null,
              })
              .eq('id', gameId);
            
            actionsTaken.push(`Ante timeout: Only ${antedUpPlayers.length} player(s) anted up, returning to waiting_for_players`);
          }
        }
      }
    }

    // 3. ENFORCE DECISION DEADLINE (stay/fold during gameplay)
    if (game.status === 'in_progress' || game.status === 'betting') {
      // RECOVERY: Check for betting rounds with MISSING decision_deadline
      // This happens when all clients disconnect and the turn was never assigned.
      // We recover by assigning the turn to the next undecided player.
      // IMPORTANT: This recovery is ONLY for Holm (turn-based) games!
      // Dice games (SCC, Horses) use simultaneous decisions and don't have current_turn_position.
      // Applying turn-based recovery to dice games incorrectly sets auto_fold on players.
      if (game.game_type === 'holm-game') {
        const { data: stuckBettingRounds } = await supabase
          .from('rounds')
          .select('*')
          .eq('game_id', gameId)
          .eq('status', 'betting')
          .is('decision_deadline', null)
          .order('created_at', { ascending: false })
          .limit(1);

        const stuckBettingRound = stuckBettingRounds?.[0];
        if (stuckBettingRound && game.all_decisions_in !== true) {
          console.log('[ENFORCE] ⚠️ RECOVERY: Found Holm betting round with NULL decision_deadline', {
            roundId: stuckBettingRound.id,
            roundNumber: stuckBettingRound.round_number,
            currentTurnPosition: stuckBettingRound.current_turn_position,
          });

          // Fetch players to find next undecided player
          const { data: players } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId);

          const activePlayers = players?.filter((p: any) => p.status === 'active' && !p.sitting_out && p.ante_decision === 'ante_up') || [];
          const undecidedPlayers = activePlayers.filter((p: any) => !p.decision_locked);

          console.log('[ENFORCE] RECOVERY: Active players:', activePlayers.length, 'Undecided:', undecidedPlayers.length);

          if (undecidedPlayers.length > 0) {
            // Find next undecided player position
            const sortedUndecided = undecidedPlayers.sort((a: any, b: any) => a.position - b.position);
            
            // If current_turn_position is set, find next after that; otherwise use first undecided
            let nextPosition: number;
            const currentPos = stuckBettingRound.current_turn_position;
            if (currentPos) {
              const higherPositions = sortedUndecided.filter((p: any) => p.position > currentPos);
              nextPosition = higherPositions.length > 0 
                ? higherPositions[0].position 
                : sortedUndecided[0].position;
            } else {
              nextPosition = sortedUndecided[0].position;
            }

            // Fetch decision timer from game_defaults
            const { data: gameDefaults } = await supabase
              .from('game_defaults')
              .select('decision_timer_seconds')
              .eq('game_type', 'holm')
              .maybeSingle();

            const timerSeconds = (gameDefaults as any)?.decision_timer_seconds ?? 30;
            const newDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();

            console.log('[ENFORCE] RECOVERY: Setting turn to position', nextPosition, 'with deadline', newDeadline);

            await supabase
              .from('rounds')
              .update({
                current_turn_position: nextPosition,
                decision_deadline: newDeadline,
              })
              .eq('id', stuckBettingRound.id);

            actionsTaken.push(`RECOVERY: Stuck Holm betting round - set turn to position ${nextPosition} with ${timerSeconds}s deadline`);
          } else if (undecidedPlayers.length === 0 && activePlayers.length > 0) {
            // All players have decided but round wasn't advanced - trigger showdown
            console.log('[ENFORCE] RECOVERY: All players decided but round stuck in betting - advancing to showdown');
            
            const { data: lockResult } = await supabase
              .from('games')
              .update({ all_decisions_in: true })
              .eq('id', gameId)
              .eq('all_decisions_in', false)
              .select();

            if (lockResult && lockResult.length > 0) {
              await supabase
                .from('rounds')
                .update({ status: 'showdown' })
                .eq('id', stuckBettingRound.id)
                .eq('status', 'betting');

              actionsTaken.push('RECOVERY: All decided but stuck - advanced to showdown');
            }
          }
        }
      }

      // IMPORTANT: round_number/status can become unreliable under race conditions.
      // Only act when we find a BETTING round whose decision_deadline is actually overdue.
      const { data: overdueRounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .eq('status', 'betting')
        .not('decision_deadline', 'is', null)
        .lt('decision_deadline', nowIso)
        .order('decision_deadline', { ascending: true })
        .limit(1);

      let currentRound = overdueRounds?.[0];

      if (currentRound?.decision_deadline && currentRound.status === 'betting') {
        const decisionDeadline = new Date(currentRound.decision_deadline);
        if (now > decisionDeadline) {
          console.log('[ENFORCE] Decision deadline expired for game', gameId, 'round', currentRound.round_number, {
            roundId: currentRound.id,
            createdAt: currentRound.created_at,
            currentTurnPosition: currentRound.current_turn_position,
          });

          // Holm games: sequential turn-based decisions
          if (game.game_type === 'holm-game') {
            const { data: players } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId);

            const activePlayers = players?.filter((p: any) => p.status === 'active' && !p.sitting_out) || [];
            const undecidedPlayers = activePlayers.filter((p: any) => !p.decision_locked);

            // Recovery: some stuck states have betting + expired deadline but missing current_turn_position.
            let currentTurnPos: number | null = (currentRound.current_turn_position ?? null) as any;
            if (!currentTurnPos && undecidedPlayers.length > 0) {
              currentTurnPos = undecidedPlayers
                .map((p: any) => p.position)
                .sort((a: number, b: number) => a - b)[0];

              await supabase
                .from('rounds')
                .update({ current_turn_position: currentTurnPos })
                .eq('id', currentRound.id);

              currentRound = { ...(currentRound as any), current_turn_position: currentTurnPos };
              actionsTaken.push(`Recovered missing current_turn_position (set to ${currentTurnPos})`);
            }

            if (currentTurnPos) {
              const currentTurnPlayer = activePlayers.find((p: any) => p.position === currentTurnPos);

              if (currentTurnPlayer && !currentTurnPlayer.decision_locked) {
                // CRITICAL: Check decision_locked, not current_decision
                // Only process if the player hasn't already locked their decision
                if (currentTurnPlayer.is_bot) {
                  // Bot decision - 50% stay, 50% fold (simple logic for server-side)
                  const botDecision = Math.random() < 0.5 ? 'stay' : 'fold';
                  // ATOMIC: Only update if decision_locked is still false to prevent race conditions
                  const { data: botUpdateResult } = await supabase
                    .from('players')
                    .update({ current_decision: botDecision, decision_locked: true })
                    .eq('id', currentTurnPlayer.id)
                    .eq('decision_locked', false) // Atomic guard
                    .select();

                  if (botUpdateResult && botUpdateResult.length > 0) {
                    actionsTaken.push(`Bot timeout: Made decision '${botDecision}' for bot at position ${currentTurnPlayer.position}`);
                  } else {
                    actionsTaken.push(`Bot timeout: Player at position ${currentTurnPlayer.position} already decided, skipping`);
                  }
                } else {
                  // Human player - auto-fold AND set auto_fold flag for future hands
                  // ATOMIC: Only update if decision_locked is still false to prevent race conditions
                  // This prevents overwriting a player's legitimate "stay" decision that arrived just before timeout
                  const { data: humanUpdateResult } = await supabase
                    .from('players')
                    .update({ current_decision: 'fold', decision_locked: true, auto_fold: true })
                    .eq('id', currentTurnPlayer.id)
                    .eq('decision_locked', false) // Atomic guard - prevents race condition
                    .select();

                  if (humanUpdateResult && humanUpdateResult.length > 0) {
                    actionsTaken.push(`Decision timeout: Auto-folded player at position ${currentTurnPlayer.position} and set auto_fold=true`);
                  } else {
                    actionsTaken.push(`Decision timeout: Player at position ${currentTurnPlayer.position} already decided, skipping auto-fold`);
                  }
                }
              }

              // CRITICAL: After decision, advance turn to next UNDECIDED player
              // Re-fetch players to get updated decisions
              const { data: freshPlayers } = await supabase
                .from('players')
                .select('*')
                .eq('game_id', gameId);

              const freshActivePlayers = freshPlayers?.filter((p: any) => p.status === 'active' && !p.sitting_out) || [];

              // CRITICAL FIX: In Holm games, check if ALL active players have LOCKED their decision
              // Not just whether they have a current_decision, because players whose turn hasn't come
              // will have null current_decision but should NOT be considered "decided"
              const undecidedActivePlayers = freshActivePlayers.filter((p: any) => !p.decision_locked);
              const currentPos = currentTurnPos;

              console.log('[ENFORCE] Active players:', freshActivePlayers.map((p: any) => ({ pos: p.position, locked: p.decision_locked, decision: p.current_decision })));
              console.log('[ENFORCE] Undecided players:', undecidedActivePlayers.map((p: any) => p.position));

              if (undecidedActivePlayers.length === 0) {
                // All players decided - use ATOMIC guard to prevent race conditions
                // Only proceed if we successfully claim the lock (all_decisions_in was false)
                const { data: lockResult, error: lockError } = await supabase
                  .from('games')
                  .update({ all_decisions_in: true })
                  .eq('id', gameId)
                  .eq('all_decisions_in', false) // Atomic guard - only update if not already set
                  .select();

                if (lockError || !lockResult || lockResult.length === 0) {
                  actionsTaken.push('All players decided - but another process already claimed the lock, skipping');
                } else {
                  // CRITICAL FIX: Also update round status to 'showdown' so client-side
                  // processing can detect the state change. Without this, the round stays
                  // in 'betting' status and the client never triggers endHolmRound.
                  await supabase
                    .from('rounds')
                    .update({ status: 'showdown' })
                    .eq('id', (currentRound as any).id)
                    .eq('status', 'betting'); // Only update if still in betting status

                  actionsTaken.push('All players decided - all_decisions_in set to true, round status set to showdown (atomic lock acquired)');
                  
                  // SERVER-SIDE HOLM ROUND COMPLETION
                  // When all decisions are in and we're processing server-side (no human client),
                  // we need to complete the round ourselves. Check if this is a bot-only game
                  // OR if all humans are in auto_fold mode (effectively AFK).
                  const humanPlayersInGame = freshActivePlayers.filter((p: any) => !p.is_bot);
                  const isBotOnlyGame = humanPlayersInGame.length === 0;
                  const allHumansAutoFold = humanPlayersInGame.length > 0 && 
                    humanPlayersInGame.every((p: any) => p.auto_fold === true);
                  const shouldResolveServerSide = isBotOnlyGame || allHumansAutoFold;
                  
                  console.log('[ENFORCE] Holm round completion check:', {
                    activePlayers: freshActivePlayers.length,
                    humanPlayers: humanPlayersInGame.length,
                    isBotOnlyGame,
                    allHumansAutoFold,
                    shouldResolveServerSide,
                  });
                  
                  if (shouldResolveServerSide) {
                    // Bot-only game OR all humans auto-folding - complete the round server-side
                    const stayedPlayers = freshActivePlayers.filter((p: any) => p.current_decision === 'stay');
                    
                    console.log('[ENFORCE] Server-side Holm resolution - completing round:', {
                      stayedCount: stayedPlayers.length,
                      foldedCount: freshActivePlayers.length - stayedPlayers.length,
                      reason: isBotOnlyGame ? 'bot_only' : 'all_humans_auto_fold',
                    });
                    
                    if (stayedPlayers.length === 0) {
                      // EVERYONE FOLDED - Apply pussy tax and carry pot forward
                      console.log('[ENFORCE] Everyone folded - applying pussy tax');
                      
                      const pussyTaxEnabled = game.pussy_tax_enabled ?? true;
                      const pussyTaxAmount = pussyTaxEnabled ? (game.pussy_tax_value || 1) : 0;
                      
                      if (pussyTaxAmount > 0) {
                        // Deduct pussy tax from all active players
                        const playerIds = freshActivePlayers.map((p: any) => p.id);
                        const { error: taxError } = await supabase.rpc('decrement_player_chips', {
                          player_ids: playerIds,
                          amount: pussyTaxAmount
                        });
                        
                        if (taxError) {
                          console.error('[ENFORCE] Pussy tax decrement error:', taxError);
                          // Fallback to individual updates
                          for (const player of freshActivePlayers) {
                            await supabase
                              .from('players')
                              .update({ chips: player.chips - pussyTaxAmount })
                              .eq('id', player.id);
                          }
                        }
                      }
                      
                      const totalTaxCollected = pussyTaxAmount * freshActivePlayers.length;
                      const newPot = (game.pot || 0) + totalTaxCollected;
                      
                      // Record game result for "everyone folded" case
                      const playerChipChanges: Record<string, number> = {};
                      if (pussyTaxAmount > 0) {
                        for (const player of freshActivePlayers) {
                          playerChipChanges[player.id] = -pussyTaxAmount;
                        }
                      }
                      
                      await supabase
                        .from('game_results')
                        .insert({
                          game_id: gameId,
                          hand_number: (currentRound as any).round_number || 1,
                          winner_player_id: null,
                          winner_username: null,
                          pot_won: 0,
                          winning_hand_description: 'Everyone folded - Pussy Tax applied (server-side)',
                          is_chopped: false,
                          player_chip_changes: playerChipChanges,
                          game_type: 'holm-game',
                        });
                      
                      // Update game with new pot and set awaiting_next_round
                      await supabase
                        .from('games')
                        .update({
                          pot: newPot,
                          last_round_result: pussyTaxAmount > 0 ? 'Pussy Tax!' : 'Everyone folded!',
                          awaiting_next_round: true,
                        })
                        .eq('id', gameId);
                      
                      // Mark round as completed
                      await supabase
                        .from('rounds')
                        .update({ status: 'completed' })
                        .eq('id', (currentRound as any).id);
                      
                      actionsTaken.push(`Server-side Holm completion: Everyone folded, pussy tax applied (${totalTaxCollected} collected), pot now ${newPot}`);
                    } else {
                      // Someone stayed - need to run full Holm showdown server-side
                      console.log('[ENFORCE] Running server-side Holm showdown with', stayedPlayers.length, 'stayer(s)');
                      
                      // Fetch player cards and community cards for evaluation
                      const { data: roundData } = await supabase
                        .from('rounds')
                        .select('*')
                        .eq('id', (currentRound as any).id)
                        .single();
                      
                      const communityCards: Card[] = (roundData?.community_cards as any[] || []).map((c: any) => ({
                        suit: (c.suit || c.Suit) as Card['suit'],
                        rank: String(c.rank || c.Rank).toUpperCase() as Card['rank']
                      }));
                      
                      const { data: allPlayerCards } = await supabase
                        .from('player_cards')
                        .select('*')
                        .eq('round_id', (currentRound as any).id);
                      
                      const roundPot = roundData?.pot || game.pot || 0;
                      
                      if (stayedPlayers.length === 1) {
                        // SINGLE STAYER VS CHUCKY
                        const player = stayedPlayers[0];
                        const playerCardsRow = allPlayerCards?.find((pc: any) => pc.player_id === player.id);
                        const playerCards: Card[] = (playerCardsRow?.cards as any[] || []).map((c: any) => ({
                          suit: (c.suit || c.Suit) as Card['suit'],
                          rank: String(c.rank || c.Rank).toUpperCase() as Card['rank']
                        }));
                        
                        // Deal Chucky's cards
                        const usedCards = new Set<string>();
                        communityCards.forEach(c => usedCards.add(`${c.suit}-${c.rank}`));
                        (allPlayerCards || []).forEach((pc: any) => {
                          (pc.cards as any[] || []).forEach((c: any) => {
                            usedCards.add(`${(c.suit || c.Suit)}-${String(c.rank || c.Rank).toUpperCase()}`);
                          });
                        });
                        
                        const fullDeck = createDeck();
                        const availableCards = fullDeck.filter(c => !usedCards.has(`${c.suit}-${c.rank}`));
                        const shuffledAvailable = shuffleDeck(availableCards);
                        const chuckyCardCount = game.chucky_cards || 4;
                        const chuckyCards = shuffledAvailable.slice(0, chuckyCardCount);
                        
                        // Store Chucky's cards
                        await supabase
                          .from('rounds')
                          .update({
                            chucky_cards: chuckyCards as any,
                            chucky_active: true,
                            chucky_cards_revealed: chuckyCardCount,
                            community_cards_revealed: 4
                          })
                          .eq('id', (currentRound as any).id);
                        
                        // Evaluate hands
                        const playerAllCards = [...playerCards, ...communityCards];
                        const chuckyAllCards = [...chuckyCards, ...communityCards];
                        
                        const playerEval = evaluateHolmHand(playerAllCards);
                        const chuckyEval = evaluateHolmHand(chuckyAllCards);
                        
                        const playerWins = playerEval.value > chuckyEval.value;
                        
                        console.log('[ENFORCE] Chucky showdown:', {
                          player: player.id,
                          playerHand: playerEval.rank,
                          playerValue: playerEval.value,
                          chuckyHand: chuckyEval.rank,
                          chuckyValue: chuckyEval.value,
                          playerWins,
                        });
                        
                        if (playerWins) {
                          // Player beats Chucky - award pot, GAME OVER
                          await supabase
                            .from('players')
                            .update({ chips: player.chips + roundPot })
                            .eq('id', player.id);
                          
                          // Record game result
                          await supabase.from('game_results').insert({
                            game_id: gameId,
                            hand_number: (game.total_hands || 0) + 1,
                            winner_player_id: player.id,
                            winner_username: player.id,
                            pot_won: roundPot,
                            winning_hand_description: `Beat Chucky with ${playerEval.rank} (server-side)`,
                            is_chopped: false,
                            player_chip_changes: { [player.id]: roundPot },
                            game_type: 'holm-game',
                          });
                          
                          // Reset players for new game
                          await supabase
                            .from('players')
                            .update({ current_decision: null, decision_locked: false, ante_decision: null })
                            .eq('game_id', gameId);
                          
                          // Set game_over
                          await supabase
                            .from('games')
                            .update({
                              status: 'game_over',
                              game_over_at: nowIso,
                              pot: 0,
                              awaiting_next_round: false,
                              buck_position: null,
                              total_hands: (game.total_hands || 0) + 1,
                              last_round_result: `Player beat Chucky! (server-side)`,
                            })
                            .eq('id', gameId);
                          
                          await supabase
                            .from('rounds')
                            .update({ status: 'completed' })
                            .eq('id', (currentRound as any).id);
                          
                          actionsTaken.push(`Server-side Holm: Player beat Chucky with ${playerEval.rank}, pot ${roundPot} awarded, game over`);
                        } else {
                          // Chucky wins - player matches pot
                          const potMatchAmount = game.pot_max_enabled
                            ? Math.min(roundPot, game.pot_max_value)
                            : roundPot;
                          
                          await supabase.rpc('decrement_player_chips', {
                            player_ids: [player.id],
                            amount: potMatchAmount
                          });
                          
                          const newPot = roundPot + potMatchAmount;
                          
                          await supabase
                            .from('games')
                            .update({
                              pot: newPot,
                              last_round_result: `Chucky wins with ${chuckyEval.rank}!`,
                              awaiting_next_round: true,
                            })
                            .eq('id', gameId);
                          
                          await supabase
                            .from('rounds')
                            .update({ status: 'completed', chucky_active: false })
                            .eq('id', (currentRound as any).id);
                          
                          actionsTaken.push(`Server-side Holm: Chucky beat player with ${chuckyEval.rank}, pot now ${newPot}, awaiting next round`);
                        }
                      } else {
                        // MULTIPLE STAYERS - Full showdown (no Chucky)
                        console.log('[ENFORCE] Multi-player showdown with', stayedPlayers.length, 'players');
                        
                        // Evaluate all stayed players' hands
                        const playerHands: { player: any; eval: { rank: string; value: number }; cards: Card[] }[] = [];
                        
                        for (const player of stayedPlayers) {
                          const playerCardsRow = allPlayerCards?.find((pc: any) => pc.player_id === player.id);
                          const playerCards: Card[] = (playerCardsRow?.cards as any[] || []).map((c: any) => ({
                            suit: (c.suit || c.Suit) as Card['suit'],
                            rank: String(c.rank || c.Rank).toUpperCase() as Card['rank']
                          }));
                          
                          const allCards = [...playerCards, ...communityCards];
                          const handEval = evaluateHolmHand(allCards);
                          
                          playerHands.push({ player, eval: handEval, cards: playerCards });
                        }
                        
                        // Sort by hand value descending
                        playerHands.sort((a, b) => b.eval.value - a.eval.value);
                        
                        const bestValue = playerHands[0].eval.value;
                        const winners = playerHands.filter(ph => ph.eval.value === bestValue);
                        
                        console.log('[ENFORCE] Showdown result:', {
                          winnersCount: winners.length,
                          bestHand: playerHands[0].eval.rank,
                          bestValue,
                        });
                        
                        // Reveal all community cards
                        await supabase
                          .from('rounds')
                          .update({ community_cards_revealed: 4, status: 'showdown' })
                          .eq('id', (currentRound as any).id);
                        
                        if (winners.length === 1) {
                          // Single winner
                          const winner = winners[0];
                          
                          await supabase
                            .from('players')
                            .update({ chips: winner.player.chips + roundPot })
                            .eq('id', winner.player.id);
                          
                          await supabase.from('game_results').insert({
                            game_id: gameId,
                            hand_number: (game.total_hands || 0) + 1,
                            winner_player_id: winner.player.id,
                            winner_username: winner.player.id,
                            pot_won: roundPot,
                            winning_hand_description: `${winner.eval.rank} (server-side showdown)`,
                            is_chopped: false,
                            player_chip_changes: { [winner.player.id]: roundPot },
                            game_type: 'holm-game',
                          });
                          
                          // Reset players
                          await supabase
                            .from('players')
                            .update({ current_decision: null, decision_locked: false, ante_decision: null })
                            .eq('game_id', gameId);
                          
                          // Game over
                          await supabase
                            .from('games')
                            .update({
                              status: 'game_over',
                              game_over_at: nowIso,
                              pot: 0,
                              awaiting_next_round: false,
                              total_hands: (game.total_hands || 0) + 1,
                              last_round_result: `Winner: ${winner.eval.rank} (server-side)`,
                            })
                            .eq('id', gameId);
                          
                          await supabase
                            .from('rounds')
                            .update({ status: 'completed' })
                            .eq('id', (currentRound as any).id);
                          
                          actionsTaken.push(`Server-side Holm showdown: Single winner with ${winner.eval.rank}, pot ${roundPot} awarded, game over`);
                        } else {
                          // TIE - Split pot and deal Chucky
                          console.log('[ENFORCE] Tie between', winners.length, 'players - dealing Chucky');
                          
                          // Deal Chucky's cards
                          const usedCards = new Set<string>();
                          communityCards.forEach(c => usedCards.add(`${c.suit}-${c.rank}`));
                          (allPlayerCards || []).forEach((pc: any) => {
                            (pc.cards as any[] || []).forEach((c: any) => {
                              usedCards.add(`${(c.suit || c.Suit)}-${String(c.rank || c.Rank).toUpperCase()}`);
                            });
                          });
                          
                          const fullDeck = createDeck();
                          const availableCards = fullDeck.filter(c => !usedCards.has(`${c.suit}-${c.rank}`));
                          const shuffledAvailable = shuffleDeck(availableCards);
                          const chuckyCardCount = game.chucky_cards || 4;
                          const chuckyCards = shuffledAvailable.slice(0, chuckyCardCount);
                          
                          const chuckyAllCards = [...chuckyCards, ...communityCards];
                          const chuckyEval = evaluateHolmHand(chuckyAllCards);
                          
                          // Store Chucky's cards
                          await supabase
                            .from('rounds')
                            .update({
                              chucky_cards: chuckyCards as any,
                              chucky_active: true,
                              chucky_cards_revealed: chuckyCardCount,
                            })
                            .eq('id', (currentRound as any).id);
                          
                          // Check who beats Chucky
                          const beatChucky = winners.filter(w => w.eval.value > chuckyEval.value);
                          const loseToChucky = winners.filter(w => w.eval.value <= chuckyEval.value);
                          
                          if (beatChucky.length > 0) {
                            // Some tied players beat Chucky - game ends
                            const splitAmount = Math.floor(roundPot / beatChucky.length);
                            
                            for (const winner of beatChucky) {
                              await supabase
                                .from('players')
                                .update({ chips: winner.player.chips + splitAmount })
                                .eq('id', winner.player.id);
                            }
                            
                            // Losers to Chucky still pay
                            const potMatchAmount = game.pot_max_enabled
                              ? Math.min(roundPot, game.pot_max_value)
                              : roundPot;
                            
                            for (const loser of loseToChucky) {
                              await supabase
                                .from('players')
                                .update({ chips: loser.player.chips - potMatchAmount })
                                .eq('id', loser.player.id);
                            }
                            
                            // Reset players
                            await supabase
                              .from('players')
                              .update({ current_decision: null, decision_locked: false, ante_decision: null })
                              .eq('game_id', gameId);
                            
                            // Game over
                            await supabase
                              .from('games')
                              .update({
                                status: 'game_over',
                                game_over_at: nowIso,
                                pot: 0,
                                awaiting_next_round: false,
                                total_hands: (game.total_hands || 0) + 1,
                                last_round_result: `Tie resolved: ${beatChucky.length} beat Chucky (server-side)`,
                              })
                              .eq('id', gameId);
                            
                            await supabase
                              .from('rounds')
                              .update({ status: 'completed' })
                              .eq('id', (currentRound as any).id);
                            
                            actionsTaken.push(`Server-side Holm tie: ${beatChucky.length}/${winners.length} beat Chucky, game over`);
                          } else {
                            // All tied players lose to Chucky - pot grows, continue
                            const potMatchAmount = game.pot_max_enabled
                              ? Math.min(roundPot, game.pot_max_value)
                              : roundPot;
                            
                            let totalAdded = 0;
                            for (const loser of loseToChucky) {
                              await supabase
                                .from('players')
                                .update({ chips: loser.player.chips - potMatchAmount })
                                .eq('id', loser.player.id);
                              totalAdded += potMatchAmount;
                            }
                            
                            const newPot = roundPot + totalAdded;
                            
                            await supabase
                              .from('games')
                              .update({
                                pot: newPot,
                                last_round_result: `Chucky beats all tied players!`,
                                awaiting_next_round: true,
                              })
                              .eq('id', gameId);
                            
                            await supabase
                              .from('rounds')
                              .update({ status: 'completed', chucky_active: false })
                              .eq('id', (currentRound as any).id);
                            
                            actionsTaken.push(`Server-side Holm tie: All ${winners.length} lose to Chucky, pot now ${newPot}`);
                          }
                        }
                      }
                    }
                  }
                }
              } else {
                // CRITICAL FIX: Only advance to UNDECIDED players
                // Filter positions to only those who haven't locked their decision yet
                const undecidedPositions = undecidedActivePlayers.map((p: any) => p.position).sort((a: number, b: number) => a - b);

                // Find next undecided position clockwise
                const higherUndecidedPositions = undecidedPositions.filter((p: number) => p > (currentPos as number));
                const nextPosition = higherUndecidedPositions.length > 0
                  ? Math.min(...higherUndecidedPositions)
                  : Math.min(...undecidedPositions);

                if (nextPosition !== currentPos) {
                  // Advance turn to next undecided player
                  const { data: gameDefaults } = await supabase
                    .from('game_defaults')
                    .select('decision_timer_seconds')
                    .eq('game_type', 'holm')
                    .maybeSingle();

                  const timerSeconds = (gameDefaults as any)?.decision_timer_seconds ?? 30;
                  const newDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();

                  await supabase
                    .from('rounds')
                    .update({
                      current_turn_position: nextPosition,
                      decision_deadline: newDeadline
                    })
                    .eq('id', (currentRound as any).id);

                  actionsTaken.push(`Advanced turn from position ${currentPos} to UNDECIDED position ${nextPosition}`);
                }
              }
            }
          }

          // 3-5-7 games: simultaneous decisions - auto-fold ALL undecided players when deadline expires
          else if (game.game_type !== 'holm-game') {
            console.log('[ENFORCE] 3-5-7 decision deadline expired for game', gameId, 'round', currentRound.round_number);

            const { data: players } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId);

            // Find all undecided active players
            const undecidedPlayers = players?.filter((p: any) =>
              p.status === 'active' &&
              !p.sitting_out &&
              !p.decision_locked &&
              p.ante_decision === 'ante_up'
            ) || [];

            console.log('[ENFORCE] 3-5-7 undecided players:', undecidedPlayers.map((p: any) => ({ pos: p.position, isBot: p.is_bot })));

            // Auto-fold all undecided players
            // ATOMIC: Use decision_locked=false guard to prevent race conditions
            // where player's legitimate decision arrives just before timeout
            for (const player of undecidedPlayers) {
              if (player.is_bot) {
                // Bot decision - 50% stay, 50% fold
                const botDecision = Math.random() < 0.5 ? 'stay' : 'fold';
                const { data: botUpdateResult } = await supabase
                  .from('players')
                  .update({ current_decision: botDecision, decision_locked: true })
                  .eq('id', player.id)
                  .eq('decision_locked', false) // Atomic guard
                  .select();

                if (botUpdateResult && botUpdateResult.length > 0) {
                  actionsTaken.push(`3-5-7 Bot timeout: Made decision '${botDecision}' for bot at position ${player.position}`);
                } else {
                  actionsTaken.push(`3-5-7 Bot timeout: Player at position ${player.position} already decided, skipping`);
                }
              } else {
                // Human player - auto-fold AND set auto_fold flag
                const { data: humanUpdateResult } = await supabase
                  .from('players')
                  .update({ current_decision: 'fold', decision_locked: true, auto_fold: true })
                  .eq('id', player.id)
                  .eq('decision_locked', false) // Atomic guard - prevents race condition
                  .select();

                if (humanUpdateResult && humanUpdateResult.length > 0) {
                  actionsTaken.push(`3-5-7 Decision timeout: Auto-folded player at position ${player.position} and set auto_fold=true`);
                } else {
                  actionsTaken.push(`3-5-7 Decision timeout: Player at position ${player.position} already decided, skipping auto-fold`);
                }
              }
            }

            // Check if all active players have made decisions (either they just did via auto-fold above,
            // or they already decided before the deadline expired)
            // FIX: Previously this only ran when undecidedPlayers.length > 0, which caused games to get stuck
            // when all players had already folded before the deadline expired.
            const { data: freshPlayersFor357 } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId);
            
            const activePlayers357 = freshPlayersFor357?.filter((p: any) =>
              p.status === 'active' &&
              !p.sitting_out &&
              p.ante_decision === 'ante_up'
            ) || [];
            
            const allDecisionsLocked = activePlayers357.length > 0 && 
              activePlayers357.every((p: any) => p.decision_locked === true);
            
            console.log('[ENFORCE] 3-5-7 decision check:', {
              undecidedCount: undecidedPlayers.length,
              activeCount: activePlayers357.length,
              allDecisionsLocked,
            });
            
            // Proceed if all decisions are in (regardless of whether we just auto-folded anyone)
            if (allDecisionsLocked && activePlayers357.length >= 1) {
              // Use atomic guard
              const { data: lockResult, error: lockError } = await supabase
                .from('games')
                .update({ all_decisions_in: true })
                .eq('id', gameId)
                .eq('all_decisions_in', false)
                .select();

              // Proceed if we just set all_decisions_in, OR if it was already set but round is still in betting
              // (handles case where previous resolution attempt failed mid-execution)
              const shouldProceedWithResolution = 
                (!lockError && lockResult && lockResult.length > 0) || // Just locked it
                (currentRound.status === 'betting'); // Still in betting - needs resolution
              
              if (shouldProceedWithResolution) {
                await supabase
                  .from('rounds')
                  .update({ status: 'showdown' })
                  .eq('id', (currentRound as any).id)
                  .eq('status', 'betting');

                actionsTaken.push('3-5-7: All players decided - all_decisions_in set to true, round status set to showdown');
                
                // SERVER-SIDE 3-5-7 ROUND COMPLETION
                // When all decisions are in, check if we should resolve server-side (bot-only or all humans auto_fold)
                const { data: fresh357Players } = await supabase
                  .from('players')
                  .select('*')
                  .eq('game_id', gameId);
                
                const fresh357Active = fresh357Players?.filter((p: any) => p.status === 'active' && !p.sitting_out) || [];
                const human357Players = fresh357Active.filter((p: any) => !p.is_bot);
                const isBotOnly357 = human357Players.length === 0;
                const allHumansAutoFold357 = human357Players.length > 0 && 
                  human357Players.every((p: any) => p.auto_fold === true);
                const shouldResolve357ServerSide = isBotOnly357 || allHumansAutoFold357;
                
                console.log('[ENFORCE] 3-5-7 round completion check:', {
                  activePlayers: fresh357Active.length,
                  humanPlayers: human357Players.length,
                  isBotOnly357,
                  allHumansAutoFold357,
                  shouldResolve357ServerSide,
                });
                
                if (shouldResolve357ServerSide) {
                  const stayed357Players = fresh357Active.filter((p: any) => p.current_decision === 'stay');
                  const legsToWin = game.legs_to_win || 3;
                  const roundNumber = currentRound.round_number || 1;
                  const legValue = game.leg_value || 1;
                  const roundPot = currentRound.pot || game.pot || 0;
                  
                  console.log('[ENFORCE] Server-side 3-5-7 resolution:', {
                    stayedCount: stayed357Players.length,
                    roundNumber,
                    roundPot,
                    reason: isBotOnly357 ? 'bot_only' : 'all_humans_auto_fold',
                  });
                  
                  if (stayed357Players.length === 0) {
                    // EVERYONE FOLDED - Apply pussy tax
                    console.log('[ENFORCE] 3-5-7: Everyone folded - applying pussy tax');
                    
                    const pussyTaxEnabled = game.pussy_tax_enabled ?? true;
                    const pussyTaxAmount = pussyTaxEnabled ? (game.pussy_tax_value || 1) : 0;
                    
                    if (pussyTaxAmount > 0) {
                      const playerIds = fresh357Active.map((p: any) => p.id);
                      await supabase.rpc('decrement_player_chips', {
                        player_ids: playerIds,
                        amount: pussyTaxAmount
                      });
                    }
                    
                    const totalTaxCollected = pussyTaxAmount * fresh357Active.length;
                    const newPot = (game.pot || 0) + totalTaxCollected;
                    const nextRoundNum = (roundNumber % 3) + 1;
                    
                    await supabase.from('game_results').insert({
                      game_id: gameId,
                      hand_number: currentRound.hand_number || roundNumber,
                      winner_player_id: null,
                      winner_username: null,
                      pot_won: 0,
                      winning_hand_description: 'Everyone folded - Pussy Tax applied (server-side)',
                      is_chopped: false,
                      player_chip_changes: pussyTaxAmount > 0 ? Object.fromEntries(fresh357Active.map((p: any) => [p.id, -pussyTaxAmount])) : {},
                      game_type: '3-5-7',
                    });
                    
                    await supabase.from('games').update({
                      pot: newPot,
                      last_round_result: pussyTaxAmount > 0 ? 'Pussy Tax!' : 'Everyone folded!',
                      awaiting_next_round: true,
                      next_round_number: nextRoundNum,
                    }).eq('id', gameId);
                    
                    await supabase.from('rounds').update({ status: 'completed' }).eq('id', currentRound.id);
                    
                    actionsTaken.push(`3-5-7 server-side: Everyone folded, pussy tax ${totalTaxCollected} collected, pot now ${newPot}`);
                    
                  } else if (stayed357Players.length === 1) {
                    // SOLO STAY - Player wins a leg
                    const winner = stayed357Players[0];
                    const newLegs = (winner.legs || 0) + 1;
                    const newChips = winner.chips - legValue;
                    
                    console.log('[ENFORCE] 3-5-7: Solo stay - awarding leg to player', winner.id);
                    
                    await supabase.from('players').update({
                      legs: newLegs,
                      chips: newChips,
                    }).eq('id', winner.id);
                    
                    if (newLegs >= legsToWin) {
                      // Player won the game!
                      await supabase.from('games').update({
                        status: 'game_over',
                        game_over_at: nowIso,
                        pot: 0,
                        awaiting_next_round: false,
                        last_round_result: `Winner with ${newLegs} legs!`,
                      }).eq('id', gameId);
                      
                      await supabase.from('rounds').update({ status: 'completed' }).eq('id', currentRound.id);
                      
                      // Reset all players
                      await supabase.from('players').update({
                        current_decision: null,
                        decision_locked: false,
                        ante_decision: null,
                      }).eq('game_id', gameId);
                      
                      actionsTaken.push(`3-5-7 server-side: Solo stay - player won game with ${newLegs} legs!`);
                    } else {
                      // Continue to next round
                      const nextRoundNum = (roundNumber % 3) + 1;
                      
                      await supabase.from('games').update({
                        last_round_result: 'Leg won!',
                        awaiting_next_round: true,
                        next_round_number: nextRoundNum,
                      }).eq('id', gameId);
                      
                      await supabase.from('rounds').update({ status: 'completed' }).eq('id', currentRound.id);
                      
                      actionsTaken.push(`3-5-7 server-side: Solo stay - leg awarded (now has ${newLegs}), next round ${nextRoundNum}`);
                    }
                    
                  } else {
                    // MULTI-STAY SHOWDOWN - Evaluate hands, winner gets pot, no leg awarded
                    console.log('[ENFORCE] 3-5-7: Multi-player showdown with', stayed357Players.length, 'players');
                    
                    // Fetch player cards
                    const { data: allPlayerCards } = await supabase
                      .from('player_cards')
                      .select('*')
                      .eq('round_id', currentRound.id);
                    
                    // Evaluate all stayed players' hands with wild cards
                    const playerHands: Array<{ player: any; eval: { rank: string; value: number }; cards: Card[] }> = [];
                    
                    for (const player of stayed357Players) {
                      const playerCardsRow = allPlayerCards?.find((pc: any) => pc.player_id === player.id);
                      const playerCards: Card[] = (playerCardsRow?.cards as any[] || []).map((c: any) => ({
                        suit: (c.suit || c.Suit) as Card['suit'],
                        rank: String(c.rank || c.Rank).toUpperCase() as Card['rank']
                      }));
                      
                      const handEval = evaluate357Hand(playerCards, roundNumber);
                      playerHands.push({ player, eval: handEval, cards: playerCards });
                    }
                    
                    // Sort by hand value descending
                    playerHands.sort((a, b) => b.eval.value - a.eval.value);
                    
                    const bestValue = playerHands[0].eval.value;
                    const winners = playerHands.filter(ph => ph.eval.value === bestValue);
                    
                    console.log('[ENFORCE] 3-5-7 showdown result:', {
                      winnersCount: winners.length,
                      bestHand: playerHands[0].eval.rank,
                      bestValue,
                    });
                    
                    const nextRoundNum = (roundNumber % 3) + 1;
                    
                    if (winners.length === 1) {
                      // Single winner - award pot
                      const winner = winners[0];
                      
                      await supabase.from('players').update({
                        chips: winner.player.chips + roundPot
                      }).eq('id', winner.player.id);
                      
                      await supabase.from('game_results').insert({
                        game_id: gameId,
                        hand_number: currentRound.hand_number || roundNumber,
                        winner_player_id: winner.player.id,
                        winner_username: winner.player.id,
                        pot_won: roundPot,
                        winning_hand_description: `${winner.eval.rank} (server-side)`,
                        is_chopped: false,
                        player_chip_changes: { [winner.player.id]: roundPot },
                        game_type: '3-5-7',
                      });
                      
                      await supabase.from('games').update({
                        pot: 0,
                        last_round_result: `${winner.eval.rank} wins!`,
                        awaiting_next_round: true,
                        next_round_number: nextRoundNum,
                      }).eq('id', gameId);
                      
                      await supabase.from('rounds').update({ status: 'completed' }).eq('id', currentRound.id);
                      
                      actionsTaken.push(`3-5-7 server-side: ${winner.eval.rank} wins pot of ${roundPot}`);
                      
                    } else {
                      // Tie - chop pot
                      const splitAmount = Math.floor(roundPot / winners.length);
                      const remainder = roundPot % winners.length;
                      
                      const chipChanges: Record<string, number> = {};
                      for (let i = 0; i < winners.length; i++) {
                        const winner = winners[i];
                        const amount = splitAmount + (i === 0 ? remainder : 0);
                        chipChanges[winner.player.id] = amount;
                        
                        await supabase.from('players').update({
                          chips: winner.player.chips + amount
                        }).eq('id', winner.player.id);
                      }
                      
                      await supabase.from('game_results').insert({
                        game_id: gameId,
                        hand_number: currentRound.hand_number || roundNumber,
                        winner_player_id: null,
                        winner_username: null,
                        pot_won: roundPot,
                        winning_hand_description: `Chopped ${winners.length} ways with ${winners[0].eval.rank} (server-side)`,
                        is_chopped: true,
                        player_chip_changes: chipChanges,
                        game_type: '3-5-7',
                      });
                      
                      await supabase.from('games').update({
                        pot: 0,
                        last_round_result: `Chopped! ${winners.length}x ${winners[0].eval.rank}`,
                        awaiting_next_round: true,
                        next_round_number: nextRoundNum,
                      }).eq('id', gameId);
                      
                      await supabase.from('rounds').update({ status: 'completed' }).eq('id', currentRound.id);
                      
                      actionsTaken.push(`3-5-7 server-side: Chopped ${winners.length} ways, ${splitAmount} each`);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // 4. ENFORCE STUCK SHOWDOWN/PROCESSING ROUNDS (Both Holm and 3-5-7 games)
    // If a round is stuck in 'showdown' or 'processing' status for too long,
    // the end-of-round function likely failed mid-execution. Auto-recover by
    // setting awaiting_next_round and allowing progression.
    // CRITICAL: Only trigger if game.awaiting_next_round is FALSE and all_decisions_in is TRUE.
    // If awaiting_next_round is already set, the client is handling progression.
    // If all_decisions_in is false, players are still deciding - not stuck.
    if (game.status === 'in_progress' && 
        game.awaiting_next_round !== true && game.all_decisions_in === true) {
      const { data: stuckRounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .in('status', ['showdown', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1);
      
      const stuckRound = stuckRounds?.[0];
      if (stuckRound) {
        // Use game.updated_at as proxy for when we entered this state (more accurate than round.created_at)
        const gameUpdatedAt = new Date(game.updated_at);
        const stuckDuration = now.getTime() - gameUpdatedAt.getTime();
        
        // Only recover if stuck for more than 15 seconds AND no awaiting_next_round flag
        // Reduced from 45s to 15s for faster recovery - animations complete in <10s
        if (stuckDuration > 15000) {
          console.log('[ENFORCE] ⚠️ Round stuck in', stuckRound.status, 'for', Math.round(stuckDuration/1000), 'seconds (game unchanged) - auto-recovering');
          
          // For 3-5-7 games: Check if a single player stayed (they earn a leg)
          // This handles the case where the client disconnected before awarding the leg
          if (game.game_type === '3-5-7') {
            const { data: players } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId)
              .eq('ante_decision', 'ante_up')
              .eq('sitting_out', false);
            
            const stayedPlayers = players?.filter(p => p.current_decision === 'stay') || [];
            
            if (stayedPlayers.length === 1) {
              // Single stayer wins a leg - award it server-side
              const winner = stayedPlayers[0];
              console.log('[ENFORCE] 3-5-7: Single stayer detected, awarding leg to player', winner.id);
              
              await supabase
                .from('players')
                .update({ legs: (winner.legs || 0) + 1 })
                .eq('id', winner.id);
              
              // Check if they won the game
              const newLegs = (winner.legs || 0) + 1;
              if (newLegs >= game.legs_to_win) {
                console.log('[ENFORCE] 3-5-7: Player reached legs_to_win, transitioning to game_over');
                
                // Transition to game_over
                await supabase
                  .from('games')
                  .update({ 
                    status: 'game_over',
                    game_over_at: new Date().toISOString(),
                    awaiting_next_round: false,
                    all_decisions_in: true,
                  })
                  .eq('id', gameId);
                
                // Mark round as completed
                await supabase
                  .from('rounds')
                  .update({ status: 'completed' })
                  .eq('id', stuckRound.id);
                
                actionsTaken.push(`3-5-7 stuck recovery: Awarded leg to winner, game over (${newLegs} legs)`);
                
                // Return early - don't set awaiting_next_round since game is over
                return new Response(JSON.stringify({
                  success: true,
                  actionsTaken,
                  gameStatus: 'game_over',
                  timestamp: now.toISOString(),
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
              }
              
              actionsTaken.push(`3-5-7 stuck recovery: Awarded leg to single stayer (now has ${newLegs} legs)`);
            }
          }
          
          // Mark round as completed and trigger next round
          await supabase
            .from('rounds')
            .update({ status: 'completed' })
            .eq('id', stuckRound.id);
          
          // Calculate next round number for 3-5-7 (cycles 1->2->3->1)
          const nextRoundNum = game.game_type === '3-5-7' 
            ? (stuckRound.round_number % 3) + 1 
            : (stuckRound.round_number || 1) + 1;
          
          // Set awaiting_next_round to trigger client-side progression
          await supabase
            .from('games')
            .update({ 
              awaiting_next_round: true,
              all_decisions_in: true,
              next_round_number: nextRoundNum,
            })
            .eq('id', gameId);
          
          actionsTaken.push(`Stuck round recovery: Marked ${stuckRound.status} round ${stuckRound.round_number} as completed, set awaiting_next_round for round ${nextRoundNum}`);
        }
      }
    }

    // 4B. ENFORCE POST-ROUND COMPLETION RECOVERY (3-5-7)
    // If a round is already marked completed but the game never transitioned to awaiting_next_round,
    // the session can freeze indefinitely. This can happen if the client disconnects at the wrong time.
    if (
      game.status === 'in_progress' &&
      game.game_type === '3-5-7' &&
      game.awaiting_next_round !== true &&
      game.all_decisions_in === true
    ) {
      const { data: latestRounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
        .limit(1);

      const latestRound = latestRounds?.[0];

      if (latestRound?.status === 'completed') {
        const gameUpdatedAt = new Date(game.updated_at);
        const stuckDuration = now.getTime() - gameUpdatedAt.getTime();

        // Give the client a moment to set awaiting_next_round; if it doesn't, recover.
        if (stuckDuration > 10000) {
          const nextRoundNum = (latestRound.round_number % 3) + 1;

          await supabase
            .from('games')
            .update({
              awaiting_next_round: true,
              next_round_number: nextRoundNum,
              all_decisions_in: true,
            })
            .eq('id', gameId);

          actionsTaken.push(
            `3-5-7 post-round recovery: latest round ${latestRound.round_number} completed but awaiting_next_round missing, set awaiting_next_round for round ${nextRoundNum}`
          );
        }
      }
    }

    // 4C. ENFORCE POST-ROUND COMPLETION RECOVERY (HOLM)
    // Holm games can get stuck with round_status='completed' but awaiting_next_round=false.
    // This happens when endHolmRound errors mid-execution or client disconnects.
    // Unlike 3-5-7, we don't require all_decisions_in=true (it may be false if error occurred early).
    // Instead, check if ALL active (non-sitting-out) players have decision_locked=true.
    const isHolmGame = game.game_type === 'holm-game' || game.game_type === 'holm';
    if (
      game.status === 'in_progress' &&
      isHolmGame &&
      game.awaiting_next_round !== true
    ) {
      const { data: latestRounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
        .limit(1);

      const latestRound = latestRounds?.[0];

      // Check if round is completed (or stuck in processing/showdown for too long)
      if (latestRound && (latestRound.status === 'completed' || latestRound.status === 'showdown' || latestRound.status === 'processing')) {
        // For Holm, verify all active players have made decisions
        const { data: activePlayers } = await supabase
          .from('players')
          .select('id, decision_locked, current_decision, sitting_out')
          .eq('game_id', gameId)
          .eq('sitting_out', false);

        const allDecided = activePlayers?.every(p => p.decision_locked && p.current_decision !== null) ?? false;

        if (allDecided || latestRound.status === 'completed') {
          const gameUpdatedAt = new Date(game.updated_at);
          const stuckDuration = now.getTime() - gameUpdatedAt.getTime();

          // Give client time to handle; if stuck >15s, recover
          if (stuckDuration > 15000) {
            console.log('[ENFORCE] ⚠️ HOLM post-round recovery: round', latestRound.round_number, 'status=', latestRound.status, 'stuck for', Math.round(stuckDuration/1000), 's');

            // Mark round as completed if not already
            if (latestRound.status !== 'completed') {
              await supabase
                .from('rounds')
                .update({ status: 'completed' })
                .eq('id', latestRound.id);
            }

            // Set awaiting_next_round to trigger client-side progression
            // For Holm, next_round_number is just current + 1
            const nextRoundNum = (latestRound.round_number || 1) + 1;

            await supabase
              .from('games')
              .update({
                awaiting_next_round: true,
                all_decisions_in: true,
                next_round_number: nextRoundNum,
              })
              .eq('id', gameId);

            actionsTaken.push(
              `HOLM post-round recovery: round ${latestRound.round_number} (${latestRound.status}) stuck, set awaiting_next_round for hand ${nextRoundNum}`
            );
          }
        }
      }
    }

    // 4D. ENFORCE POST-ROUND COMPLETION RECOVERY (DICE GAMES: HORSES / SHIP CAPTAIN CREW)
    // Dice games rely on the client to start the next hand when awaiting_next_round=true.
    // If the client disconnects after completing a round but before setting awaiting_next_round,
    // the session can freeze indefinitely.
    const isDiceGame = game.game_type === 'horses' || game.game_type === 'ship-captain-crew';
    if (
      game.status === 'in_progress' &&
      isDiceGame &&
      game.awaiting_next_round !== true
    ) {
      const { data: latestRounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: false })
        .limit(1);

      const latestRound = latestRounds?.[0];

      if (latestRound?.status === 'completed') {
        const gameUpdatedAt = new Date(game.updated_at);
        const stuckDuration = now.getTime() - gameUpdatedAt.getTime();

        // Give the client a moment to set awaiting_next_round; if it doesn't, recover.
        if (stuckDuration > 10000) {
          const nextRoundNum = (latestRound.round_number || (game.current_round || 0)) + 1;

          await supabase
            .from('games')
            .update({
              awaiting_next_round: true,
              next_round_number: nextRoundNum,
              all_decisions_in: true,
            })
            .eq('id', gameId);

          actionsTaken.push(
            `DICE post-round recovery: latest round ${latestRound.round_number} completed but awaiting_next_round missing, set awaiting_next_round for hand ${nextRoundNum}`
          );
        }
      }
      
      // 4E. PER-TURN DICE DEADLINE ENFORCEMENT
      // When a specific player's turn deadline expires OR they have auto_fold=true (auto-roll),
      // complete that player's turn server-side and advance to the next player.
      // This handles individual player timeouts without requiring all humans to be auto_fold.
      if (latestRound && latestRound.status === 'betting' && latestRound.horses_state) {
        const horsesState = latestRound.horses_state as any;
        
        // Get all players for this game
        const { data: dicePlayers } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        const activeDicePlayers = dicePlayers?.filter((p: any) => !p.sitting_out) || [];
        
        // Check if current turn player needs auto-roll enforcement
        if (horsesState.gamePhase === 'playing' && horsesState.currentTurnPlayerId) {
          const currentTurnPlayerId = horsesState.currentTurnPlayerId;
          const currentTurnPlayer = dicePlayers?.find((p: any) => p.id === currentTurnPlayerId);
          const turnDeadline = horsesState.turnDeadline ? new Date(horsesState.turnDeadline) : null;
          const turnExpired = turnDeadline && now > turnDeadline;
          
          // Auto-roll conditions:
          // 1. Player is a bot (always auto-complete after deadline)
          // 2. Player has auto_fold=true (auto-roll mode)
          // 3. Turn deadline has expired (enforce timeout)
          const isBot = currentTurnPlayer?.is_bot === true;
          const isAutoRoll = currentTurnPlayer?.auto_fold === true;
          const shouldAutoCompleteTurn = isBot || isAutoRoll || turnExpired;
          
          if (shouldAutoCompleteTurn) {
            const playerState = horsesState.playerStates?.[currentTurnPlayerId];
            
            // Only complete if the player hasn't already completed their turn
            if (playerState && !playerState.isComplete) {
              console.log('[ENFORCE] 🎲 Auto-rolling dice for player:', {
                playerId: currentTurnPlayerId,
                reason: isBot ? 'bot' : isAutoRoll ? 'auto_roll' : 'turn_expired',
                rollsRemaining: playerState.rollsRemaining,
              });
              
              // Complete this player's turn
              let dice = playerState.dice || [];
              const rollsRemaining = playerState.rollsRemaining || 0;
              
              if (rollsRemaining > 0) {
                if (game.game_type === 'horses') {
                  dice = completeHorsesHand(dice, rollsRemaining);
                } else if (game.game_type === 'ship-captain-crew') {
                  dice = completeSCCHand(dice, rollsRemaining);
                }
              } else {
                // Mark all dice as held if no rolls remaining
                dice = dice.map((d: any) => ({ ...d, isHeld: true }));
              }
              
              // Evaluate the completed hand
              let result: any;
              if (game.game_type === 'horses') {
                result = evaluateHorsesHand(dice);
              } else if (game.game_type === 'ship-captain-crew') {
                result = evaluateSCCHand(dice);
              }
              
              // Update player state
              const updatedPlayerStates = {
                ...horsesState.playerStates,
                [currentTurnPlayerId]: {
                  ...playerState,
                  dice,
                  rollsRemaining: 0,
                  isComplete: true,
                  result,
                },
              };
              
              // Find next incomplete player in turn order
              const turnOrder: string[] = horsesState.turnOrder || [];
              const currentIndex = turnOrder.indexOf(currentTurnPlayerId);
              let nextTurnPlayerId: string | null = null;
              
              for (let i = 1; i <= turnOrder.length; i++) {
                const nextIdx = (currentIndex + i) % turnOrder.length;
                const nextId = turnOrder[nextIdx];
                if (!updatedPlayerStates[nextId]?.isComplete) {
                  nextTurnPlayerId = nextId;
                  break;
                }
              }
              
              // Check if all turns are now complete
              const allTurnsComplete = turnOrder.every(pid => updatedPlayerStates[pid]?.isComplete);
              
              if (allTurnsComplete) {
                // All done - transition to complete phase
                console.log('[ENFORCE] 🎲 All dice turns complete after auto-roll');
                
                const completedState = {
                  ...horsesState,
                  playerStates: updatedPlayerStates,
                  gamePhase: 'complete',
                  currentTurnPlayerId: null,
                  turnDeadline: null,
                };
                
                await supabase
                  .from('rounds')
                  .update({ horses_state: completedState })
                  .eq('id', latestRound.id);
                
                actionsTaken.push(`Dice auto-roll: Completed turn for ${currentTurnPlayerId}, all turns done`);
              } else if (nextTurnPlayerId) {
                // Advance to next player with fresh deadline
                const nextPlayer = dicePlayers?.find((p: any) => p.id === nextTurnPlayerId);
                const nextIsBot = nextPlayer?.is_bot === true;
                const nextIsAutoRoll = nextPlayer?.auto_fold === true;
                
                // Set deadline: 30 seconds for humans, 5 seconds for bots/auto-roll
                const deadlineSecs = (nextIsBot || nextIsAutoRoll) ? 5 : 30;
                const newDeadline = new Date(now.getTime() + deadlineSecs * 1000).toISOString();
                
                const advancedState = {
                  ...horsesState,
                  playerStates: updatedPlayerStates,
                  currentTurnPlayerId: nextTurnPlayerId,
                  turnDeadline: newDeadline,
                };
                
                await supabase
                  .from('rounds')
                  .update({ horses_state: advancedState })
                  .eq('id', latestRound.id);
                
                actionsTaken.push(`Dice auto-roll: Completed turn for ${currentTurnPlayerId}, advancing to ${nextTurnPlayerId}`);
              }
            }
          }
        }
        
        // Continue to full resolution check below
        const humanDicePlayers = activeDicePlayers.filter((p: any) => !p.is_bot);
        const isBotOnlyDiceGame = humanDicePlayers.length === 0;
        const allHumansAutoFoldDice = humanDicePlayers.length > 0 && 
          humanDicePlayers.every((p: any) => p.auto_fold === true);
        const shouldResolveDiceServerSide = isBotOnlyDiceGame || allHumansAutoFoldDice;
        
        console.log('[ENFORCE] Dice game server-side check:', {
          gameType: game.game_type,
          gamePhase: horsesState.gamePhase,
          humanPlayers: humanDicePlayers.length,
          isBotOnly: isBotOnlyDiceGame,
          allHumansAutoFold: allHumansAutoFoldDice,
          shouldResolve: shouldResolveDiceServerSide,
        });
        
        if (shouldResolveDiceServerSide && horsesState.gamePhase === 'playing') {
          // Check if turn deadline has expired OR if current turn player needs resolution
          const turnDeadline = horsesState.turnDeadline ? new Date(horsesState.turnDeadline) : null;
          const turnExpired = turnDeadline && now > turnDeadline;
          
          // If no deadline set but we need server-side resolution, process anyway
          if (turnExpired || !turnDeadline) {
            console.log('[ENFORCE] 🎲 Server-side dice game resolution starting', {
              reason: isBotOnlyDiceGame ? 'bot_only' : 'all_humans_auto_fold',
              turnExpired,
              currentTurnPlayerId: horsesState.currentTurnPlayerId,
            });
            
            // Complete all player turns server-side
            const turnOrder: string[] = horsesState.turnOrder || [];
            const playerStates: Record<string, any> = { ...horsesState.playerStates };
            let allTurnsComplete = true;
            
            // Process each player's turn
            for (const playerId of turnOrder) {
              const playerState = playerStates[playerId];
              if (!playerState) continue;
              
              // If player hasn't completed their turn, complete it server-side
              if (!playerState.isComplete) {
                allTurnsComplete = false;
                
                // Roll remaining dice for this player
                let dice = playerState.dice || [];
                const rollsRemaining = playerState.rollsRemaining || 0;
                
                if (game.game_type === 'horses') {
                  dice = completeHorsesHand(dice, rollsRemaining);
                } else if (game.game_type === 'ship-captain-crew') {
                  dice = completeSCCHand(dice, rollsRemaining);
                }
                
                playerStates[playerId] = {
                  ...playerState,
                  dice,
                  rollsRemaining: 0,
                  isComplete: true,
                };
                
                actionsTaken.push(`Dice server-side: Completed turn for player ${playerId}`);
              }
            }
            
            // Check if all turns are now complete
            const allComplete = Object.values(playerStates).every((ps: any) => ps.isComplete);
            
            if (allComplete) {
              console.log('[ENFORCE] All dice game turns complete, evaluating hands');
              
              // Evaluate all hands and determine winner
              const evaluatedHands: Array<{ playerId: string; result: any }> = [];
              
              for (const playerId of turnOrder) {
                const playerState = playerStates[playerId];
                if (!playerState?.dice) continue;
                
                let result: any;
                if (game.game_type === 'horses') {
                  result = evaluateHorsesHand(playerState.dice);
                } else if (game.game_type === 'ship-captain-crew') {
                  result = evaluateSCCHand(playerState.dice);
                }
                
                if (result) {
                  evaluatedHands.push({ playerId, result });
                }
              }
              
              console.log('[ENFORCE] Evaluated dice hands:', evaluatedHands.map(h => ({ 
                playerId: h.playerId, 
                rank: h.result.rank, 
                desc: h.result.description 
              })));
              
              // Find winners (highest rank, or NQ handling for SCC)
              let maxRank = -1;
              const winnerIds: string[] = [];
              
              for (const hand of evaluatedHands) {
                if (hand.result.rank > maxRank) {
                  maxRank = hand.result.rank;
                  winnerIds.length = 0;
                  winnerIds.push(hand.playerId);
                } else if (hand.result.rank === maxRank) {
                  winnerIds.push(hand.playerId);
                }
              }
              
              const roundPot = latestRound.pot || game.pot || 0;
              const isTie = winnerIds.length > 1 || 
                (game.game_type === 'ship-captain-crew' && evaluatedHands.every(h => !h.result.isQualified));
              
              console.log('[ENFORCE] Dice game result:', {
                winnerIds,
                isTie,
                roundPot,
                maxRank,
              });
              
              // Update horses_state with completion
              const completedState = {
                ...horsesState,
                playerStates,
                gamePhase: 'complete',
              };
              
              await supabase
                .from('rounds')
                .update({ 
                  horses_state: completedState,
                  status: 'completed',
                })
                .eq('id', latestRound.id);
              
              if (isTie) {
                // Tie - set awaiting_next_round for re-ante
                await supabase
                  .from('games')
                  .update({
                    awaiting_next_round: true,
                    last_round_result: 'One tie all tie - rollover',
                    all_decisions_in: true,
                  })
                  .eq('id', gameId);
                
                actionsTaken.push(`Dice server-side: Tie detected, set awaiting_next_round for re-ante`);
              } else if (winnerIds.length === 1) {
                // Single winner - award pot
                const winnerId = winnerIds[0];
                const winnerPlayer = activeDicePlayers.find((p: any) => p.id === winnerId);
                const winnerHand = evaluatedHands.find(h => h.playerId === winnerId);
                
                if (winnerPlayer) {
                  // Award pot to winner
                  await supabase
                    .from('players')
                    .update({ chips: winnerPlayer.chips + roundPot })
                    .eq('id', winnerId);
                  
                  // Record game result
                  const playerChipChanges: Record<string, number> = { [winnerId]: roundPot };
                  await supabase.from('game_results').insert({
                    game_id: gameId,
                    hand_number: latestRound.hand_number || game.total_hands || 1,
                    winner_player_id: winnerId,
                    winner_username: winnerId,
                    pot_won: roundPot,
                    winning_hand_description: `${winnerHand?.result?.description || 'Winner'} (server-side)`,
                    is_chopped: false,
                    player_chip_changes: playerChipChanges,
                    game_type: game.game_type,
                  });
                  
                  // Set game_over
                  await supabase
                    .from('games')
                    .update({
                      status: 'game_over',
                      game_over_at: nowIso,
                      pot: 0,
                      awaiting_next_round: false,
                      last_round_result: winnerHand?.result?.description || 'Winner!',
                    })
                    .eq('id', gameId);
                  
                  actionsTaken.push(`Dice server-side: Winner ${winnerId} awarded ${roundPot} chips with ${winnerHand?.result?.description}`);
                }
              }
            } else {
              // Not all complete yet - update the horses_state with progress
              // and advance to next incomplete player
              const nextIncompletePlayer = turnOrder.find(pid => !playerStates[pid]?.isComplete);
              
              const updatedState = {
                ...horsesState,
                playerStates,
                currentTurnPlayerId: nextIncompletePlayer || horsesState.currentTurnPlayerId,
                turnDeadline: null, // Clear deadline for server-side resolution
              };
              
              await supabase
                .from('rounds')
                .update({ horses_state: updatedState })
                .eq('id', latestRound.id);
              
              actionsTaken.push(`Dice server-side: Advanced state, next player ${nextIncompletePlayer}`);
            }
          }
        }
      }
    }

    // 5. ENFORCE AWAITING_NEXT_ROUND TIMEOUT (stuck game watchdog)
    // If a game has been stuck in awaiting_next_round=true for too long (>10 seconds),
    // it means client-side proceedToNextRound never fired. Auto-proceed server-side.
    // NOTE: We no longer require next_round_number to be set - the round can be inferred from current_round.
    if (game.status === 'in_progress' && game.awaiting_next_round === true) {
      // Check how long the game has been in this state by looking at updated_at
      const gameUpdatedAt = new Date(game.updated_at);
      const stuckDuration = now.getTime() - gameUpdatedAt.getTime();
      
      // If stuck for more than 10 seconds (giving client 4s + buffer)
      if (stuckDuration > 10000) {
        console.log('[ENFORCE] ⚠️ Game stuck in awaiting_next_round for', Math.round(stuckDuration/1000), 'seconds - auto-proceeding', {
          gameId,
          pending_session_end: game.pending_session_end,
          next_round_number: game.next_round_number,
          current_round: game.current_round,
        });
        
        // CRITICAL: If pending_session_end is true, END THE SESSION instead of starting a new round
        if (game.pending_session_end) {
          console.log('[ENFORCE] pending_session_end=true, ending session instead of starting next round');
          
          await supabase
            .from('games')
            .update({
              status: 'session_ended',
              session_ended_at: game.session_ended_at ?? nowIso,
              pending_session_end: false,
              awaiting_next_round: false,
              next_round_number: null,
              game_over_at: nowIso,
              config_deadline: null,
              ante_decision_deadline: null,
              config_complete: false,
            })
            .eq('id', gameId);
          
          actionsTaken.push('awaiting_next_round watchdog: pending_session_end=true → session ended');
          
          return new Response(JSON.stringify({
            success: true,
            actionsTaken,
            gameStatus: 'session_ended',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Clear result and reset awaiting flag atomically (same as client-side proceedToNextRound)
        const { data: updateResult, error: updateError } = await supabase
          .from('games')
          .update({ 
            awaiting_next_round: false,
            next_round_number: null,
            last_round_result: null,
            all_decisions_in: false, // Reset for next round
          })
          .eq('id', gameId)
          .eq('awaiting_next_round', true)  // Only update if still awaiting (atomic guard)
          .select();
        
        if (updateError || !updateResult || updateResult.length === 0) {
          console.log('[ENFORCE] awaiting_next_round already cleared by another process');
          actionsTaken.push('awaiting_next_round watchdog: Another process already handled it');
        } else {
          // Use next_round_number if set, otherwise infer from current_round
          const nextRoundNum = game.next_round_number || ((game.current_round || 0) + 1);
          console.log('[ENFORCE] Cleared awaiting state, now starting round', nextRoundNum);
          
          // Get fresh player data for starting the round
          const { data: freshPlayers } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId);
          
          const isHolmGame = game.game_type === 'holm-game';
          const isDiceGame = game.game_type === 'horses' || game.game_type === 'ship-captain-crew';
          
          // For dice games: Start a new round server-side when awaiting_next_round
          // This enables full server-side resolution when all humans are auto_fold
          if (isDiceGame) {
            console.log('[ENFORCE] Dice game awaiting_next_round - starting new round server-side', {
              gameId,
              gameType: game.game_type,
            });
            
            // Get active players (not sitting out)
            const activeDicePlayers = freshPlayers?.filter((p: any) => 
              !p.sitting_out
            ) || [];
            
            if (activeDicePlayers.length >= 2) {
              const newHandNumber = (game.total_hands || 0) + 1;
              
              // Build initial horses_state for the new round
              const sortedActive = [...activeDicePlayers].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
              const dealerPos = game.dealer_position as number | null;
              const dealerIdx = dealerPos ? sortedActive.findIndex((p: any) => p.position === dealerPos) : -1;
              const turnOrder = dealerIdx >= 0
                ? Array.from({ length: sortedActive.length }, (_, i) => sortedActive[(dealerIdx + i + 1) % sortedActive.length].id)
                : sortedActive.map((p: any) => p.id);
              
              const firstTurnPlayer = sortedActive.find((p: any) => p.id === turnOrder[0]) ?? null;
              
              // Initial dice state (different for Horses vs SCC)
              const initialDice = game.game_type === 'ship-captain-crew'
                ? [
                    { value: 0, isHeld: false, isSCC: false },
                    { value: 0, isHeld: false, isSCC: false },
                    { value: 0, isHeld: false, isSCC: false },
                    { value: 0, isHeld: false, isSCC: false },
                    { value: 0, isHeld: false, isSCC: false },
                  ]
                : [
                    { value: 0, isHeld: false },
                    { value: 0, isHeld: false },
                    { value: 0, isHeld: false },
                    { value: 0, isHeld: false },
                    { value: 0, isHeld: false },
                  ];
              
              const initialState: any = {
                currentTurnPlayerId: turnOrder[0] ?? null,
                playerStates: Object.fromEntries(
                  turnOrder.map((pid: string) => [
                    pid,
                    { dice: initialDice, rollsRemaining: 3, isComplete: false },
                  ]),
                ),
                gamePhase: 'playing',
                turnOrder,
                botControllerUserId: null,
                turnDeadline: firstTurnPlayer?.is_bot
                  ? null
                  : new Date(Date.now() + 30_000).toISOString(),
              };
              
              // Calculate pot for new round (re-ante)
              const anteAmount = game.ante_amount || 2;
              const newAnteTotal = activeDicePlayers.length * anteAmount;
              const potForRound = (game.pot || 0) + newAnteTotal;
              
              // Clean up any existing round
              const { data: existingDiceRound } = await supabase
                .from('rounds')
                .select('id')
                .eq('game_id', gameId)
                .eq('round_number', nextRoundNum)
                .maybeSingle();
              
              if (existingDiceRound?.id) {
                await supabase.from('player_cards').delete().eq('round_id', existingDiceRound.id);
                await supabase.from('player_actions').delete().eq('round_id', existingDiceRound.id);
                await supabase.from('rounds').delete().eq('id', existingDiceRound.id);
              }
              
              // Create the round
              const { data: newDiceRound, error: diceRoundError } = await supabase
                .from('rounds')
                .insert({
                  game_id: gameId,
                  round_number: nextRoundNum,
                  hand_number: newHandNumber,
                  cards_dealt: 2, // Constraint requires >= 2
                  status: 'betting',
                  pot: potForRound,
                  horses_state: initialState,
                })
                .select()
                .single();
              
              if (diceRoundError || !newDiceRound) {
                console.error('[ENFORCE] Failed to create dice round:', diceRoundError);
                actionsTaken.push(`awaiting_next_round watchdog: Failed to create dice round ${nextRoundNum}`);
              } else {
                // Collect antes
                if (anteAmount > 0) {
                  const playerIds = activeDicePlayers.map((p: any) => p.id);
                  await supabase.rpc('decrement_player_chips', {
                    player_ids: playerIds,
                    amount: anteAmount,
                  });
                }
                
                // Update game state
                await supabase
                  .from('games')
                  .update({
                    status: 'in_progress',
                    current_round: nextRoundNum,
                    total_hands: newHandNumber,
                    pot: potForRound,
                    all_decisions_in: false,
                    last_round_result: null,
                    game_over_at: null,
                    is_first_hand: false,
                    config_deadline: null,
                    ante_decision_deadline: null,
                  })
                  .eq('id', gameId);
                
                actionsTaken.push(`awaiting_next_round watchdog: Started ${game.game_type} round ${nextRoundNum} (hand #${newHandNumber}) with ${activeDicePlayers.length} players`);
                console.log('[ENFORCE] ✅ Successfully started dice round server-side:', {
                  gameId,
                  gameType: game.game_type,
                  roundNumber: nextRoundNum,
                  handNumber: newHandNumber,
                  playerCount: activeDicePlayers.length,
                });
              }
            } else {
              // Not enough players
              await supabase
                .from('games')
                .update({
                  status: 'waiting_for_players',
                  awaiting_next_round: false,
                  next_round_number: null
                })
                .eq('id', gameId);
              actionsTaken.push(`awaiting_next_round watchdog: Not enough ${game.game_type} players, returning to waiting`);
            }
          } else if (isHolmGame) {
            // For Holm games: Start the round server-side (just like we do for 3-5-7)
            // This ensures the game progresses even when no clients are connected
            
            // Get active players (not sitting out)
            const activePlayers = freshPlayers?.filter((p: any) => 
              p.status === 'active' && !p.sitting_out
            ) || [];
            
            if (activePlayers.length >= 2) {
              // Get game defaults for timer
              const { data: holmDefaults } = await supabase
                .from('game_defaults')
                .select('decision_timer_seconds')
                .eq('game_type', 'holm')
                .maybeSingle();
              
              const timerSeconds = (holmDefaults as any)?.decision_timer_seconds ?? 30;
              const decisionDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();
              
              // Calculate buck position - rotate clockwise from current position
              const occupiedPositions = activePlayers.map((p: any) => p.position).sort((a: number, b: number) => a - b);
              let buckPosition = game.buck_position || occupiedPositions[0];
              
              // Rotate buck clockwise for next hand
              const currentBuckIndex = occupiedPositions.indexOf(buckPosition);
              if (currentBuckIndex !== -1) {
                const nextBuckIndex = (currentBuckIndex + 1) % occupiedPositions.length;
                buckPosition = occupiedPositions[nextBuckIndex];
              }
              
              // Clean up any existing round with same round_number
              const { data: existingHolmRound } = await supabase
                .from('rounds')
                .select('id')
                .eq('game_id', gameId)
                .eq('round_number', nextRoundNum)
                .maybeSingle();
              
              if (existingHolmRound?.id) {
                await supabase.from('player_cards').delete().eq('round_id', existingHolmRound.id);
                await supabase.from('player_actions').delete().eq('round_id', existingHolmRound.id);
                await supabase.from('rounds').delete().eq('id', existingHolmRound.id);
              }
              
              // Deal cards
              const deck = shuffleDeck(createDeck());
              let cardIndex = 0;
              
              // Deal 4 community cards
              const communityCards = [
                deck[cardIndex++],
                deck[cardIndex++],
                deck[cardIndex++],
                deck[cardIndex++]
              ];
              
              // Get total_hands for hand_number
              const handNumber = (game.total_hands || 0) + 1;
              
              // Create the round
              const { data: newRound, error: holmRoundError } = await supabase
                .from('rounds')
                .insert({
                  game_id: gameId,
                  round_number: nextRoundNum,
                  cards_dealt: 4,
                  pot: game.pot || 0,
                  status: 'betting',
                  decision_deadline: decisionDeadline,
                  community_cards: communityCards,
                  community_cards_revealed: 2,
                  chucky_active: false,
                  current_turn_position: buckPosition,
                  hand_number: handNumber
                })
                .select()
                .single();
              
              if (holmRoundError || !newRound) {
                console.error('[ENFORCE] Failed to create Holm round:', holmRoundError);
                actionsTaken.push(`awaiting_next_round watchdog: Failed to create Holm round ${nextRoundNum}`);
              } else {
                // Deal 4 cards to each player
                for (const player of activePlayers) {
                  const playerCards = [
                    deck[cardIndex++],
                    deck[cardIndex++],
                    deck[cardIndex++],
                    deck[cardIndex++]
                  ];
                  
                  await supabase
                    .from('player_cards')
                    .insert({
                      player_id: player.id,
                      round_id: newRound.id,
                      cards: playerCards
                    });
                }
                
                // Reset player decisions
                await supabase
                  .from('players')
                  .update({ current_decision: null, decision_locked: false })
                  .eq('game_id', gameId);
                
                // Update game state
                await supabase
                  .from('games')
                  .update({
                    current_round: nextRoundNum,
                    buck_position: buckPosition,
                    all_decisions_in: false,
                    last_round_result: null,
                    is_first_hand: false,
                    total_hands: handNumber
                  })
                  .eq('id', gameId);
                
                actionsTaken.push(`awaiting_next_round watchdog: Started Holm round ${nextRoundNum} (hand #${handNumber}) with ${activePlayers.length} players, buck at position ${buckPosition}`);
                console.log('[ENFORCE] ✅ Successfully started Holm round server-side:', {
                  gameId,
                  roundNumber: nextRoundNum,
                  handNumber,
                  buckPosition,
                  playerCount: activePlayers.length
                });
              }
            } else {
              // Not enough players - return to waiting state
              await supabase
                .from('games')
                .update({
                  status: 'waiting_for_players',
                  awaiting_next_round: false,
                  next_round_number: null
                })
                .eq('id', gameId);
              actionsTaken.push('awaiting_next_round watchdog: Not enough Holm players, returning to waiting');
            }
          } else {
            // For 3-5-7: Start the round directly server-side
            // This matches what client's proceedToNextRound -> startRound does
            
            // Get active players (anted up and not sitting out)
            const activePlayers = freshPlayers?.filter(p => 
              p.ante_decision === 'ante_up' && !p.sitting_out
            ) || [];
            
            if (activePlayers.length >= 2) {
              // Get game defaults for timer
              const { data: gameDefaults } = await supabase
                .from('game_defaults')
                .select('decision_timer_seconds')
                .eq('game_type', '3-5-7')
                .maybeSingle();
              
              const timerSeconds = gameDefaults?.decision_timer_seconds ?? 30;
              const decisionDeadline = new Date(Date.now() + timerSeconds * 1000).toISOString();
              
              // Create the round
              const cardsForRound = nextRoundNum === 1 ? 3 : nextRoundNum === 2 ? 5 : 7;

              // IMPORTANT: rounds has a unique constraint on (game_id, round_number).
              // Before inserting, delete any existing round with the same round_number.
              // Without this, the watchdog can error and the game will appear "frozen".
              const { data: existingRound } = await supabase
                .from('rounds')
                .select('id')
                .eq('game_id', gameId)
                .eq('round_number', nextRoundNum)
                .maybeSingle();

              if (existingRound?.id) {
                await supabase.from('player_cards').delete().eq('round_id', existingRound.id);
                await supabase.from('player_actions').delete().eq('round_id', existingRound.id);
                await supabase.from('rounds').delete().eq('id', existingRound.id);
              }

              const { error: roundInsertError } = await supabase
                .from('rounds')
                .insert({
                  game_id: gameId,
                  round_number: nextRoundNum,
                  cards_dealt: cardsForRound,
                  pot: game.pot || 0,
                  status: 'betting',
                  decision_deadline: decisionDeadline,
                });

              if (roundInsertError) {
                console.error('[ENFORCE] Failed to insert watchdog round:', {
                  gameId,
                  nextRoundNum,
                  error: roundInsertError,
                });
                actionsTaken.push(`awaiting_next_round watchdog: Failed to insert round ${nextRoundNum} (${roundInsertError.message})`);
              } else {
                // Update game current_round
                await supabase
                  .from('games')
                  .update({ current_round: nextRoundNum })
                  .eq('id', gameId);
              }
              
              // Reset player decisions for new round
              await supabase
                .from('players')
                .update({ current_decision: null, decision_locked: false })
                .eq('game_id', gameId)
                .eq('ante_decision', 'ante_up');
              
              // Deal cards (simplified - just create records, client will fetch)
              // Note: For a more complete implementation, we'd generate cards here
              // For now, let client-side logic handle card generation on next fetch
              
              actionsTaken.push(`awaiting_next_round watchdog: Started 3-5-7 round ${nextRoundNum} with ${activePlayers.length} players`);
            } else {
              actionsTaken.push('awaiting_next_round watchdog: Not enough players to start round');
            }
          }
        }
      } else {
        console.log('[ENFORCE] Game awaiting_next_round for', Math.round(stuckDuration/1000), 's (waiting for client, threshold: 10s)');
      }
    }

    // 6. ENFORCE GAME OVER COUNTDOWN (session ending after game)
    // If game_over countdown expires with no client handling it, we need to:
    // 1. Evaluate player states (mark auto_fold players as sitting_out)
    // 2. Check if session should end (no active humans or no eligible dealers)
    // 3. Or rotate dealer and start next hand
    if (game.status === 'game_over' && game.game_over_at) {
      const gameOverAt = new Date(game.game_over_at);
      const gameOverDeadline = new Date(gameOverAt.getTime() + 8000); // 8 seconds countdown
      const staleThreshold = new Date(gameOverAt.getTime() + 15000); // 15 seconds = definitely stale, no client handling it

      // If this was the LAST HAND (pending_session_end=true), the session must be ended after the countdown.
      // Previously we skipped all server-side progression when pending_session_end was set, which could leave
      // sessions stuck in game_over forever when no client was connected.
      if (now > gameOverDeadline && game.pending_session_end) {
        console.log('[ENFORCE] game_over countdown expired with pending_session_end=true; ending session server-side', {
          gameId,
          sessionEndedAt: game.session_ended_at,
        });

        await supabase
          .from('games')
          .update({
            status: 'session_ended',
            session_ended_at: game.session_ended_at ?? nowIso,
            pending_session_end: false,
            game_over_at: nowIso,
            // Clear stale deadlines so clients don't show old timers on rejoin
            config_deadline: null,
            ante_decision_deadline: null,
            config_complete: false,
            awaiting_next_round: false,
          })
          .eq('id', gameId);

        actionsTaken.push('game_over: pending_session_end expired → session ended');
      } else if (now > staleThreshold) {
        // No client handled progression - enforce server-side
        console.log('[ENFORCE] Game over is STALE (>15s), no client handled progression - enforcing server-side for game', gameId);

        // Fetch all players for state evaluation
        const { data: allPlayers, error: playersError } = await supabase
          .from('players')
          .select('id, user_id, position, sitting_out, waiting, stand_up_next_hand, sit_out_next_hand, is_bot, auto_fold, status')
          .eq('game_id', gameId)
          .order('position');

        if (playersError || !allPlayers) {
          console.error('[ENFORCE] Failed to fetch players for game_over evaluation:', playersError);
          actionsTaken.push('game_over stale: Failed to fetch players');
        } else {
          // STEP 1: Evaluate player states (mark auto_fold, sit_out_next_hand, stand_up_next_hand)
          console.log('[ENFORCE] Evaluating player states for stale game_over');

          for (const player of allPlayers) {
            // stand_up_next_hand → delete bots, mark humans sitting_out
            if (player.stand_up_next_hand) {
              if (player.is_bot) {
                await supabase.from('players').delete().eq('id', player.id);
                console.log('[ENFORCE] Deleted bot with stand_up_next_hand:', player.id);
              } else {
                await supabase
                  .from('players')
                  .update({
                    sitting_out: true,
                    stand_up_next_hand: false,
                    waiting: false,
                  })
                  .eq('id', player.id);
                console.log('[ENFORCE] Marked human sitting_out (stand_up_next_hand):', player.id);
              }
              continue;
            }

            // sit_out_next_hand → sitting_out
            if (player.sit_out_next_hand) {
              await supabase
                .from('players')
                .update({
                  sitting_out: true,
                  sit_out_next_hand: false,
                  waiting: false,
                })
                .eq('id', player.id);
              console.log('[ENFORCE] Marked player sitting_out (sit_out_next_hand):', player.id);
              continue;
            }

            // auto_fold → sitting_out (player timed out during game)
            if (player.auto_fold) {
              await supabase
                .from('players')
                .update({
                  sitting_out: true,
                  waiting: false,
                })
                .eq('id', player.id);
              console.log('[ENFORCE] Marked player sitting_out (auto_fold timeout):', player.id);
              continue;
            }

            // waiting → active
            if (player.waiting && !player.sitting_out) {
              await supabase
                .from('players')
                .update({
                  sitting_out: false,
                  waiting: false,
                })
                .eq('id', player.id);
              console.log('[ENFORCE] Activated waiting player:', player.id);
            }
          }

          // STEP 2: Re-fetch players to count active/eligible
          const { data: freshPlayers } = await supabase
            .from('players')
            .select('id, sitting_out, is_bot, status, position')
            .eq('game_id', gameId);

          const activeHumans = (freshPlayers || []).filter((p: any) => !p.sitting_out && p.status !== 'observer' && !p.is_bot);

          // Fetch allow_bot_dealers setting
          const { data: gameDefaults } = await supabase
            .from('game_defaults')
            .select('allow_bot_dealers')
            .eq('game_type', 'holm')
            .maybeSingle();

          const allowBotDealers = (gameDefaults as any)?.allow_bot_dealers ?? false;

          const eligibleDealers = (freshPlayers || []).filter((p: any) =>
            !p.sitting_out && p.status !== 'observer' && (allowBotDealers || !p.is_bot) && p.position !== null
          );

          console.log('[ENFORCE] After evaluation - activeHumans:', activeHumans.length, 'eligibleDealers:', eligibleDealers.length);

          // STEP 3: Decide what to do
          if (activeHumans.length === 0) {
            // No active human players - end session
            console.log('[ENFORCE] No active humans after game_over, ending session');

            // Check if any hands were played
            const { data: gameData } = await supabase
              .from('games')
              .select('total_hands')
              .eq('id', gameId)
              .single();

            const totalHands = gameData?.total_hands || 0;

            const { count: resultsCount } = await supabase
              .from('game_results')
              .select('id', { count: 'exact', head: true })
              .eq('game_id', gameId);

            const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;

            if (hasHistory) {
              await supabase
                .from('games')
                .update({
                  status: 'session_ended',
                  session_ended_at: nowIso,
                  pending_session_end: false,
                  game_over_at: nowIso,
                  config_deadline: null,
                  ante_decision_deadline: null,
                  config_complete: false,
                  awaiting_next_round: false,
                })
                .eq('id', gameId);
              actionsTaken.push('game_over stale: No active humans, session ended');
            } else {
              // Delete empty session
              const { data: roundRows } = await supabase.from('rounds').select('id').eq('game_id', gameId);
              const roundIds = (roundRows ?? []).map((r: any) => r.id);
              if (roundIds.length > 0) {
                await supabase.from('player_cards').delete().in('round_id', roundIds);
                await supabase.from('player_actions').delete().in('round_id', roundIds);
              }
              await supabase.from('chip_stack_emoticons').delete().eq('game_id', gameId);
              await supabase.from('chat_messages').delete().eq('game_id', gameId);
              await supabase.from('rounds').delete().eq('game_id', gameId);
              await supabase.from('players').delete().eq('game_id', gameId);
              await supabase.from('games').delete().eq('id', gameId);
              actionsTaken.push('game_over stale: No humans, no history - deleted empty session');
            }
          } else if (eligibleDealers.length === 0) {
            // Humans exist but no eligible dealers - end session
            console.log('[ENFORCE] No eligible dealers after game_over, ending session');
            await supabase
              .from('games')
              .update({
                status: 'session_ended',
                session_ended_at: nowIso,
                pending_session_end: false,
                game_over_at: nowIso,
                config_deadline: null,
                ante_decision_deadline: null,
                config_complete: false,
                awaiting_next_round: false,
              })
              .eq('id', gameId);
            actionsTaken.push('game_over stale: No eligible dealers, session ended');
          } else {
            // Have eligible dealers - rotate and start next hand configuration
            console.log('[ENFORCE] Rotating dealer and starting next hand configuration');

            const eligiblePositions = eligibleDealers.map((p: any) => p.position as number).sort((a: number, b: number) => a - b);
            const currentDealerPos = game.dealer_position || 0;
            const currentIndex = eligiblePositions.indexOf(currentDealerPos);

            let nextDealerPos: number;
            if (currentIndex === -1) {
              nextDealerPos = eligiblePositions[0];
            } else {
              nextDealerPos = eligiblePositions[(currentIndex + 1) % eligiblePositions.length];
            }

            // Calculate config deadline
            const configDeadline = new Date(Date.now() + 60 * 1000).toISOString(); // 60 seconds

            // Transition to configuring with new dealer
            await supabase
              .from('games')
              .update({
                status: 'configuring',
                dealer_position: nextDealerPos,
                config_deadline: configDeadline,
                game_over_at: null,
                awaiting_next_round: false,
                config_complete: false,
              })
              .eq('id', gameId);

            // Reset player ante decisions and flags for new hand
            await supabase
              .from('players')
              .update({
                ante_decision: null,
                current_decision: null,
                decision_locked: false,
                auto_fold: false,
                pre_fold: false,
                pre_stay: false,
              })
              .eq('game_id', gameId)
              .eq('sitting_out', false);

            actionsTaken.push(`game_over stale: Rotated dealer to position ${nextDealerPos}, started configuring`);
          }
        }
      } else if (now > gameOverDeadline && !game.pending_session_end) {
        console.log('[ENFORCE] Game over countdown expired but within grace period, waiting for client...');
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      actionsTaken,
      gameStatus: game.status,
      timestamp: nowIso,
      debugSnapshot: (body?.debug === true ? debugSnapshot : undefined),
      source: (body?.source ?? 'unknown'),
      requestId: (typeof body?.requestId === 'string' ? body.requestId : null),
      debugLabel: (typeof body?.debugLabel === 'string' ? body.debugLabel : null),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[ENFORCE DEADLINES] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});