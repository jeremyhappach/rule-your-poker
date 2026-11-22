// Local browser qualification only. No production requests or financial writes.
import {supabase as base} from '../blue-hour/client';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
const started=Date.now(),board:WordsSnapshot['board']=Array(225).fill(null);
board[112]={id:90,face:'A',letter:'A',value:1};
let state:WordsSnapshot={identity:{sessionId:'match',dealerGameId:'words',roundId:'words'},revision:1,serverAt:started,
 rules:{version:'ptown-words/4',dictionaryId:'enable2k/1',dictionarySha256:'fixture',turnMs:300000,timeBankUses:2,timeBankMs:180000},
 board,rack:[{id:1,face:'C',value:3},{id:2,face:'T',value:1}],rackCounts:{me:2,other:7},bagCount:80,
 players:[{id:'me',userId:'me',name:'Jeremy',seat:1,isBot:false},{id:'other',userId:'other',name:'Opponent',seat:2,isBot:false}],
 scores:{me:8,other:12},viewerId:'me',activePlayerId:'me',turn:3,deadline:started+300000,playDeadline:started+300000,
 phase:'playing',canAct:true,paused:false,pausedAt:null,finished:false,settlement:null,financial:{balances:{},resultId:null,batch:null},moves:[],event:{label:'',points:0}};
let allowed=true,loseReply=false,sends=0,commits=0,subscriptions=0;
const receipts=new Map<string,WordsSnapshot>(),channels=new Set<{topic:string;status:(s:string,error?:Error)=>void;stopped:boolean}>();
export const metrics=()=>({sends,commits,subscriptions,revision:state.revision});
export const home=()=>({id:'match',revision:state.revision,status:'active',organizer:'me',opponent:'other',players:state.players,realMoney:false,held:false,completed:0,net:0,exposure:5,createdAt:new Date(started).toISOString(),acceptedAt:new Date(started).toISOString(),serverAt:Date.now(),lineup:[{id:'words',ordinal:1,game:'ptown-words',stake:5,actor:'me',terminal:false,expiresAt:new Date(state.deadline).toISOString(),scores:state.scores,bagCount:80}]});
export function interrupt(brief=false){
 allowed=false;
 if(brief){Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'));}
 for(const channel of [...channels])if(channel.topic.startsWith('async-words:'))channel.status('CHANNEL_ERROR',new Error('Fixture connection interruption'));
 if(brief)setTimeout(()=>{allowed=true;Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));},1200);
}
export function allowRetry(){allowed=true;}
export function loseNextReply(){loseReply=true;}
const result=(data:unknown)=>({data,error:null,status:200});
export const supabase={...base,
 async rpc(name:string,args:any={}){
  if(name==='delayed_words_inspect'||name==='delayed_words_snapshot')return result({...structuredClone(state),serverAt:Date.now()});
  if(name==='delayed_home')return result(home());
  if(name==='delayed_list')return result([home()]);
  if(name==='delayed_capabilities')return result({enabled:true,fake_money_only:true,max_children:1,games:[{id:'ptown-words',name:'P-Town Words',enabled:true,stake:5,version:'ptown-words/4'}]});
  if(name==='delayed_words_action'){
   sends++;let response=receipts.get(args.p_request);
   if(!response){commits++;state={...state,revision:state.revision+1,deadline:state.deadline+180000,playDeadline:state.playDeadline!+180000,timeBankSpent:{me:[0]}};response=structuredClone(state);receipts.set(args.p_request,response);}
   if(loseReply){loseReply=false;return {data:null,error:{message:'lost reply',code:''},status:503};}
   return result({...response,serverAt:Date.now()});
  }
  if(name==='ptown_words_preview')return result({points:4,invalidWords:[],words:[]});
  return base.rpc(name);
 },
 channel(topic:string){
  const channel={topic,status:(_s:string,_e?:Error)=>{},stopped:false};
  const api={on:()=>api,subscribe:(status?:(s:string,error?:Error)=>void)=>{channel.status=status??(()=>{});channels.add(channel);if(topic.startsWith('async-words:'))subscriptions++;setTimeout(()=>{if(!channel.stopped&&allowed)channel.status('SUBSCRIBED');},250);return api;},track:async()=>{},untrack:async()=>{},presenceState:()=>({}),unsubscribe:()=>{channel.stopped=true;channels.delete(channel);}};
  return api;
 },
 removeChannel:async(channel:{unsubscribe:()=>void})=>channel.unsubscribe(),
};
