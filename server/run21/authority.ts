import { randomUUID } from 'node:crypto';
import { advanceScorePresentation, applyCommand, createMatch, prepareRound, project, recordSettlement, settlementIntent } from '../../src/lib/run21/engine.js';
import { chooseAction } from '../../src/lib/run21/bot.js';
import { shuffleRound } from '../../src/lib/run21/shuffle.server.js';
import { DEFAULT_CONFIG, isUuid, type Command, type Intent, type Match, type Player } from '../../src/lib/run21/model.js';
import { exportReplay, visibleHistory } from '../../src/lib/run21/history.js';

export interface StoredMatch {
  dealer_game_id: string; game_id: string; first_round_id: string;
  participants: (Player & {userId: string; chips: number})[];
  stake: number; balances: Record<string, number>; revision: number;
  state: Match | null; bot_due_at: number | null; finished: boolean;
}
export interface Store {
  load(gameId?: string): Promise<StoredMatch[]>;
  commit(record: StoredMatch, state: Match, botDue: number | null): Promise<StoredMatch>;
  close(dealerId: string, userId: string): Promise<void>;
}
export class AuthorityError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
/** Per-instance serialization; PostgreSQL revision CAS protects competing instances. */
export class Run21Authority {
  private queues = new Map<string, Promise<unknown>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private pending = new Map<string, {done: Promise<void>; resolve: () => void}>();
  private listeners = new Map<string, Set<() => void>>();
  constructor(readonly store: Store, readonly now = Date.now, readonly shuffle = shuffleRound) {}
  private serial<T>(gameId: string, work: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(gameId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      for (let attempt = 0; ; attempt++) {
        try { return await work(); }
        catch (error) {
          if (!(error instanceof AuthorityError) || error.code !== 'run21:concurrent_commit' || attempt >= 7) throw error;
          // Reload canonical state and reapply the same request identity after a CAS race.
        }
      }
    });
    this.queues.set(gameId, result);
    void result.finally(() => { if (this.queues.get(gameId) === result) this.queues.delete(gameId); }).catch(() => {});
    return result;
  }
  subscribe(gameId: string, listener: () => void) {
    const set = this.listeners.get(gameId) ?? new Set(); set.add(listener); this.listeners.set(gameId, set);
    return () => { set.delete(listener); if (!set.size) this.listeners.delete(gameId); };
  }
  private async latest(gameId: string) {
    const row = (await this.store.load(gameId)).at(-1);
    if (!row) throw new AuthorityError('run21:not_configured', 404);
    return row;
  }
  private player(row: StoredMatch, userId: string) {
    const player = row.participants.find(p => p.userId === userId && p.kind === 'human');
    if (!player) throw new AuthorityError('run21:participant_required', 403);
    return player;
  }
  private command(state: Match, playerId: string, intent: Intent, at: number) {
    const round = state.rounds.at(-1)!;
    const result = applyCommand(state, {identity: state.identity, roundId: round.id, playerId,
      requestId: randomUUID(), revision: round.boards[playerId].revision, intent}, {kind: 'service'}, at);
    if (result.status !== 'accepted') throw new AuthorityError(`run21:runner_${result.reason}`);
    return result.state;
  }
  private async openRound(state: Match, id: string, at: number) {
    state = prepareRound(state, id, state.rounds.at(-1)?.id ?? null, await this.shuffle(state.identity, id), at);
    state = this.command(state, state.rounds.at(-1)!.active_player_id!, {type: 'ready'}, at);
    return state;
  }
  private async advance(row: StoredMatch) {
    if (row.finished) return row;
    const at = Math.max(this.now(), row.state?.updatedAt ?? 0);
    let state = row.state;
    let due = row.bot_due_at;
    if (!state) {
      state = createMatch({sessionId: row.game_id, dealerGameId: row.dealer_game_id, handNumber: 1},
        row.participants.map(({id, seat, name, kind}) => ({id, seat, name, kind})), row.stake, DEFAULT_CONFIG, at);
      state = await this.openRound(state, row.first_round_id, at);
    }
    state = advanceScorePresentation(state, at);
    let round = state.rounds.at(-1)!;
    // Missed deadlines after a process restart settle at their persisted authority time.
    if (!round.revealed && !round.active_player_id && !round.scorePresentation) throw new AuthorityError('run21:sequential_round_required');
    if (round.active_player_id) {
      const board = round.boards[round.active_player_id];
      if (!board.result && board.deadline !== null && at >= board.deadline)
        state = this.command(state, board.playerId, {type: 'expire'}, at);
    }
    const bot = state.players.find(p => p.kind === 'bot')!;
    round = state.rounds.at(-1)!;
    if (!round.revealed && round.active_player_id === bot.id && due !== null && at >= due && !round.boards[bot.id].result) {
      const action = chooseAction(project(state, bot.id), at);
      if (action) state = this.command(state, bot.id, action.intent, at);
      due = null;
    }
    round = state.rounds.at(-1)!;
    // Live boards need no reveal acknowledgement: the second scoring hold completes the round.
    if (round.revealed && round.liveBoards && !state.winnerId) {
      for (const p of state.players) if (!state.rounds.at(-1)!.acknowledged.includes(p.id))
        state = this.command(state, p.id, {type: 'acknowledge'}, at);
    }
    round = state.rounds.at(-1)!;
    if (round.revealed && !round.acknowledged.includes(bot.id)) state = this.command(state, bot.id, {type: 'acknowledge'}, at);
    round = state.rounds.at(-1)!;
    if (state.winnerId && !state.settlement) {
      state = recordSettlement(state, {...settlementIntent(state)!, resultId: randomUUID(), transferBatchId: randomUUID(), at});
    } else if (!state.winnerId && round.revealed && round.acknowledged.length === state.players.length) {
      state = await this.openRound(state, randomUUID(), at); due = null;
    }
    const choice = chooseAction(project(state, bot.id), at);
    due = choice ? due ?? at + choice.delayMs : null;
    if (state !== row.state || due !== row.bot_due_at) row = await this.store.commit(row, state, due);
    this.schedule(row);
    return row;
  }
  private schedule(row: StoredMatch) {
    clearTimeout(this.timers.get(row.game_id)); this.timers.delete(row.game_id);
    this.pending.get(row.game_id)?.resolve(); this.pending.delete(row.game_id);
    if (row.finished || !row.state) return;
    const round = row.state.rounds.at(-1)!;
    const active = round.active_player_id ? round.boards[round.active_player_id] : null;
    const deadlines = active && !active.result && active.deadline !== null ? [active.deadline] : [];
    if (round.scorePresentation) deadlines.push(round.scorePresentation.endsAt);
    if (row.bot_due_at !== null && row.state.players.find(p => p.id === round.active_player_id)?.kind === 'bot') deadlines.push(row.bot_due_at);
    if (!deadlines.length) return;
    let resolve!: () => void;
    const done = new Promise<void>(r => { resolve = r; });
    this.pending.set(row.game_id, {done, resolve});
    const timer = setTimeout(() => {
      void this.serial(row.game_id, async () => {
        await this.advance(await this.latest(row.game_id));
        this.notify(row.game_id);
      }).catch(error => {
        // Fail visibly; no synthetic success and no client-driven substitute scheduler.
        console.error('[Run21 authority]', error instanceof AuthorityError ? error.code : 'local_database_failure');
        this.notify(row.game_id);
      }).finally(resolve);
    }, Math.max(1, Math.min(...deadlines) - this.now()));
    timer.unref?.(); this.timers.set(row.game_id, timer);
  }
  private notify(gameId: string) { this.listeners.get(gameId)?.forEach(fn => fn()); }
  async recover() {
    for (const row of await this.store.load()) await this.serial(row.game_id, () => this.advance(row));
  }
  private snapshot(row: StoredMatch, playerId: string, afterSequence: number) {
    return {revision: row.revision, serverAt: this.now(), view: project(row.state!, playerId), balances: row.balances, finished: row.finished,
      eventSequence: row.state!.events.at(-1)?.sequence ?? 0, events: visibleHistory(row.state!, playerId).filter(e => e.sequence > afterSequence)};
  }
  async read(gameId: string, userId: string, afterSequence = 0) {
    return this.serial(gameId, async () => {
      const initial = await this.latest(gameId); const player = this.player(initial, userId);
      const row = await this.advance(initial);
      return this.snapshot(row, player.id, afterSequence);
    });
  }
  async act(gameId: string, userId: string, command: Command, afterSequence = 0) {
    return this.serial(gameId, async () => {
      const initial = await this.latest(gameId); const player = this.player(initial, userId);
      let row = await this.advance(initial);
      if (row.finished) throw new AuthorityError('run21:finished');
      if (!command || !isUuid(command.requestId ?? '') || !command.identity || !command.intent ||
        !['place', 'pass', 'collect', 'acknowledge'].includes(command.intent.type)) throw new AuthorityError('run21:invalid_command', 400);
      const result = applyCommand(row.state!, command, {kind: 'player', playerId: player.id}, Math.max(this.now(), row.state!.updatedAt));
      if (result.status === 'rejected') throw new AuthorityError(`run21:${result.reason}`);
      if (result.status === 'accepted') row = await this.store.commit(row, result.state, null);
      row = await this.advance(row); this.notify(gameId);
      return {status: result.status, requestId: command.requestId, ...this.snapshot(row, player.id, afterSequence)};
    });
  }
  async history(gameId: string, userId: string) {
    const rows = await this.store.load(gameId);
    if (!rows.length) throw new AuthorityError('run21:not_configured', 404);
    return rows.map(row => {
      const player = this.player(row, userId);
      return {dealerGameId: row.dealer_game_id, balances: row.balances, events: row.state ? visibleHistory(row.state, player.id) : [],
        replay: row.state ? exportReplay(row.state, player.id) : null};
    });
  }
  async close(gameId: string, userId: string) {
    return this.serial(gameId, async () => {
      const row = await this.latest(gameId); this.player(row, userId);
      if (!row.state?.settlement) throw new AuthorityError('run21:not_settled');
      await this.store.close(row.dealer_game_id, userId); clearTimeout(this.timers.get(gameId));
      this.pending.get(gameId)?.resolve(); this.pending.delete(gameId); this.notify(gameId);
    });
  }
  async drain(gameId: string) {
    while (this.pending.has(gameId)) {
      const work = this.pending.get(gameId)!;
      await work.done;
      if (this.pending.get(gameId) === work) this.pending.delete(gameId);
    }
  }
  dispose() {
    this.timers.forEach(clearTimeout); this.timers.clear(); this.listeners.clear();
    this.pending.forEach(work => work.resolve()); this.pending.clear();
  }
}
