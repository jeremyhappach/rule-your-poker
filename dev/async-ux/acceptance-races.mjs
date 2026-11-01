import {connect} from '../../dev/async-words/local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const database=JSON.parse(read('qualification.local/async-real-money/context.json')).database;assert(/^async_real_\d+$/.test(database));
const db=await connect(database),peer=await connect(database),a=randomUUID(),b=randomUUID(),checks=[];
const owner=async c=>c.query('RESET ROLE');
const user=async(c,id)=>{await owner(c);await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await c.query('SET ROLE authenticated');};
const val=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0]?.v;
try{
 await db.query('UPDATE private.delayed_words_health SET last_tick=clock_timestamp()');
 for(const id of [a,b]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true',[id,'UX acceptance race '+id]);}
 for(const real of [false,true]){
  const request=randomUUID();await user(db,a);await user(peer,a);
  const ids=await Promise.all([db,peer].map(c=>val(c,"SELECT public.delayed_create($1,$2,$3,'[{\"game\":\"run21\",\"stake\":7},{\"game\":\"tri-towers\",\"stake\":3}]') v",[request,b,real])));
  assert.equal(ids[0],ids[1]);const id=ids[0],home=await val(db,'SELECT public.delayed_home($1) v',[id]);
  const accept=randomUUID();await user(db,b);await user(peer,b);
  const answers=await Promise.all([db,peer].map(c=>val(c,"SELECT public.delayed_respond($1,$2,$3,'accept') v",[id,accept,home.offerHash])));
  assert.deepEqual(answers[0],answers[1]);assert.equal(answers[0].status,'active');
  await assert.rejects(()=>val(peer,"SELECT public.delayed_respond($1,$2,$3,'accept') v",[id,randomUUID(),home.offerHash]),/offer_changed/);
  await owner(db);
  const proof=await val(db,"SELECT jsonb_build_object('createReceipts',(SELECT count(*) FROM private.delayed_requests WHERE match_id=$1 AND fingerprint->>'op'='create'),'acceptReceipts',(SELECT count(*) FROM private.delayed_requests WHERE match_id=$1 AND fingerprint->>'op'='accept'),'children',(SELECT count(*) FROM private.delayed_children WHERE match_id=$1 AND revision=1 AND starter IS NOT NULL),'financialRows',(SELECT count(*) FROM public.player_transactions WHERE source_game_id=$1),'canonicalGames',(SELECT count(*) FROM public.games WHERE id=$1)) v",[id]);
  assert.deepEqual(proof,{createReceipts:1,acceptReceipts:1,children:2,financialRows:0,canonicalGames:0});checks.push({real,...proof});
 }
 write('qualification.local/async-ux/acceptance-races.json',JSON.stringify({passed:true,database,connections:2,checks},null,2));console.log('PASS independent-connection create/accept races in both modes');
}finally{await db.end();await peer.end();}

