import {connect} from '../tri-towers/bots-fixture.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const database='arcade_tri_'+Date.now(),root=await connect('postgres');
await root.query('CREATE DATABASE '+database+' TEMPLATE tri_polish_1792113087070');await root.end();
const db=await connect(database),baseline=JSON.parse(readFileSync('qualification.local/tri-towers/solo-baseline.json','utf8'));
try{
 await db.query("CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY); CREATE SCHEMA IF NOT EXISTS cron; CREATE TABLE IF NOT EXISTS cron.job(jobid bigserial,jobname text,schedule text,active boolean); CREATE OR REPLACE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE SQL AS $$ INSERT INTO cron.job(jobname,schedule,active) VALUES($1,$2,true) RETURNING jobid $$");
 await db.query(readFileSync('supabase/arcade/phase-one.sql','utf8'));
 await db.query(readFileSync('supabase/arcade/completion.sql','utf8'));
 await db.query('DROP FUNCTION IF EXISTS public.arcade_leaderboard(uuid,text,text,uuid)');
 await db.query('ALTER TABLE private.tri_towers_matches ADD COLUMN IF NOT EXISTS bot_due_at bigint;ALTER TABLE private.tri_towers_release ADD COLUMN IF NOT EXISTS admission_enabled boolean NOT NULL DEFAULT false;SET check_function_bodies=off');
 for(const f of baseline.functions)await db.query(f.definition);
 await db.query('SET check_function_bodies=on');
 for(const r of baseline.rulesets)await db.query('INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled',[r.id,r.game,r.config,r.enabled]);
 await db.query("UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp()");
 writeFileSync('qualification.local/tri-towers/solo-context.json',JSON.stringify({database}));console.log(JSON.stringify({database,functions:baseline.functions.length}));
}finally{await db.end();}
