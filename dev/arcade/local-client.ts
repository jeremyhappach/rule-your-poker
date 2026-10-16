const user=()=>({id:(window as any).__ARCADE_USER__});
const query:any=new Proxy(()=>query,{get:(_,key)=>key==='then'?Promise.resolve({data:null,error:null}).then.bind(Promise.resolve({data:null,error:null})):()=>query,apply:()=>query});
const request=async(body:any)=>fetch('/__artwork',{method:'POST',headers:{'Content-Type':'application/json','x-fixture-user':(window as any).__ARTWORK_ACTOR__??user().id},body:JSON.stringify(body)}).then(r=>r.json());
function artworkQuery(table:string){
 let op=table==='user_roles'?'role':'list',game='',path='',previous:string|null=null;
 const q:any={update:(v:any)=>{op='save';path=v.object_path;return q;},eq:(key:string,v:string)=>{if(key==='game')game=v;if(key==='object_path')previous=v;return q;},
 is:()=>q,select:()=>q,maybeSingle:()=>request({op}),single:()=>request({op,game,path,previous}),then:(ok:any,fail:any)=>request({op}).then(ok,fail)};
 return q;
}
export const supabase:any={
 auth:{getSession:async()=>({data:{session:{access_token:user().id,user:user()}}}),getUser:async()=>({data:{user:user()}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 from:(table:string)=>['arcade_game_artwork','user_roles'].includes(table)?artworkQuery(table):query,
 rpc:async(name:string,args:any)=>name==='arcade_rules_help'?request({op:'rules',ruleset:args?.p_ruleset??null}):({data:null,error:null}),
 storage:{from:()=>({
  upload:async(path:string,file:File)=>request({op:'upload',path,type:file.type,size:file.size,bytes:Array.from(new Uint8Array(await file.arrayBuffer())),fail:(window as any).__FAIL_UPLOAD__}),
  download:async(path:string)=>{const r=await request({op:'download',path});return r.error?r:{data:new Blob([new Uint8Array(r.data.body)],{type:r.data.type}),error:null};},
  remove:(paths:string[])=>request({op:'remove',paths})
 })},
 channel:()=>{let callback=()=>{},stream:EventSource;const channel={on:(_e:any,_f:any,fn:any)=>{callback=fn;return channel;},subscribe:(status:any)=>{stream=new EventSource('/__arcade-events');stream.onmessage=()=>callback();stream.onopen=()=>status?.('SUBSCRIBED');return channel;},unsubscribe:()=>stream?.close()};return channel;},
 removeChannel:(channel:any)=>channel.unsubscribe()
};

