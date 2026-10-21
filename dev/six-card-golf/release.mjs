import {writeFileSync as write,readFileSync as read} from 'node:fs';
import {createHash} from 'node:crypto';
import {candidate,connect,localContext,installLocalReference} from './database.mjs';

// Previously inspected canonical authority, checked again against the isolated
// reference. Any drift at eventual installation aborts before shared replacement.
export const expected={
 'private.megatouch_begin(uuid,uuid)':'2a7cc30da1908e929e54791b4d5766b0',
 'private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)':'f3582431c00322facc1daaa81c20b682',
 'private.megatouch_frozen_stake()':'b42707fd97a6547a849a801190da8ac1',
 'public.settle_gameplay_chip_transfers(uuid,jsonb,text)':'86c0feb55524f14ab9f58a06cdee2ef6',
 'public.submit_ante_decision(uuid,uuid,uuid,text,boolean,boolean)':'c633a318c7f2605104c92e03d3b3b09a',
 'public.set_game_paused(uuid,boolean,uuid,bigint)':'1fa2220c33734d1cf14c11f3eaef432b',
 'private.split_whole_chips_clockwise(uuid,uuid[],integer,integer)':'b6eb18407c38efdc17d6b181820cfa9a',
 'public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)':'a69f39fefb234c3b01114c8049fdbbb6',
};
export const guard=`DO $guard$ DECLARE f record;BEGIN FOR f IN SELECT * FROM (VALUES ${Object.entries(expected).map(([signature,hash])=>`('${signature}','${hash}')`).join(',')}) expected(signature,hash) LOOP
 IF md5(pg_get_functiondef(to_regprocedure(f.signature))) IS DISTINCT FROM f.hash AND md5(replace(pg_get_functiondef(to_regprocedure(f.signature)),chr(13)||chr(10),chr(10))) IS DISTINCT FROM f.hash THEN RAISE EXCEPTION 'golf:shared_authority_changed:%',f.signature;END IF;END LOOP;END $guard$;`;
export const publication="ALTER PUBLICATION supabase_realtime ADD TABLE public.golf_revisions;";
export const schedule="SELECT cron.schedule('six-card-golf-recovery','1 second',$job$SET statement_timeout='3s'; SELECT private.golf_recover()$job$);";
const prerequisites=`DO $requirements$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') OR to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN RAISE EXCEPTION 'golf:pg_cron_required';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN RAISE EXCEPTION 'golf:realtime_publication_required';END IF;
 IF current_setting('wal_level')<>'logical' THEN RAISE EXCEPTION 'golf:logical_replication_required';END IF;
END $requirements$;`;
const sql=[prerequisites,guard,candidate(),publication,schedule].join('\n').replaceAll('\r\n','\n');
export const migrationPath='supabase/migrations/20261021011905_six_card_golf_v1.sql';
write(migrationPath,sql);
const c=await connect(localContext().database);
try{await c.query('BEGIN');await installLocalReference(c);await c.query(guard);await c.query('ROLLBACK');}
catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
const proof="-- LOCAL qualification: fixtures seed scheduler health. Not a production proof payload.\nBEGIN; SET LOCAL statement_timeout='60s';\n"+['core-proof','proof','financial-proof','recovery-proof','mixed-proof','qualification-proof'].map(n=>read('supabase/six-card-golf/'+n+'.sql','utf8')).join('\n')+'\n'+['core-proof','financial-proof','rollback-failure-proof'].map(n=>read('supabase/race-poker/'+n+'.sql','utf8')).join('\n')+"\nROLLBACK;";
write('qualification.local/six-card-golf/migration.sql',sql);
write('qualification.local/six-card-golf/installed-proof.sql',proof);
write('qualification.local/six-card-golf/release-manifest.json',JSON.stringify({preparedAt:new Date().toISOString(),sha256:createHash('sha256').update(sql).digest('hex'),expected,admission:'closed',productionApplied:false,formalMigrationId:'20261021011905'},null,2));
console.log('Prepared guarded closed-admission SQL and installed-authority proof; no production execution');
