import {supabase} from '@/integrations/supabase/client';
import type {Intent,WordsSnapshot} from './model';
export interface Command {requestId:string;revision:number;intent:Intent}
export interface WordsTransport {load:()=>Promise<WordsSnapshot>;send:(c:Command)=>Promise<WordsSnapshot>;subscribe:(refresh:()=>void,status:(connected:boolean)=>void)=>()=>void}
export async function wordsRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error,status}=await supabase.rpc(name as never,args as never);
 if(error)throw Error(!error.code||status>=500?'Connection uncertain. Reconnect to retry.':error.message);
 const payload:unknown=data;if(payload&&typeof payload==='object'&&'error' in payload)throw Error(String(payload.error));return payload as T;
}
export function wordsTransport(id:string):WordsTransport{return {
 load:()=>wordsRpc('ptown_words_snapshot',{p_dealer_game_id:id}),
 send:async c=>{await wordsRpc('ptown_words_action',{p_dealer_game_id:id,p_request_id:c.requestId,p_revision:c.revision,p_action:c.intent.type,p_items:'items' in c.intent?c.intent.items:null});return wordsRpc('ptown_words_snapshot',{p_dealer_game_id:id});},
 subscribe:(refresh,status)=>{const channel=supabase.channel(`ptown-words:${id}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'ptown_words_revisions',filter:`dealer_game_id=eq.${id}`},refresh).subscribe(s=>status(s==='SUBSCRIBED'));return()=>{void supabase.removeChannel(channel);};},
};}
