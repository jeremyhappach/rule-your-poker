import {supabase as base} from '../arcade/local-client';
export const supabase={...base,rpc:(name:string,args:unknown)=>{
 if(!['run21_timing_grant','run21_store_timing'].includes(name))return base.rpc(name,args);
 const request=(signal?:AbortSignal)=>fetch('/__timing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args}),signal}).then(r=>r.json());
 return{abortSignal:request,then:(resolve:unknown,reject:unknown)=>request().then(resolve as never,reject as never)};
}};
