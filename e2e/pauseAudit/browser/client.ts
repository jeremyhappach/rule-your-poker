// Synthetic transport; no credentials, SDK connection or remote requests.
export const game={status:'game_selection',config_complete:false,config_deadline:new Date(Date.now()+600000).toISOString(),is_paused:false};
export const supabase={
 from:(table:string)=>{const result=()=>({data:table==='games'?{...game}:table==='game_defaults'?{ante_amount:5,rollover_amount:1,leg_value:1,legs_to_win:3,pussy_tax_enabled:true,pussy_tax_value:1,pot_max_enabled:true,pot_max_value:10,chucky_cards:4}:[],error:null});const q:any={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,limit:()=>q,insert:()=>q,upsert:()=>q,single:async()=>result(),maybeSingle:async()=>result(),then:(yes:any,no:any)=>Promise.resolve(result()).then(yes,no)};return q;},
 rpc:async()=>({data:null,error:null}),
 channel:()=>{const c:any={on:()=>c,subscribe:()=>c};return c;},removeChannel:()=>{},
};
