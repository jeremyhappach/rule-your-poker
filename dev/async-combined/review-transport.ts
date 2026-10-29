async function send(body:unknown){const response=await fetch('/fixture-review-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return response.json();}
export const delayedRpc=(name:string,args:unknown={})=>send({name,args});
export const delayedRequest=send;
export class DelayedRequestError extends Error{constructor(message:string,readonly status:number){super(message);}}
export const gameName=(g:string)=>g;
export const signed=String;
export const supabase={channel:()=>{const c={on:()=>c,subscribe:(cb?:(status:string)=>void)=>{cb?.('SUBSCRIBED');return c;}};return c;},removeChannel:async()=>{}};
