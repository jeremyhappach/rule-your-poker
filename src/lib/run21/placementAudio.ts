import type {BoardFeedbackEvent} from './exact21Feedback';

/** Consumes confirmed events only. Every mount/recovery establishes a silent baseline. */
export class PlacementAudio {
  private scope='';
  private epoch=-1;
  private sequence=0;
  accept(scope:string,epoch:number,events:BoardFeedbackEvent[],enabled:boolean){
    const baseline=this.scope!==scope||this.epoch!==epoch;
    this.scope=scope;this.epoch=epoch;
    let key:string|null=null;
    for(const event of events){
      if(event.sequence<=this.sequence&&!baseline)continue;
      if(!baseline&&enabled&&event.type==='card_placed'&&event.actorId&&Number.isInteger(event.operands.column))
        key=JSON.stringify([scope,event.actorId,event.sequence]);
    }
    this.sequence=Math.max(baseline?0:this.sequence,...events.map(e=>e.sequence));
    return key;
  }
}
