// Never connects to a database. Playwright fulfills this local endpoint.
export async function delayedRequest(body:unknown){return fetch('/fixture-api',{method:'POST',body:JSON.stringify(body)}).then(r=>r.json());}
export const delayedRpc=()=>Promise.resolve({items:[],actionable:0});
export class DelayedRequestError extends Error{status=500;}
export const gameName=(game:string)=>({'tri-towers':'TriTowers',run21:'Run21',quintzee:'Quintzee',boxdrop:'Boxdrop'}[game]??game);
export const supabase={channel:()=>{const channel={on:(_event:unknown,_filter:unknown,cb:(p:unknown)=>void)=>{
 (window as any).fixtureUpdate=()=>cb({new:{match_id:'match'}});return channel;
},subscribe:()=>channel};return channel;},removeChannel:()=>Promise.resolve()};
