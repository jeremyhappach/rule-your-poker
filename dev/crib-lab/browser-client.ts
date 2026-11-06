// Loopback browser fixture. The browser runner sends gameplay RPCs to real PostgreSQL.
const actor=sessionStorage.getItem('lab-proof-user')!;
export function useAuthGuard(){return {user:{id:actor},isReady:true};}
export const supabase={
  auth:{getSession:async()=>({data:{session:{access_token:actor,user:{id:actor}}}})},
  rpc:async(name:string,args:object)=>({data:await (await fetch('/fixture/rpc',{method:'POST',body:JSON.stringify({name,args})})).json(),error:null}),
  from(table:string){
    let patch:Record<string,unknown>={},single=false;
    const chain:any={select:()=>chain,eq:()=>chain,in:()=>chain,update:(v:Record<string,unknown>)=>{patch=v;return chain;},
      single:()=>{single=true;return chain;},maybeSingle:()=>{single=true;return chain;},
      then:(ok:any,no:any)=>Promise.resolve({data:table==='profiles'?{play_sounds:true,...patch}:single?null:[],error:null}).then(ok,no)};
    return chain;
  },
  channel(){const channel={on:()=>channel,subscribe:(cb:(s:string)=>void)=>{queueMicrotask(()=>cb?.('SUBSCRIBED'));return channel;}};return channel;},
  removeChannel:async()=>{},
};
