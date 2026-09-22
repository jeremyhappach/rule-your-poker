import { randomUUID } from 'node:crypto';
import { advanceScorePresentation, applyCommand, createMatch, prepareRound, project, recordSettlement, settlementIntent } from '../../src/lib/run21/engine.js';
import { chooseAction } from '../../src/lib/run21/bot.js';
import { shuffleRound } from '../../src/lib/run21/shuffle.server.js';
import { DEFAULT_CONFIG, isUuid, type Command, type Intent, type Match, type Player } from '../../src/lib/run21/model.js';
import { exportReplay, visibleHistory } from '../../src/lib/run21/history.js';

export interface StoredMatch {
  dealer_game_id: string; game_id: string; first_round_id: string;
  dealer_user_id: string;
  participants: (Player & {userId: string; chips: number})[];
  stake: number; balances: Record<string, number>; revision: number;
  state: Match | null; bot_due_at: number | null; finished: boolean;
}
export interface Store {
  load(gameId?: string, includeHistory?: boolean, afterSequence?: number): Promise<StoredMatch[]>;
  commit(record: StoredMatch, state: Match, botDue: number | null, verifiedUserId?: string): Promise<StoredMatch>;
  confirm(record: StoredMatch, verifiedUserId: string): Promise<StoredMatch>;
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
  private committed = new Map<string, StoredMatch>();
  constructor(readonly store: Store, readonly now = Date.now, readonly shuffle = shuffleRound,
    readonly measure: <T>(name:string,work:()=>T)=>T = (_name,work)=>work()) {}
  /** Server-loaded computation snapshot only. Every action rechecks admission at commit. */
  admit(row: StoredMatch) {
    const prior = this.committed.get(row.game_id);
    if (!prior || prior.dealer_game_id !== row.dealer_game_id || row.revision >= prior.revision)
      this.committed.set(row.game_id, row);
  }
  private serial<T>(gameId: string, work: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(gameId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      for (let attempt = 0; ; attempt++) {
        try { return await work(); }
        catch (error) {
          if (!(error instanceof AuthorityError) || error.code !== 'run21:concurrent_commit' || attempt >= 7) throw error;
          this.committed.delete(gameId);
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
  private async latest(gameId: string, afterSequence?: number) {
    const row = (await this.store.load(gameId, false, afterSequence)).at(-1);
    if (!row) throw new AuthorityError('run21:not_configured', 404);
    const prior=this.committed.get(gameId);
    if(!prior||prior.dealer_game_id!==row.dealer_game_id||row.revision>=prior.revision)this.committed.set(gameId,row);
    return row;
  }
  private player(row: StoredMatch, userId: string) {
    return this.measure('playerMembership',()=>{
      const player = row.participants.find(p => p.userId === userId && p.kind === 'human');
      if (!player) throw new AuthorityError('run21:participant_required', 403);
      return player;
    });
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
  private async advance(row: StoredMatch, verifiedUserId?: string) {
    if (row.finished) return row;
    const at = Math.max(this.now(), row.state?.updatedAt ?? 0);
    let state = row.state;
    let due = row.bot_due_at;
    if (!state) {
      const dealer = row.participants.find(p => p.userId === row.dealer_user_id);
      if (!dealer) throw new AuthorityError('run21:dealer_identity_required');
      const ordered = [...row.participants.filter(p => p.id !== dealer.id), dealer];
      state = createMatch({sessionId: row.game_id, dealerGameId: row.dealer_game_id, handNumber: 1},
        ordered.map(({id, seat, name, kind}) => ({id, seat, name, kind})), row.stake, DEFAULT_CONFIG, at);
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
    if (state !== row.state || due !== row.bot_due_at) row = await this.store.commit(row, state, due, verifiedUserId);
    this.committed.set(row.game_id,row);
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
      eventSequence: row.state!.eventSequence ?? row.state!.events.at(-1)?.sequence ?? 0, events: visibleHistory(row.state!, playerId, afterSequence)};
  }
  async read(gameId: string, userId: string, afterSequence = 0) {
    return this.serial(gameId, async () => {
      const initial = await this.latest(gameId, afterSequence); const player = this.player(initial, userId);
      const row = await this.advance(initial);
      // Recovery may accept a timeout/bot transition while catching up. Keep the
      // requested committed prefix as well as this transition's new events.
      const events = [...new Map([...(initial.state?.events??[]),...row.state!.events]
        .map(event=>[event.sequence,event])).values()].sort((a,b)=>a.sequence-b.sequence);
      return this.snapshot({...row,state:{...row.state!,events}}, player.id, afterSequence);
    });
  }
  /** Revision notifications observe committed state; they never queue gameplay work. */
  async observe(gameId: string, userId: string, afterSequence = 0) {
    const row = await this.latest(gameId, afterSequence);
    const player = this.player(row, userId);
    if (!row.state) return this.read(gameId, userId, afterSequence);
    return this.snapshot(row, player.id, afterSequence);
  }
  async act(gameId: string, userId: string, command: Command, afterSequence = 0) {
    return this.serial(gameId, async () => {
      // A matching committed revision can go directly to the PostgreSQL CAS.
      // No cached result bypasses the database write; races reload and retry the same ID.
      const cached=this.committed.get(gameId),round=cached?.state?.rounds.at(-1);
      const exact=cached&&!cached.finished&&command?.identity?.dealerGameId===cached.dealer_game_id&&
        command?.roundId===round?.id&&command?.revision===round?.boards[command?.playerId]?.revision;
      const initial = exact ? cached : await this.latest(gameId); const player = this.player(initial, userId);
      let row = await this.advance(initial, userId);
      if (row.finished) throw new AuthorityError('run21:finished');
      if (!command || !isUuid(command.requestId ?? '') || !command.identity || !command.intent ||
        !['place', 'pass', 'collect', 'acknowledge'].includes(command.intent.type)) throw new AuthorityError('run21:invalid_command', 400);
      let result = this.measure('commandAuthorizationAndRules',()=>applyCommand(row.state!, command, {kind: 'player', playerId: player.id}, Math.max(this.now(), row.state!.updatedAt)));
      if(exact&&result.status!=='accepted'){
        row=await this.advance(await this.latest(gameId), userId);
        if(row.finished)throw new AuthorityError('run21:finished');
        result=this.measure('commandAuthorizationAndRules',()=>applyCommand(row.state!,command,{kind:'player',playerId:player.id},Math.max(this.now(),row.state!.updatedAt)));
      }
      // Duplicate/rejected commands cannot return cached data or bypass current admission.
      if (result.status !== 'accepted') row = await this.store.confirm(row, userId);
      if (result.status === 'rejected') throw new AuthorityError(`run21:${result.reason}`);
      if (result.status === 'accepted') row = await this.store.commit(row, result.state, null, userId);
      row = await this.advance(row, userId); this.notify(gameId);
      return {status: result.status, requestId: command.requestId, ...this.snapshot(row, player.id, afterSequence)};
    });
  }
  async history(gameId: string, userId: string) {
    const rows = await this.store.load(gameId, true);
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
      this.committed.delete(gameId);
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
    this.committed.clear();
    this.pending.forEach(work => work.resolve()); this.pending.clear();
  }
}
