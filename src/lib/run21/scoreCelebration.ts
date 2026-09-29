import type {Run21Snapshot} from './localClient';
import {eventSnapshot} from './livePresentation';

export interface ScoreCelebrationReceipt {key:string; aggregate:104|105; playerName:string}
interface HeldScore {receipt:ScoreCelebrationReceipt; snapshot:Run21Snapshot; scoringAt:number|null}
/** Presentation-only receipts. The latest authoritative snapshot is never modified or persisted here. */
export class ScoreCelebrations {
  private scope='';
  private received=0;
  private initialized=false;
  private queue:HeldScore[]=[];
  accept(snapshot:Run21Snapshot, recovery=false) {
    const scope=JSON.stringify(snapshot.view.identity);
    if(scope!==this.scope){this.scope=scope;this.queue=[];this.received=0;this.initialized=false;}
    const baseline=recovery||!this.initialized;
    this.initialized=true;
    for(const event of snapshot.events??[]) {
      if(event.sequence<=this.received)continue;
      this.received=event.sequence;
      if(baseline||event.type!=='score_presentation_started'||JSON.stringify(event.frame.identity)!==scope)continue;
      const phase=event.frame.scorePresentation, result=phase&&event.frame.boards[phase.playerId]?.result;
      if(!phase||!result||result.score<=0||(result.aggregate!==104&&result.aggregate!==105))continue;
      this.queue.push({receipt:{key:JSON.stringify([scope,event.roundId,phase.playerId,event.sequence]),
        aggregate:result.aggregate,playerName:event.frame.players.find(p=>p.id===phase.playerId)!.name},
        snapshot:eventSnapshot(snapshot,event),scoringAt:null});
    }
    this.received=Math.max(this.received,snapshot.eventSequence??0);
  }
  get receipt(){const current=this.queue[0];return current?.scoringAt===null?current.receipt:null;}
  get pending(){return this.queue.length>0;}
  retire(key:string,at:number){
    const current=this.queue[0];
    if(current?.receipt.key!==key||current.scoringAt!==null)return;
    current.scoringAt=at;
  }
  frame(latest:Run21Snapshot,liveNow:number,at:number){
    let held=this.queue[0];
    while(held&&held.scoringAt!==null&&at-held.scoringAt>=held.snapshot.view.scorePresentation!.endsAt-held.snapshot.view.scorePresentation!.startedAt){
      this.queue.shift();held=this.queue[0];
    }
    if(!held)return {snapshot:latest,now:liveNow};
    const phase=held.snapshot.view.scorePresentation!;
    return {snapshot:held.snapshot,now:phase.startedAt+(held.scoringAt===null?0:at-held.scoringAt)};
  }
}
