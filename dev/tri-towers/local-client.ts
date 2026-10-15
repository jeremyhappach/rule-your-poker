// Test-only transport: same client contract, local PostgreSQL + commit notifications.
// Never imported by application code or a production Vite configuration.
const user=new URLSearchParams(location.search).get('user')!;
const channels=new Map<object,EventSource>();
export const supabase={
 async rpc(name:string,args:Record<string,unknown>){const response=await fetch('/__tri-test/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,name,args})});return response.json();},
 channel(){let notify=()=>{};const channel={on(_event:unknown,_filter:unknown,callback:()=>void){notify=callback;return channel;},subscribe(status:(s:string)=>void){
  const stream=new EventSource('/__tri-test/events');stream.onopen=()=>status('SUBSCRIBED');stream.onmessage=()=>notify();stream.onerror=()=>status('CHANNEL_ERROR');channels.set(channel,stream);return channel;
 }};return channel;},
 removeChannel(channel:object){channels.get(channel)?.close();channels.delete(channel);},
};
