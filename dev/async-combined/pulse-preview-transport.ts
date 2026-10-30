// The pulse-only scenario has immutable game state. Only presence needs SSE.
// This also avoids the browser's per-origin HTTP/1 connection limit with two frames.
export const viewer=new URLSearchParams(location.search).get('viewer');
async function request(body:unknown){const r=await fetch('/preview/api',{method:'POST',headers:{'Content-Type':'application/json','X-Preview-Viewer':viewer??''},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
export const supabase={
 rpc:async(name:string,args:unknown)=>{try{return {data:await request({name,args}),error:null};}catch(e){return {data:null,error:{message:String(e)}};}},
 channel:(topic:string)=>{
  const id=crypto.randomUUID();let source:EventSource|null=null,state={},closed=false,callbacks:{event:string;fn:(p:any)=>void}[]=[];
  const channel={on:(event:string,_filter:unknown,fn:(p:any)=>void)=>{callbacks.push({event,fn});return channel;},subscribe:(status?:(s:string)=>void)=>{
   if(!topic.startsWith('delayed-playing:')){queueMicrotask(()=>{if(!closed)status?.('SUBSCRIBED');});return channel;}
   source=new EventSource('/preview/events?'+new URLSearchParams({topic,id,viewer:viewer??''}));source.onopen=()=>status?.('SUBSCRIBED');source.onerror=()=>status?.('CHANNEL_ERROR');source.onmessage=e=>{const p=JSON.parse(e.data);if(p.event==='presence')state=p.state;callbacks.filter(c=>c.event===p.event).forEach(c=>c.fn(p.payload));};return channel;
  },presenceState:()=>state,track:(payload:unknown)=>request({name:'presence',topic,id,payload}),untrack:()=>topic.startsWith('delayed-playing:')?request({name:'leave',topic,id}):Promise.resolve(),close:()=>{closed=true;source?.close();}};return channel;
 },removeChannel:async(c:{close:()=>void})=>c.close(),
 auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{user:{id:viewer},access_token:'local-pulse-fixture'}}})},
};
