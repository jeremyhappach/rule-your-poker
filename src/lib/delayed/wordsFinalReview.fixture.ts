import type {WordsSnapshot} from '@/lib/ptownWords/model';
import type {Home} from './client';
import type {ReviewEvent} from './reviews';
export const viewer='11111111-1111-4111-8111-111111111111',opponent='22222222-2222-4222-8222-222222222222';
export const childId='33333333-3333-4333-8333-333333333333',matchId='44444444-4444-4444-8444-444444444444';
export function finalWordsFixture(matchEnds=true){
 const players=[{id:viewer,userId:viewer,name:'Viewer',seat:1,isBot:false},{id:opponent,userId:opponent,name:'Opponent',seat:2,isBot:false}];
 const board:WordsSnapshot['board']=Array(225).fill(null);
 for(const [square,letter,value] of [[112,'U',1],[113,'P',3],[128,'A',1],[10,'D',2],[11,'O',1],[12,'G',2]] as const)board[square]={id:square,face:letter,letter,value};
 const moves:WordsSnapshot['moves']=[{turn:1,playerId:opponent,action:'place',points:100,count:3,words:[{word:'DOG',points:100,square:10,direction:0}]},{turn:3,playerId:opponent,action:'place',points:276,count:1,words:[{word:'OLD',points:276,square:10,direction:0}]},{turn:5,playerId:opponent,action:'place',points:8,count:1,words:[{word:'UP',points:4,square:112,direction:0},{word:'PA',points:4,square:113,direction:1}]}];
 const snapshot:WordsSnapshot={identity:{sessionId:matchId,dealerGameId:childId,roundId:childId},revision:7,serverAt:10000,rules:{version:'ptown-words/3',dictionaryId:'enable2k/1',dictionarySha256:'fixture',turnMs:129600000},board,rack:[],rackCounts:{},bagCount:0,players,scores:{[viewer]:245,[opponent]:385},preAdjustmentScores:{[viewer]:246,[opponent]:384},rackDeductions:{[viewer]:1,[opponent]:0},viewerId:viewer,activePlayerId:opponent,turn:6,deadline:10000,phase:'complete',canAct:false,paused:false,pausedAt:null,finished:true,settlement:null,financial:{balances:{},resultId:null,batch:null},moves,movePresentation:{version:1,turn:5,playerId:opponent,squares:[113],startedAt:1000,announceAt:2100,readyAt:5700,flipMs:300,focusMs:800,noticeMs:3250},event:{label:'Word played',points:8}};
 snapshot.terminal={resultId:'fixture-result',winnerIds:[opponent],score:385,startedAt:5700,deadline:5700};
 const events:ReviewEvent[]=moves.map((move,i)=>({id:'turn-'+move.turn,kind:'attempt',actor:opponent,actorName:'Opponent',round:move.turn,score:move.points,at:new Date(i*10000).toISOString(),receipt:{game:'ptown-words',rules:snapshot.rules,move},board:{...snapshot,board:i<2?board.map((tile,square)=>square===113?null:tile):board,scores:i<2?{[viewer]:100,[opponent]:i===0?100:376}:snapshot.scores,turn:move.turn+1,moves:moves.slice(0,i+1)},seen:false}));
 events.push({id:'child-result',kind:'child',actor:null,round:0,score:null,at:new Date(30000).toISOString(),receipt:{game:'ptown-words',rules:snapshot.rules,winner:opponent,stake:5},board:null,seen:false});
 const home={id:matchId,status:matchEnds?'settled':'active',revision:7,organizer:viewer,opponent,players,realMoney:false,net:-5,receipt:matchEnds?{match_id:matchId}:null,completed:1,exposure:5,serverAt:10000,createdAt:new Date(0).toISOString(),acceptedAt:new Date(0).toISOString(),lineup:[{id:childId,ordinal:1,game:'ptown-words',stake:5,terminal:true,viewed:false,scores:snapshot.scores,result:{winner:opponent,delta:-5}},...matchEnds?[]:[{id:'remaining',ordinal:2,game:'run21',stake:1,terminal:false,viewed:false,result:null}]]} as unknown as Home;
 return {snapshot,events,home};
}
