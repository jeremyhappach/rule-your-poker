import { supabase } from '@/integrations/supabase/client';

export type DealerGameType =
  | '3-5-7'
  | 'holm-game'
  | 'cribbage'
  | 'gin-rummy'
  | 'horses'
  | 'ship-captain-crew'
  | 'yahtzee';

export interface DealerGameSetupCommitResult {
  outcome: 'configured' | 'already_configured';
  deduped: boolean;
  setup_identity: {
    game_id: string;
    dealer_position: number;
    expected_config_deadline: string;
  };
  game: Record<string, unknown> & {
    id: string;
    status: string;
    config_complete: boolean;
    current_game_uuid: string | null;
  };
  dealer_game: Record<string, unknown> & {
    id: string;
    session_id: string;
    game_type: string;
  };
  players: Array<Record<string, unknown> & {
    id: string;
    position: number;
    ante_decision: string | null;
    sitting_out: boolean;
  }>;
}

interface ConfigureDealerGameParams {
  gameId: string;
  dealerPlayerId: string;
  expectedDealerPosition: number;
  expectedConfigDeadline: string | null | undefined;
  gameType: DealerGameType;
  config: Record<string, unknown>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const sameInstant = (left: unknown, right: string): boolean => {
  if (typeof left !== 'string') return false;
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
};

export function parseDealerGameSetupCommitResult(
  raw: unknown,
  expected: Omit<ConfigureDealerGameParams, 'config'>,
): DealerGameSetupCommitResult {
  if (!isObject(raw) || !isObject(raw.game) || !isObject(raw.dealer_game)
      || !isObject(raw.setup_identity) || !Array.isArray(raw.players)) {
    throw new Error('configure_dealer_game returned an incomplete committed result');
  }

  const outcome = raw.outcome;
  const game = raw.game;
  const dealerGame = raw.dealer_game;
  const identity = raw.setup_identity;
  const exactIdentity =
    identity.game_id === expected.gameId
    && identity.dealer_position === expected.expectedDealerPosition
    && sameInstant(identity.expected_config_deadline, expected.expectedConfigDeadline ?? '');
  const exactCommit =
    (outcome === 'configured' || outcome === 'already_configured')
    && typeof raw.deduped === 'boolean'
    && exactIdentity
    && game.id === expected.gameId
    && game.status === 'ante_decision'
    && game.config_complete === true
    && typeof dealerGame.id === 'string'
    && dealerGame.session_id === expected.gameId
    && dealerGame.game_type === expected.gameType
    && game.current_game_uuid === dealerGame.id;

  const players = raw.players;
  const dealer = players.find((player) =>
    isObject(player)
    && player.id === expected.dealerPlayerId
    && player.position === expected.expectedDealerPosition
  );
  if (!exactCommit || !dealer || dealer.ante_decision !== 'ante_up' || dealer.sitting_out !== false) {
    throw new Error('configure_dealer_game returned a mismatched committed result');
  }

  return raw as unknown as DealerGameSetupCommitResult;
}

export async function configureDealerGame(
  params: ConfigureDealerGameParams,
): Promise<DealerGameSetupCommitResult> {
  if (!params.expectedConfigDeadline) {
    throw new Error('Dealer setup is missing its exact configuration deadline');
  }

  const { data, error } = await supabase.rpc('configure_dealer_game' as never, {
    p_game_id: params.gameId,
    p_dealer_player_id: params.dealerPlayerId,
    p_expected_dealer_position: params.expectedDealerPosition,
    p_game_type: params.gameType,
    p_config: params.config,
    p_expected_config_deadline: params.expectedConfigDeadline,
  } as never);
  if (error) throw error;
  return parseDealerGameSetupCommitResult(data, params);
}
