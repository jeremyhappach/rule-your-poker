// Local qualification transport only. No production account or write access.
const request=async(path:string,body:object)=>(await fetch('/fixture/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
export const supabase={
 rpc:(name:string,args?:object)=>request('rpc',{name,args}),
 from(table:string){let body:Record<string,unknown>={table};const chain:any={
  select(){return chain;},order(){return chain;},eq(){return chain;},in(){return chain;},limit(){return chain;},maybeSingle(){body.single=true;return chain;},single(){body.single=true;return chain;},
  update(value:unknown){body={...body,value};return chain;},
  then(resolve:unknown,reject:unknown){return request('table',body).then(resolve as any,reject as any);}
 };return chain;},
 channel(){const channel={on(){return channel;},subscribe(){return channel;},track:async()=>{},untrack:async()=>{},presenceState:()=>({})};return channel;},removeChannel:()=>{},
};
