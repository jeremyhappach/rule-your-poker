// Loopback qualification only: actual PostgreSQL RPCs, rows and commit notifications.
const user=new URLSearchParams(location.search).get('user')!;
const channels=new Map<object,EventSource>();
const request=async(path:string,body:unknown)=>{const r=await fetch('/__tri-test/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,...body as object})});return r.json();};
export const supabase={
 rpc:(name:string,args:Record<string,unknown>)=>request('rpc',{name,args}),
 from(table:string){const filters:Record<string,unknown>={};let single=false;const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters[k]=v;return q;},maybeSingle:()=>{single=true;return q;},single:()=>{single=true;return q;},then:(yes:any,no:any)=>request('read',{table,filters,single}).then(yes,no)};return q;},
 channel(){const listeners:any[]=[];const channel={on(_event:unknown,filter:any,callback:any){listeners.push({filter,callback});return channel;},subscribe(status:(s:string)=>void){
  const stream=new EventSource('/__tri-test/events');stream.onopen=()=>status('SUBSCRIBED');stream.onerror=()=>status('CHANNEL_ERROR');
  stream.onmessage=e=>{const p=JSON.parse(e.data);for(const {filter,callback} of listeners){const [key,value]=String(filter.filter??'').split('=eq.');if(filter.table===p.table&&(filter.event==='*'||filter.event===p.eventType)&&(!key||p.new[key]===value))callback(p);}};
  channels.set(channel,stream);return channel;
 }};return channel;},
 removeChannel(channel:object){channels.get(channel)?.close();channels.delete(channel);}
};
