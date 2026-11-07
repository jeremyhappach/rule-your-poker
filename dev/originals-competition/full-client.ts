// Local transport only: every gameplay/session read and write reaches PostgreSQL.
const actor=sessionStorage.getItem('originals-user')!;
const user={id:actor,email:'originals@example.invalid',email_confirmed_at:'2026-01-01',app_metadata:{provider:'email'},user_metadata:{}};
const channels=new Set<any>();
new EventSource('/fixture/events').onmessage=event=>{
 const change=JSON.parse(event.data);
 for(const channel of channels)for(const h of channel.handlers){if(h.kind!=='postgres_changes'||h.filter.event&&h.filter.event!=='*'&&h.filter.event!==change.eventType||h.filter.table&&h.filter.table!==change.table)continue;const f=h.filter.filter?.match(/^([a-z_]+)=eq\.(.+)$/);if(f&&String((change.new??change.old)?.[f[1]])!==f[2])continue;h.fn(change);}
};
async function request(path:string,body:any){const res=await fetch(path,{method:'POST',headers:{'x-fixture-user':actor},body:JSON.stringify(body)});return res.json();}
export function useAuthGuard(){return {user,isReady:true,authInvalidated:false};}
export const supabase:any={
 auth:{getSession:async()=>({data:{session:{access_token:actor,user}},error:null}),getUser:async()=>({data:{user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 rpc:(name:string,args:any)=>request('/fixture/rpc',{name,args}),
 from(table:string){const query:any={table,filters:[],orders:[]};const chain:any={
  select:(columns='*')=>{query.columns=columns;return chain;},
  single:()=>{query.single=true;return chain;},maybeSingle:()=>{query.single=true;return chain;},
  limit:(n:number)=>{query.limit=n;return chain;},range:(from:number,to:number)=>{query.offset=from;query.limit=to-from+1;return chain;},
  order:(key:string,options:any={})=>{query.orders.push({key,ascending:options.ascending!==false});return chain;},
  update:(value:any)=>{query.update=value;return chain;},insert:(value:any)=>{query.insert=value;return chain;},
  then:(ok:any,no:any)=>request('/fixture/table',query).then(ok,no)
 };for(const op of ['eq','neq','gt','gte','lt','lte','in','is','not','or'])chain[op]=(...args:any[])=>{query.filters.push({op,args});return chain;};return chain;},
 channel(name:string){const channel:any={name,handlers:[],on(kind:string,filter:any,fn:any){channel.handlers.push({kind,filter,fn});return channel;},subscribe(cb:any){channels.add(channel);queueMicrotask(()=>cb?.('SUBSCRIBED'));return channel;},track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({}),unsubscribe:async()=>channels.delete(channel)};return channel;},
 removeChannel:async(channel:any)=>channels.delete(channel),removeAllChannels:async()=>channels.clear(),getChannels:()=>[...channels],
 functions:{invoke:async()=>({data:null,error:null})}
};
