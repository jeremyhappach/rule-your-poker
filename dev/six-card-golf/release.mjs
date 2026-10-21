import {writeFileSync as write,readFileSync as read} from 'node:fs';
import {createHash} from 'node:crypto';
import {candidate,connect,localContext,installLocalReference} from './database.mjs';

// Previously inspected canonical authority, checked again against the isolated
// reference. Any drift at eventual installation aborts before shared replacement.
export const expected={
 'private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)':'4103ca5c1f6acd06c89c4d86fcfa2c91',
 'private.megatouch_frozen_stake()':'d3efe1f605eea056169a8b674017958f',
 'public.settle_gameplay_chip_transfers(uuid,jsonb,text)':'de14ab5df0a703cfd8c1ed43aa5a819c',
 'public.submit_ante_decision(uuid,uuid,uuid,text,boolean,boolean)':'c633a318c7f2605104c92e03d3b3b09a',
 'public.set_game_paused(uuid,boolean,uuid,bigint)':'1fa2220c33734d1cf14c11f3eaef432b',
 'private.split_whole_chips_clockwise(uuid,uuid[],integer,integer)':'b6eb18407c38efdc17d6b181820cfa9a',
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
const sql=[prerequisites,guard,candidate(),publication,schedule].join('\n');
const c=await connect(localContext().database);
try{await c.query('BEGIN');await installLocalReference(c);await c.query(guard);await c.query('ROLLBACK');}
catch(e){await c.query('ROLLBACK');throw e;}finally{await c.end();}
const proof="BEGIN; SET LOCAL statement_timeout='60s';\n"+['core-proof','proof','financial-proof','recovery-proof','mixed-proof'].map(n=>read('supabase/six-card-golf/'+n+'.sql','utf8')).join('\n')+"\nROLLBACK;";
write('qualification.local/six-card-golf/migration.sql',sql);
write('qualification.local/six-card-golf/installed-proof.sql',proof);
write('qualification.local/six-card-golf/release-manifest.json',JSON.stringify({preparedAt:new Date().toISOString(),sha256:createHash('sha256').update(sql).digest('hex'),expected,admission:'closed',productionApplied:false,formalMigrationId:null},null,2));
console.log('Prepared guarded closed-admission SQL and installed-authority proof; no production execution');
