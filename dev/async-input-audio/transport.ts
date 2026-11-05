export async function delayedRequest(body:unknown){return fetch('/fixture-api',{method:'POST',body:JSON.stringify(body)}).then(r=>r.json());}
export const arcadeRequest=delayedRequest;
export const delayedRpc=()=>Promise.resolve({items:[],actionable:0});
export class DelayedRequestError extends Error{status=500;}
export const gameName=()=> 'TriTowers';
let enabled=new URLSearchParams(location.search).get('mute')!=='1';
export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'local'}}})},from:()=>{const q={select:()=>q,eq:()=>q,update:(v:any)=>{enabled=v.play_sounds;return q;},maybeSingle:async()=>({data:{play_sounds:enabled}}),single:async()=>({data:{play_sounds:enabled}})};return q;},channel:()=>{const c={on:()=>c,subscribe:()=>c,track:async()=>{},untrack:async()=>{},presenceState:()=>({})};return c;},removeChannel:async()=>{}};
