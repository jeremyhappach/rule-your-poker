/** Local presentation fixture only. No Supabase URL, login, or production API. */
const params=new URLSearchParams(location.search),player=params.get('player')??'a';
async function request<T>(mode:string,body:Record<string,unknown>):Promise<T>{
 const response=await fetch('/fixture/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,player,...body})});
 const value=await response.json();if(!response.ok)throw new Error(value.error);return value;
}
export const arcadeRequest=<T,>(body:Record<string,unknown>)=>request<T>('arcade',body);
export const delayedRequest=<T,>(body:Record<string,unknown>)=>request<T>('async',body);
export const delayedRpc=<T,>(name:string,args:Record<string,unknown>)=>request<T>('async',{op:name,...args});
export const supabase={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{play_sounds:sessionStorage.getItem('five-alive-preview-muted')!=='true'},error:null})})})}),rpc:async(_name:string,args:{p_enabled?:boolean})=>{sessionStorage.setItem('five-alive-preview-muted',String(!args.p_enabled));return {data:args.p_enabled,error:null};},channel:()=>{
 let stream:EventSource|undefined,update=()=>{};
 return {on(_event:unknown,_filter:unknown,callback:()=>void){update=callback;return this;},
  subscribe(callback:(status:string)=>void){stream=new EventSource('/fixture/events');stream.onmessage=()=>update();stream.onopen=()=>callback('SUBSCRIBED');return this;},
  close(){stream?.close();}};
},removeChannel:(channel:{close:()=>void})=>channel.close()};
