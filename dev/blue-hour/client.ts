// Isolated visual fixture transport; never imported by the application.
import type { CribbageState, CribbageCard } from '@/lib/cribbageTypes';
export const session = '30000000-0000-4000-8000-000000000001';
export const dealerGame = '30000000-0000-4000-8000-000000000002';
export const round = '30000000-0000-4000-8000-000000000003';
export const players = [1, 4].map((position, i) => ({
  id: `10000000-0000-4000-8000-00000000000${i}`,
  user_id: `20000000-0000-4000-8000-00000000000${i}`,
  position, chips: 0, status: 'active', current_decision: null, decision_locked: false,
  legs: 0, is_bot: false, sitting_out: false, profiles: { username: i ? 'Bot 1' : 'Hap' },
}));
const card = (rank: string, suit: CribbageCard['suit']): CribbageCard => ({rank, suit, value: 'JQK'.includes(rank) ? 10 : Number(rank)});
export const cribbage: CribbageState = {
  phase: 'discarding', dealerPlayerId: players[1].id, cribOwnerPlayerId: players[1].id,
  playerStates: {
    [players[0].id]: {playerId:players[0].id, hand:[card('6','clubs'),card('6','hearts'),card('8','diamonds'),card('9','diamonds'),card('9','spades'),card('Q','diamonds')],pegScore:0,hasCalledGo:false,discardedToCrib:[]},
    [players[1].id]: {playerId:players[1].id, hand:[card('2','clubs'),card('3','hearts'),card('4','diamonds'),card('5','spades')],pegScore:0,hasCalledGo:false,discardedToCrib:[card('7','clubs'),card('K','hearts')]},
  },
  turnOrder:players.map(p=>p.id), crib:[card('7','clubs'),card('K','hearts')], cutCard:null,
  pegging:{playedCards:[],currentCount:0,currentTurnPlayerId:players[0].id,lastToPlay:null,goCalledBy:[],sequenceStartIndex:0},
  anteAmount:10,pot:20,pointsToWin:121,skunkEnabled:true,skunkThreshold:91,doubleSkunkEnabled:true,doubleSkunkThreshold:61,
  winnerPlayerId:null,loserScore:null,payoutMultiplier:1,dealerResolved:true,dealerSelectionCohort:0,
};
const result = (data: unknown) => ({data,error:null});
export const supabase = {
  auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  rpc(name:string){const promise = Promise.resolve(result(name==='get_waiting_start_blocked'?false:name==='cribbage_get_state'?cribbage:[]));return Object.assign(promise,{abortSignal:()=>promise});},
  from(table:string){let single=false; const data=()=>table==='rounds'?{id:round,hand_number:1,round_number:1,status:'betting',cribbage_state:cribbage}:table==='games'?{id:session,status:'in_progress',current_game_uuid:dealerGame,is_paused:false}:table==='profiles'?{username:'Hap',play_sounds:false,table_layout:'bridge',card_back_design:'bears',deck_color_mode:'two_color'}:table==='game_defaults'?{}:single?null:[];
    const q:any=new Proxy({then:(ok:any,no:any)=>Promise.resolve(result(data())).then(ok,no)},{get(target,key){if(key==='then')return target.then;if(key==='single'||key==='maybeSingle')return()=>{single=true;return q;};return()=>q;}});return q;},
  channel(){const c={on:()=>c,subscribe:()=>c,unsubscribe:()=>{}};return c;},removeChannel:async()=>{},
  functions:{invoke:async()=>result(null)},
};
