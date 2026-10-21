import {supabase} from '@/integrations/supabase/client';
import type {RacePokerTransport} from '@/hooks/useRacePoker';
import {multiplayerSnapshot} from './model';
export async function racePokerRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error,status}=await supabase.rpc(name as never,args as never);
 if(error)throw Error(!error.code||status>=500?'Connection uncertain. Reconnect to retry.':error.message);
 return data as T;
}
export function racePokerTransport(id:string):RacePokerTransport {
 const load=async()=>multiplayerSnapshot(await racePokerRpc('race_poker_snapshot',{p_dealer_game_id:id}));
 return {load,send:async command=>{
  // The action returns its immutable original receipt. Fetch current authority
  // afterwards so a recovered old receipt cannot rewind a later board.
  await racePokerRpc('race_poker_action',{p_dealer_game_id:id,p_request_id:command.requestId,p_revision:command.revision,p_action:'choose',p_items:command.intent.items});
  return load();
 },subscribe:(refresh,status)=>{
  const channel=supabase.channel(`race-poker:${id}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'race_poker_revisions',filter:`dealer_game_id=eq.${id}`},refresh).subscribe(state=>status(state==='SUBSCRIBED'));
  return()=>{void supabase.removeChannel(channel);};
 }};
}
