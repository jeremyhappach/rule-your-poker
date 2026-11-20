import {supabase as fixture} from '../originals-competition/browser-client';

export const supabase={
 ...fixture,
 channel(){
  let change:((payload:unknown)=>void)|undefined;
  const listener=()=>change?.({new:{match_id:'44444444-4444-4444-8444-444444444444'}});
  const channel={
   on(event:string,_filter:unknown,callback:(payload:unknown)=>void){
    if(event==='postgres_changes')change=callback;
    return channel;
   },
   subscribe(callback?:(status:string)=>void){
    window.addEventListener('async-chucky-revision',listener);
    queueMicrotask(()=>callback?.('SUBSCRIBED'));
    return channel;
   },
   remove(){window.removeEventListener('async-chucky-revision',listener);},
  };
  return channel;
 },
 removeChannel:async(channel:{remove?:()=>void})=>channel.remove?.(),
};
