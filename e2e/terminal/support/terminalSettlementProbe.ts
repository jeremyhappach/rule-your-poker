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

async function withProbeDeadline<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  label: string,
  timeoutMs = 10_000,
  attempts = 2,
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
      if (!timedOut || attempt === attempts) {
        if (timedOut) throw new Error(`${label} exceeded ${timeoutMs}ms on ${attempts} attempts`);
        throw error;
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

  async findTerminalResult(
    gameId: string,
    dealerGameId: string,
    expected: TerminalExpectation,
  ): Promise<TerminalResult | null> {
    const { data, error } = await withProbeDeadline(
      (signal) => {
        let query = this.client
          .from('game_results')
          .select('*')
          .eq('game_id', gameId)
          .eq('dealer_game_id', dealerGameId)
          .eq('game_type', expected.gameType);

        if (expected.eventKind) query = query.eq('event_kind', expected.eventKind);
        if (expected.settlementKey) query = query.eq('settlement_key', expected.settlementKey);
        return query.order('created_at', { ascending: true }).limit(2).abortSignal(signal);
      },
      'Terminal settlement query',
    );
    if (error) throw new Error(`Could not read terminal settlement: ${error.message}`);
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
      const { data, error } = await this.client
        .from('games')
        .select('pending_session_end')
        .eq('id', gameId)
        .single();
      if (error) throw new Error(`Could not verify LAST HAND: ${error.message}`);
      if (data.pending_session_end === true) return;
      await wait(250);
    }
    throw new Error('LAST HAND was not durably recorded');
  }

  async readCribbageProgress(
    gameId: string,
    dealerGameId: string,
  ): Promise<{ phase: string | null; eventSequence: number }> {
    const { data, error } = await withProbeDeadline(
      (signal) => this.client
          .from('rounds')
          .select('cribbage_state')
          .eq('game_id', gameId)
          .eq('dealer_game_id', dealerGameId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .abortSignal(signal),
      'Cribbage progress query',
    );
    if (error) throw new Error(`Could not read Cribbage progress: ${error.message}`);
    const state = data?.cribbage_state as {
      phase?: string;
      pegging?: { eventSequence?: number };
    } | null;
    return {
      phase: state?.phase ?? null,
      eventSequence: Number(state?.pegging?.eventSequence ?? 0),
    };
  }

  async readGinProgress(
    gameId: string,
    dealerGameId: string,
  ): Promise<{ phase: string | null; turnPhase: string | null; actionCount: number }> {
    const { data, error } = await withProbeDeadline(
      (signal) => this.client
          .from('rounds')
          .select('gin_rummy_state')
          .eq('game_id', gameId)
          .eq('dealer_game_id', dealerGameId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
          .abortSignal(signal),
      'Gin progress query',
    );
    if (error) throw new Error(`Could not read Gin progress: ${error.message}`);
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

    const { data: snapshots, error: snapshotError } = await this.client
      .from('session_player_snapshots')
      .select('*')
      .eq('game_id', gameId)
      .eq('dealer_game_id', dealerGameId)
      .eq('hand_number', result.hand_number)
      .eq('is_bot', false)
      .order('created_at', { ascending: true });
    if (snapshotError) throw new Error(`Could not read terminal snapshots: ${snapshotError.message}`);
    this.assertTwoHumanSnapshots(snapshots);

    const { data: game, error: gameError } = await this.client
      .from('games')
      .select('status,pending_session_end,session_ended_at')
      .eq('id', gameId)
      .single();
    if (gameError) throw new Error(`Could not read ended session: ${gameError.message}`);
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
