import type {Intent} from './model';
import {triTiming} from './diagnostics';
export type BufferedIntent=Intent|{type:'abandon'};
export interface IntentView {scope:string;actor:string;roundId:string;revision:number;phase:string;waste:number;cards:(number|null)[];removed:number[];allowed:boolean}
export interface FrozenIntent {requestId:string;revision:number;roundId:string;scope:string;intent:BufferedIntent}
interface Entry {intent:BufferedIntent;scope:string;waste:number;card:number|null;at:number}
export class UncertainTriAction extends Error {}
/** Rejection after receipt lookup proves this immutable request was not applied. */
export class RejectedTriAction extends Error {}
/** Orders intentions, never reduces gameplay. Only the server accepts a move. */
export class TriIntentBuffer {
 queue:Entry[]=[]; sent:FrozenIntent|null=null; uncertain=false; message=''; running=false;
 private restored=''; private storageKey=''; private interrupted=false;
 constructor(private io:{read:()=>IntentView|null;send:(c:FrozenIntent)=>Promise<IntentView>;change:()=>void;storage?:Storage;key:string}){}
 get busy(){return !!this.sent||this.queue.length>0;}
 get pendingCards(){return [...(this.sent?[this.sent.intent]:[]),...this.queue.map(e=>e.intent)].flatMap(i=>i.type==='remove'?[i.index]:[]);}
 private changed(){this.io.change();}
 private persist(){try{if(this.sent){if(!this.io.storage)return false;this.io.storage.setItem(this.storageKey,JSON.stringify(this.sent));}else this.io.storage?.removeItem(this.storageKey);return true;}catch{return false;}}
 restore(){const v=this.io.read();if(!v)return;const key=this.io.key+':'+v.actor;if(this.restored===key)return;this.restored=key;this.storageKey=key;
  try{const c=JSON.parse(this.io.storage?.getItem(key)??'null');if(c?.requestId&&Number.isSafeInteger(c.revision)&&c.scope&&c.intent){this.sent=c;this.uncertain=true;this.message='Resolving the previous play…';this.changed();}}catch{/* Invalid local diagnostics cannot authorize a command. */}
 }
 enqueue(intent:BufferedIntent){this.restore();const v=this.io.read();
  if(!v?.allowed||!['ready','playing'].includes(v.phase)||this.uncertain){this.message=this.uncertain?'Reconnect to resolve the previous play.':'That play is unavailable now.';this.changed();return;}
  if(this.busy&&(v.phase==='ready'||intent.type!=='remove'||this.sent?.intent.type!=='remove'||this.queue.some(e=>e.intent.type!=='remove'))){this.message='Wait for the current play to be confirmed.';this.changed();return;}
  if(this.pendingCards.length>=4){this.message='Four plays are pending. Try that card again after confirmation.';this.changed();return;}
  const card=intent.type==='remove'?v.cards[intent.index]:null;
  if(intent.type==='remove'&&(card==null||v.removed.includes(intent.index)||this.pendingCards.includes(intent.index))){this.message='That card is unavailable or already pending.';this.changed();return;}
  const tail=this.queue.at(-1),head=this.sent?.intent;
  const waste=tail?.card??(head?.type==='remove'?v.cards[head.index]:null)??v.waste;
  this.queue.push({intent,scope:v.scope,waste,card,at:performance.now()});triTiming('queued',v.scope,undefined,String(this.queue.length));this.message='';this.changed();void this.pump();
 }
 interrupt(){this.interrupted=true;if(this.sent)this.uncertain=true;if(this.queue.length)this.message='Unsent plays were cancelled. Review the board before playing again.';this.queue=[];this.changed();}
 async recover(){this.restore();if(this.running)return;if(this.sent){await this.execute();}else{this.interrupted=false;this.changed();}}
 private async pump(){if(this.running||this.sent||!this.queue.length)return;
  const next=this.queue.shift()!,v=this.io.read();
  if(!v?.allowed||v.scope!==next.scope||v.waste!==next.waste||!['ready','playing'].includes(v.phase)||(next.intent.type==='remove'&&(v.cards[next.intent.index]!==next.card||v.removed.includes(next.intent.index)))){
   this.queue=[];this.message='The confirmed board differs from the pending play. Choose again.';this.changed();return;
  }
  this.interrupted=false;this.sent={requestId:crypto.randomUUID(),revision:v.revision,roundId:v.roundId,scope:v.scope,intent:next.intent};
  if(!this.persist()){this.sent=null;this.queue=[];this.message='Site storage is unavailable. Enable it so pending plays can recover safely.';this.changed();return;}
  triTiming('dispatch',this.sent.requestId,performance.now()-next.at);await this.execute();
 }
 private async execute(){const c=this.sent;if(!c||this.running)return;const resolving=this.uncertain;this.running=true;this.changed();
  try{const v=await this.io.send(c);const moved=c.intent.type==='remove'?v.removed.includes(c.intent.index):true;
   this.sent=null;this.uncertain=false;this.persist();this.message=this.interrupted?'Previous play resolved. Unsent plays were cancelled; review the board before playing again.':resolving?'Previous play resolved. Review the board before playing again.':'';
   if(this.interrupted||v.scope!==c.scope||!moved||!['ready','playing'].includes(v.phase)){if(this.queue.length)this.message='Pending plays were cancelled after the confirmed result.';this.queue=[];}
  }catch(e){this.queue=[];this.uncertain=e instanceof UncertainTriAction||(resolving||this.uncertain)&&!(e instanceof RejectedTriAction);
   if(!this.uncertain){this.sent=null;this.persist();}
   this.message=this.uncertain?'Play outcome is uncertain. Reconnect to resolve it before playing again.':`${e instanceof Error?e.message:'Play rejected.'} Pending plays were cancelled.`;
  }finally{this.running=false;this.changed();}
  if(!this.sent)void this.pump();
 }
}
