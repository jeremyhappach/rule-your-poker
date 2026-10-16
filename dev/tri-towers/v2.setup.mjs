import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
import {connect,fixture,state} from './bots-fixture.mjs';
const database='tri_bots_v2_'+Date.now(),root=await connect('postgres');
await root.query('CREATE DATABASE '+database+' TEMPLATE tri_polish_1792113087070');await root.end();
const c=await connect(database),source=JSON.parse(await readFile('qualification.local/tri-towers/v2-captured-baseline.json','utf8'));
try{
 await c.query('ALTER TABLE private.tri_towers_matches ADD COLUMN IF NOT EXISTS bot_due_at bigint');
 await c.query('ALTER TABLE private.tri_towers_release ADD COLUMN IF NOT EXISTS admission_enabled boolean NOT NULL DEFAULT false');
 await c.query('SET check_function_bodies=off');
 for(const f of source.functions)await c.query(f.definition);
 for(const t of source.triggers){await c.query('DROP TRIGGER IF EXISTS "'+t.name+'" ON '+t.table);await c.query(t.definition);}
 await c.query('SET check_function_bodies=on');
 for(const f of source.functions)assert.equal((await c.query('SELECT md5(pg_get_functiondef($1::regprocedure)) h',[f.signature])).rows[0].h,f.hash,f.signature);
 await c.query("CREATE INDEX IF NOT EXISTS tri_towers_matches_due ON private.tri_towers_matches(least((state->>'deadline')::bigint,bot_due_at),dealer_game_id) WHERE NOT finished AND settlement IS NULL AND paused_at IS NULL");
 await c.query('DROP TRIGGER IF EXISTS tri_towers_schedule_bot ON private.tri_towers_matches;CREATE TRIGGER tri_towers_schedule_bot BEFORE INSERT OR UPDATE ON private.tri_towers_matches FOR EACH ROW EXECUTE FUNCTION private.tri_towers_schedule_bot()');
 const history=async()=>(await c.query("SELECT dealer_game_id,md5(to_jsonb(m)::text) h FROM private.tri_towers_matches m ORDER BY 1")).rows;
 const before=await history();
 await c.query(await readFile('supabase/migrations/20261016233453_tri_towers_v2.sql','utf8'));assert.deepEqual(await history(),before);
 assert.equal((await c.query('SELECT admission_enabled FROM private.tri_towers_release')).rows[0].admission_enabled,false);
 await c.query('UPDATE private.tri_towers_release SET enabled=true,admission_enabled=true');
 const f=await fixture(c,database);assert.equal((await state(c,f)).state.rules.version,'tri-towers/2');
 await writeFile('qualification.local/tri-towers/v2-context.json',JSON.stringify({database,fixture:f}));
 console.log(JSON.stringify({database,functions:source.functions.length,triggers:source.triggers.length,preserved:true}));
}finally{await c.end();}
