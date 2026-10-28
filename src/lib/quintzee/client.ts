import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {QuintzeeTransport} from '@/hooks/useQuintzee';
import type {QuintzeeSnapshot,QuintzeeState} from './model';
import type {BoxdropSnapshot} from '@/lib/boxdrop/model';

export interface QuintzeeProductionSnapshot extends QuintzeeSnapshot {
 viewerId?:string;identity?:BoxdropSnapshot['identity'];financial?:BoxdropSnapshot['financial'];
 settlement?:BoxdropSnapshot['settlement'];terminal?:BoxdropSnapshot['terminal'];completion?:BoxdropSnapshot['completion'];
 closed?:boolean;participants?:BoxdropSnapshot['players'];
}
export async function quintzeeRpc<T=any>(name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error,status}=await supabase.rpc(name as never,args as never);
 if(error)throw Object.assign(Error(error.message),{definitive:!!error.code&&status<500});
 return data as T;
}
export function projectQuintzee(raw:any,userId:string,solo:boolean):QuintzeeProductionSnapshot{
 if(solo){
  const b=raw.view,results=raw.results??[];
  const state:QuintzeeState={rules:b.rules,players:[userId],scores:{[userId]:raw.score},round:b.round,turnIndex:0,
   qualified:b.round===3?[userId]:[],results,finished:raw.status!=='active',board:b};
  return {id:raw.id,revision:raw.revision,scope:b.roundId,serverAt:raw.serverAt,state,theme:raw.theme==='modern'?'modern':'classic',pausedAt:null,
   status:raw.status,outcome:'current',completion:raw.completion,playerNames:{[userId]:'You'}};
 }
 const id=raw.identity.dealerGameId,state=raw.core as QuintzeeState;
 return {id,revision:raw.revision,scope:[id,raw.identity.roundId,state.round,state.turnIndex].join(':'),serverAt:raw.serverAt,state,
  theme:raw.theme==='modern'?'modern':'classic',pausedAt:raw.pausedAt??null,status:state.finished?'completed':'active',outcome:'current',
  autoplay:raw.autoplay??false,identity:raw.identity,financial:raw.financial,settlement:raw.settlement,terminal:raw.terminal,closed:raw.finished,viewerId:raw.viewerId,
  playerNames:Object.fromEntries(raw.players.map((p:any)=>[p.id,p.name])),participants:raw.players.map((p:any)=>({...p,score:state.scores[p.id]??0,active:p.id===state.players[state.turnIndex],chips:raw.financial?.balances[p.id]}))};
}
export function quintzeeTransport(id:string,userId:string,solo:boolean):QuintzeeTransport{
 const project=(v:any)=>projectQuintzee(v,userId,solo);
 return {
  load:async()=>project(solo?await arcadeRequest({op:'state',game:'quintzee',runId:id}):await quintzeeRpc('quintzee_snapshot',{p_dealer_game_id:id})),
  send:async c=>project(solo?await arcadeRequest({op:'action',game:'quintzee',runId:id,requestId:c.requestId,revision:c.revision,roundId:c.scope,intent:c.intent}):c.intent.type==='reclaim'?await quintzeeRpc('quintzee_reclaim',{p_dealer_game_id:id,p_revision:c.revision}):await quintzeeRpc('quintzee_action',{p_dealer_game_id:id,p_request_id:c.requestId,p_revision:c.revision,p_action:c.intent.type,p_items:c.intent.items})),
  subscribe:refresh=>{
   const channel=supabase.channel(`quintzee:${id}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:solo?'arcade_revisions':'quintzee_revisions',filter:`${solo?'run_id':'dealer_game_id'}=eq.${id}`},refresh).subscribe(state=>{if(state==='SUBSCRIBED')refresh();});
   return()=>{void supabase.removeChannel(channel);};
  },
 };
}
