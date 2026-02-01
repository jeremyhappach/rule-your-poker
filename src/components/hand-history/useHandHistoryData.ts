import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  GameResultRecord,
  DealerGameRecord,
  RoundRecord,
  CardData,
  DealerGameGroup,
  HandGroup,
  RoundGroup,
  PlayerDiceResult,
} from "./types";

interface UseHandHistoryDataProps {
  gameId: string;
  currentUserId?: string;
  currentPlayerId?: string;
  currentRound?: number | null;
}

export function useHandHistoryData({
  gameId,
  currentUserId,
  currentPlayerId,
  currentRound,
}: UseHandHistoryDataProps) {
  const [gameResults, setGameResults] = useState<GameResultRecord[]>([]);
  const [dealerGames, setDealerGames] = useState<Map<string, DealerGameRecord>>(new Map());
  const [dealerGameNumberById, setDealerGameNumberById] = useState<Map<string, number>>(new Map());
  const [rounds, setRounds] = useState<RoundRecord[]>([]);
  const [playerNames, setPlayerNames] = useState<Map<string, string>>(new Map());
  const [userIdToName, setUserIdToName] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  
  // Card data maps
  const [playerCardsByRound, setPlayerCardsByRound] = useState<
    Map<string, Map<string, { cards: CardData[]; visibleToUserIds: string[] | null }>>
  >(new Map());
  const [roundCardData, setRoundCardData] = useState<
    Map<string, { communityCards: CardData[]; chuckyCards: CardData[] }>
  >(new Map());

  useEffect(() => {
    fetchData();
  }, [gameId]);

  useEffect(() => {
    if (currentRound !== undefined && currentRound !== null) {
      fetchData({ showLoading: false });
    }
  }, [currentRound]);

  const fetchData = async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    if (showLoading) setLoading(true);

    try {
      // Fetch game info
      const { data: gameData } = await supabase
        .from("games")
        .select("buy_in, session_ended_at, current_game_uuid")
        .eq("id", gameId)
        .maybeSingle();

      if (gameData) {
        setIsSessionEnded(!!gameData.session_ended_at);
      }

      // Fetch dealer_games
      const { data: dealerGamesData } = await supabase
        .from("dealer_games")
        .select("id, game_type, dealer_user_id, started_at, config")
        .eq("session_id", gameId)
        .order("started_at", { ascending: true });

      if (dealerGamesData) {
        // Get dealer usernames
        const dealerUserIds = Array.from(
          new Set(dealerGamesData.map((dg) => dg.dealer_user_id).filter(Boolean))
        );
        const dealerNameByUserId = new Map<string, string>();

        if (dealerUserIds.length > 0) {
          const { data: dealerProfiles } = await supabase
            .from("profiles")
            .select("id, username")
            .in("id", dealerUserIds);
          dealerProfiles?.forEach((p) => dealerNameByUserId.set(p.id, p.username));
        }

        const dealerGamesMap = new Map<string, DealerGameRecord>();
        const numberMap = new Map<string, number>();

        dealerGamesData.forEach((dg, idx) => {
          dealerGamesMap.set(dg.id, {
            id: dg.id,
            game_type: dg.game_type,
            dealer_user_id: dg.dealer_user_id,
            started_at: dg.started_at,
            config: (typeof dg.config === 'object' && dg.config !== null && !Array.isArray(dg.config)) 
              ? (dg.config as Record<string, any>) 
              : {},
            dealer_username: dealerNameByUserId.get(dg.dealer_user_id) || "Unknown",
          });
          numberMap.set(dg.id, idx + 1);
        });

        setDealerGames(dealerGamesMap);
        setDealerGameNumberById(numberMap);
      }

      // Fetch game results
      const { data: results } = await supabase
        .from("game_results")
        .select("*")
        .eq("game_id", gameId)
        .order("hand_number", { ascending: true });

      if (results) {
        const enrichedResults = results.map((r) => ({
          ...r,
          player_chip_changes: (r.player_chip_changes as Record<string, number>) || {},
        }));
        setGameResults(enrichedResults);
      }

      // Fetch rounds
      const { data: roundsData } = await supabase
        .from("rounds")
        .select(
          "id, game_id, round_number, hand_number, pot, status, created_at, horses_state, dealer_game_id, community_cards, chucky_cards"
        )
        .eq("game_id", gameId)
        .order("created_at", { ascending: true });

      if (roundsData) {
        setRounds(roundsData as RoundRecord[]);

        // Extract round card data
        const roundCardMap = new Map<string, { communityCards: CardData[]; chuckyCards: CardData[] }>();
        roundsData.forEach((r: any) => {
          const communityCards = r.community_cards && Array.isArray(r.community_cards) ? r.community_cards : [];
          const chuckyCards = r.chucky_cards && Array.isArray(r.chucky_cards) ? r.chucky_cards : [];
          roundCardMap.set(r.id, { communityCards, chuckyCards });
        });
        setRoundCardData(roundCardMap);
      }

      // Fetch player names from snapshots and current players
      await fetchPlayerNames(roundsData || []);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchPlayerNames = async (roundsData: RoundRecord[]) => {
    const { data: snapshotsData } = await supabase
      .from("session_player_snapshots")
      .select("player_id, username")
      .eq("game_id", gameId);

    const namesMap = new Map<string, string>();
    snapshotsData?.forEach((snap) => namesMap.set(snap.player_id, snap.username));

    const { data: playersData } = await supabase
      .from("players")
      .select("id, user_id, is_bot, created_at")
      .eq("game_id", gameId);

    const userIdMap = new Map<string, string>();

    if (playersData && playersData.length > 0) {
      const userIds = playersData.filter((p) => p.user_id && !p.is_bot).map((p) => p.user_id);
      const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", userIds);

      const bots = playersData
        .filter((p) => p.is_bot)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      playersData.forEach((player) => {
        if (player.is_bot) {
          const botIndex = bots.findIndex((b) => b.user_id === player.user_id);
          const botAlias = botIndex >= 0 ? `Bot ${botIndex + 1}` : "Bot";
          if (!namesMap.has(player.id)) namesMap.set(player.id, botAlias);
          userIdMap.set(player.user_id, botAlias);
        } else {
          const profile = profiles?.find((p) => p.id === player.user_id);
          const username = profile?.username || "Unknown";
          if (!namesMap.has(player.id)) namesMap.set(player.id, username);
          userIdMap.set(player.user_id, username);
        }
      });
    }

    setPlayerNames(namesMap);
    setUserIdToName(userIdMap);

    // Fetch player cards
    if (roundsData.length > 0) {
      const roundIds = roundsData.map((r) => r.id);
      const { data: allCardsData } = await supabase
        .from("player_cards")
        .select("round_id, player_id, cards, visible_to_user_ids")
        .in("round_id", roundIds);

      if (allCardsData) {
        const allCardsMap = new Map<
          string,
          Map<string, { cards: CardData[]; visibleToUserIds: string[] | null }>
        >();

        allCardsData.forEach((pc: any) => {
          if (pc.cards && Array.isArray(pc.cards)) {
            if (!allCardsMap.has(pc.round_id)) {
              allCardsMap.set(pc.round_id, new Map());
            }
            allCardsMap.get(pc.round_id)!.set(pc.player_id, {
              cards: pc.cards,
              visibleToUserIds: pc.visible_to_user_ids || null,
            });
          }
        });

        setPlayerCardsByRound(allCardsMap);
      }
    }
  };

  // Helper functions
  const isUUID = (str: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  const resolveWinnerName = (winnerUsername: string | null, winnerPlayerId: string | null): string | null => {
    if (!winnerUsername) return null;
    const systemWinners = ["Ante", "Leg Purchase", "Pussy Tax", "Pot Refund", "CHOP Ante Correction", "Ante Correction"];
    if (systemWinners.includes(winnerUsername)) return winnerUsername;

    if (isUUID(winnerUsername)) {
      if (userIdToName.has(winnerUsername)) return userIdToName.get(winnerUsername) || winnerUsername;
      if (playerNames.has(winnerUsername)) return playerNames.get(winnerUsername) || winnerUsername;
    }

    if (winnerPlayerId && playerNames.has(winnerPlayerId)) {
      return playerNames.get(winnerPlayerId) || winnerUsername;
    }

    return winnerUsername;
  };

  const isSystemEvent = (result: GameResultRecord): boolean => {
    const systemWinners = ["Ante", "Leg Purchase", "Pussy Tax", "Pot Refund", "CHOP Ante Correction", "Ante Correction"];
    return systemWinners.includes(result.winner_username || "");
  };

  const canSeeCards = (
    playerId: string,
    visibleToUserIds: string[] | null
  ): boolean => {
    if (playerId === currentPlayerId) return true;
    if (!visibleToUserIds || visibleToUserIds.length === 0) return false;
    return currentUserId ? visibleToUserIds.includes(currentUserId) : false;
  };

  // Build the grouped data structure
  const dealerGameGroups = useMemo((): DealerGameGroup[] => {
    if (gameResults.length === 0 && rounds.length === 0) return [];

    // Group results by dealer_game_id
    const resultsByDealerGame = new Map<string, GameResultRecord[]>();
    gameResults.forEach((result) => {
      const dgId = result.dealer_game_id || "orphan";
      if (!resultsByDealerGame.has(dgId)) {
        resultsByDealerGame.set(dgId, []);
      }
      resultsByDealerGame.get(dgId)!.push(result);
    });

    // Group rounds by dealer_game_id
    const roundsByDealerGame = new Map<string, RoundRecord[]>();
    rounds.forEach((round) => {
      const dgId = round.dealer_game_id || "orphan";
      if (!roundsByDealerGame.has(dgId)) {
        roundsByDealerGame.set(dgId, []);
      }
      roundsByDealerGame.get(dgId)!.push(round);
    });

    // Get all dealer game IDs (from both results and rounds)
    const allDealerGameIds = new Set<string>([
      ...Array.from(resultsByDealerGame.keys()),
      ...Array.from(roundsByDealerGame.keys()),
    ]);

    const groups: DealerGameGroup[] = [];

    allDealerGameIds.forEach((dgId) => {
      const dealerGame = dealerGames.get(dgId);
      const dgResults = resultsByDealerGame.get(dgId) || [];
      const dgRounds = roundsByDealerGame.get(dgId) || [];

      const gameType = dealerGame?.game_type || dgResults[0]?.game_type || null;
      const isDiceGame = gameType === "horses" || gameType === "ship-captain-crew";

      // Group by hand_number → round_number
      const handMap = new Map<number, Map<number, { round: RoundRecord; events: GameResultRecord[] }>>();

      // First, organize rounds
      dgRounds.forEach((round) => {
        const handNum = round.hand_number ?? 1;
        const roundNum = round.round_number;

        if (!handMap.has(handNum)) {
          handMap.set(handNum, new Map());
        }
        const roundMap = handMap.get(handNum)!;
        if (!roundMap.has(roundNum)) {
          roundMap.set(roundNum, { round, events: [] });
        }
      });

      // Then, assign events to their rounds
      dgResults.forEach((result) => {
        const handNum = result.hand_number;
        
        // Find the matching round for this event
        // For 3-5-7: events are assigned to rounds within their hand by created_at order
        const handsRounds = handMap.get(handNum);
        if (handsRounds) {
          // Find the round this event belongs to based on timing
          const sortedRounds = Array.from(handsRounds.values()).sort(
            (a, b) => new Date(a.round.created_at).getTime() - new Date(b.round.created_at).getTime()
          );

          // For Ante events, always put in round 1
          if (result.winner_username === "Ante" && sortedRounds.length > 0) {
            sortedRounds[0].events.push(result);
            return;
          }

          // Match event to round by timing
          const eventTime = new Date(result.created_at).getTime();
          let assignedRound = sortedRounds[sortedRounds.length - 1]; // Default to last round

          for (let i = 0; i < sortedRounds.length; i++) {
            const roundTime = new Date(sortedRounds[i].round.created_at).getTime();
            const nextRoundTime = sortedRounds[i + 1]
              ? new Date(sortedRounds[i + 1].round.created_at).getTime()
              : Infinity;

            if (eventTime >= roundTime && eventTime < nextRoundTime) {
              assignedRound = sortedRounds[i];
              break;
            }
          }

          assignedRound.events.push(result);
        } else {
          // No rounds for this hand yet, create a placeholder
          if (!handMap.has(handNum)) {
            handMap.set(handNum, new Map());
          }
          const roundMap = handMap.get(handNum)!;
          if (!roundMap.has(1)) {
            roundMap.set(1, {
              round: {
                id: `placeholder-${handNum}-1`,
                game_id: gameId,
                round_number: 1,
                hand_number: handNum,
                pot: null,
                status: "completed",
                created_at: result.created_at,
              },
              events: [],
            });
          }
          roundMap.get(1)!.events.push(result);
        }
      });

      // Build HandGroup array
      const hands: HandGroup[] = [];
      const sortedHandNumbers = Array.from(handMap.keys()).sort((a, b) => a - b);

      sortedHandNumbers.forEach((handNum) => {
        const roundMap = handMap.get(handNum)!;
        const roundGroups: RoundGroup[] = [];
        
        // Sort rounds by round_number
        const sortedRoundNumbers = Array.from(roundMap.keys()).sort((a, b) => a - b);

        sortedRoundNumbers.forEach((roundNum) => {
          const { round, events } = roundMap.get(roundNum)!;
          
          // Get cards for this round
          const roundCards = playerCardsByRound.get(round.id);
          const roundCardDataForRound = roundCardData.get(round.id);

          // My cards
          const myCardsData = roundCards?.get(currentPlayerId || "");
          const myCards = myCardsData?.cards || [];

          // Visible player cards
          const visiblePlayerCards: RoundGroup["visiblePlayerCards"] = [];
          if (roundCards) {
            roundCards.forEach((data, playerId) => {
              const isMe = playerId === currentPlayerId;
              const canSee = isMe || canSeeCards(playerId, data.visibleToUserIds);
              
              if (canSee) {
                visiblePlayerCards.push({
                  playerId,
                  username: isMe ? "You" : (playerNames.get(playerId) || "Unknown"),
                  cards: data.cards,
                  isCurrentPlayer: isMe,
                });
              }
            });
          }

          // Sort so current player first
          visiblePlayerCards.sort((a, b) => (b.isCurrentPlayer ? 1 : 0) - (a.isCurrentPlayer ? 1 : 0));

          // Dice results for dice games
          let diceResults: PlayerDiceResult[] | undefined;
          if (isDiceGame && round.horses_state?.playerStates) {
            const playerStates = round.horses_state.playerStates as Record<string, any>;
            const winnerPlayerId = events.find((e) => !isSystemEvent(e))?.winner_player_id;

            diceResults = Object.entries(playerStates)
              .filter(([, state]) => state.isComplete && state.dice)
              .map(([playerId, state]) => {
                const dice = (state.dice as Array<{ value: number }>).map((d) => d.value);
                return {
                  playerId,
                  username: playerNames.get(playerId) || "Unknown",
                  dice,
                  isWinner: playerId === winnerPlayerId,
                  handDescription: state.result?.description || state.result?.handName,
                  rollCount: state.rollsRemaining !== undefined ? 3 - state.rollsRemaining : undefined,
                };
              })
              .sort((a, b) => (b.isWinner ? 1 : 0) - (a.isWinner ? 1 : 0));
          }

          roundGroups.push({
            roundNumber: roundNum,
            roundId: round.id,
            myCards,
            visiblePlayerCards,
            communityCards: roundCardDataForRound?.communityCards || [],
            chuckyCards: roundCardDataForRound?.chuckyCards || [],
            events: events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
            diceResults,
          });
        });

        // Calculate chip change for this hand
        const handChipChange = roundGroups.reduce(
          (sum, rg) =>
            sum +
            rg.events.reduce(
              (eSum, e) => eSum + (e.player_chip_changes[currentPlayerId || ""] ?? 0),
              0
            ),
          0
        );

        hands.push({
          handNumber: handNum,
          rounds: roundGroups,
          totalChipChange: handChipChange,
        });
      });

      // Calculate totals for the dealer game
      const allEvents = hands.flatMap((h) => h.rounds.flatMap((r) => r.events));
      const totalChipChange = allEvents.reduce(
        (sum, e) => sum + (e.player_chip_changes[currentPlayerId || ""] ?? 0),
        0
      );
      const totalPot = allEvents
        .filter((e) => !isSystemEvent(e))
        .reduce((sum, e) => sum + (e.pot_won || 0), 0);

      // Find winner
      const outcomeEvents = allEvents.filter((e) => !isSystemEvent(e));
      const lastOutcome = outcomeEvents[outcomeEvents.length - 1];
      const resolvedWinner = resolveWinnerName(lastOutcome?.winner_username || null, lastOutcome?.winner_player_id || null);

      const displayNumber = dgId === "orphan" ? 0 : (dealerGameNumberById.get(dgId) ?? 0);

      groups.push({
        dealerGameId: dgId,
        displayNumber,
        gameType,
        dealerGame,
        hands,
        totalChipChange,
        winner: resolvedWinner,
        winnerDescription: lastOutcome?.winning_hand_description || null,
        isWinner: lastOutcome?.winner_player_id === currentPlayerId,
        totalPot,
        latestTimestamp: allEvents[allEvents.length - 1]?.created_at || dealerGame?.started_at || "",
        isDiceGame,
      });
    });

    // Sort by display number DESC (most recent first)
    return groups.sort((a, b) => b.displayNumber - a.displayNumber);
  }, [
    gameResults,
    rounds,
    dealerGames,
    dealerGameNumberById,
    playerNames,
    userIdToName,
    currentPlayerId,
    currentUserId,
    playerCardsByRound,
    roundCardData,
  ]);

  return {
    dealerGameGroups,
    loading,
    isSessionEnded,
    playerNames,
  };
}
