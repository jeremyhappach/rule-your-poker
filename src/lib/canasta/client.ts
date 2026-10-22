import type {Action,Command,Projection} from './engine';
import type {ChipPresentationBatch} from '../canonicalShell/ChipPresentationLedger';
export type Settlement={key:string;resultId:string;transferBatchId:string;batch:ChipPresentationBatch;winner:string;loser:string;amount:number;scores:Record<string,number>;startedAt:number;deadline:number};
export type Snapshot={state:Projection;serverAt:number;firstRoundId?:string;settlement:Settlement|null;finished:boolean};
export interface Transport {load():Promise<Snapshot>;send(command:Command):Promise<Snapshot>;takeControl?():Promise<Snapshot>;subscribe(refresh:()=>void):()=>void}
export class CommandRejected extends Error {}
export function httpTransport(id:string,token:()=>Promise<string>,subscribe:Transport['subscribe']):Transport{
  async function request(operation:'state'|'action'|'take-control',command?:Command):Promise<Snapshot>{
    const response=await fetch(`/__canasta/${id}/${operation}`,{method:operation==='state'?'GET':'POST',headers:{Authorization:`Bearer ${await token()}`,'Content-Type':'application/json'},
      ...(command?{body:JSON.stringify(command)}:{})});
    const body=await response.json();if(!response.ok){if(response.status>=400&&response.status<500)throw new CommandRejected(body.error);throw Error('Connection uncertain');}
    return body as Snapshot;
  }
  return {load:()=>request('state'),send:c=>request('action',c),takeControl:()=>request('take-control'),subscribe};
}
export function commandFor(state:Projection,action:Action):Command{
  const h=state.hand;if(!h||!state.viewer)throw Error('canasta:not_ready');
  return {matchId:state.id,handId:h.id,turn:h.turn,generation:h.generation,revision:state.revision,
    playerId:state.viewer,requestId:crypto.randomUUID(),action};
}
/** Equal revisions must be identical; serverAt is transport metadata, not gameplay. */
export function acceptSnapshot(prior:Snapshot|null,next:Snapshot):Snapshot{
  if(!prior)return next;
  if(next.state.id!==prior.state.id||next.state.viewer!==prior.state.viewer)throw Error('canasta:snapshot_identity');
  if(next.state.revision<prior.state.revision)return prior;
  if(next.state.revision===prior.state.revision&&JSON.stringify({...next,serverAt:0})!==JSON.stringify({...prior,serverAt:0}))throw Error('canasta:snapshot_conflict');
  if(next.state.revision===prior.state.revision&&next.serverAt<prior.serverAt)return prior;
  return next;
}
