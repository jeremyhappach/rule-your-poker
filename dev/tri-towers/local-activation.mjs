import {readFile,writeFile} from 'node:fs/promises';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import assert from 'node:assert/strict';
const options={host:'127.0.0.1',port:55439,user:'tri_test',database:'postgres'};
const root=new pg.Client(options);await root.connect();
const database='tri_towers_activation_'+Date.now();
assert.equal((await root.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount,0,'Use a fresh isolated clone');
await root.query('CREATE DATABASE '+database+' TEMPLATE postgres');await root.end();
const c=new pg.Client({...options,database}),blocker=new pg.Client({...options,database});
await c.connect();await blocker.connect();
try {
 await c.query('DROP TRIGGER tri_towers_pause ON public.games; DROP TABLE private.tri_towers_release,private.tri_towers_matches,private.tri_towers_requests,private.tri_towers_history,public.tri_towers_revisions CASCADE');
 const fns=(await c.query("SELECT oid::regprocedure::text signature FROM pg_proc WHERE proname LIKE 'tri_towers_%'")).rows;
 for(const f of fns)await c.query('DROP FUNCTION '+f.signature+' CASCADE');
 await c.query('CREATE PUBLICATION supabase_realtime');
 const source=await readFile('supabase/migrations/20261015003637_activate_tri_towers_test_play.sql','utf8');
 // Windows PostgreSQL has no pg_cron binary. Verify the real job on Supabase.
 const sql=source.replace(/^SELECT cron.schedule.*$/m,'SELECT 1; -- Platform-only scheduler checked on production');
 await blocker.query('BEGIN; LOCK TABLE public.games IN ROW EXCLUSIVE MODE');
 const started=performance.now();
 await assert.rejects(c.query(sql),e=>e.code==='55P03');
 const blockedMs=performance.now()-started;
 await c.query('ROLLBACK');
 assert.equal((await c.query("SELECT to_regclass('private.tri_towers_matches') r")).rows[0].r,null);
 assert.equal((await c.query("SELECT count(*) n FROM public.game_defaults WHERE game_type='tri-towers'")).rows[0].n,'0');
 await blocker.query('ROLLBACK');
 const successStart=performance.now();await c.query(sql);const successMs=performance.now()-successStart;
 assert.equal((await c.query("SELECT presentation_mode FROM public.game_defaults WHERE game_type='tri-towers'")).rows[0].presentation_mode,'fullscreen');
 assert.equal((await c.query("SELECT count(*) n FROM pg_publication_tables WHERE tablename='tri_towers_revisions'")).rows[0].n,'1');
 assert.equal((await c.query("SELECT has_function_privilege('anon','public.tri_towers_capabilities(uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 const result={blockedMs,successMs,atomicRollback:true,catalog:true,publication:true,anonymousDenied:true,cron:'platform-only verification'};
 await writeFile('qualification.local/tri-towers/activation-proof.json',JSON.stringify(result,null,2));console.log(result);
}finally{await c.end();await blocker.end();}
