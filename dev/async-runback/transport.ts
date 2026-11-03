async function call(body:unknown){const r=await fetch('/runback-fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await r.json();if(!r.ok)throw Error(value.error);return value;}
export const delayedRpc=(name:string,args:unknown={})=>call({name,args});
export const delayedRequest=call;
export class DelayedRequestError extends Error{constructor(message:string,readonly status:number){super(message);}}
export const gameName=(game:string)=>game;
export const signed=String;
export const supabase={channel:()=>{const c={on:()=>c,subscribe:(cb?:(status:string)=>void)=>{cb?.('SUBSCRIBED');return c;}};return c;},removeChannel:async()=>{}};
