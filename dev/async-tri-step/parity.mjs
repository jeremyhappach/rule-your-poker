import {connect} from '../async-words/local.mjs';
import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir='qualification.local/async-tri-step',database=JSON.parse(readFileSync(dir+'/context.json')).database;
await build({entryPoints:['server/delayed/adapter.ts'],outfile:dir+'/adapter.mjs',bundle:true,platform:'node',format:'esm'});
const {transition,project}=await import('../../'+dir+'/adapter.mjs'),db=await connect(database),checks=[];
const rpc=async(name,args)=>(await db.query('SELECT public.'+name+'('+Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')+') v',Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v))).rows[0].v;
const players=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
try{for(const version of ['tri-towers/3','tri-towers/4','tri-towers/5']){
 const config={...JSON.parse(readFileSync('src/lib/triTowers/rules-v2.json')),version,roundIntroMs:2500,clearCelebrationMs:3000};
 const base=await rpc('delayed_tri_core',{p_operation:'deal',p_config:config,p_at:1800000000000});
 for(const [phase,time] of [['intro',1800000000100],['intro',base.deadline],['ready',1800000003000],['playing',1800000003000],['playing',1800000200000]])for(const round of [1,2,3])for(const action of ['tick','draw','take_score','remove']){
  const board={...base,phase,deadline:phase==='intro'?base.deadline:1800000120000};
  const visible=await rpc('delayed_tri_core',{p_operation:'visible',p_board:board});
  const idx=visible.cards.findIndex(c=>c!=null&&[1,12].includes(Math.abs(c%13-board.waste%13)));
  const intent=action==='remove'?{type:action,index:idx<0?18:idx}:{type:action};
  const row={id:players[0],match_id:players[0],game_type:'tri-towers',config,starter:players[0],actor:players[1],segment:2,revision:3,terminal:false,held:false,available_at:new Date(1799999999000).toISOString(),expires_at:new Date(1800010000000).toISOString(),server_at:time,organizer:players[0],opponent:players[1],reviewed:[],state:{version:'delayed/1',game:'tri-towers',child:players[0],players,round,turn:1,totals:{[players[0]]:90000,[players[1]]:0},attempts:[],board,deck:null,completed:false,winner:null,segmentStartedAt:1799999999000}};
  const old=await transition(row,intent,rpc).then(v=>({v}),e=>({error:e.message}));
  const current=await db.query('SELECT private.delayed_tri_transition($1,$2) v',[JSON.stringify(row),JSON.stringify(intent)]).then(r=>({v:r.rows[0].v}),e=>({error:e.message}));
  if(old.error||current.error)assert.equal(current.error,old.error);else{delete old.v.forfeit;assert.deepEqual(current.v,old.v);const r={...row,state:current.v.state};const projection=await project(r,players[1],rpc),sql=(await db.query('SELECT private.delayed_tri_project($1,$2) v',[JSON.stringify(r),players[1]])).rows[0].v;assert.deepEqual(sql,projection);}
  checks.push({version,phase,round,action,passed:true});
 }
}writeFileSync(dir+'/parity.json',JSON.stringify(checks,null,2));console.log('PASS',checks.length,'frozen-rule transitions and projections');}finally{await db.end();}
