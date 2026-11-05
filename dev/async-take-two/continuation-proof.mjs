import {db,q,rpc,fixture,started,synchronize,people} from './service-fixture.mjs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {dir} from './local.mjs';
try{
 // Align the disposable older clone with the two captured deployed continuation owners.
 const runback=readFileSync('supabase/delayed/runback.candidate.sql','utf8');await db.query(runback.slice(0,runback.indexOf('DO $guard$')));
 for(const f of JSON.parse(readFileSync('dev/async-take-two/preimage.json')))if(['delayed_finale_ack','delayed_history_detail'].includes(f.name))await db.query(f.definition);
 const f=await fixture(false),s=await started(f);
 await db.query("UPDATE private.delayed_children SET available_at=available_at-interval '104 seconds',last_call_at=last_call_at-interval '104 seconds',expires_at=expires_at-interval '104 seconds',started_at=started_at-interval '104 seconds',gameplay_due_at=gameplay_due_at-interval '104 seconds',state=jsonb_set(state,'{board,deadline}',to_jsonb((state#>>'{board,deadline}')::bigint-104000)) WHERE id=$1",[f.child]);
 await synchronize((n,a)=>rpc(null,n,a),await rpc(null,'delayed_load',{p_child:f.child,p_actor:null}),null);
 const after=await q('SELECT state v FROM private.delayed_children WHERE id=$1',[f.child]);
 assert.equal(after.attempts.length,1);assert.equal(after.attempts[0].board.result.reason,'timeout');assert.equal(after.board,null);assert.equal(after.turn,1);
 const end=await fixture(false);
 await db.query("UPDATE private.delayed_children SET available_at=available_at-interval '37 hours',last_call_at=last_call_at-interval '37 hours',expires_at=expires_at-interval '37 hours' WHERE id=$1",[end.child]);
 await synchronize((n,a)=>rpc(null,n,a),await rpc(null,'delayed_load',{p_child:end.child,p_actor:null}),null);
 for(const who of people){const reviews=await rpc(who,'delayed_reviews',{p_child:end.child},'authenticated');for(const e of reviews.events)await rpc(who,'delayed_review_ack',{p_event:e.id},'authenticated');}
 await rpc(people[0],'delayed_finale_ack',{p_match:end.match},'authenticated');
 assert.equal((await rpc(people[0],'delayed_history_detail',{p_match:end.match},'authenticated')).runbackEligible,false);
 await rpc(people[1],'delayed_finale_ack',{p_match:end.match},'authenticated');
 const h=await rpc(people[1],'delayed_history_detail',{p_match:end.match},'authenticated');assert.equal(h.runbackEligible,true);
 const lineup=h.lineup.map(c=>({game:c.game,stake:c.stake,config:c.config}));
 assert.equal(lineup[0].game,'take-two');assert.equal(lineup[0].config.version,'take-two/2');
 const n=await rpc(people[1],'delayed_create',{p_request:randomUUID(),p_opponent:people[0],p_real_money:false,p_lineup:lineup},'authenticated');
 assert.notEqual(n,end.match);assert.equal(await q('SELECT status v FROM private.delayed_matches WHERE id=$1',[n]),'invited');
 assert.equal(await q('SELECT count(*)::int v FROM private.delayed_settlements WHERE match_id=$1',[end.match]),1);
 writeFileSync(dir+'/continuation.json',JSON.stringify({passed:true,zeroClientGameplayTimeout:true,turnHandoff:true,archiveFrozenRules:true,lastViewerRunback:true,independentInvitation:true,settlementUnchanged:true},null,2));
 console.log('PASS zero-client gameplay timeout, archive, Run It Back and unchanged settlement');
}finally{await db.end();}
