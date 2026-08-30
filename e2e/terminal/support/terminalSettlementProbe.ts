import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../src/integrations/supabase/types';
import type { PlayerCredentials } from '../../liveness/support/env';

export type TerminalExpectation = {
  gameType: string;
  eventKind?: Database['public']['Enums']['holm_event_kind'];
  settlementKey?: string;
};

export type TerminalResult = Database['public']['Tables']['game_results']['Row'];
type SessionSnapshot = Database['public']['Tables']['session_player_snapshots']['Row'];

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function isAbortLike(error: unknown): boolean {
  const name = error instanceof Error
    ? error.name
    : typeof error === 'object' && error && 'name' in error
      ? String((error as { name?: unknown }).name ?? '')
      : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'AbortError'
    || name === 'TimeoutError'
    || /abort|failed to fetch|fetch failed|network error/i.test(message);
}

export async function withProbeDeadline<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  label: string,
  timeoutMs = 30_000,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      return await Promise.resolve(operation(controller.signal));
    } catch (error) {
      if (!timedOut && !isAbortLike(error)) throw error;
      if (attempt === attempts) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`${label} unavailable after ${attempts} attempts: ${detail}`);
      }
    } finally {
      clearTimeout(timer);
    }
    await wait(250);
  }
  throw new Error(`${label} exhausted its retry budget`);
}

export class TerminalSettlementProbe {
  private readonly client: SupabaseClient<Database>;

  private constructor(url: string, publishableKey: string) {
    this.client = createClient<Database>(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  static async create(
    url: string,
    publishableKey: string,
    credentials: PlayerCredentials,
  ): Promise<TerminalSettlementProbe> {
    const probe = new TerminalSettlementProbe(url, publishableKey);
    const { error } = await probe.client.auth.signInWithPassword(credentials);
    if (error) throw new Error(`Could not authenticate settlement probe: ${error.message}`);
    return probe;
  }

  async readDealerGameConfig(
    dealerGameId: string,
  ): Promise<Database['public']['Tables']['dealer_games']['Row']['config']> {
    return withProbeDeadline(
      async (signal) => {
        const { data, error } = await this.client
          .from('dealer_games')
          .select('config')
          .eq('id', dealerGameId)
          .single()
          .abortSignal(signal);
        if (error) throw new Error(`Could not read dealer-game config: ${error.message}`);
        return data.config;
      },
      'Dealer-game config query',
    );
  }

  async findTerminalResult(
    gameId: string,
    dealerGameId: string,
    expected: TerminalExpectation,
  ): Promise<TerminalResult | null> {
    const data = await withProbeDeadline(
      async (signal) => {
        let query = this.client
          .from('game_results')
          .select('*')
          .eq('game_id', gameId)
          .eq('dealer_game_id', dealerGameId)
          .eq('game_type', expected.gameType);

        if (expected.eventKind) query = query.eq('event_kind', expected.eventKind);
        if (expected.settlementKey) query = query.eq('settlement_key', expected.settlementKey);
        const { data, error } = await query
          .order('created_at', { ascending: true })
          .limit(2)
          .abortSignal(signal);
        if (error) throw new Error(`Could not read terminal settlement: ${error.message}`);
        return data;
      },
      'Terminal settlement query',
    );
    if (data.length > 1) {
      throw new Error(
        `Expected one terminal settlement for ${expected.gameType}, found ${data.length}`,
      );
    }
    return data[0] ?? null;
  }

  async waitForTerminalResult(
    gameId: string,
    dealerGameId: string,
    expected: TerminalExpectation,
    timeoutMs = 15 * 60_000,
  ): Promise<TerminalResult> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await this.findTerminalResult(gameId, dealerGameId, expected);
      if (result) return result;
      await wait(500);
    }
    throw new Error(`Timed out waiting for ${expected.gameType} terminal settlement`);
  }

