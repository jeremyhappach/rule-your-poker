// Qualification only. Connection and fixtures are confined to loopback PostgreSQL.
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {randomUUID as uuid} from 'node:crypto';
export const options=database=>({host:'127.0.0.1',port:55439,user:'tri_test',database});
export async function connect(database){const c=new pg.Client(options(database));await c.connect();return c;}
export async function actor(database,user,sql,args=[]){const c=await connect(database);try{
 await c.query('BEGIN');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user]);await c.query('SET LOCAL ROLE authenticated');
 const r=await c.query(sql,args);await c.query('COMMIT');return r.rows[0]?.v;
}finally{await c.end();}}
export async function fixture(c,database,count=2){
 const id=uuid(),users=Array.from({length:count},uuid),players=Array.from({length:count},uuid),deadline=new Date(Date.now()+600000).toISOString();
 await c.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'game_selection',false,$2,$3,0,false,false)",[id,count,deadline]);
 for(let i=0;i<count;i++){
  await c.query('INSERT INTO public.profiles(id,username) VALUES($1,$2)',[users[i],`Polish ${i+1} ${users[i].slice(0,6)}`]);
  await c.query('INSERT INTO public.players(id,game_id,user_id,position,chips) VALUES($1,$2,$3,$4,0)',[players[i],id,users[i],count-i]);
 }
 const setup=await actor(database,users[0],"SELECT public.tri_towers_configure($1,$2,$3,'tri-towers','{\"ante_amount\":5}',$4) v",[id,players[0],count,deadline]);
 return {id,users,players,dealer:setup.dealer_game.id};
}
export const state=async(c,f)=>(await c.query('SELECT * FROM private.tri_towers_matches WHERE dealer_game_id=$1',[f.dealer])).rows[0];
export const action=(database,f,user,revision,type,index=null,request=uuid())=>actor(database,user,'SELECT public.tri_towers_action($1,$2,$3,$4,$5) v',[f.dealer,request,revision,type,index]);
export const expire=async(c,f)=>{await c.query("UPDATE private.tri_towers_matches SET state=jsonb_set(state,'{deadline}','0') WHERE dealer_game_id=$1",[f.dealer]);await c.query('SELECT private.tri_towers_recover()');};
