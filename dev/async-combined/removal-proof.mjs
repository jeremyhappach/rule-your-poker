import {connect} from '../async-words/local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const ctx=JSON.parse(read('qualification.local/async-combined/context.json','utf8'));
const db=await connect(ctx.database),peer=await connect(ctx.database),checks=[];
const [a,b,outsider]=Array.from({length:3},randomUUID);
const val=async(sql,args=[],c=db)=>(await c.query(sql,args)).rows[0]?.v;
const asUser=async(id,c=db)=>{await c.query('RESET ROLE');await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await c.query('SET ROLE authenticated');};
async function fixture(status='active',real=false){
 await db.query('RESET ROLE');const id=randomUUID(),child=randomUUID(),cfg=await val("SELECT private.ptown_words_rules_for('ptown-words/3') v"),offer=[{game:'ptown-words',stake:5,config:cfg}];
 await db.query('INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,status,offer,offer_hash) VALUES($1,$2,$3,$4,$5,$6::jsonb,md5(($6::jsonb)::text))',[id,a,b,real,status,JSON.stringify(offer)]);
 await db.query("WITH t AS(SELECT clock_timestamp() at) INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,starter,actor,segment,revision,available_at,last_call_at,expires_at) SELECT $1,$2,1,'ptown-words',5,$3,$4,$4,1,1,at,at+interval '24 hours',at+interval '36 hours' FROM t",[child,id,cfg,a]);
 await db.query('SELECT private.delayed_notify($1)',[id]);return {id,child};
}
const remove=(id,request=randomUUID(),c=db)=>val('SELECT public.delayed_remove($1,$2) v',[id,request],c);
const financial=id=>val("SELECT jsonb_build_object('receipts',(SELECT count(*) FROM private.delayed_settlements WHERE match_id=$1),'outcomes',(SELECT count(*) FROM private.delayed_outcomes WHERE match_id=$1),'batches',(SELECT count(*) FROM public.gameplay_transfer_batches WHERE game_id=$1),'accounts',(SELECT count(*) FROM public.player_transactions WHERE source_game_id=$1)) v",[id]);
const finish=child=>db.query("SELECT private.delayed_record_outcome($1,1,'normal',$2,'{}')",[child,a]);
try{
 if(!process.argv.includes('--installed')){await db.query('BEGIN');await db.query(read('supabase/delayed/combined-humans.sql','utf8'));await db.query(read('supabase/delayed/combined-removal.sql','utf8'));await db.query('COMMIT');}
 for(const id of [a,b,outsider]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[id,'RemoveProof '+id]);}
 for(const status of ['invited','active','declined','cancelled','expired','settled']){
  const {id,child}=await fixture(status==='settled'?'active':status);if(status==='settled')await finish(child);
  const before=await financial(id),request=randomUUID();await asUser(b);await assert.rejects(remove(id),e=>e.code==='42501');await asUser(outsider);await assert.rejects(remove(id),e=>e.code==='42501');
  await asUser(a);const r=await remove(id,request);assert.deepEqual(await remove(id,request),r);assert.deepEqual(await remove(id),r);
  for(const user of [a,b]){await asUser(user);assert(!(await val('SELECT public.delayed_list() v')).some(m=>m.id===id));assert((await val('SELECT public.delayed_home($1) v',[id])).removedAt);assert(!(await val('SELECT public.platform_notification_center() v')).items.some(n=>n.match_id===id));}
  await db.query('RESET ROLE');assert.deepEqual(await financial(id),before);assert.equal(await val('SELECT count(*)::int v FROM private.delayed_removals WHERE match_id=$1',[id]),1);
  await assert.rejects(db.query('SELECT private.delayed_words_view($1,$2)',[child,b]),e=>e.code==='42501');
 }
 checks.push('all six statuses: creator only, both lists/notifications hidden, deep gameplay denied, history unchanged, retries return one tombstone');
 const real=await fixture('invited',true);await asUser(a);await assert.rejects(remove(real.id),e=>e.code==='42501');checks.push('real-money removal categorically denied');
 const cancelled=await fixture();await asUser(a);await db.query('BEGIN');await remove(cancelled.id);
 const waiting=peer.query("SELECT private.delayed_record_outcome($1,1,'normal',$2,'{}')",[cancelled.child,a]).then(()=>({ok:true}),e=>({error:e.message}));
 await db.query('COMMIT');assert((await waiting).error);await db.query('RESET ROLE');assert.equal((await financial(cancelled.id)).receipts,0);checks.push('deletion wins parent lock: late final child cannot settle');
 const settled=await fixture();await db.query('BEGIN');await finish(settled.child);await asUser(a,peer);const pending=remove(settled.id,randomUUID(),peer);await db.query('COMMIT');await pending;
 assert.equal((await financial(settled.id)).receipts,1);assert.equal((await financial(settled.id)).batches,1);checks.push('settlement wins parent lock: removal retains exactly one completed settlement');
 write('qualification.local/async-combined/removal-proof.json',JSON.stringify({passed:true,database:ctx.database,checks},null,2));console.log('PASS',checks);
}finally{await db.query('ROLLBACK').catch(()=>{});await db.end();await peer.end();}
