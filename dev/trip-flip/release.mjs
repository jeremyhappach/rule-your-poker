import {readFileSync as read,writeFileSync as write,existsSync} from 'node:fs';
import {build} from 'esbuild';import {webkit} from '@playwright/test';
const guard=`DO $guard$ DECLARE f record; BEGIN
 FOR f IN SELECT * FROM (VALUES
 ('public.arcade_start(uuid,uuid,text)','5c29d89461b1de9b7c2ce7dea03621d3'),
 ('public.arcade_commit(uuid,uuid,bigint,jsonb,bigint,uuid,text,uuid)','6d57da27cb323f7696a08105fdc99d74'),
 ('private.megatouch_begin(uuid,uuid)','a3870e589a62d8460409af2a17b1a3bd'),
 ('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)','61a00628fb000a2a8eb3df1063ef9da3'),
 ('private.megatouch_frozen_stake()','1e97542cf7bac94bafcbd64396337e25')) expected(signature,hash) LOOP
 IF md5(pg_get_functiondef(to_regprocedure(f.signature))) IS DISTINCT FROM f.hash THEN RAISE EXCEPTION 'trip_flip:shared_authority_changed:%',f.signature;END IF;
 END LOOP;END $guard$;
`;
const source=['rules','multiplayer','arcade','bots','recovery','registration'].map(n=>read('supabase/trip-flip/'+n+'.sql','utf8')).join('\n');
write('qualification.local/trip-flip/migration.sql',guard+source+"\nALTER PUBLICATION supabase_realtime ADD TABLE public.trip_flip_revisions;\nSELECT cron.schedule('trip-flip-recovery','1 second',$job$SET statement_timeout='3s'; SELECT private.trip_flip_recover()$job$);\n");
write('qualification.local/trip-flip/installed-proof.sql','BEGIN;\n'+['proof','core-proof','bot-pause-proof'].map(n=>read('supabase/trip-flip/'+n+'.sql','utf8')).join('\n')+"\nROLLBACK;\nSELECT (SELECT count(*) FROM private.trip_flip_matches)=0 AS no_synthetic_matches, (SELECT count(*) FROM private.arcade_runs WHERE game='trip-flip')=0 AS no_synthetic_runs, (SELECT NOT enabled AND NOT admission_enabled FROM private.trip_flip_release WHERE singleton) AS admission_closed;\n");
await build({entryPoints:['supabase/functions/arcade-recovery/index.ts'],bundle:true,platform:'neutral',format:'esm',target:'es2022',outfile:'qualification.local/trip-flip/arcade-recovery.js'});
console.log('webkitInstalled',existsSync(webkit.executablePath()));
