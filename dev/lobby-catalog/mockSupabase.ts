import fixture from './production-fixture.json';
let rows=structuredClone(fixture.defaults);export const writes:unknown[]=[];
export function reset(extra:typeof rows=[]){rows=structuredClone([...fixture.defaults,...extra]);writes.length=0;}
export const supabase:any={
 from(table:string){let key:string|undefined,patch:any;const result=()=>{if(patch){writes.push({table,key,patch});rows=rows.map(row=>row.game_type===key?{...row,...patch}:row);}return {data:table==='game_defaults'?(key?rows.find(row=>row.game_type===key):rows):table==='user_roles'?{role:'admin'}:table==='arcade_game_artwork'?fixture.arcadeRules.filter(r=>r.enabled).map(r=>({game:r.game,object_path:null})):[],error:null};};const q:any={select:()=>q,order:()=>q,eq:(column:string,value:string)=>{if(column==='game_type')key=value;return q;},update:(value:any)=>{patch=value;return q;},in:()=>q,single:async()=>result(),maybeSingle:async()=>result(),then:(yes:any,no:any)=>Promise.resolve(result()).then(yes,no)};return q;},
 rpc:async(name:string,args:any)=>name==='arcade_rules_help'?{data:fixture.arcadeRules.find(row=>row.id===args.p_ruleset)?.config,error:null}:{data:{armed:false},error:null},
 channel(){const c:any={on:()=>c,subscribe:()=>c};return c;},removeChannel(){},
 auth:{getSession:async()=>({data:{session:{user:{id:'local-fixture'},access_token:'local-only'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 storage:{from:()=>({download:async()=>({data:null,error:null})})}
};
