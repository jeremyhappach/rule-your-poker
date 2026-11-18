import type {MatchRecord,GameRecord} from './matchRecord';
import type {ChildSummary,Home} from './client';
import {FIVE_ALIVE_RULES,feedback} from '../../../server/fiveAlive/rules';
export const recordGames:ChildSummary['game'][]=['chess','five-alive','run21','tri-towers','quintzee','ptown-words','boxdrop','take-two','mega-card-golf','crib-lab','chucky-showdown'];
export const recordHome:Home={
 id:'match',status:'settled',organizer:'me',opponent:'other',players:[{id:'me',name:'Hap'},{id:'other',name:'Opponent'}],
 receipt:{match_id:'match'},settledAt:'2026-11-17T20:00:00Z',acceptedAt:'2026-11-17T18:00:00Z',net:5,
 revision:1,realMoney:false,offerHash:'fixture',createdAt:'2026-11-17T17:00:00Z',
 invitationExpiresAt:'2026-11-18T17:00:00Z',held:false,completed:11,exposure:11,serverAt:0,
 lineup:recordGames.map((game,i)=>({id:game,ordinal:i+1,game,stake:1,terminal:true,viewed:false,
  config:{},starter:'me',actor:null,segment:1,revision:1,availableAt:null,lastCallAt:null,expiresAt:null,startedAt:null,
  scores:{me:1568,other:490},pendingResults:{},result:{winner:'me',delta:1,reason:'normal',at:''}}))
};
export function recordFixture(game?:ChildSummary['game']):MatchRecord{
 if(!game)return {home:structuredClone(recordHome),detail:null};
 const result={reason:'timeout',stageScore:784,score:1568,scoreBefore:784,aggregate:100,totals:[20,20,20,20,20],speed:200,multiplier:100,
  categorySubtotal:200,upperSubtotal:63,upperBonus:35,clearBonus:500,rawSubtotal:735,timeBonus:45,stockBonus:300,
  firstOrderPoints:150,closurePoints:200,partialPoints:30,speedBonus:50,recyclingBonus:60};
 const board:any={result,scores:{ones:3,twos:6,threes:9,fours:12,fives:15,sixes:18,chance:24},
  columns:[[{rank:'A',suit:'spades'}]],cards:[0,null,14],removed:[1,2],waste:2,slots:[0,null,14],
  scales:[{boxes:[{value:10},{value:11}],sum:21,target:21,status:'closed'}],
  hands:[[{rank:'K',suit:'hearts'}]],cut:{rank:'A',suit:'clubs'},
  player:[{rank:'Q',suit:'♦'}],community:[{rank:'J',suit:'♣'}],chucky:[{rank:'2',suit:'♥'}],
  folds:1,cracks:2,level:4,results:[{hole:1,cards:[0,14,28,42],score:4,reason:'exposed'}]};
 const detail:GameRecord={id:game,matchId:'match',game,config:{...FIVE_ALIVE_RULES},board:null,words:null,
  attempts:[{actor:'me',round:1,score:784,at:100,board},{actor:'other',round:1,score:490,at:101,board},
   {actor:'me',round:2,score:784,at:102,board},{actor:'other',round:2,score:0,at:103,board}]};
 if(game==='chess'){detail.attempts=[];detail.board={identity:{},fen:'7k/6Q1/5K2/8/8/8/8/8 b - - 0 1',initialFen:'',players:[{id:'me',userId:'me',name:'Hap'},{id:'other',userId:'other',name:'Opponent'}],viewerId:'me',winnerIds:['me'],reason:'checkmate',phase:'complete',moves:[]};}
 if(game==='five-alive'){
  detail.attempts=[];const guess={word:'APPLE',feedback:feedback('APPLE','APPLE')};
  detail.words={players:['me','other'],rounds:[[{answer:'APPLE',difficulty:4,completed:true,guesses:[guess]}],[{answer:'APPLE',difficulty:4,completed:true,guesses:[{word:'CRANE',feedback:feedback('APPLE','CRANE')},guess]}]]};
 }
 if(game==='ptown-words'){detail.attempts=[];detail.board={board:Array.from({length:225},(_,i)=>i===112?{face:'A',value:1}:null),moves:[{turn:1,playerId:'me',action:'place',points:24,words:[{word:'AXE',points:24}]}],scores:{me:24,other:0},preAdjustmentScores:{me:25,other:0},rackDeductions:{me:1,other:0}};}
 return {home:structuredClone(recordHome),detail};
}
