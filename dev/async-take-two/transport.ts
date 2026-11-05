export class DelayedRequestError extends Error{constructor(message:string,readonly status:number){super(message);}}
const params=new URLSearchParams(location.search);
if(params.get('actor'))sessionStorage.setItem('take-two-proof-actor',params.get('actor')!);
export const actor=()=>sessionStorage.getItem('take-two-proof-actor')!;
async function send(path:string,body:unknown){
 const r=await fetch('/_take_two/'+path,{method:'POST',headers:{'Content-Type':'application/json','x-fixture-actor':actor()},body:JSON.stringify(body)});
 const result=await r.json();if(!r.ok)throw new DelayedRequestError(result.error,r.status);return result;
}
export const delayedRequest=<T,>(body:unknown):Promise<T>=>send('action',body);
export const delayedRpc=<T,>(name:string,args:unknown={}):Promise<T>=>send('rpc',{name,args});
export const gameName=(g:string)=>g==='take-two'?'Take 2':g;
export const signed=(n:number)=>n>0?'+'+n:String(n);
export const supabase={channel:()=>{const c={on:()=>c,subscribe:(cb?:(status:string)=>void)=>{cb?.('SUBSCRIBED');return c;},track:async()=>{},untrack:async()=>{},presenceState:()=>({})};return c;},removeChannel:async()=>{}};
