import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {connect,context} from './database.mjs';
import {installCandidate} from './install-candidate.mjs';
import {installPolish} from './install-polish.mjs';
const c=await connect((await context()).database),checks=[];
const one=async(sql,params=[])=>(await c.query(sql,params)).rows[0];
const fixture=async(theme='classic')=>(await one('SELECT pg_temp.quintzee_fixture(2,false,$1) f',[theme])).f;
const state=async(f)=>(await one('SELECT state FROM private.quintzee_matches WHERE dealer_game_id=$1',[f.dealer])).state;
const solo=async(user,theme)=>(await one("SELECT public.arcade_quintzee_start($1,gen_random_uuid(),$2) r",[user,theme])).r;
const unchanged=async()=> (await c.query("SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND (p.proname LIKE 'quintzee_v%_%' OR p.proname IN ('quintzee_settle','quintzee_pause','arcade_score_group'))) OR (n.nspname='public' AND p.proname IN ('arcade_start','arcade_leaderboard')) ORDER BY 1")).rows;
try {
 await c.query('BEGIN');await installCandidate(c);await installPolish(c);
 let source=read('supabase/quintzee/production-proof.sql','utf8').replaceAll('\r\n','\n');await c.query(source.slice(0,source.indexOf('DO $$\nDECLARE')));
 source=read('supabase/quintzee/extended-proof.sql','utf8').replaceAll('\r\n','\n');await c.query(source.slice(source.indexOf('CREATE OR REPLACE FUNCTION pg_temp.quintzee_fixture'),source.indexOf('DO $$ DECLARE f jsonb;')));
 await c.query("UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL");
 const original=await fixture(),oldState=await state(original),oldRun=await solo(original.users[0],'classic'),hashes=await unchanged();
 assert.equal(oldRun.config.durationMs,180000);
 await c.query(read('supabase/quintzee/round-duration.candidate.sql','utf8'));
 assert.equal((await one("SELECT quintzee_round_seconds seconds FROM public.game_defaults WHERE game_type='quintzee'")).seconds,240);
 assert.deepEqual(await state(original),oldState);
 assert.equal((await one('SELECT config FROM private.arcade_runs WHERE id=$1',[oldRun.id])).config.durationMs,180000);
 assert.equal((await solo(original.users[0],'modern')).id,oldRun.id);
 checks.push('Initial 240s; preexisting 180s Arcade/multiplayer snapshots and active-run resume preserved');
 for(const seconds of [240,60,600,300])for(const theme of ['classic','modern']) {
  await c.query("UPDATE public.game_defaults SET quintzee_round_seconds=$1 WHERE game_type='quintzee'",[seconds]);
  const f=await fixture(theme),s=await state(f),r=await solo(f.users[0],theme);
  assert.equal(s.rules.durationMs,seconds*1000);assert.equal(r.config.durationMs,seconds*1000);assert.equal(r.config.theme,theme);
  assert.deepEqual(s.rules,((({theme,...config})=>config)(r.config)));
  assert.equal(r.ruleset,`quintzee/3-duration-${seconds}`);
  const b=(await one("SELECT private.quintzee_v3_board_reduce(private.quintzee_v3_board_start($1,1000),'start','{}',2000) b",[s.rules])).b;
  assert.equal(b.deadline-2000,seconds*1000);assert.equal(s.rules.readyMs,30000);
  assert.equal((await one('SELECT private.quintzee_v3_speed($1,$2) speed',[seconds*500,seconds*1000])).speed,200);
  const expired=(await one("SELECT private.quintzee_v3_board_reduce($1,'tick',NULL,$2) b",[b,b.deadline])).b;assert.equal(expired.result.reason,'timeout');
  const bonus=(await one("SELECT private.quintzee_v3_board_reduce($1::jsonb||'{\"scores\":{\"ones\":3,\"twos\":6,\"threes\":9,\"fours\":12,\"fives\":15},\"dice\":[6,6,6,1,2]}','score','{5}',3000) b",[b])).b;
  assert.equal(bonus.deadline,b.deadline+2100);assert.equal(bonus.celebration.endsAt,5100);
  const saved=s;await c.query("UPDATE public.game_defaults SET quintzee_round_seconds=241 WHERE game_type='quintzee'");assert.deepEqual(await state(f),saved);
  assert.equal((await one('SELECT config FROM private.arcade_runs WHERE id=$1',[r.id])).config.durationMs,seconds*1000);
  const board=(await one("SELECT public.arcade_leaderboard($1,'quintzee','all',NULL,$2) b",[f.users[0],r.ruleset])).b;
  assert.equal(board.ruleset,r.ruleset);
  checks.push(`${theme}: ${seconds}s new Arcade/MP, frozen after default edit, normalized multiplier, exact expiry, bounded bonus pause, historical board selectable`);
 }
 await c.query("UPDATE public.game_defaults SET quintzee_round_seconds=180 WHERE game_type='quintzee'");
 assert.equal((await one("SELECT id FROM private.arcade_rulesets WHERE game='quintzee' AND enabled")).id,'quintzee/3');
 for(const bad of [0,59,601,null]){await c.query('SAVEPOINT invalid');await assert.rejects(c.query("UPDATE public.game_defaults SET quintzee_round_seconds=$1 WHERE game_type='quintzee'",[bad]));await c.query('ROLLBACK TO invalid');}
 await c.query('SAVEPOINT invalid');await assert.rejects(c.query("UPDATE public.game_defaults SET quintzee_round_seconds='240.5' WHERE game_type='quintzee'"));await c.query('ROLLBACK TO invalid');
 // The disposable template omits API grants/policies. Reproduce the read-only
 // verified hosted SELECT/UPDATE policy for this rollback proof only.
 await c.query('GRANT SELECT,UPDATE ON public.game_defaults TO authenticated');
 await c.query(`ALTER TABLE public.game_defaults ENABLE ROW LEVEL SECURITY;
 CREATE POLICY "Anyone can view game defaults" ON public.game_defaults FOR SELECT USING(true);
 CREATE POLICY "Admins can update game defaults" ON public.game_defaults FOR UPDATE USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));`);
 await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[original.users[0]]);await c.query('SET LOCAL ROLE authenticated');
 const denied=await c.query("UPDATE public.game_defaults SET quintzee_round_seconds=260 WHERE game_type='quintzee' RETURNING game_type");assert.equal(denied.rowCount,0);await c.query('RESET ROLE');
 await c.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[original.users[0]]);await c.query('SET LOCAL ROLE authenticated');
 assert.equal((await c.query("UPDATE public.game_defaults SET quintzee_round_seconds=260 WHERE game_type='quintzee' RETURNING game_type")).rowCount,1);await c.query('RESET ROLE');
 assert.equal((await one("SELECT config FROM private.arcade_rulesets WHERE game='quintzee' AND enabled")).config.durationMs,260000);
 checks.push('Admin-only saved defaults, server bounds/fraction/null rejection, 180s board reuse');
 await c.query("UPDATE private.arcade_rulesets SET enabled=false WHERE game='quintzee';UPDATE public.game_defaults SET quintzee_round_seconds=240 WHERE game_type='quintzee'");
 assert.equal((await one("SELECT count(*)::int n FROM private.arcade_rulesets WHERE game='quintzee' AND enabled")).n,0);
 await c.query('SAVEPOINT real');await assert.rejects(c.query("SELECT pg_temp.quintzee_fixture(2,false,'classic',true)"),/fake_money_only/);await c.query('ROLLBACK TO real');
 assert.deepEqual(await unchanged(),hashes);
 checks.push('Closed Arcade admission remains closed; real-money rejection intact; frozen /1-/3 cores, settlement, pause, Arcade admission and leaderboard functions unchanged');
 await c.query('ROLLBACK');mkdirSync('dev/quintzee/evidence/round-duration',{recursive:true});write('dev/quintzee/evidence/round-duration/authority.json',JSON.stringify({passed:true,local:true,rolledBack:true,checkedAt:new Date().toISOString(),checks},null,2));console.log(JSON.stringify(checks,null,2));
}catch(e){await c.query('ROLLBACK');console.error(e);process.exitCode=1;}finally{await c.end();}
