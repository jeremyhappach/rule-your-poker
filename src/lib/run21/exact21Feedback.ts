import type {VisibleEvent} from './history';
import {total} from './rules';

/** Accepted event frames only. Optimistic board renders cannot trigger feedback. */
export class Exact21Feedback {
  private scope: string | null = null;
  private sequence = 0;
  accept(scope: string, playerId: string, events: VisibleEvent[]): Record<number,number> | null {
    if(this.scope!==scope){
      this.scope=scope;this.sequence=Math.max(0,...events.map(e=>e.sequence));return {};
    }
    const pulses:Record<number,number>={};
    for(const event of events){
      if(event.sequence<=this.sequence)continue;
      this.sequence=event.sequence;
      if(event.type!=='card_placed'||event.actorId!==playerId)continue;
      const index=event.operands.column;
      if(typeof index!=='number'||!Number.isInteger(index))continue;
      const cards=event.frame.boards[playerId]?.columns[index];
      if(cards?.length&&total(cards,event.frame.config.target).value===21&&total(cards.slice(0,-1),event.frame.config.target).value!==21)pulses[index]=event.sequence;
    }
    return Object.keys(pulses).length?pulses:null;
  }
}
