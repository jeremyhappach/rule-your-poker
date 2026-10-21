import assert from 'node:assert/strict';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {createHash} from 'node:crypto';
import {installReleasedBaseline,source} from './released-baseline.mjs';
import {connect} from './database.mjs';
const database='battle31_package_'+Date.now(),admin=await connect('postgres');
await admin.query('CREATE DATABASE '+database+' TEMPLATE money_qualification_1792441147994');await admin.end();
const c=await connect(database),locker=await connect(database);
const sql=read('supabase/battle31/release.sql','utf8'),meta=JSON.parse(read('dev/battle31/evidence/release-manifest.json','utf8'));
let reference;
const preservation="SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,coalesce(p.proacl::text,'') acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND (p.proname LIKE 'race_poker_%' OR p.proname LIKE 'eleven_up_%' OR p.proname IN('megatouch_begin','advance_ante_phase_exact','megatouch_frozen_stake','set_game_paused','set_automatic_play','pause_all_humans_auto_fold','submit_ante_decision','settle_gameplay_chip_transfers')) ORDER BY signature";
let baseline,defaults;
const cases=[];
async function reject(name,setup,pattern){
 await c.query('BEGIN');
 try{if(setup)await c.query(setup);await assert.rejects(c.query(sql),pattern);cases.push(name);}
 finally{await c.query('ROLLBACK');}
}
try{
 await installReleasedBaseline(c);
 baseline=(await c.query(preservation)).rows;
 reference=baseline.filter(f=>['megatouch_begin','advance_ante_phase_exact','megatouch_frozen_stake'].some(n=>f.signature.includes(n+'('))).map(f=>f.definition).join('\n;\n')+';';
 defaults=(await c.query('SELECT to_jsonb(d) d FROM public.game_defaults d ORDER BY game_type')).rows;
 // This local template has no pg_cron extension. Model registration metadata,
 // not execution: actual pg_cron dispatch remains a hosted qualification gate.
 await c.query(`ALTER TABLE cron.job ADD COLUMN command text,ADD COLUMN database text DEFAULT current_database(),ADD COLUMN username text DEFAULT current_user;
 CREATE OR REPLACE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$ INSERT INTO cron.job(jobname,schedule,command,active) VALUES($1,$2,$3,true) RETURNING jobid $$;`);
 await reject('missing publication refused',null,/platform_registration_missing/);
 await c.query('CREATE PUBLICATION supabase_realtime');
 await reject('canonical drift refused',"ALTER FUNCTION private.megatouch_frozen_stake() SET search_path=public",/canonical_definition_drift/);
 await reject('obsolete pre-11-Up-bot shared owner refused',source('supabase/race-poker/registration.sql'),/canonical_definition_drift/);
 await reject('partial installation refused',"CREATE TABLE private.battle31_incomplete(id int)",/partial_installation/);
 await reject('scheduler collision rolls back all game objects',"INSERT INTO cron.job(jobname,schedule,command,active) VALUES('battle31-recovery','5 seconds','SELECT 1',true)",/scheduler_collision/);
 assert.equal((await c.query("SELECT to_regclass('private.battle31_matches') t")).rows[0].t,null);
 await c.query("CREATE FUNCTION pg_temp.fail_battle_default() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.game_type='battle-31' THEN RAISE EXCEPTION 'injected_registration_failure';END IF;RETURN NEW;END $$");
 await reject('late registration failure is atomic',"CREATE TRIGGER battle31_package_failure BEFORE INSERT ON public.game_defaults FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_battle_default()",/injected_registration_failure/);
 assert.equal((await c.query("SELECT to_regclass('private.battle31_matches') t")).rows[0].t,null);
 assert.equal((await c.query("SELECT count(*)::int n FROM cron.job WHERE jobname='battle31-recovery'")).rows[0].n,0);
 await locker.query('BEGIN');await locker.query('LOCK TABLE public.games IN ROW EXCLUSIVE MODE');
 await reject('busy shared table fails without waiting',null,/could not obtain lock|lock timeout/);
 await locker.query('ROLLBACK');
 await c.query(reference.replaceAll('\r\n','\n').replaceAll('\n','\r\n'));
 await c.query(sql);cases.push('fresh atomic install against CRLF shared definitions');
 assert.deepEqual((await c.query('SELECT enabled,admission_enabled,fake_qualified,real_qualified FROM private.battle31_release')).rows,[{enabled:false,admission_enabled:false,fake_qualified:false,real_qualified:false}]);
 const before=(await c.query("SELECT obj_description('private.battle31_release'::regclass,'pg_class') marker")).rows[0].marker;
 await c.query(sql);await c.query(sql);cases.push('exact repeat no-op twice');
 assert.equal((await c.query("SELECT obj_description('private.battle31_release'::regclass,'pg_class') marker")).rows[0].marker,before);
 assert.equal((await c.query("SELECT count(*)::int n FROM cron.job WHERE jobname='battle31-recovery'")).rows[0].n,1);
 assert.equal((await c.query("SELECT count(*)::int n FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='battle31_revisions'")).rows[0].n,1);
 const recoverDef=(await c.query("SELECT pg_get_functiondef('private.battle31_recover()'::regprocedure) d")).rows[0].d;
 await c.query('BEGIN');await c.query(recoverDef.replaceAll('\r\n','\n').replaceAll('\n','\r\n'));await c.query(sql);await c.query('ROLLBACK');cases.push('CRLF-only installed definition repeat accepted');
 await reject('substantive body drift refused',recoverDef.replace('BEGIN','BEGIN /* changed */'),/installed_definition_drift/);
 await reject('bare CR is not normalized away',recoverDef.replace('BEGIN','BEGIN\r '),/installed_definition_drift/);
 await reject('spaces are not normalized away',recoverDef.replace('BEGIN','BEGIN '),/installed_definition_drift/);
 await reject('installed function drift refused',"ALTER FUNCTION private.battle31_recover() SET search_path=public",/installed_definition_drift/);
 await reject('installed ACL drift refused',"GRANT SELECT ON private.battle31_matches TO authenticated",/installed_definition_drift/);
 await reject('installed schema drift refused',"ALTER TABLE private.battle31_matches ADD COLUMN unauthorized text",/installed_definition_drift/);
 await reject('scheduler drift refused',"UPDATE cron.job SET active=false WHERE jobname='battle31-recovery'",/installed_definition_drift/);
 await reject('publication drift refused',"ALTER PUBLICATION supabase_realtime DROP TABLE public.battle31_revisions",/installed_definition_drift/);
 await c.query('BEGIN');await c.query('UPDATE private.battle31_release SET enabled=true,admission_enabled=true,fake_qualified=true,real_qualified=true');await c.query(sql);
 assert.equal((await c.query('SELECT admission_enabled FROM private.battle31_release')).rows[0].admission_enabled,true);await c.query('ROLLBACK');cases.push('repeat preserves existing gates');
 // Reverse only the explicitly additive Battle 31 branches; everything else is exact.
 const after=(await c.query(preservation)).rows;
 const branch="  IF g.game_type='battle-31' THEN\n   IF NOT EXISTS(SELECT 1 FROM private.battle31_release WHERE singleton AND enabled AND CASE WHEN g.real_money THEN real_qualified ELSE fake_qualified END) THEN RAISE EXCEPTION 'battle31:admission_closed';END IF;\n   s:=private.battle31_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);\n   INSERT INTO private.battle31_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);\n  ELSIF g.game_type='race-poker' THEN";
 for(const previous of baseline){const current=after.find(f=>f.signature===previous.signature);assert(current);assert.equal(current.acl,previous.acl);
  const restored=current.definition.replaceAll('\r\n','\n').replaceAll(",'battle-31')",')').replace(branch,"  IF g.game_type='race-poker' THEN");
  assert.equal(restored,previous.definition.replaceAll('\r\n','\n'),previous.signature);
 }
 assert.deepEqual((await c.query("SELECT to_jsonb(d) d FROM public.game_defaults d WHERE game_type<>'battle-31' ORDER BY game_type")).rows,defaults);
 cases.push('released Race Poker v2, 11 Up bots/Ready, shared controls, ACLs and defaults preserved exactly');
 const evidence={at:new Date().toISOString(),database,main:meta.main,packageSHA256:createHash('sha256').update(sql).digest('hex'),passed:true,cases,limitations:['cron.schedule is a local metadata stub; no actual scheduler dispatch','publication catalog tested with wal_level=replica; no logical replication transport']};
 write('dev/battle31/evidence/package-proof.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{await locker.query('ROLLBACK').catch(()=>{});await Promise.all([c.end(),locker.end()]);}