  async waitForLastHand(gameId: string, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const data = await withProbeDeadline(
        async (signal) => {
          const { data, error } = await this.client
            .from('games')
            .select('pending_session_end')
            .eq('id', gameId)
            .single()
            .abortSignal(signal);
          if (error) throw new Error(`Could not verify LAST HAND: ${error.message}`);
          return data;
        },
        'LAST HAND verification query',
      );
      if (data.pending_session_end === true) return;
      await wait(250);
    }
    throw new Error('LAST HAND was not durably recorded');
  }

  async readCribbageProgress(
    gameId: string,
    dealerGameId: string,
  ): Promise<{
    roundId: string | null;
    handNumber: number | null;
    phase: string | null;
    eventSequence: number;
    countingReleaseAt: number | null;
  }> {
    const data = await withProbeDeadline(
      async (signal) => {
        const { data, error } = await this.client
          .from('rounds')
          .select('id,hand_number,cribbage_state')
          .eq('game_id', gameId)
          .eq('dealer_game_id', dealerGameId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .abortSignal(signal);
        if (error) throw new Error(`Could not read Cribbage progress: ${error.message}`);
        return data;
      },
      'Cribbage progress query',
    );
    const state = data?.cribbage_state as {
      phase?: string;
      pegging?: { eventSequence?: number };
      countingResolution?: { presentationReleaseAt?: string };
    } | null;
    const releaseAt = state?.countingResolution?.presentationReleaseAt
      ? Date.parse(state.countingResolution.presentationReleaseAt)
      : Number.NaN;
    return {
      roundId: data?.id ?? null,
      handNumber: data?.hand_number ?? null,
      phase: state?.phase ?? null,
      eventSequence: Number(state?.pegging?.eventSequence ?? 0),
      countingReleaseAt: Number.isFinite(releaseAt) ? releaseAt : null,
    };
  }

  async readGinProgress(
    gameId: string,
    dealerGameId: string,
  ): Promise<{ phase: string | null; turnPhase: string | null; actionCount: number }> {
    const data = await withProbeDeadline(
      async (signal) => {
        const { data, error } = await this.client
          .from('rounds')
          .select('gin_rummy_state')
          .eq('game_id', gameId)
          .eq('dealer_game_id', dealerGameId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .abortSignal(signal);
        if (error) throw new Error(`Could not read Gin progress: ${error.message}`);
        return data;
      },
      'Gin progress query',
    );
    const state = data?.gin_rummy_state as {
      phase?: string;
      turnPhase?: string;
      actionCount?: number;
    } | null;
    return {
      phase: state?.phase ?? null,
      turnPhase: state?.turnPhase ?? null,
      actionCount: Number(state?.actionCount ?? 0),
    };
  }

  async readDiceProgress(
    gameId: string,
    dealerGameId: string,
  ): Promise<{
    roundId: string | null;
    handNumber: number | null;
    phase: string | null;
    currentTurnPlayerId: string | null;
    stateSignature: string;
  }> {
    const data = await withProbeDeadline(
      async (signal) => {
        const { data, error } = await this.client
          .from('rounds')
          .select('id,hand_number,horses_state')
          .eq('game_id', gameId)
          .eq('dealer_game_id', dealerGameId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .abortSignal(signal);
        if (error) throw new Error(`Could not read dice progress: ${error.message}`);
        return data;
      },
      'Dice progress query',
    );
    const state = data?.horses_state as {
      gamePhase?: string;
      currentTurnPlayerId?: string | null;
    } | null;
    return {
      roundId: data?.id ?? null,
      handNumber: data?.hand_number ?? null,
      phase: state?.gamePhase ?? null,
      currentTurnPlayerId: state?.currentTurnPlayerId ?? null,
      stateSignature: JSON.stringify(state ?? null),
    };
  }

  async readYahtzeeProgress(
    gameId: string,
    dealerGameId: string,
  ): Promise<{ stateSignature: string }> {
    const data = await withProbeDeadline(
      async (signal) => {
        const { data, error } = await this.client
          .from('rounds')
          .select('yahtzee_state')
          .eq('game_id', gameId)
          .eq('dealer_game_id', dealerGameId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .abortSignal(signal);
        if (error) throw new Error(`Could not read Yahtzee progress: ${error.message}`);
        return data;
      },
      'Yahtzee progress query',
    );
    return { stateSignature: JSON.stringify(data?.yahtzee_state ?? null) };
  }

  async assertTerminalProof(
    gameId: string,
    dealerGameId: string,
    expected: TerminalExpectation,
    result: TerminalResult,
  ): Promise<void> {
    const exactResult = await this.findTerminalResult(gameId, dealerGameId, expected);
    if (!exactResult || exactResult.id !== result.id) {
      throw new Error('Terminal settlement identity changed during verification');
    }
    if (!result.winner_player_id) throw new Error('Terminal settlement has no winner_player_id');

    const snapshots = await withProbeDeadline(
      async (signal) => {
        const { data, error } = await this.client
          .from('session_player_snapshots')
          .select('*')
          .eq('game_id', gameId)
          .eq('dealer_game_id', dealerGameId)
          .eq('hand_number', result.hand_number)
          .eq('is_bot', false)
          .order('created_at', { ascending: true })
          .abortSignal(signal);
        if (error) throw new Error(`Could not read terminal snapshots: ${error.message}`);
        return data;
      },
      'Terminal snapshot query',
    );
    this.assertTwoHumanSnapshots(snapshots);

    const game = await withProbeDeadline(
      async (signal) => {
        const { data, error } = await this.client
          .from('games')
          .select('status,pending_session_end,session_ended_at')
          .eq('id', gameId)
          .single()
          .abortSignal(signal);
        if (error) throw new Error(`Could not read ended session: ${error.message}`);
        return data;
      },
      'Ended-session query',
    );
    if (game.status !== 'session_ended' || game.pending_session_end === true || !game.session_ended_at) {
      throw new Error(
        `Terminal game row is inconsistent: status=${game.status}, pending=${game.pending_session_end}`,
      );
    }

  }

  private assertTwoHumanSnapshots(snapshots: SessionSnapshot[]): void {
    if (snapshots.length !== 2) {
      throw new Error(`Expected two human terminal snapshots, found ${snapshots.length}`);
    }
    if (new Set(snapshots.map((snapshot) => snapshot.player_id)).size !== 2) {
      throw new Error('Terminal snapshots do not contain two distinct player ids');
    }
    if (new Set(snapshots.map((snapshot) => snapshot.user_id)).size !== 2) {
      throw new Error('Terminal snapshots do not contain two distinct human user ids');
    }
  }
}
