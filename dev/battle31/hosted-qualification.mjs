// Prepared for a separately authorized hosted qualification. No default connection.
// Never imports database.mjs, installs authority, schedules jobs, or seeds health.
import assert from 'node:assert/strict';
import {readFileSync as read} from 'node:fs';
import {pathToFileURL} from 'node:url';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {runFinancialProof} from './financial-cases.mjs';

export async function requireLiveScheduler(c,now=Date.now()) {
 const extensions=(await c.query("SELECT extname FROM pg_extension WHERE extname='pg_cron'")).rows;
 assert.equal(extensions.length,1,'Actual pg_cron extension required; metadata stubs are insufficient');
 const jobs=(await c.query("SELECT * FROM cron.job WHERE jobname='battle31-recovery'")).rows;
 assert.equal(jobs.length,1,'Exactly one Battle 31 recovery job required');
 const job=jobs[0];
 assert.equal(job.active,true);assert.equal(job.schedule,'1 second');
 assert.equal(job.command,"SET statement_timeout='3s'; SELECT private.battle31_recover()");
 const executions=(await c.query("SELECT status,end_time FROM cron.job_run_details WHERE jobid=$1 AND end_time IS NOT NULL ORDER BY end_time DESC LIMIT 3",[job.jobid])).rows;
 assert.equal(executions.length,3,'Three real completed scheduler executions required');
 assert(executions.every(r=>r.status==='succeeded'),'Recent scheduler failure');
 const fresh=t=>Number.isFinite(Date.parse(t))&&now-Date.parse(t)>=-5000&&now-Date.parse(t)<30000;
 assert(fresh(executions[0].end_time),'Battle 31 scheduler evidence is stale');
 const health=(await c.query('SELECT to_jsonb(s) health FROM private.game_recovery_dispatch_state s WHERE singleton')).rows[0]?.health;
 assert(health&&health.last_outcome==='completed'&&fresh(health.last_completed_at),'Canonical recovery health is missing, failed, or stale');
 return {recentExecutions:executions,canonicalHealth:health};
}

export async function qualifyInstalled(c) {
 const meta=JSON.parse(read('dev/battle31/evidence/release-manifest.json','utf8'));
 // Fail before any fixture writes when the package is absent or differs.
 const installed=(await c.query("SELECT to_regclass('private.battle31_release') present")).rows[0].present;
 assert(installed,'Install and qualify the guarded package under separate approval first');
 const marker=(await c.query("SELECT obj_description('private.battle31_release'::regclass,'pg_class') marker")).rows[0].marker;
 assert.equal(JSON.parse(marker).sourceSHA256,meta.sourceSHA256,'Wrong installed package');
 const gates=(await c.query('SELECT * FROM private.battle31_release')).rows[0];
 assert(!gates.enabled&&!gates.admission_enabled&&!gates.fake_qualified&&!gates.real_qualified,'Hosted qualification requires all admission gates closed');
 const scheduler=await requireLiveScheduler(c);
 // Installed package validation is its guarded no-op path, rolled back regardless.
 await c.query('BEGIN');
 try {await c.query(read('supabase/battle31/release.sql','utf8'));}
 finally {await c.query('ROLLBACK');}
 const financial=await runFinancialProof(c);
 return {packageSHA256:meta.packageSHA256,scheduler,financial,
  remaining:['Authenticated hosted PostgREST and Realtime','Zero-client recovery with actual scheduler','Physical iPhone and owner smoke']};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 if(!process.argv.includes('--run-installed')) {
  console.log('Prepared only. Separately authorized execution requires --run-installed and BATTLE31_QUALIFICATION_URL. No connection made.');
 } else {
  assert(process.env.BATTLE31_QUALIFICATION_URL,'Explicit qualification connection required');
  const c=new pg.Client({connectionString:process.env.BATTLE31_QUALIFICATION_URL,application_name:'battle31-rollback-qualification',connectionTimeoutMillis:10000});
  try {
   await c.connect();
   await c.query("SET statement_timeout='15s'; SET lock_timeout='100ms'");
   console.log(JSON.stringify(await qualifyInstalled(c),null,2));
  }
  finally {await c.end();}
 }
}
