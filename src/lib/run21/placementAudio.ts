import type {BoardFeedbackEvent} from './exact21Feedback';

/** Consumes confirmed events only. Every mount/recovery establishes a silent baseline. */
export class PlacementAudio {
  private scope='';
  private epoch=-1;
  private sequence=0;
  accept(scope:string,epoch:number,events:BoardFeedbackEvent[],enabled:boolean){
    const baseline=this.scope!==scope||this.epoch!==epoch;
    this.scope=scope;this.epoch=epoch;
    let action:{key:string;kind:'play'|'pass'}|null=null;
    for(const event of events){
      if(event.sequence<=this.sequence&&!baseline)continue;
      if(baseline||!enabled||!event.actorId)continue;
      const kind=event.type==='card_placed'&&Number.isInteger(event.operands.column)?'play':event.type==='pass_used'?'pass':null;
      if(kind)action={key:JSON.stringify([scope,event.actorId,event.sequence]),kind};
    }
    this.sequence=Math.max(baseline?0:this.sequence,...events.map(e=>e.sequence));
    return action;
  }
}
