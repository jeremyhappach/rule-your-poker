import {randomUUID} from 'node:crypto';
import {execute,expire,automaticTurn,pause,startHand,takeControl,project,type Match,type Command} from '../../src/lib/canasta/engine.js';
import {chooseBotAction} from '../../src/lib/canasta/bot.js';
import {secureDeck} from './shuffle.js';

export type RecordState={state:Match;firstRoundId:string;activeHumans:string[];botDue:number|null;serverAt:number;finished:boolean;settlement:unknown};
export type CommitContext={kind:'command';command:Command;userId:string}|{kind:'recover'}|{kind:'control';userId:string};
/** Commit must lock canonical identity, recheck membership/consent, use a fresh database
 * clock, enforce deadline/CAS, and atomically perform canonical settlement if decided. */
export interface Store {
  load(id:string,userId?:string):Promise<RecordState>;
  commit(prior:RecordState,next:Match,context:CommitContext):Promise<RecordState>;
  finish(id:string):Promise<void>;
}
export class CanastaAuthority {
  constructor(readonly store:Store,readonly deck=secureDeck){}
  async action(id:string,userId:string,command:Command){
    const row=await this.store.load(id,userId);
    const result=execute(row.state,command,{kind:'human',userId},row.serverAt);
    // Even exact retries recheck current canonical membership at the store boundary.
    const committed=await this.store.commit(row,result.state,{kind:'command',command,userId});
    return this.visible(committed,userId);
  }
  async read(id:string,userId:string){return this.visible(await this.store.load(id,userId),userId);}
  private visible(row:RecordState,userId:string){
    const seat=row.state.seats.find(s=>s.kind==='human'&&s.userId===userId);
    return {state:project(row.state,seat?.id??null),firstRoundId:row.firstRoundId,serverAt:row.serverAt,settlement:row.settlement,finished:row.finished};
  }
  /** Invoked by durable server scheduling; all transition identities remain in the store. */
  async recover(id:string){
    for(let attempt=0;attempt<3;attempt++){
      const row=await this.store.load(id);let state=row.state;const at=row.serverAt,h=state.hand;
      if(row.finished)return row;
      if(row.settlement){await this.store.finish(id);return this.store.load(id);}
      if(state.pause)return row;
      if(!h||h.phase==='complete'){
        if(!state.winner)state=startHand(state,h?randomUUID():row.firstRoundId,this.deck(),at);
      }else if(at>=h.deadline)state=expire(state,at,row.activeHumans);
      else if(state.automatic.includes(h.active)&&row.botDue!==null&&at>=row.botDue)state=automaticTurn(state,at,row.activeHumans);
      else if(state.seats.find(s=>s.id===h.active)?.kind==='bot'&&row.botDue!==null&&at>=row.botDue){
        const action=chooseBotAction(project(state,h.active));
        if(action)state=execute(state,{matchId:state.id,handId:h.id,turn:h.turn,generation:h.generation,
          revision:state.revision,requestId:randomUUID(),playerId:h.active,action},{kind:'service'},at).state;
        else state=pause(state,at,'recovery');
      }
      if(state===row.state)return row;
      try{return await this.store.commit(row,state,{kind:'recover'});}
      catch(error){if(!(error instanceof Error)||error.message!=='canasta:conflict'||attempt===2)throw error;}
    }
    throw Error('canasta:conflict');
  }
  /** Pause/resume remains on the existing host-authorized set_game_paused RPC. */
  async takeControl(id:string,userId:string){
    const row=await this.store.load(id,userId),seat=row.state.seats.find(s=>s.kind==='human'&&s.userId===userId);
    if(!seat)throw Error('canasta:unauthorized');
    const state=takeControl(row.state,seat.id,{kind:'human',userId},row.serverAt);
    return this.visible(await this.store.commit(row,state,{kind:'control',userId}),userId);
  }
}
