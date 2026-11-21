// Local review data only. This module is aliased by dev/midnight-blue/server.mjs;
// it is never imported by the application or included in the production build.
export const viewer='11111111-1111-4111-8111-111111111111';
export const other='22222222-2222-4222-8222-222222222222';
const defaults={ante_amount:3,rollover_amount:1,leg_value:1,legs_to_win:3,pussy_tax_enabled:true,pussy_tax_value:1,pot_max_enabled:true,pot_max_value:15,chucky_cards:4,rabbit_hunt:true,golf_holes:9,cribbage_game_mode:'full',skunks_enabled:true,gin_rummy_points_to_win:100,gin_rummy_per_point_value:0,gin_rummy_gin_bonus:25,gin_rummy_undercut_bonus:25};
const games=['run21','tri-towers','quintzee','ptown-words','chess','crib-lab','chucky-showdown','mega-card-golf','boxdrop','take-two','five-alive'];
export const calls:{name:string;args:unknown}[]=[];
(window as any).midnightCalls=calls;
const child=(game:string,i:number)=>({id:'child-'+i,ordinal:i+1,game,stake:3,config:null,terminal:false,actor:viewer,playable:true,expiresAt:new Date(Date.now()+72*3600000).toISOString(),scores:{[viewer]:0,[other]:0}});
const home=(i:number)=>({id:'match-'+i,status:i===2?'invited':'active',revision:1,realMoney:true,organizer:viewer,opponent:other,players:[{id:viewer,name:'Hap'},{id:other,name:['M Crew 81','Chucky','RiverRat'][i]}],createdAt:new Date().toISOString(),acceptedAt:i===2?null:new Date().toISOString(),completed:0,net:0,lineup:i===0?[child('run21',0),child('run21',1),child('ptown-words',2)]:[{...child(i===1?'tri-towers':'quintzee',0),actor:other,playable:false}],serverAt:Date.now()});
export const supabase={
 auth:{getSession:async()=>({data:{session:{user:{id:viewer},access_token:'local-preview-only'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 rpc:async(name:string,args?:unknown)=>{
  calls.push({name,args});let data:unknown=null;
  if(name==='delayed_capabilities')data={enabled:true,fake_money_only:false,max_children:32,games:games.map(id=>({id,stake:5}))};
  if(name==='delayed_opponent_page')data={items:[{id:other,name:'M Crew 81',isHuman:true},{id:'3',name:'RiverRat 57',isHuman:true}],next:null,hasMore:false};
  if(name==='delayed_list')data=[home(2),home(1),home(0)];
  if(name==='delayed_create')data='preview-match';
  if(name==='delayed_history')data=[];
  if(name==='platform_notification_center')data={items:[{id:'n1',match_id:'match-0',kind:'turn',actionable:true,revision:1,read_revision:0,payload:{opponentName:'M Crew 81',availableCount:3}},{id:'n2',match_id:'match-0',kind:'results',actionable:true,revision:1,read_revision:0,payload:{completionCount:1}},{id:'n3',match_id:'match-1',kind:'results',actionable:true,revision:1,read_revision:0,payload:{completionCount:1}}],actionable:3,serverAt:Date.now()};
  if(name==='configure_dealer_game')data={dealer_game:{id:'preview-dealer'},game:{status:'ante_decision'},deduped:false};
  return {data,error:null};
 },
 from(table:string){let single=false;const q:any={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,limit:()=>q,abortSignal:()=>q,insert:()=>q,update:()=>q,single:()=>{single=true;return q;},maybeSingle:()=>{single=true;return q;},then:(ok:any,no:any)=>Promise.resolve({data:table==='game_defaults'?defaults:table==='games'?{status:'game_selection',config_deadline:new Date(Date.now()+600000).toISOString()}:table==='arcade_lobby_layout'?{layout:{originals:['run21','tri-towers','quintzee','357-drop','crib-lab','chucky-showdown'],other:[]},revision:1}:table==='profiles'?{username:'Hap',play_sounds:false}:single?null:[],error:null}).then(ok,no)};return q;},
 channel(){const c={on:()=>c,subscribe:(cb?:(s:string)=>void)=>{queueMicrotask(()=>cb?.('SUBSCRIBED'));return c;}};return c;},removeChannel:async()=>{},
};
export function useLobbyGames(){return {games:[{id:'table',name:'Nov 21 - Rift',status:'in_progress',buy_in:0,pot:0,created_at:new Date().toISOString(),player_count:2,host_username:'Hap',duration_minutes:0,game_type:'holm-game',ante_amount:3,pot_max_enabled:true,pot_max_value:15,is_player:true,players:[]}],loading:false,initialLoadSucceeded:true,refresh:()=>{}};}
export const useIsAdmin=()=>({isAdmin:true,loading:false});
export const useRun21Access=()=>true;export const useTriTowersTestAccess=()=>true;export const useElevenUpAccess=()=>true;export const useRoyalFlashAccess=()=>true;export const useTakeTwoAccess=()=>true;export const useTripFlipAccess=()=>true;export const useGolfAccess=()=>true;export const useBoxdropAccess=()=>true;export const useRacePokerAccess=()=>true;export const useBattle31Access=()=>true;export const useCanastaAccess=()=>true;export const useQuintzeeAccess=()=>true;export const usePtownWordsAccess=()=>true;export const useChessAccess=()=>true;
export const useOriginalsAccess=()=>({'crib-lab':true,'chucky-showdown':true});
export const useMegaCompetitionConfig=()=>null;
export const useActiveHarnessMap=()=>({});export const useActiveHarnessInfo=()=>({active:false});
