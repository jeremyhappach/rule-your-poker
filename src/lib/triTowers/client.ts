import {supabase} from '@/integrations/supabase/client';
import type {Projection,Command} from './model';
import {UncertainTriAction,RejectedTriAction} from './intentBuffer';
import {triTiming} from './diagnostics';
export async function triTowersRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
  const endpoint=name==='tri_towers_snapshot'||name==='tri_towers_action'?'tri_towers_present_celebration':name;
  const id=String(args.p_request_id??'state'),at=performance.now();triTiming('request-start',id);
  const {data,error,status}=await supabase.rpc(endpoint as never,args as never);triTiming('response-parsed',id,performance.now()-at);
  if(error){if(!error.code||status>=500)throw new UncertainTriAction(error.message);if(/^tri_towers:(stale_revision|inactive|illegal_move|phase|complete|stock_empty)/.test(error.message))throw new RejectedTriAction(error.message);throw Error(error.message);}return data as T;
}
export function acceptSnapshot(prior:Projection|null,incoming:Projection,dealerGameId:string):Projection|null{
  if(incoming.identity.dealerGameId!==dealerGameId)return prior;
  if(prior&&incoming.revision<prior.revision)return prior;
  if(prior&&incoming.revision===prior.revision){
    // Financial transport has its own canonical cursor; it is not gameplay progress.
    const {serverAt:a,financial:af,...before}=prior,{serverAt:b,financial:bf,...after}=incoming;
    if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Conflicting TriTowers state. Reconnect required.');
  }
  return incoming;
}
export const submit=(command:Command)=>triTowersRpc<Projection>('tri_towers_action',{
  p_dealer_game_id:command.dealerGameId,p_request_id:command.requestId,p_revision:command.revision,
  p_action:command.intent.type,p_index:command.intent.type==='remove'?command.intent.index:null,
});
