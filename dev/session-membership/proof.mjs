// Disposable localhost only. Existing fixtures are never mutated.
import pg from 'file:///C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {definition} from '../battle31/canonical-lifecycle.mjs';
const database='session_membership_'+Date.now();
assert(/^session_membership_\d+$/.test(database));
const admin=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database:'postgres',connectionTimeoutMillis:3000});
await admin.connect();await admin.query(`CREATE DATABASE ${database} TEMPLATE money_qualification_1792441147994`);
mkdirSync('qualification.local/session-membership',{recursive:true});
const connect=async()=>{const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database,connectionTimeoutMillis:3000});await c.connect();return c;};
const db=await connect(),peer=await connect(),checks=[];
const query=(s,a=[],c=db)=>c.query(s,a);
const val=async(s,a=[],c=db)=>(await query(s,a,c)).rows[0]?.v;
const pass=s=>{checks.push(s);console.log('PASS',s);};
const migration=read('supabase/migrations/20261102210516_session_host_succession_and_inactivity.sql','utf8');
const flags="SELECT set_config('app.three_five_seven_authoritative_write','on',false),set_config('app.cribbage_authoritative_write','on',false),set_config('app.gin_rummy_authoritative_write','on',false),set_config('app.yahtzee_authoritative_write','on',false)";
async function actor(id,c=db){await query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated')::text,false)",[id],c);}
async function asUser(id,sql,args=[],c=db){await actor(id,c);await query('SET ROLE authenticated',[],c);try{return await val(sql,args,c);}finally{await query('RESET ROLE',[],c).catch(()=>{});}}
const hosts=async f=>val('SELECT jsonb_build_object(\'host\',current_host,\'version\',host_version) v FROM public.games WHERE id=$1',[f.g]);
const ledger=async f=>val(`SELECT jsonb_build_object('players',(SELECT jsonb_agg(jsonb_build_object('id',id,'chips',chips,'cursor',chip_transfer_cursor) ORDER BY id) FROM public.players WHERE game_id=$1),'results',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.game_results r WHERE game_id=$1),'batches',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.gameplay_transfer_batches b WHERE game_id=$1),'accounts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.player_transactions t WHERE source_game_id=$1),'snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.session_player_snapshots s WHERE game_id=$1)) v`,[f.g]);
async function fixture(real=false){
 const f={g:randomUUID(),u:Array.from({length:5},randomUUID),p:Array.from({length:5},randomUUID)};
 for(const id of f.u){await query('INSERT INTO auth.users(id) VALUES($1)',[id]);await query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true",[id,'Membership '+id.slice(0,8)]);}
 await query("INSERT INTO public.games(id,name,status,current_host,real_money) VALUES($1,'Local membership proof','waiting',$2,$3)",[f.g,f.u[0],real]);
 for(let i=0;i<5;i++)await query("INSERT INTO public.players(id,game_id,user_id,position,is_bot,status) VALUES($1,$2,$3,$4,$5,'active')",[f.p[i],f.g,f.u[i],i+1,i===4]);
 return f;
}
async function open(f){
 f.d=randomUUID();await query("INSERT INTO public.dealer_games(id,session_id,game_type,dealer_user_id) VALUES($1,$2,'holm-game',$3)",[f.d,f.g,f.u[1]]);
 await query("UPDATE public.games SET status='in_progress',current_game_uuid=$2,game_type='holm-game',total_hands=1,dealer_position=1 WHERE id=$1",[f.g,f.d]);
}
async function settled(f){
 await query("INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,game_type,winner_player_id,winner_username,pot_won,player_chip_changes) VALUES($1,$2,1,'holm-game',$3,'Local proof',0,'{}')",[f.g,f.d,f.p[1]]);
 await query("UPDATE public.games SET status='game_over' WHERE id=$1",[f.g]);
 await query("INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot) SELECT game_id,$2,1,id,user_id,'Local proof',chips,is_bot FROM public.players WHERE game_id=$1",[f.g,f.d]);
}
const boundary=(f,c=db)=>query("UPDATE public.games SET status='game_selection',current_game_uuid=NULL,game_type=NULL,config_complete=false,config_deadline=clock_timestamp()+interval '5 minutes' WHERE id=$1",[f.g],c);
const missed=p=>val('SELECT missed_dealer_games v FROM private.session_table_tenure WHERE player_id=$1',[p]);
try {
 // This archived local fixture omits some RPCs; install their exact checked-in
 // definitions as test prerequisites, without changing any production service.
 if(!await val("SELECT to_regprocedure('public.session_leave(uuid,uuid,integer)')::text v")){
  for(const name of ['private.capture_recovery_context','private.restore_recovery_context'])await query(definition('20260905025936_isolate_recovery_sessions_and_restore_context.sql',name));
  for(const name of ['private.stand_up_and_resolve_postgame','private.reconcile_session_abandonment','public.session_leave','public.session_take_seat','public.transfer_session_host','public.request_session_end','private.request_session_end'])await query(definition('20260914214838_gin_replay_waiting_lifecycle.sql',name));
  await query(definition('20261015212154_farkle_active_account_and_recovery_lock_order.sql','public.set_game_paused'));
  await query("REVOKE ALL ON FUNCTION public.session_leave(uuid,uuid,integer),public.session_take_seat(uuid,integer,uuid,integer),public.transfer_session_host(uuid,uuid,bigint),public.request_session_end(uuid,uuid,bigint),public.set_game_paused(uuid,boolean,uuid,bigint) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.session_leave(uuid,uuid,integer),public.session_take_seat(uuid,integer,uuid,integer),public.transfer_session_host(uuid,uuid,bigint),public.request_session_end(uuid,uuid,bigint),public.set_game_paused(uuid,boolean,uuid,bigint) TO authenticated;");
 }
 await query(flags);await query(flags,[],peer);
 // Remove copied synthetic sessions only in this newly created disposable
 // database. The source template is never connected for writes; triggers remain
 // installed/enabled for every tested fixture and financial transition below.
 assert.equal(await val('SELECT current_database() v'),database);
 await query('TRUNCATE public.games CASCADE');
 await query("INSERT INTO public.game_defaults(game_type,holm_presentation_ack_fallback_seconds,allow_bot_dealers) VALUES('holm',30,false) ON CONFLICT(game_type) DO UPDATE SET holm_presentation_ack_fallback_seconds=30,allow_bot_dealers=false");
 if(!await val("SELECT to_regclass('private.session_table_tenure')::text v")){
  await query('BEGIN');await query("INSERT INTO public.games(name,status,real_money) VALUES('Rollout gate proof','waiting',false)");
  await assert.rejects(()=>query(migration),/finish_existing_tables_before_install/);await query('ROLLBACK');pass('migration refuses installation while existing tables remain');
  await query('BEGIN');await query(migration);await query('ROLLBACK');
  assert.equal(await val("SELECT to_regclass('private.session_table_tenure')::text v"),null);pass('migration rollback leaves no candidate objects');
  await query(migration);
 }
 await query('BEGIN');
 const f=await fixture();
 const before=await ledger(f);
 const initial=await hosts(f);assert.equal(initial.host,f.u[0]);
 // Socket absence/reconnect only updates heartbeat data; neither resets tenure nor elects.
 const tenure=await val('SELECT seated_since::text v FROM private.session_table_tenure WHERE player_id=$1',[f.p[0]]);
 await query('UPDATE public.players SET position=NULL WHERE id=$1',[f.p[0]]);
 await query('UPDATE public.players SET position=7 WHERE id=$1',[f.p[0]]);
 assert.deepEqual(await hosts(f),initial);
 assert.equal(await val('SELECT seated_since::text v FROM private.session_table_tenure WHERE player_id=$1',[f.p[0]]),tenure);
 await query("UPDATE public.players SET sitting_out=true WHERE id=$1",[f.p[0]]);
 assert.deepEqual(await hosts(f),initial);
 assert.equal(await val('SELECT seated_since::text v FROM private.session_table_tenure WHERE player_id=$1',[f.p[0]]),tenure);
 await query("UPDATE public.players SET status='left' WHERE id=$1",[f.p[0]]);
 assert.equal((await hosts(f)).host,f.u[1]);
 await query("UPDATE public.players SET status='active',sitting_out=false WHERE id=$1",[f.p[0]]);
 await query("UPDATE public.players SET status='left' WHERE id=$1",[f.p[1]]);
 assert.equal((await hosts(f)).host,f.u[2]);
 assert.notEqual(await val('SELECT seated_since::text v FROM private.session_table_tenure WHERE player_id=$1',[f.p[0]]),tenure);
 assert.deepEqual(await ledger(f),before);pass('continuous tenure, canonical seat rearrangement, sitting-out host, leave/reseat and financial preservation');
 const version=(await hosts(f)).version;
 await query("UPDATE public.players SET status='left' WHERE game_id=$1 AND id=ANY($2::uuid[])",[f.g,[f.p[2],f.p[3]]]);
 assert.equal((await hosts(f)).host,f.u[0]);assert.equal((await hosts(f)).version,version+1);pass('simultaneous departures choose the final eligible cohort once, never a bot');
 await query('UPDATE public.profiles SET is_active=false WHERE id=$1',[f.u[0]]);
 assert.equal((await hosts(f)).host,null);pass('ineligible account and bot-only table have no human host');
 await query('ROLLBACK');

 for(const real of [false,true]){
  await query('BEGIN');const x=await fixture(real);
  await query('UPDATE public.players SET sitting_out=true WHERE id=$1',[x.p[0]]);
  for(let i=1;i<=3;i++){
   await open(x);await query("UPDATE public.games SET status='in_progress' WHERE id=$1",[x.g]);
   if(i===1){
    await actor(x.u[1]);
    await query('SELECT public.settle_gameplay_chip_transfers($1,$2::jsonb,$3)',[x.g,JSON.stringify([{from:{kind:'player',playerId:x.p[0]},to:{kind:'player',playerId:x.p[1]},amount:7}]),'transfer']);
    await query('SET CONSTRAINTS ALL IMMEDIATE');
    assert.equal(await val('SELECT sum(chips) v FROM public.players WHERE game_id=$1',[x.g]),'0');
    assert.equal(await val('SELECT chips v FROM public.players WHERE id=$1',[x.p[0]]),-7);
    assert.equal(await val('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE game_id=$1',[x.g]),1);
   }
   assert.equal(await missed(x.p[0]),i-1);
   await settled(x);const finances=await ledger(x);
   if(i===3){
    await query(`CREATE OR REPLACE FUNCTION pg_temp.reject_membership_boundary() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.id='${x.g}'::uuid AND NEW.status='game_selection' THEN RAISE EXCEPTION 'proof:injected_boundary_failure'; END IF;RETURN NEW;END $$; CREATE TRIGGER proof_membership_failure AFTER UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_membership_boundary()`);
    await query('SAVEPOINT boundary_failure');await assert.rejects(()=>boundary(x),/injected_boundary_failure/);await query('ROLLBACK TO boundary_failure');
    assert.equal(await missed(x.p[0]),2);assert.equal(await val('SELECT status v FROM public.players WHERE id=$1',[x.p[0]]),'active');assert.deepEqual(await ledger(x),finances);
    await query('DROP TRIGGER proof_membership_failure ON public.games');
   }
   await boundary(x);await boundary(x);
   assert.deepEqual(await ledger(x),finances);
   if(i<3){assert.equal(await missed(x.p[0]),i);assert.equal((await hosts(x)).host,x.u[0]);}
  }
  assert.equal(await val('SELECT status v FROM public.players WHERE id=$1',[x.p[0]]),'left');
  assert.equal(await val('SELECT position v FROM public.players WHERE id=$1',[x.p[0]]),null);
  assert.equal((await hosts(x)).host,x.u[1]);
  assert.equal(await val('SELECT dealer_position v FROM public.games WHERE id=$1',[x.g]),4); // canonical clockwise; bot dealer disabled
  await query('ROLLBACK');pass(`${real?'real-money':'play-money'} synthetic three-game threshold, injected rollback, duplicate boundary, financial snapshot preservation, dealer and host handoff`);
 }

 await query('BEGIN');const a=await fixture();
 await query("UPDATE public.system_settings SET value='{"+'"dealer_game_limit":1'+"}' WHERE key='session_inactivity'");
 await open(a);await query('UPDATE public.players SET sitting_out=true WHERE id=$1',[a.p[0]]);await settled(a);await boundary(a);
 assert.equal(await missed(a.p[0]),0);pass('partial game does not count');
 await open(a);await query('UPDATE public.players SET sitting_out=false WHERE id=$1',[a.p[0]]);await query('UPDATE public.players SET sitting_out=true WHERE id=$1',[a.p[0]]);await settled(a);await boundary(a);
 assert.equal(await missed(a.p[0]),0);pass('actual participation resets and invalidates a fully-missed cohort');
 await open(a);await settled(a);await boundary(a);
 assert.equal(await val('SELECT status v FROM public.players WHERE id=$1',[a.p[0]]),'left');pass('configured one-game limit');
 await query('ROLLBACK');

 await query('BEGIN');const auth=await fixture();await open(auth);
 await query("UPDATE public.players SET status='left' WHERE id=$1",[auth.p[0]]);
 assert.equal((await asUser(auth.u[0],'SELECT public.set_game_paused($1,true,$2,0) v',[auth.g,auth.d])).outcome,'not_authorized');
 assert.equal((await asUser(auth.u[1],'SELECT public.set_game_paused($1,true,$2,0) v',[auth.g,auth.d])).outcome,'paused');
 const generation=await val('SELECT timer_generation v FROM public.games WHERE id=$1',[auth.g]);
 await query('SAVEPOINT denied');await assert.rejects(()=>asUser(auth.u[0],'SELECT public.request_session_end($1,$2,$3) v',[auth.g,auth.d,generation]),/not_session_host/);await query('ROLLBACK TO denied');await query('RESET ROLE');
 await asUser(auth.u[1],'SELECT public.request_session_end($1,$2,$3) v',[auth.g,auth.d,generation]);
 assert.equal(await val('SELECT pending_session_end v FROM public.games WHERE id=$1',[auth.g]),true);
 await query('SAVEPOINT denied');await assert.rejects(()=>asUser(auth.u[1],'UPDATE public.games SET current_host=$2 WHERE id=$1 RETURNING id v',[auth.g,auth.u[3]]),/command_required|permission denied/);await query('ROLLBACK TO denied');await query('RESET ROLE');
 await query('ROLLBACK');pass('existing pause/end authority follows successor; former host and raw writes denied');

 await query('BEGIN');const guard=await fixture();await open(guard);
 await query('UPDATE public.players SET sitting_out=true WHERE id=$1',[guard.p[0]]);
 await query('UPDATE public.profiles SET is_active=false WHERE id=$1',[guard.u[3]]);
 await query('SAVEPOINT denied');await assert.rejects(()=>asUser(guard.u[0],'SELECT public.transfer_session_host($1,$2,0) v',[guard.g,guard.p[3]]),/invalid_target/);await query('ROLLBACK TO denied');await query('RESET ROLE');
 await query('SAVEPOINT denied');await assert.rejects(()=>asUser(guard.u[0],'SELECT public.transfer_session_host($1,$2,0) v',[guard.g,guard.p[4]]),/invalid_target/);await query('ROLLBACK TO denied');await query('RESET ROLE');
 await query('SAVEPOINT denied');await assert.rejects(()=>asUser(guard.u[0],'UPDATE private.session_table_tenure SET missed_dealer_games=99 WHERE player_id=$1 RETURNING player_id v',[guard.p[1]]),/permission denied/);await query('ROLLBACK TO denied');await query('RESET ROLE');
 await query('ROLLBACK');pass('manual transfers reject bots/ineligible humans and counters are private');

 await query('BEGIN');const reconnect=await fixture();
 const tenureBefore=await val('SELECT seated_since::text v FROM private.session_table_tenure WHERE player_id=$1',[reconnect.p[0]]);
 const hostBefore=await hosts(reconnect);
 await query('SELECT private.reconcile_session_abandonment($1,clock_timestamp()+interval \'30 seconds\')',[reconnect.g]);
 await query("INSERT INTO public.voice_presence_heartbeats(user_id,tab_id,game_id,route,status,last_heartbeat_at) VALUES($1,'local-host-proof',$2::uuid,'/game/'||($2::uuid)::text,'active',clock_timestamp())",[reconnect.u[0],reconnect.g]);
 await query('SELECT private.reconcile_session_abandonment($1,clock_timestamp()+interval \'30 seconds\')',[reconnect.g]);
 assert.deepEqual(await hosts(reconnect),hostBefore);
 assert.equal(await val('SELECT seated_since::text v FROM private.session_table_tenure WHERE player_id=$1',[reconnect.p[0]]),tenureBefore);
 await open(reconnect);
 await asUser(reconnect.u[0],'SELECT public.session_leave($1,$2,0) v',[reconnect.g,reconnect.p[0]]);
 const rejoin=await asUser(reconnect.u[0],'SELECT public.session_take_seat($1,1,$2,1) v',[reconnect.g,reconnect.p[0]]);
 assert.equal(rejoin.outcome,'seated');assert.equal((await hosts(reconnect)).host,reconnect.u[1]);
 assert.notEqual(await val('SELECT seated_since::text v FROM private.session_table_tenure WHERE player_id=$1',[reconnect.p[0]]),tenureBefore);
 assert.equal((await asUser(reconnect.u[0],'SELECT public.session_leave($1,$2,0) v',[reconnect.g,reconnect.p[0]])).outcome,'stale-participation');
 await query('ROLLBACK');pass('presence grace/reconnect preserves host and tenure; explicit leave/rejoin starts new tenure and rejects late departure');

 // Committed synthetic fixture permits two independent database clients.
 const race=await fixture();await open(race);
 const responses=await Promise.all([asUser(race.u[0],'SELECT public.session_leave($1,$2,0) v',[race.g,race.p[0]]),asUser(race.u[1],'SELECT public.session_leave($1,$2,0) v',[race.g,race.p[1]],peer)]);
 assert.equal((await hosts(race)).host,race.u[2]);
 assert(responses.every(r=>r.outcome==='stand-up-recorded-outside-postgame'));
 const after=await hosts(race);await asUser(race.u[0],'SELECT public.session_leave($1,$2,0) v',[race.g,race.p[0]]);assert.deepEqual(await hosts(race),after);
 pass('independent clients: concurrent departures and late duplicate converge');
 await query("UPDATE public.system_settings SET value='{"+'"dealer_game_limit":1'+"}' WHERE key='session_inactivity'");
 // The remaining host sits out for one full subsequent dealer-game. A second
 // client's departure races the boundary that releases the inactive host.
 await boundary(race);await query('UPDATE public.players SET sitting_out=true WHERE id=$1',[race.p[2]]);await open(race);await settled(race);
 await Promise.all([boundary(race),asUser(race.u[3],'SELECT public.session_leave($1,$2,0) v',[race.g,race.p[3]],peer)]);
 assert.equal((await hosts(race)).host,null);
 assert.equal(await val('SELECT status v FROM public.players WHERE id=$1',[race.p[2]]),'left');
 pass('inactivity boundary racing a second client departure excludes both and cannot select a bot');
 await query('DELETE FROM public.games WHERE id=$1',[race.g]);
 await query('DELETE FROM auth.users WHERE id=ANY($1::uuid[])',[race.u]);
 write('qualification.local/session-membership/result.json',JSON.stringify({database,checks,passed:true,at:new Date().toISOString()},null,2));
} finally {
 await db.query('ROLLBACK');await db.query('RESET ROLE');await db.end();await peer.end();
 // Only the uniquely named database created above; no shared fixture is deleted.
 assert(/^session_membership_\d+$/.test(database));
 await admin.query(`DROP DATABASE ${database}`);await admin.end();
}
