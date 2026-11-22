import {supabase as fixture} from '../blue-hour/client';
const child=(id:string,patch={})=>({id,ordinal:1,game:'run21',terminal:false,actor:'me',playable:true,expiresAt:new Date(Date.now()+600000).toISOString(),...patch});
const match=(id:string,lineup:any[],patch={})=>({id,status:'active',organizer:'other',opponent:'me',players:[{id:'me',name:'Hap'},{id:'other',name:'mcru81'}],lineup,createdAt:new Date().toISOString(),held:false,completed:0,realMoney:false,serverAt:Date.now(),...patch});
let rows=[match('opponent',[child('o',{actor:'other',playable:false})]),match('own',[child('a')]),match('review',[child('r',{actor:'other',playable:false,pendingResults:{other:1}})]),match('invite',[],{status:'invited'}),match('mixed',[child('a'),child('r',{pendingResults:{other:1}})])];
let refreshed=()=>{};
const clear=()=>{rows=rows.map(row=>({...row,status:'active',lineup:row.lineup.map(c=>({...c,actor:'other',playable:false,pendingResults:{}}))}));};
if(localStorage.getItem('polish-fixture-cleared'))clear();
Object.assign(window,{polishClear:()=>{localStorage.setItem('polish-fixture-cleared','1');clear();refreshed();}});
export const supabase={...fixture,
 rpc:async(name:string,args:any)=>{
  if(name==='ptown_words_preview')return {data:await (await fetch('/__preview',{method:'POST',body:JSON.stringify(args)})).json(),error:null,status:200};
  if(name==='delayed_list')return {data:rows,error:null,status:200};
  return fixture.rpc(name);
 },
 channel(){const c={on:(_e:any,_f:any,callback:()=>void)=>{refreshed=callback;return c;},subscribe:()=>c};return c;},
};
