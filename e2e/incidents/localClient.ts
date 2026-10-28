// Browser-side deterministic adapter used only by the separate incident Vite config.
const viewer=new URLSearchParams(location.search).get('viewer')??'a';
export const controls={ack:true,drop:true,channels:[] as any[]};
(window as any).__incident=controls;
export const smokeDb={rows:{} as Record<string,any[]>,listeners:[] as {table:string;event:string;fn:(payload:any)=>void}[],
 emit(table:string,event:string,row:any){for(const listener of this.listeners)if(listener.table===table&&listener.event===event)listener.fn({new:row});}};
export const supabase={
 auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 from(table:string){const filters:[string,any][]=[];const rows=()=> (smokeDb.rows[table]??[]).filter(row=>filters.every(([key,value])=>row[key]===value));const q:any={};for(const key of ['select','in','order','limit','insert','update','upsert','gte','gt','neq','is'])q[key]=()=>q;q.eq=(key:string,value:any)=>{filters.push([key,value]);return q;};q.single=q.maybeSingle=async()=>({data:rows()[0]??null,error:null});q.then=(resolve:any)=>Promise.resolve({data:rows(),error:null}).then(resolve);return q;},
 async rpc(name:string,args:any){if(!name.startsWith('tri_towers'))return {data:null,error:null};return fetch('/__incident__/rpc',{method:'POST',body:JSON.stringify({name,args,viewer})}).then(r=>r.json());},
 channel(){
  if(location.pathname.endsWith('/smoke.html')){const own:any[]=[];const ch={on(_event:any,config:any,fn:any){const listener={table:config.table,event:config.event,fn};own.push(listener);smokeDb.listeners.push(listener);return ch;},subscribe(fn:any){queueMicrotask(()=>fn?.('SUBSCRIBED'));return ch;},close(){smokeDb.listeners=smokeDb.listeners.filter(l=>!own.includes(l));}};return ch;}
  let notify=()=>{};let status=(_s:string)=>{};let prior=-1;let timer:any;let active=true;
  const record={status:(s:string)=>status(s),notify:()=>notify(),closed:false};controls.channels.push(record);
  const ch={on(_e:any,_c:any,fn:()=>void){notify=fn;return ch;},subscribe(fn:(s:string)=>void){status=fn??(()=>{});
   if(controls.ack)queueMicrotask(()=>active&&status('SUBSCRIBED'));
   timer=setInterval(async()=>{const value=await fetch('/__incident__/state').then(r=>r.json());if(!active)return;if(value.revision!==prior){prior=value.revision;if(!controls.drop)notify();}},100);
   return ch;},close(){active=false;record.closed=true;clearInterval(timer);}};return ch;
 },removeChannel(ch:any){ch.close();return Promise.resolve();},
};
