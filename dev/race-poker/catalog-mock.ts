// Isolated presentation fixture. No backend connection or production mutation.
import {supabase as base,reset,writes} from '../lobby-catalog/mockSupabase';
import fixture from '../lobby-catalog/production-fixture.json';
export const deadline=new Date(Date.now()+600000).toISOString(),calls:{name:string;args:any}[]=[];
reset([{...fixture.defaults.find(r=>r.game_type==='boxdrop')!,game_type:'race-poker',ante_amount:5}]);
export {writes};
export const supabase:any={...base,from(table:string){if(['debug_events','debug_sync_events'].includes(table))return {insert:async()=>({error:null})};if(table!=='games')return base.from(table);const result={data:{id:'session',status:'game_selection',config_complete:false,config_deadline:deadline},error:null};const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>result,single:async()=>result};return q;},async rpc(name:string,args:any){
 calls.push({name,args});
 if(name==='race_poker_capabilities')return {data:{version:2,enabled:new URLSearchParams(location.search).get('closed')!=='1',user_id:'local-fixture',session_id:args.p_session_id,fake_money_only:false},error:null};
 if(name==='race_poker_configure')return {data:{outcome:'configured',deduped:false,setup_identity:{game_id:args.p_game_id,dealer_position:args.p_expected_dealer_position,expected_config_deadline:args.p_expected_config_deadline},game:{id:args.p_game_id,status:'ante_decision',config_complete:true,current_game_uuid:'dealer-game'},dealer_game:{id:'dealer-game',session_id:args.p_game_id,game_type:args.p_game_type},players:[{id:args.p_dealer_player_id,position:args.p_expected_dealer_position,ante_decision:'ante_up',sitting_out:false}]},error:null};
 if(name==='submit_ante_decision')return {data:{outcome:'accepted',decision:args.p_decision},error:null};
 return base.rpc(name,args);
}};
