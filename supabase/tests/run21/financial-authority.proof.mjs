// Qualification only: fresh loopback clone, deployed definitions, rollback fixtures.
import pg from '../../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const options={host:'127.0.0.1',port:55439,user:'tri_test',database:'postgres'};
const root=new pg.Client(options);await root.connect();
const database='run21_release_proof_'+Date.now();
await root.query('CREATE DATABASE '+database+' TEMPLATE postgres');await root.end();
const c=new pg.Client({...options,database});await c.connect();
const vite=await createServer({configFile:false,resolve:{alias:{'@':resolve('src')}},esbuild:{jsx:'automatic'},server:{middlewareMode:true},appType:'custom',optimizeDeps:process.argv.includes('--browser')?{entries:['supabase/tests/run21/browser-proof.tsx'],include:['react','react-dom/client','react/jsx-runtime']}:{noDiscovery:true,entries:[]}});
const source=JSON.parse(readFileSync('qualification.local/run21-production/current-capture.json','utf8'));
const financial=JSON.parse(readFileSync('qualification.local/run21-production/finance-capture.json','utf8'));
const result={database,productionWrites:0,tests:[]};
const suddenDeath=process.argv.includes('--sudden-death');
const terminal=process.argv.includes('--terminal');
const realMoney=process.argv.includes('--real-money');
const disconnectFinal=process.argv.includes('--disconnect-final');
const legacy=process.argv.includes('--legacy');
const pass=(name,data)=>{result.tests.push({name,...data});console.log('PASS',name,data??'');};
try {
 await c.query('BEGIN; SET LOCAL check_function_bodies=off');
 for(const f of source.functions)await c.query(f.definition);
 for(const f of financial.functions)await c.query(f.definition);
 // The prior metadata clone contains gameplay FKs and 88 real shared triggers.
 for(const [name,ddl] of [
 ['run21_append_events','BEFORE UPDATE OF state ON private.run21_matches FOR EACH ROW EXECUTE FUNCTION private.run21_append_events()'],
 ['run21_publish_revision','AFTER INSERT OR UPDATE ON private.run21_matches FOR EACH ROW EXECUTE FUNCTION private.run21_publish_revision()'],
 ['run21_capture_harness','BEFORE INSERT OR UPDATE OF debug_harness ON private.run21_matches FOR EACH ROW EXECUTE FUNCTION private.run21_capture_harness()']]){
  await c.query('DROP TRIGGER IF EXISTS '+name+' ON private.run21_matches');await c.query('CREATE TRIGGER '+name+' '+ddl);
 }
 for(const f of source.functions){
  const signature=f.signature.startsWith('private.')?f.signature:'public.'+f.signature;
  await c.query('REVOKE ALL ON FUNCTION '+signature+' FROM PUBLIC,anon,authenticated,service_role');
  if(f.acl?.some(a=>a.startsWith('authenticated=X/')))await c.query('GRANT EXECUTE ON FUNCTION '+signature+' TO authenticated');
  if(f.acl?.some(a=>a.startsWith('service_role=X/')))await c.query('GRANT EXECUTE ON FUNCTION '+signature+' TO service_role');
 }
 await c.query('GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role');
 await c.query("INSERT INTO private.run21_app_test_release(singleton,enabled,qualified,project_ref) VALUES(true,true,true,'local') ON CONFLICT(singleton) DO UPDATE SET enabled=true,qualified=true,project_ref='local'");
 const journal=JSON.parse(readFileSync('qualification.local/run21-production/journal-capture.json','utf8'));
 for(const f of journal.functions)await c.query(f.definition);
 for(const t of journal.triggers){const table=t.name==='history_transfer'?'public.gameplay_transfer_batches':'public.gameplay_transfer_pending_changes';await c.query('DROP TRIGGER IF EXISTS '+t.name+' ON '+table);await c.query(t.definition);}
 const pauseReference=JSON.parse(readFileSync('qualification.local/run21-production/horses-reference.json','utf8'));
 for(const f of pauseReference.functions)await c.query(f.definition);
 for(const f of JSON.parse(readFileSync('qualification.local/run21-production/context-capture.json','utf8')))await c.query(f.definition);
 for(const f of JSON.parse(readFileSync('qualification.local/run21-production/player-intent-capture.json','utf8')))await c.query(f.definition);
 await c.query(readFileSync('supabase/migrations/20261009231202_restore_all_human_auto_fold_pause.sql','utf8').split('-- Extend')[0].split('DO $')[0]);
 if(process.argv.includes('--migration')){
  // Platform cadence is separately verified against deployed pg_cron. This stub
  // keeps the exact migration transactional in the Windows metadata clone.
  await c.query("CREATE SCHEMA IF NOT EXISTS cron; CREATE TABLE cron.job(jobid bigserial,jobname text,schedule text,active boolean); CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE SQL AS $$ INSERT INTO cron.job(jobname,schedule,active) VALUES($1,$2,true) RETURNING jobid $$");
  await c.query(readFileSync('supabase/migrations/20261015133432_run21_production_authority.sql','utf8'));
 }else for(const name of ['financial-authority','recovery','pause','admission'])await c.query(readFileSync('supabase/run21/'+name+'.candidate.sql','utf8'));
 // Only the isolated proof opts in. Scheduler catalog/heartbeat are fixture inputs;
 // this exercises admission policy, not installation of pg_cron on Windows.
 await c.query("UPDATE private.run21_production_release SET qualified=true");
 await c.query("INSERT INTO public.game_defaults(game_type,decision_timer_seconds) VALUES('run21',30) ON CONFLICT(game_type) DO UPDATE SET decision_timer_seconds=30");
 await c.query("CREATE SCHEMA IF NOT EXISTS cron; CREATE TABLE IF NOT EXISTS cron.job(jobname text,schedule text,active boolean); INSERT INTO cron.job(jobname,schedule,active) VALUES('run21-recovery','5 seconds',true)");
 await c.query("INSERT INTO private.game_recovery_dispatch_state(singleton,last_completed_at,last_outcome) VALUES(true,clock_timestamp(),'completed') ON CONFLICT(singleton) DO UPDATE SET last_completed_at=excluded.last_completed_at,last_outcome=excluded.last_outcome");
 await c.query("UPDATE private.run21_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL");
 const users=[randomUUID(),randomUUID(),randomUUID()],players=[randomUUID(),randomUUID()],game=randomUUID();
 const deadline=new Date(Date.now()+600000).toISOString();
 for(const [i,user] of users.entries())await c.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)',[user,'Run21 isolated '+i]);
 await c.query("INSERT INTO public.games(id,name,status,real_money,current_host,dealer_position,config_deadline,pot,is_paused,pending_session_end) VALUES($1,'Isolated Run21 release proof','configuring',false,$2,1,$3,0,false,false)",[game,users[0],deadline]);
 if(realMoney)await c.query('UPDATE public.games SET real_money=true WHERE id=$1',[game]);
 for(let i=0;i<2;i++)await c.query("INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,waiting,is_bot) VALUES($1,$2,$3,$4,0,'active',false,false,false)",[players[i],game,users[i],i+1]);
 await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[users[0],JSON.stringify({sub:users[0],role:'authenticated'})]);
 const scalar=async(sql,args=[])=> (await c.query(sql,args)).rows[0].v;
 assert.equal(await scalar('SELECT private.run21_actor_allowed($1) v',[users[0]]),true);
 pass('Active non-admin account is already authorized without Run21 allowlist');
 const setupSql="SELECT public.run21_configure_local($1,$2,1,'run21',$3,$4) v";
 const setupArgs=[game,players[0],{ante_amount:5},deadline];
 const rejectsSetup=async(name,mutation,args,pattern,request=setupArgs)=>{
  await c.query('SAVEPOINT rejected_setup');
  if(mutation)await c.query(mutation,args);
  await c.query('SET LOCAL ROLE authenticated');
  await assert.rejects(()=>scalar(setupSql,request),pattern);
  await c.query('ROLLBACK TO SAVEPOINT rejected_setup');
  assert.equal(await scalar('SELECT count(*)::int v FROM private.run21_matches WHERE game_id=$1',[game]),0);
  assert.equal(await scalar('SELECT sum(abs(chips))::int v FROM public.players WHERE game_id=$1',[game]),0);
  pass(name);
 };
 await rejectsSetup('Unqualified release rejects configuration', 'UPDATE private.run21_production_release SET qualified=false',[],/release_unqualified/);
 await rejectsSetup('Revoked player rejects configuration','UPDATE public.profiles SET is_active=false WHERE id=$1',[users[0]],/authenticated_player_required/);
 await rejectsSetup('Outsider cannot configure',"SELECT set_config('request.jwt.claim.sub',$1,true)",[users[2]],/participant_required/);
 await rejectsSetup('Wrong dealer cannot configure',null,[],/setup_identity/,[game,players[1],{ante_amount:5},deadline]);
 await rejectsSetup('Paused session rejects setup','UPDATE public.games SET is_paused=true WHERE id=$1',[game],/setup_identity/);
 await rejectsSetup('Pending session end rejects setup','UPDATE public.games SET pending_session_end=true WHERE id=$1',[game],/setup_identity/);
 await rejectsSetup('Outstanding pot rejects setup','UPDATE public.games SET pot=1 WHERE id=$1',[game],/outstanding_pot/);
 await rejectsSetup('One competitor rejects setup',"UPDATE public.players SET status='left' WHERE id=$1",[players[1]],/two_eligible_players_required/);
 await rejectsSetup('Three competitors reject setup',"INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,waiting,is_bot) VALUES($1,$2,$3,3,0,'active',false,false,false)",[randomUUID(),game,users[2]],/two_eligible_players_required/);
 await rejectsSetup('Zero stake rejects setup',null,[],/invalid_setup/,[game,players[0],{ante_amount:0},deadline]);
 await rejectsSetup('Stale configuration identity rejects setup',null,[],/setup_identity/,[game,players[0],{ante_amount:5},new Date(Date.now()+300000).toISOString()]);
 if(realMoney){
  await rejectsSetup('Real money rejects bots',"INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,waiting,is_bot) VALUES($1,$2,$3,3,0,'active',false,false,true)",[randomUUID(),game,users[2]],/real_money_humans_required/);
  await rejectsSetup('Missing shared heartbeat fails closed','UPDATE private.game_recovery_dispatch_state SET last_completed_at=NULL',[],/real_money_liveness_unavailable/);
  await rejectsSetup('Disabled Run21 scheduler fails closed',"UPDATE cron.job SET active=false WHERE jobname='run21-recovery'",[],/run21_recovery_unhealthy/);
  await rejectsSetup('Failed worker fails closed',"UPDATE private.run21_recovery_state SET failure='proof_failure'",[],/run21_recovery_unhealthy/);
  await rejectsSetup('Stale worker heartbeat fails closed',"UPDATE private.run21_recovery_state SET last_completed_at=clock_timestamp()-interval '1 minute'",[],/run21_recovery_unhealthy/);
 }else{
  await c.query('SAVEPOINT fake_bot');
  await c.query("UPDATE public.players SET status='left' WHERE id=$1",[players[1]]);
  await c.query("INSERT INTO public.players(id,game_id,user_id,position,chips,status,sitting_out,waiting,is_bot) VALUES($1,$2,$3,3,0,'active',false,false,true)",[randomUUID(),game,users[2]]);
  await c.query('SET LOCAL ROLE authenticated');
  const botSetup=await scalar(setupSql,setupArgs);await c.query('RESET ROLE');
  const roster=await scalar('SELECT participants v FROM private.run21_matches WHERE dealer_game_id=$1',[botSetup.dealer_game.id]);
  assert.deepEqual(roster.map(p=>p.kind).sort(),['bot','human']);
  await c.query('ROLLBACK TO SAVEPOINT fake_bot');pass('Fake-money setup admits one human and one bot');
 }
 await c.query('COMMIT');
 const setupPeers=[new pg.Client({...options,database}),new pg.Client({...options,database})];
 let setups;
 try{
  setups=await Promise.all(setupPeers.map(async peer=>{
   await peer.connect();await peer.query('BEGIN');await peer.query('SET LOCAL ROLE authenticated');
   await peer.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[users[0],JSON.stringify({sub:users[0],role:'authenticated'})]);
   const value=(await peer.query(setupSql,setupArgs)).rows[0].v;await peer.query('COMMIT');return value;
  }));
 }finally{for(const peer of setupPeers)await peer.end();}
 assert.deepEqual(setups.map(s=>s.outcome).sort(),['already_configured','configured']);
 assert.equal(setups[0].dealer_game.id,setups[1].dealer_game.id);
 pass('Concurrent configuration commits exactly one dealer-game and deduplicates its replay');
 const setup=setups[0];await c.query('BEGIN');
 const dg=setup.dealer_game.id;
 assert.equal(await scalar('SELECT financial_version v FROM private.run21_matches WHERE dealer_game_id=$1',[dg]),2);
 if(terminal)await c.query('UPDATE public.games SET pending_session_end=true WHERE id=$1',[game]);
 pass('Non-admin two-human configuration succeeds',{realMoney});
 await c.query('SAVEPOINT forged_financial_write');await c.query('SET LOCAL ROLE authenticated');
 await assert.rejects(()=>scalar("SELECT public.run21_server_commit($1,0,'{\"winnerId\":\"forged\"}',NULL) v",[dg]),/permission denied/);
 await c.query('ROLLBACK TO SAVEPOINT forged_financial_write');
 pass('Browser role cannot submit a fabricated score or settlement to the service authority');
 const {Run21Authority}=await vite.ssrLoadModule('/server/run21/authority.ts');
 const {roundDeck}=await vite.ssrLoadModule('/server/run21/harness.ts');
 let now=Date.now();
 const load=async()=>{
  const rows=await scalar('SELECT public.run21_server_load_current($1,0) v',[game]);
  return rows.map(r=>({...r,dealer_user_id:users[0]}));
 };
 const commit=async(old,state,due,user)=>{
  const delta=state?{...state,events:state.events.filter(e=>e.sequence>(old.state?.eventSequence??0))}:null;
  let v;
  const args=[user??users[0],dg,old.revision,delta,due];
  const sql='SELECT public.run21_server_commit_admitted($1,$2,$3,$4,$5) v';
  if(!legacy&&state?.settlement&&!old.state?.settlement){
   await c.query('SAVEPOINT financial_failure');
   await c.query(`CREATE FUNCTION pg_temp.reject_run21_snapshot() RETURNS trigger LANGUAGE plpgsql AS $proof$ BEGIN RAISE EXCEPTION 'injected_snapshot_failure'; END $proof$;
    CREATE TRIGGER reject_run21_snapshot BEFORE INSERT ON public.session_player_snapshots FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_run21_snapshot()`);
   await assert.rejects(()=>scalar(sql,args),/injected_snapshot_failure/);
   await c.query('ROLLBACK TO SAVEPOINT financial_failure');
   assert.equal(await scalar('SELECT count(*)::int v FROM public.game_results WHERE game_id=$1',[game]),0);
   assert.equal(await scalar('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE game_id=$1',[game]),0);
   assert.equal(await scalar('SELECT count(*)::int v FROM private.run21_settlements WHERE dealer_game_id=$1',[dg]),0);
   assert.equal(await scalar('SELECT sum(abs(chips))::int v FROM public.players WHERE game_id=$1',[game]),0);
   pass('Failure after transfer and result insertion rolls back every financial artifact');
   // Only this disposable local database commits fixtures, so distinct connections can race.
   await c.query('COMMIT');
   const peers=[new pg.Client({...options,database}),new pg.Client({...options,database})];
   try{
    for(const peer of peers){await peer.connect();await peer.query('SET ROLE service_role');}
    const responses=await Promise.all(peers.map(peer=>peer.query(sql,args).then(r=>r.rows[0].v)));
    assert.deepEqual(responses.map(r=>r.outcome).sort(),['committed','conflict']);
    v=responses.find(r=>r.outcome==='committed');pass('Two service workers race: exactly one settlement commits');
   }finally{for(const peer of peers)await peer.end();}
   await c.query('BEGIN');
   assert.equal((await scalar(sql,args)).outcome,'conflict');pass('Replayed terminal revision cannot transfer twice');
  }else v=await scalar(sql,args);
  assert.equal(v.outcome,'committed');return {...v.record,dealer_user_id:users[0]};
 };
 const store={load,commit,confirm:(old,user)=>commit(old,null,old.bot_due_at,user),close:async(d,user)=>scalar('SELECT public.run21_server_close($1,$2) v',[d,user])};
 const {recoverRun21}=await vite.ssrLoadModule('/server/run21/recovery.ts');
 const recoverFresh=async()=>{
  const token=randomUUID();
  await c.query("UPDATE private.run21_recovery_state SET token=$1,expires_at=clock_timestamp()+interval '25 seconds',claimed=false",[token]);
  const signatures={run21_recovery_claim:['p_token'],run21_recovery_load:['p_token','p_game_id'],
   run21_server_commit:['p_dealer_game_id','p_expected_revision','p_state','p_bot_due_at'],run21_recovery_complete:['p_token','p_failure']};
  await c.query('SET LOCAL ROLE service_role');
  try{return await recoverRun21(async(name,args)=>{
   const keys=signatures[name];assert(keys,'unexpected recovery RPC');
   return scalar('SELECT public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') v',keys.map(key=>args[key]));
  },token);}finally{await c.query('RESET ROLE');}
 };
 // Exercise the real claim functions against an unstarted match, which is due now.
 await c.query('COMMIT');
 const recoveryPeers=[new pg.Client({...options,database}),new pg.Client({...options,database})];
 try{
  for(const peer of recoveryPeers){await peer.connect();await peer.query('SET ROLE service_role');}
  const token=randomUUID();
  await c.query("UPDATE private.run21_recovery_state SET token=$1,expires_at=clock_timestamp()+interval '25 seconds',claimed=false",[token]);
  const claims=await Promise.all(recoveryPeers.map(peer=>peer.query('SELECT public.run21_recovery_claim($1) v',[token]).then(r=>r.rows[0].v)));
  assert.deepEqual(claims.map(r=>r.accepted).sort(),[false,true]);pass('Competing database recovery workers claim a dispatch only once');
  assert.equal((await recoveryPeers[0].query('SELECT public.run21_recovery_load($1,$2) v',[token,game])).rows[0].v.length,1);
  await assert.rejects(()=>recoveryPeers[0].query('SELECT public.run21_recovery_load($1,$2)',[randomUUID(),game]),/recovery_token_denied/);
  await recoveryPeers[0].query('SET ROLE authenticated');
  await assert.rejects(()=>recoveryPeers[0].query('SELECT public.run21_recovery_claim($1)',[token]),/permission denied/);
  await recoveryPeers[0].query('SET ROLE service_role');pass('Recovery RPCs reject browser roles and forged dispatch tokens');
  await recoveryPeers[0].query('SELECT public.run21_recovery_complete($1,$2)',[token,'injected_worker_failure']);
  assert.equal(await scalar('SELECT failure v FROM private.run21_recovery_state'),'injected_worker_failure');
  await assert.rejects(()=>recoveryPeers[0].query('SELECT public.run21_recovery_complete($1,NULL)',[token]),/recovery_token_denied/);
  pass('Failed recovery remains observable and its acknowledgement cannot replay');
 }finally{for(const peer of recoveryPeers)await peer.end();}
 await c.query('BEGIN');
 await c.query('SAVEPOINT legacy_recovery');
 await c.query('UPDATE private.run21_matches SET financial_version=1 WHERE dealer_game_id=$1',[dg]);
 const legacyToken=randomUUID();
 await c.query("UPDATE private.run21_recovery_state SET token=$1,expires_at=clock_timestamp()+interval '25 seconds',claimed=false",[legacyToken]);
 assert.deepEqual((await scalar('SELECT public.run21_recovery_claim($1) v',[legacyToken])).games,[]);
 await c.query('ROLLBACK TO SAVEPOINT legacy_recovery');
 pass('Durable recovery excludes historical version-one matches');
 await c.query('SAVEPOINT pause_before_initialization');
 const unstarted=new Run21Authority(store,Date.now,undefined,undefined,false);
 try{
  await c.query("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
  await scalar('SELECT public.set_game_paused($1,true) v',[game]);
  await assert.rejects(()=>unstarted.read(game,users[0]),/run21:paused/);
  assert.equal(await scalar('SELECT state v FROM private.run21_matches WHERE dealer_game_id=$1',[dg]),null);
  assert.deepEqual(await recoverFresh(),{processed:0,failures:[]});
  await scalar('SELECT public.set_game_paused($1,false) v',[game]);
  assert((await unstarted.read(game,users[0])).view.roundId);
  pass('Pause before initialization preserves an empty match; resume safely opens its first board');
 }finally{unstarted.dispose();await c.query('ROLLBACK TO SAVEPOINT pause_before_initialization');}
 await c.query('SAVEPOINT inactivity');
 let clock=Date.now();
 const inactive=new Run21Authority(store,()=>clock,undefined,undefined,false);
 try{
  await inactive.recoverOne(game);
  const before=await scalar('SELECT state v FROM private.run21_matches WHERE dealer_game_id=$1',[dg]);
  const active=before.rounds.at(-1).active_player_id;
  assert.equal(before.config.firstPlacementSeconds,30);
  assert.equal(before.rounds.at(-1).boards[active].firstPlacementDeadline-before.updatedAt,30000);
  await inactive.read(game,users[0]);await inactive.read(game,users[1]);
  assert.equal((await scalar('SELECT state v FROM private.run21_matches WHERE dealer_game_id=$1',[dg])).rounds.at(-1).boards[active].firstPlacementDeadline,before.rounds.at(-1).boards[active].firstPlacementDeadline);
  pass('Reconnect and repeated reads preserve the first-placement deadline');
  // Move only the synthetic deadline to the past; scores/cards still come from the engine.
  await c.query("UPDATE private.run21_matches SET state=jsonb_set(state,$2::text[],to_jsonb($3::bigint)),revision=revision+1 WHERE dealer_game_id=$1",[dg,['rounds','-1','boards',active,'firstPlacementDeadline'],Date.now()-1]);
  clock=Date.now();
  const dispatch=randomUUID();
  await c.query("UPDATE private.run21_recovery_state SET token=$1,expires_at=clock_timestamp()+interval '25 seconds',claimed=false",[dispatch]);
  const {recoverRun21}=await vite.ssrLoadModule('/server/run21/recovery.ts');
  const signatures={
   run21_recovery_claim:['p_token'],run21_recovery_load:['p_token','p_game_id'],
   run21_server_commit:['p_dealer_game_id','p_expected_revision','p_state','p_bot_due_at'],
   run21_recovery_complete:['p_token','p_failure'],
  };
  await c.query('SET LOCAL ROLE service_role');
  const recoveryResult=await recoverRun21(async(name,args)=>{
   const keys=signatures[name];assert(keys,'unexpected recovery RPC');
   return scalar('SELECT public.'+name+'('+keys.map((_,i)=>'$'+(i+1)).join(',')+') v',keys.map(key=>args[key]));
  },dispatch);
  await c.query('RESET ROLE');
  assert.deepEqual(recoveryResult,{processed:1,failures:[]});
  pass('Fresh durable worker claims and recovers the expired turn through actual SQL RPCs');
  const after=await scalar('SELECT to_jsonb(m) v FROM private.run21_matches m WHERE dealer_game_id=$1',[dg]);
  const flags=await scalar('SELECT to_jsonb(p) v FROM public.players p WHERE id=$1',[active]);
  assert.equal(await scalar('SELECT sum(abs(chips))::int v FROM public.players WHERE game_id=$1',[game]),0);
  if(realMoney){
   assert.equal(flags.sitting_out,true);assert.equal(flags.auto_fold,false);
   assert.equal(await scalar('SELECT is_paused v FROM public.games WHERE id=$1',[game]),true);
   assert.deepEqual(after.state.cumulative,before.cumulative);
   await inactive.recoverOne(game);
   assert.equal(await scalar('SELECT revision::int v FROM private.run21_matches WHERE dealer_game_id=$1',[dg]),Number(after.revision));
   pass('Zero-client real-money timeout sits out the player and pauses without scoring or transferring');
   await c.query("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
   await c.query('SAVEPOINT resume_denied');
   await assert.rejects(()=>scalar('SELECT public.set_game_paused($1,false) v',[game]),/return_players_before_resume/);
   await c.query('ROLLBACK TO SAVEPOINT resume_denied');
   const returningUser=users[players.indexOf(active)];
   await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[returningUser,JSON.stringify({sub:returningUser,role:'authenticated'})]);
   assert.equal((await scalar("SELECT public.set_session_player_intent($1,$2,(SELECT intent_version FROM public.players WHERE id=$2),$3,'rejoin',true) v",[game,active,dg])).outcome,'accepted');
   assert.equal(await scalar('SELECT sitting_out v FROM public.players WHERE id=$1',[active]),false);
   await c.query("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
   assert.equal((await scalar('SELECT public.set_game_paused($1,false) v',[game])).outcome,'resumed');
   const resumed=await scalar('SELECT state v FROM private.run21_matches WHERE dealer_game_id=$1',[dg]);
   assert.equal(resumed.pausedAt,null);assert(resumed.rounds.at(-1).boards[active].firstPlacementDeadline>Date.now());
   pass('Resume requires the player to return and preserves a fresh first-placement clock');
  }else{
   assert.equal(flags.auto_fold,true);assert.equal(flags.sit_out_next_hand,true);
   assert(after.state.automaticPlayers.includes(active));
   await c.query('UPDATE private.run21_matches SET bot_due_at=$2 WHERE dealer_game_id=$1',[dg,Date.now()-1]);
   assert.deepEqual(await recoverFresh(),{processed:1,failures:[]});
   assert((await scalar('SELECT state v FROM private.run21_matches WHERE dealer_game_id=$1',[dg])).rounds.at(-1).boards[active].cardIndex>0);
   pass('Zero-client fake-money timeout uses bot logic and publishes automatic-play identity');
   const returningUser=users[players.indexOf(active)];
   await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[returningUser,JSON.stringify({sub:returningUser,role:'authenticated'})]);
   assert.equal((await scalar('SELECT public.set_automatic_play($1,$2,$3,$4,(SELECT intent_version FROM public.players WHERE id=$4),false) v',[game,after.state.rounds.at(-1).id,dg,active])).outcome,'accepted');
   assert.equal((await scalar('SELECT state v FROM private.run21_matches WHERE dealer_game_id=$1',[dg])).automaticPlayers.includes(active),false);
   assert.equal((await scalar('SELECT public.run21_server_commit($1,$2,$3,$4) v',[dg,after.revision,after.state,after.bot_due_at])).outcome,'conflict');
   pass('Canonical automatic-play control lets the human take back their board');
  }
 }finally{inactive.dispose();await c.query('ROLLBACK TO SAVEPOINT inactivity');}
 await c.query('SAVEPOINT gameplay_deadline');
 const overdue=new Run21Authority(store,Date.now,undefined,undefined,false);
 try{
  const initial=await overdue.read(game,users[0]),id=initial.view.active_player_id;
  await overdue.act(game,users[players.indexOf(id)],{identity:initial.view.identity,roundId:initial.view.roundId,playerId:id,
   requestId:randomUUID(),revision:initial.view.boards[id].revision,intent:{type:'place',column:0}});
  const persisted=await scalar('SELECT state v FROM private.run21_matches WHERE dealer_game_id=$1',[dg]);
  persisted.rounds.at(-1).boards[id].deadline=Date.now()-1;
  await c.query('UPDATE private.run21_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[dg,persisted]);
  overdue.dispose();assert.deepEqual(await recoverFresh(),{processed:1,failures:[]});
  assert.equal((await scalar('SELECT state v FROM private.run21_matches WHERE dealer_game_id=$1',[dg])).rounds.at(-1).boards[id].result.reason,'timeout');
  pass('Fresh worker expires a started gameplay clock from persisted state without clients');
 }finally{overdue.dispose();await c.query('ROLLBACK TO SAVEPOINT gameplay_deadline');}
 if(legacy)await c.query('UPDATE private.run21_matches SET financial_version=1 WHERE dealer_game_id=$1',[dg]);
 const worker=new Run21Authority(store,()=>now,(identity,round)=>roundDeck(identity,round,'always_104'));
 let browserProof;
 try {
  let view=await worker.read(game,users[0]);
  if(process.argv.includes('--browser'))browserProof=await (await import('./browser-proof.mjs')).openBrowserProof(vite,worker,game,users);
  // Only deterministic server shuffle is injected; every score comes from legal player commands.
  for(let round=1;round<=(suddenDeath?4:3);round++)for(let turn=0;turn<2;turn++){
   const id=view.view.active_player_id;const user=users[players.indexOf(id)];
   for(const intent of [...[0,1,2,3,0,1,2,3,4,4,4].map(column=>({type:'place',column})),{type:'collect'}]){
    if(intent.type==='collect'&&turn===1&&(!suddenDeath||round===4))now+=1000;
    const cmd={identity:view.view.identity,roundId:view.view.roundId,playerId:id,requestId:randomUUID(),revision:view.view.boards[id].revision,intent};
    view=browserProof?await browserProof.act(user,cmd):await worker.act(game,user,cmd);
   }
   now+=5000;
   if(disconnectFinal&&round===(suddenDeath?4:3)&&turn===1){
    worker.dispose();await browserProof?.close();browserProof=undefined;
    const persisted=await scalar('SELECT state v FROM private.run21_matches WHERE dealer_game_id=$1',[dg]);
    assert.equal(persisted.settlement,null);
    const delay=Math.max(0,persisted.rounds.at(-1).scorePresentation.endsAt-Date.now()+20);
    assert(delay<60000);await new Promise(resolve=>setTimeout(resolve,delay));
    assert.deepEqual(await recoverFresh(),{processed:1,failures:[]});
    assert.equal(await scalar('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE game_id=$1',[game]),1);
    assert.deepEqual(await recoverFresh(),{processed:0,failures:[]});
    pass('With every client disposed, a fresh durable worker settles and a repeated wake transfers nothing');
   }
   view=await worker.read(game,user);
   if(suddenDeath&&round===3&&turn===1){
    assert.equal(view.view.settlement,null);assert.equal(view.view.roundNumber,4);
    assert.equal(await scalar('SELECT count(*)::int v FROM public.game_results WHERE game_id=$1',[game]),0);
    assert.equal(await scalar('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE game_id=$1',[game]),0);
    pass('Three-round tie opens sudden death without moving chips or writing a result');
   }
  }
  assert.equal(view.view.roundNumber,suddenDeath?4:3);assert(view.view.settlement);
  if(browserProof){await browserProof.finish();pass('Two independent browsers play all three rounds through the actual fullscreen controls and shared SQL authority');}
  const before={canonicalBalances:await scalar('SELECT jsonb_object_agg(id,chips) v FROM public.players WHERE game_id=$1',[game]),
   resultCount:await scalar('SELECT count(*)::int v FROM public.game_results WHERE game_id=$1',[game]),
   transferCount:await scalar('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE game_id=$1',[game]),
   privateBalances:view.balances,privateReceipt:view.view.settlement};
  assert.deepEqual(Object.values(before.canonicalBalances).sort((a,b)=>a-b),legacy?[0,0]:[-5,5]);
  assert.equal(before.resultCount,legacy?0:1);assert.equal(before.transferCount,legacy?0:1);
  assert.deepEqual(Object.values(before.privateBalances).sort((a,b)=>a-b),[-5,5]);
  pass(legacy?'Historical version-one completion keeps private balances without retroactive canonical transfers':'Completed match settles canonical balances +5/-5 exactly once',before);
  const snapshots=await scalar('SELECT jsonb_object_agg(player_id,chips) v FROM public.session_player_snapshots WHERE game_id=$1 AND dealer_game_id=$2',[game,dg]);
  assert.deepEqual(snapshots,legacy?null:before.canonicalBalances);pass(legacy?'Historical completion creates no new final snapshots':'Final snapshots match canonical balances');
  const batch=legacy?null:await scalar('SELECT to_jsonb(b) v FROM public.gameplay_transfer_batches b WHERE game_id=$1',[game]);
  if(!legacy){assert.equal(batch.id,view.view.settlement.transferBatchId);assert.equal(Object.keys(batch.unmatched_deltas).length,0);pass('Immutable receipt references canonical balanced transfer batch');}
  await worker.read(game,users[0]);await worker.read(game,users[1]);pass('Reconnect replays terminal state without another transfer');
  await worker.close(game,users[0]);await worker.close(game,users[0]);
  assert.equal(await scalar('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE game_id=$1',[game]),legacy?0:1);
  assert.equal(await scalar('SELECT count(*)::int v FROM public.game_results WHERE game_id=$1',[game]),legacy?0:1);
  pass('Duplicate close and reconnect do not duplicate canonical financial settlement');
  const after=await scalar('SELECT to_jsonb(g) v FROM public.games g WHERE id=$1',[game]);
  if(terminal){assert.equal(after.status,'session_ended');pass('Pending terminal session ends after canonical settlement');}
  else{
   assert.equal(after.status,'game_selection');
   await c.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'; UPDATE private.run21_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL");
   const i=after.dealer_position-1;
   await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[users[i],JSON.stringify({sub:users[i],role:'authenticated'})]);
   await c.query('SET LOCAL ROLE authenticated');
   const next=await scalar("SELECT public.run21_configure_local($1,$2,$3,'run21','{\"ante_amount\":5}',$4) v",[game,players[i],after.dealer_position,after.config_deadline]);
   await c.query('RESET ROLE');
   await scalar('SELECT public.run21_server_close($1,$2) v',[dg,users[0]]);
   assert.equal(await scalar('SELECT current_game_uuid::text v FROM public.games WHERE id=$1',[game]),next.dealer_game.id);
   assert.equal(await scalar('SELECT financial_version v FROM private.run21_matches WHERE dealer_game_id=$1',[next.dealer_game.id]),2);
   pass('Run Back accepts a settled predecessor; late close preserves the successor');
   // Race a legal last-moment placement against the durable expiry, using
   // distinct service connections and the same persisted revision.
   const raceStore={...store,commit:async(row,state,due)=>{
    const value=await scalar('SELECT public.run21_server_commit($1,$2,$3,$4) v',[row.dealer_game_id,row.revision,state,due]);
    assert.equal(value.outcome,'committed');return {...value.record,dealer_user_id:users[i]};
   }};
   const raceAuthority=new Run21Authority(raceStore,Date.now,undefined,undefined,false);
   await raceAuthority.recoverOne(game);raceAuthority.dispose();
   const raceRow=await scalar('SELECT to_jsonb(m) v FROM private.run21_matches m WHERE dealer_game_id=$1',[next.dealer_game.id]);
   const raceId=raceRow.state.rounds.at(-1).active_player_id, raceDeadline=Date.now()+250;
   raceRow.state.rounds.at(-1).boards[raceId].firstPlacementDeadline=raceDeadline;
   await c.query('UPDATE private.run21_matches SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',[raceRow.dealer_game_id,raceRow.state]);
   const persisted=await scalar('SELECT to_jsonb(m) v FROM private.run21_matches m WHERE dealer_game_id=$1',[raceRow.dealer_game_id]);
   const engine=await vite.ssrLoadModule('/src/lib/run21/engine.ts');
   const placement=engine.applyCommand(persisted.state,{identity:persisted.state.identity,roundId:persisted.state.rounds.at(-1).id,
    playerId:raceId,requestId:randomUUID(),revision:persisted.state.rounds.at(-1).boards[raceId].revision,intent:{type:'place',column:0}},
    {kind:'player',playerId:raceId},raceDeadline-1);
   assert.equal(placement.status,'accepted');
   const expiry=engine.expireFirstPlacement(persisted.state,raceDeadline,realMoney);
   await c.query('COMMIT');
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,raceDeadline-Date.now()+1)));
   const racers=[new pg.Client({...options,database}),new pg.Client({...options,database})];
   try{
    const raced=await Promise.all(racers.map(async(peer,index)=>{
     await peer.connect();await peer.query('SET ROLE service_role');
     return (await peer.query('SELECT public.run21_server_commit($1,$2,$3,NULL) v',[persisted.dealer_game_id,persisted.revision,index===0?placement.state:expiry])).rows[0].v;
    }));
    assert.deepEqual(raced.map(r=>r.outcome).sort(),['committed','conflict']);
    assert.deepEqual(await scalar('SELECT jsonb_object_agg(id,chips) v FROM public.players WHERE game_id=$1',[game]),before.canonicalBalances);
    pass('Timeout/action race commits one revision without an additional transfer');
   }finally{for(const peer of racers)await peer.end();}
   await c.query('BEGIN');
  }
 }finally{await browserProof?.close();worker.dispose();}
 await c.query('ROLLBACK');
 result.fixtureTransactionRolledBack=true;result.isolatedDatabaseWillBeDropped=true;writeFileSync('qualification.local/run21-production/'+(legacy?'legacy':disconnectFinal?'disconnected':terminal?'terminal':suddenDeath?'sudden-death':'financial')+'-result.json',JSON.stringify(result,null,2));
}catch(e){await c.query('ROLLBACK');throw e;}finally{await vite.close();await c.end();
 const cleanup=new pg.Client(options);await cleanup.connect();
 if(!/^run21_release_proof_[0-9]+$/.test(database))throw Error('unsafe cleanup');
 await cleanup.query('DROP DATABASE '+database+' WITH (FORCE)');await cleanup.end();}
