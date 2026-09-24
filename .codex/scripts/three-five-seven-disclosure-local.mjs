/**
 * Ordinary-user HTTP/Realtime security proof. Uses only the already prepared,
 * unlinked secure357-concealment Docker stack. Never accepts a remote URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const root=fileURLToPath(new URL('../../',import.meta.url));
process.chdir(root);
const output=path.join(root,'test-results/secure-357');
const cli=path.join(process.env.LOCALAPPDATA,'npm-cache/_npx/66b4952730d9cac8/node_modules/@supabase/cli-windows-x64/bin/supabase.exe');
const config=JSON.parse(execFileSync(cli,['--workdir',path.join(output,'stack'),'status','-o','json'],{encoding:'utf8',stdio:['pipe','pipe','pipe']}));
assert.equal(config.API_URL,'http://127.0.0.1:63321');
const sql=q=>execFileSync('docker',['exec','-i','supabase_db_secure357-concealment','psql','-X','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options);
const liveClients=[];
const client=()=>{const c=createClient(config.API_URL,config.ANON_KEY,options);liveClients.push(c);return c;};
const run=randomUUID(),accounts=[],evidence=[],results=[];
const save=()=>{fs.writeFileSync(path.join(output,'security-cases.private.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(output,'security-cases-summary.json'),JSON.stringify(results,null,2));};
const wait=ms=>new Promise(r=>setTimeout(r,Math.max(0,ms)));
const ok=async(request)=>{const r=await request;if(r.error)throw Error(r.error.message);return r.data;};
try{
 for(let i=0;i<5;i++){
  const email='proof-'+run+'-'+i+'@local.test',password=randomBytes(24).toString('base64url');
  const created=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));
  const c=client(),signed=await ok(c.auth.signInWithPassword({email,password}));
  const id=created.user.id;assert.match(id,/^[a-f0-9-]{36}$/);
  sql("INSERT INTO public.profiles(id,username,is_active,is_superuser) VALUES('"+id+"','S357_"+run.slice(0,8)+"_"+i+"',true,false) ON CONFLICT(id) DO UPDATE SET is_active=true,is_superuser=false;");
  accounts.push({id,c,session:signed.session});
 }
 // Match the known production publication membership relevant to this proof.
 sql("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='game_results') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.game_results; END IF; END $$;");
 const cases=[
  {name:'normal-one-folder-last-stays',players:2,terminal:false,lastFolder:false},
  {name:'normal-multiple-folders',players:3,terminal:false,lastFolder:false},
  {name:'winning-one-folder-last-stays',players:2,terminal:true,lastFolder:false},
  {name:'winning-multiple-folders',players:3,terminal:true,lastFolder:false},
  {name:'normal-last-actor-folds',players:2,terminal:false,lastFolder:true},
  {name:'winning-last-actor-folds',players:3,terminal:true,lastFolder:true},
 ];
 for(const test of cases){
  const game=randomUUID(),dealer=randomUUID(),members=accounts.slice(0,test.players),observer=accounts[3],outsider=accounts[4];
  const fixture=JSON.parse(sql("BEGIN; SELECT set_config('request.jwt.claim.sub','"+members[0].id+"',true); SELECT set_config('request.jwt.claims','{\"role\":\"authenticated\",\"sub\":\""+members[0].id+"\"}',true); SELECT set_config('app.three_five_seven_authoritative_write','on',true); SELECT set_config('app.three_five_seven_test_no_sweep','on',true);"+
  "INSERT INTO public.games(id,name,status,game_type,current_game_uuid,current_host,dealer_position,ante_amount,rollover_amount,leg_value,legs_to_win,total_hands,current_round,pot,real_money) VALUES('"+game+"','Secure357 "+test.name+"','ante_decision','3-5-7','"+dealer+"','"+members[0].id+"',1,1,1,1,"+(test.terminal?1:3)+",0,NULL,0,false);"+
  "INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES('"+dealer+"','"+game+"','"+members[0].id+"','3-5-7');"+
  "INSERT INTO public.players(game_id,user_id,position,chips,status,sitting_out,is_bot,ante_decision) VALUES "+
  members.map((m,i)=>"('"+game+"','"+m.id+"',"+(i+1)+",100,'active',false,false,'ante_up')").join(',')+";"+
  "INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot,sitting_out) VALUES('"+game+"','"+observer.id+"',NULL,0,'active',false,true);"+
  "SELECT public.three_five_seven_begin_game('"+game+"');"+
  "UPDATE public.player_cards SET cards='[{\"rank\":\"2\",\"suit\":\"♠\"},{\"rank\":\"4\",\"suit\":\"♠\"},{\"rank\":\"6\",\"suit\":\"♠\"}]'::jsonb WHERE round_id IN(SELECT id FROM public.rounds WHERE game_id='"+game+"'); COMMIT;"+
  "SELECT jsonb_build_object('game','"+game+"','dealer','"+dealer+"','round',(SELECT id FROM public.rounds WHERE game_id='"+game+"'),'players',(SELECT jsonb_agg(jsonb_build_object('id',id,'user',user_id,'position',position) ORDER BY position) FROM public.players WHERE game_id='"+game+"' AND status='active' AND position IS NOT NULL));").split(/\r?\n/).at(-1));
  const observed=[],rec={test,fixture,payloads:{}};
  evidence.push(rec);
  // Separate sockets per scenario avoid reusing a channel during its teardown.
  const c=client();await ok(c.auth.setSession(members[0].session));
  const channel=c.channel('proof-'+game);
  for(const table of ['players','game_results','three_five_seven_frame_notices'])channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'game_id=eq.'+game},p=>observed.push({at:Date.now(),table,payload:p}));
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Realtime subscribe timeout')),12000);channel.subscribe(s=>{if(s==='SUBSCRIBED'){clearTimeout(timer);resolve();}if(s==='CHANNEL_ERROR'){clearTimeout(timer);reject(Error('Realtime channel failed'));}});});
  const identity={p_game_id:game,p_dealer_game_id:dealer,p_round_id:fixture.round,p_hand_number:1,p_round_number:1};
  const choices=fixture.players.map((p,i)=>({p,m:members[i],choice:i===0?'stay':'fold'}));
  const order=test.lastFolder?choices:[...choices.slice(1),choices[0]];
  const before=await ok(c.rpc('three_five_seven_current_frame',{p_game_id:game}));
  rec.payloads.before=before;
  for(const action of order.slice(0,-1)){
   await ok(action.m.c.rpc('three_five_seven_submit_decision',{...identity,p_player_id:action.p.id,p_decision:action.choice}));
  }
  await wait(500);
  const incomplete=await ok(c.rpc('three_five_seven_current_frame',{p_game_id:game}));
  for(const p of incomplete.players)if(p.user_id!==members[0].id)assert.equal(p.current_decision,null,'incomplete opponent choice');
  assert.equal(incomplete.decision_reveal,null);
  assert.deepEqual(await ok(c.from('player_actions').select('*').eq('round_id',fixture.round)),[]);
  const last=order.at(-1);
  const receipt=await ok(last.m.c.rpc('three_five_seven_submit_decision',{...identity,p_player_id:last.p.id,p_decision:last.choice}));
  rec.payloads.receipt=receipt;
  assert.equal(receipt.resolution,null);assert.equal(receipt.game.status,'in_progress');
  assert.equal(receipt.decision_reveal.resolved_decisions,null);
  // Hold the existing authoritative pause interval for adversarial fan-out.
  // This does not change reveal durations or mutate a disclosure timestamp.
  const paused=await ok(c.rpc('set_game_paused',{p_game_id:game,p_paused:true,p_expected_dealer_game_id:dealer,p_expected_pause_version:receipt.game.pause_version}));
  assert.equal(paused.outcome,'paused');
  let drop=Date.parse(receipt.decision_reveal.drop_at);
  const reconnect=client();await ok(reconnect.auth.setSession(members[0].session));
  const reads=await Promise.all([
   c.rpc('three_five_seven_current_frame',{p_game_id:game}),
   c.rpc('read_session_frame',{p_game_id:game}),
   c.rpc('three_five_seven_read_reveal',identity),
   reconnect.rpc('three_five_seven_read_reveal',identity),
   observer.c.rpc('three_five_seven_read_reveal',identity),
   c.from('players').select('*').eq('game_id',game),
   c.from('game_results').select('*').eq('game_id',game),
   c.from('gameplay_transfer_batches').select('*').eq('game_id',game),
   c.rpc('get_hand_history',{p_game_id:game,p_dealer_game_id:dealer}),
   c.schema('private').from('three_five_seven_decision_snapshots').select('*'),
   outsider.c.rpc('three_five_seven_read_reveal',identity),
   c.rpc('three_five_seven_read_reveal',{...identity,p_dealer_game_id:randomUUID()}),
   c.rpc('three_five_seven_reveal_terminal_cards',{p_game_id:game,p_dealer_game_id:dealer,p_round_id:fixture.round,p_hand_number:1,p_player_id:fixture.players[0].id}),
   c.rpc('three_five_seven_settle_game',{p_game_id:game,p_dealer_game_id:dealer,p_round_id:fixture.round,p_hand_number:1}),
  ]);
  rec.payloads.beforeDrop=reads;rec.beforeDropCompletedAt=Date.now();
  assert.equal(reads[0].data?.game?.is_paused,true,'Concealed interval is not paused');
  reads.slice(0,9).forEach(r=>assert.equal(r.error,null));
  assert.equal(reads[0].data.game.status,'in_progress');
  assert.deepEqual(reads[0].data.players.map(p=>p.chips),before.players.map(p=>p.chips));
  assert.equal(reads[1].data.game.last_round_result,before.game.last_round_result);
  for(const i of [2,3,4])assert.equal(reads[i].data.decision_reveal.resolved_decisions,null);
  for(const i of [5,6,7])assert.deepEqual(reads[i].data,[]);
  assert.ok(!JSON.stringify(reads[8].data).includes('"action":"fold"'));
  for(const i of [9,10,11])assert.ok(reads[i].error);
  assert.equal(reads[12].data.outcome,'disclosure_pending');assert.equal(reads[13].data.outcome,'disclosure_pending');
  const resumed=await ok(c.rpc('set_game_paused',{p_game_id:game,p_paused:false,p_expected_dealer_game_id:dealer,p_expected_pause_version:paused.pause_version}));
  assert.equal(resumed.outcome,'resumed');
  const resumedClock=await ok(c.rpc('three_five_seven_read_reveal',identity));
  drop=Date.parse(resumedClock.decision_reveal.drop_at);
  // Delayed/reconnected read is authorized by server time, never a caller clock.
  await wait(drop-Date.now()+100);
  const released=await ok(reconnect.rpc('three_five_seven_current_frame',{p_game_id:game}));
  const map=Object.fromEntries(choices.map(a=>[a.p.id,a.choice]));
  assert.deepEqual(released.decision_reveal.resolved_decisions,map);
  assert.equal(released.game.status,test.terminal?'game_over':'in_progress');
  if(test.terminal)assert.ok(released.players.every(p=>p.current_decision==null));
  const observedReveal=await ok(observer.c.rpc('three_five_seven_read_reveal',identity));
  assert.deepEqual(observedReveal.decision_reveal.resolved_decisions,map);
  await wait(400);
  rec.payloads.released=released;rec.realtime=observed;
  assert.ok(observed.some(e=>e.table==='three_five_seven_frame_notices'),'secret-free wakeup absent');
  assert.ok(!observed.some(e=>e.at<drop&&e.table==='players'&&e.payload.new?.user_id!==members[0].id&&['fold','stay'].includes(e.payload.new?.current_decision)),'early realtime opponent choice');
  assert.ok(!observed.some(e=>e.at<drop&&e.table==='game_results'
    && e.payload.new?.settlement_key!=='three_five_seven_charge:'+fixture.round),'early realtime outcome');
  const late=await ok(last.m.c.rpc('three_five_seven_submit_decision',{...identity,p_player_id:last.p.id,p_decision:last.choice}));
  assert.equal(late.outcome,'already_decided');
  if(!test.terminal){
   await wait(Date.parse(resumedClock.decision_reveal.continuation_at)-Date.now()+100);
   await ok(c.rpc('three_five_seven_advance_round',identity));
   const next=await ok(c.rpc('three_five_seven_current_frame',{p_game_id:game}));
   assert.notEqual(next.identity.round_id,fixture.round);assert.equal(next.decision_reveal,null);
   assert.ok(next.players.every(p=>p.current_decision==null));
   rec.payloads.next=next;
  }
  await c.removeChannel(channel);
  results.push({name:test.name,passed:true,game,dropAt:receipt.decision_reveal.drop_at,checks:'ordinary RPC/read/history/result/realtime/private-schema/identity/outsider/spectator/reconnect/snapshot/continuation'});
  save();console.log('PASS '+test.name);
 }
 const privateChecks=sql("SELECT jsonb_build_object('schema',has_schema_privilege('authenticated','private','USAGE'),'snapshot',has_table_privilege('authenticated','private.three_five_seven_decision_snapshots','SELECT'),'implementation',has_function_privilege('authenticated','public.three_five_seven_settle_game_authority_impl(uuid,uuid,uuid,integer)','EXECUTE'));");
 assert.deepEqual(JSON.parse(privateChecks),{schema:false,snapshot:false,implementation:false});
 sql("DO $$ BEGIN BEGIN UPDATE private.three_five_seven_decision_snapshots SET decisions='{}' WHERE round_id=(SELECT round_id FROM private.three_five_seven_decision_snapshots LIMIT 1); RAISE EXCEPTION 'immutability_not_enforced'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'three_five_seven_snapshot:immutable' THEN RAISE; END IF; END; END $$;");
 results.push({name:'private privileges and snapshot immutability',passed:true});save();
 console.log('PASS private privileges and snapshot immutability');
} catch(error){results.push({passed:false,error:error.message});save();console.error(error.message);process.exitCode=1;}
finally{for(const c of liveClients){await c.removeAllChannels();c.realtime.disconnect();}for(const a of accounts)await a.c.auth.signOut({scope:'local'});}
