import type {VisibleEvent} from './history';
import type {Command, Projection} from './model';
import type {Run21Snapshot} from './localClient';
/** A cursor over recorded facts, never a second game engine. */
export class LivePresentation {
  received = 0; sequence = 0; queue: VisibleEvent[] = []; event: VisibleEvent | null = null; shownAt = 0;
  ingest(events: VisibleEvent[]) {
    for (const event of [...events].sort((a,b) => a.sequence-b.sequence)) {
      if (event.sequence <= this.received) continue;
      this.received = event.sequence;
      if (!event.frame.roundId) {this.sequence = event.sequence; continue;}
      const prior = this.queue.at(-1);
      if (prior && prior.at === event.at && prior.roundId === event.roundId && prior.frame.active_player_id === event.frame.active_player_id &&
          !!prior.frame.scorePresentation === !!event.frame.scorePresentation && prior.type !== 'score_presentation_completed') this.queue[this.queue.length-1] = event;
      else this.queue.push(event);
    }
  }
  advance(at: number, live = false): VisibleEvent | null {
    const next = this.queue[0]; if (!next) return null;
    const gap = this.event ? Math.max(0,next.at-this.event.at) : 0;
    const delay = this.event?.type === 'score_presentation_completed' ? 120 : Math.min(this.event?.frame.scorePresentation ? 5000 : 750,gap);
    if (this.event && (!live || this.event.frame.scorePresentation || this.event.type === 'score_presentation_completed') && at-this.shownAt < delay) return null;
    this.event = this.queue.shift()!; this.sequence = this.event.sequence; this.shownAt = at; return this.event;
  }
}
export function optimisticPlacement(view: Projection, command: Command | null): Projection {
  if (!command || command.intent.type !== 'place' || view.roundId !== command.roundId || view.active_player_id !== command.playerId) return view;
  const board = view.boards[command.playerId], column = command.intent.column;
  if (!board?.current || board.result || board.revision !== command.revision) return view;
  return {...view,boards:{...view.boards,[command.playerId]:{...board,current:null,columns:board.columns.map((cards,i)=>i===column?[...cards,board.current!]:cards)}}};
}
export function presentationPhase(view: Projection | undefined, at: number, eventType?: string) {
  if (!view) return 'turn_preparation';
  if (eventType === 'score_presentation_completed') return 'board_clear';
  if (view.scorePresentation) return at-view.scorePresentation.startedAt<750?'terminal_result':'score_calculation';
  if (view.active_player_id) return view.boards[view.active_player_id]?.current?'active_play':'turn_preparation';
  return 'next_turn';
}
export function eventSnapshot(snapshot: Run21Snapshot, event: VisibleEvent): Run21Snapshot {
  let view = event.frame;
  if (event.type === 'score_presentation_completed') {
    // Clear only the presentation copy after the recorded score hold; frozen history stays intact.
    view = {...view,boards:Object.fromEntries(Object.entries(view.boards).map(([id,board])=>
      [id,board?{...board,columns:board.columns.map(()=>[]),current:null,result:null}:null]))};
  }
  return {...snapshot,events:undefined,view,eventSequence:event.sequence};
}
