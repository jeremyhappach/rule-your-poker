// Optional canonical presentation reads in the isolated loopback preview.
const channels=new Map<object,EventSource>();
async function request(path:string,body:object){const user=new URLSearchParams(location.search).get('user');const r=await fetch('/__takeTwo/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,...body})});return r.json();}
export const supabase={
 async rpc(name:string,args:object){return request('rpc',{name,args});},
 from(table:string){const filters:Record<string,unknown>={};let single=false;const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},maybeSingle:()=>{single=true;return q;},single:()=>{single=true;return q;},then:(yes:any,no:any)=>request('read',{table,filters,single}).then(yes,no)};return q;},
 channel(){const listeners:any[]=[];const channel={on(_event:unknown,filter:any,callback:any){listeners.push({filter,callback});return channel;},subscribe(status:(s:string)=>void){const id=listeners[0]?.filter.filter?.split('=eq.')[1];const stream=new EventSource('/__takeTwo/events?id='+id);stream.onopen=()=>status('SUBSCRIBED');stream.onerror=()=>status('CHANNEL_ERROR');stream.onmessage=e=>{const p=JSON.parse(e.data);for(const {filter,callback}of listeners)if(p.table===filter.table)callback(p);};channels.set(channel,stream);return channel;}};return channel;},
 removeChannel(channel:object){channels.get(channel)?.close();channels.delete(channel);}
};
