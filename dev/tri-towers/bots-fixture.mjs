import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {randomUUID as uuid} from 'node:crypto';
import {readFile} from 'node:fs/promises';
export const context=()=>readFile('qualification.local/tri-towers/bots-context.json','utf8').then(JSON.parse);
export async function connect(database){const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;}
export async function actor(database,user,sql,args=[]){const c=await connect(database);try{await c.query('BEGIN');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await c.query('SET LOCAL ROLE authenticated');const r=await c.query(sql,args);await c.query('COMMIT');return r.rows[0]?.v;}finally{await c.end();}}
export async function fixture(c,database,kinds=[false,true],chips=kinds.map((_,i)=>100+i*10)){
 const id=uuid(),users=kinds.map(()=>uuid()),players=kinds.map(()=>uuid()),deadline=new Date(Date.now()+600000).toISOString();
 await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,$2,$3,0,false,false)",[id,kinds.length,deadline]);
 for(let i=0;i<kinds.length;i++){await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)',[users[i],`${kinds[i]?'Bot':'Human'} ${users[i].slice(0,6)}`]);await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,$5,$6)',[players[i],id,users[i],kinds.length-i,chips[i],kinds[i]]);}
 const f={id,users,players,kinds,chips};await configure(database,f,deadline);return f;
}
export async function configure(database,f,deadline){const c=await connect(database);try{const g=(await c.query('SELECT *,config_deadline::text exact_deadline FROM public.games WHERE id=$1',[f.id])).rows[0];const d=(await c.query('SELECT * FROM public.players WHERE game_id=$1 AND position=$2',[f.id,g.dealer_position])).rows[0];const v=await actor(database,d.user_id,"SELECT public.tri_towers_configure($1,$2,$3,'tri-towers','{\"ante_amount\":5}',$4) v",[f.id,d.id,g.dealer_position,deadline??g.exact_deadline]);f.dealer=v.dealer_game.id;return v;}finally{await c.end();}}
export const state=async(c,f)=>{const m=(await c.query('SELECT * FROM private.tri_towers_matches WHERE dealer_game_id=$1',[f.dealer])).rows[0];return {...m,revision:Number(m.revision),bot_due_at:m.bot_due_at===null?null:Number(m.bot_due_at)};};
export const action=(database,f,user,revision,type,index=null,request=uuid())=>actor(database,user,'SELECT public.tri_towers_action($1,$2,$3,$4,$5) v',[f.dealer,request,revision,type,index]);
export const snapshot=(database,f,user=f.users[0])=>actor(database,user,'SELECT public.tri_towers_snapshot($1) v',[f.dealer]);
export const balances=async(c,f)=>(await c.query('SELECT id,chips FROM public.players WHERE game_id=$1 ORDER BY id',[f.id])).rows;
