// Local synthetic financial boundary proof. Does not open public admission.
import {connect} from '../async-words/local.mjs';
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const prior=JSON.parse(read('qualification.local/async-words/context.json','utf8'));
if(!/^ptown_words_real_\d+$/.test(prior.template))throw Error('Unexpected local template');
let database;
if(process.argv.includes('--existing'))database=JSON.parse(read('qualification.local/async-combined/context.json')).database;
else {const root=await connect('postgres');database='async_combined_'+Date.now();await root.query('CREATE DATABASE '+database+' TEMPLATE '+prior.template);await root.end();}
const db=await connect(database),peer=await connect(database),checks=[];
const val=async(sql,args=[],c=db)=>(await c.query(sql,args)).rows[0]?.v;
const pass=s=>{checks.push(s);console.log('PASS',s);};
const [a,b,outside]=Array.from({length:3},randomUUID);
const counts=id=>val("SELECT jsonb_build_object('games',(SELECT count(*) FROM public.games WHERE id=$1),'outcomes',(SELECT count(*) FROM private.delayed_outcomes WHERE match_id=$1),'receipts',(SELECT count(*) FROM private.delayed_settlements WHERE match_id=$1),'batches',(SELECT count(*) FROM public.gameplay_transfer_batches WHERE game_id=$1),'accounts',(SELECT count(*) FROM public.player_transactions WHERE source_game_id=$1)) v",[id]);
async function fixture(stakes){
 const id=randomUUID(),offer=stakes.map(stake=>({game:'ptown-words',stake,config:null}));
 const config=await val("SELECT private.ptown_words_rules_for('ptown-words/3') v");offer.forEach(v=>v.config=config);
 await db.query("INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,status,offer,offer_hash,accepted_at) VALUES($1,$2,$3,false,'active',$4::jsonb,md5(($4::jsonb)::text),clock_timestamp())",[id,a,b,JSON.stringify(offer)]);
 for(let i=0;i<stakes.length;i++)await db.query("WITH t AS(SELECT clock_timestamp() at) INSERT INTO private.delayed_children(match_id,ordinal,game_type,stake,config,starter,actor,segment,revision,available_at,last_call_at,expires_at) SELECT $1,$2,'ptown-words',$3,$4,$5,$5,1,1,at,at+interval '24 hours',at+interval '36 hours' FROM t",[id,i+1,stakes[i],config,a]);
 await db.query('SELECT private.delayed_notify($1)',[id]);
 return {id,children:(await db.query('SELECT * FROM private.delayed_children WHERE match_id=$1 ORDER BY ordinal',[id])).rows};
}
const outcome=(c,winner,connection=db,reason='normal')=>val('SELECT private.delayed_record_outcome($1,$2,$3,$4,$5) v',[c.id,c.revision,reason,winner,{proof:'local trusted result boundary',child:c.id}],connection);
try{
 const expected={'public.settle_gameplay_chip_transfers(uuid,jsonb,text)':'86c0feb55524f14ab9f58a06cdee2ef6','public.record_session_results()':'eb408dcb7dca842776909bd603183a60','public.finalize_gameplay_transfer_batch()':'5d1c8703caee40ce7392d4eb6de1aaf9','private.delayed_finalize(uuid)':'3c319dee938f4242d6174b27bc3ff260'};
 for(const [signature,hash] of Object.entries(expected))assert.equal(await val("SELECT md5(replace(pg_get_functiondef($1::regprocedure),chr(13),'')) v",[signature]),hash);
 if(!process.argv.includes('--existing'))await db.query(read('supabase/delayed/polish-local.sql','utf8'));pass('current deployed financial owners matched; presentation polish applied locally');
 for(const id of [a,b,outside]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true",[id,'Combined proof '+id.slice(0,8)]);}
 const normal=await fixture([5,10,5,10]);
 assert.deepEqual(await counts(normal.id),{games:0,outcomes:0,receipts:0,batches:0,accounts:0});
 for(let i=0;i<3;i++)await outcome(normal.children[i],i===1?b:a);
 assert.deepEqual(await counts(normal.id),{games:0,outcomes:3,receipts:0,batches:0,accounts:0});pass('three provisional child results cause zero canonical financial writes');
 await outcome(normal.children[3],a);
 assert.deepEqual(await counts(normal.id),{games:1,outcomes:4,receipts:1,batches:1,accounts:0});
 assert.equal(await val('SELECT organizer_delta v FROM private.delayed_settlements WHERE match_id=$1',[normal.id]),10);
 assert.deepEqual(await val('SELECT unmatched_deltas v FROM public.gameplay_transfer_batches WHERE game_id=$1',[normal.id]),{});
 assert.equal(await val('SELECT chips v FROM public.players WHERE game_id=$1 AND user_id=$2',[normal.id,b]),-10);
 const receipt=await val('SELECT private.delayed_finalize($1) v',[normal.id]);await outcome(normal.children[3],a);assert.deepEqual(await val('SELECT private.delayed_finalize($1) v',[normal.id]),receipt);
 await assert.rejects(()=>outcome(normal.children[3],b),/outcome_conflict/);pass('one aggregate +10/-10 transfer, negative chips, balanced batch and replay receipt');
 const zero=await fixture([5,5]);await outcome(zero.children[0],a);await outcome(zero.children[1],b);
 assert.deepEqual(await counts(zero.id),{games:1,outcomes:2,receipts:1,batches:0,accounts:0});pass('net zero closes with receipt and no transfer');
 const race=await fixture([7,11]);await Promise.all([outcome(race.children[0],a,db),outcome(race.children[1],b,peer)]);
 assert.deepEqual(await counts(race.id),{games:1,outcomes:2,receipts:1,batches:1,accounts:0});assert.equal(await val('SELECT organizer_delta v FROM private.delayed_settlements WHERE match_id=$1',[race.id]),-4);pass('two last children on independent connections produce exactly one parent settlement');
 const fail=await fixture([13,9]);await outcome(fail.children[0],a);
 await db.query("CREATE FUNCTION pg_temp.combined_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.id='"+fail.id+"'::uuid AND NEW.status='session_ended' THEN RAISE EXCEPTION 'combined:injected';END IF;RETURN NEW;END $$; CREATE TRIGGER combined_proof_fail BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION pg_temp.combined_fail()");
 try{await assert.rejects(()=>outcome(fail.children[1],b),/combined:injected/);assert.deepEqual(await counts(fail.id),{games:0,outcomes:1,receipts:0,batches:0,accounts:0});}finally{await db.query('DROP TRIGGER combined_proof_fail ON public.games');}
 await outcome(fail.children[1],b);assert.equal((await counts(fail.id)).receipts,1);pass('last outcome and every financial artifact roll back together; retry completes');
 const timed=await fixture([8,9]);
 await db.query("WITH t AS(SELECT clock_timestamp()-interval '1 second' AS due_at) UPDATE private.delayed_children SET available_at=t.due_at-interval '36 hours',last_call_at=t.due_at-interval '12 hours',expires_at=t.due_at FROM t WHERE id=$1",[timed.children[0].id]);
 const due=(await db.query('SELECT id,segment,expires_at::text FROM private.delayed_children WHERE id=$1',[timed.children[0].id])).rows[0];
 assert.equal(await val('SELECT private.delayed_expire($1,$2,$3) v',[due.id,due.segment,due.expires_at]),true);assert.equal(await val('SELECT private.delayed_expire($1,$2,$3) v',[due.id,due.segment,due.expires_at]),false);
 assert.deepEqual(await counts(timed.id),{games:0,outcomes:1,receipts:0,batches:0,accounts:0});assert.equal(await val('SELECT terminal v FROM private.delayed_children WHERE id=$1',[timed.children[1].id]),false);pass('expiry is child-only, replay safe and cannot pay an incomplete parent');
 const limit=await fixture(Array(32).fill(1));assert.equal(await val("SELECT (payload->>'availableCount')::int v FROM public.platform_notifications WHERE match_id=$1 AND user_id=$2 AND kind='turn'",[limit.id,a]),32);
 assert.equal(await val("SELECT count(*)::int v FROM public.platform_notifications WHERE match_id=$1 AND user_id=$2 AND kind='turn'",[limit.id,a]),1);pass('32 independent obligations aggregate into one persistent match notification');
 await db.query('SET ROLE authenticated');await assert.rejects(()=>db.query('SELECT private.delayed_finalize($1)',[limit.id]),/permission denied/);await db.query('RESET ROLE');pass('browser cannot invoke the financial owner');
 mkdirSync('qualification.local/async-combined',{recursive:true});write('qualification.local/async-combined/context.json',JSON.stringify({database,template:prior.template}));write('qualification.local/async-combined/parent-proof.json',JSON.stringify({passed:true,database,checks,scope:'private parent financial boundary only; public multi-game admission remains closed'},null,2));
}finally{await db.query('RESET ROLE');await db.end();await peer.end();}
