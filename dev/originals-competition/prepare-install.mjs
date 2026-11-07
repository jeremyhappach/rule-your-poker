import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {build} from 'esbuild';
const body=['gameplay','async','live-foundation','live'].map(f=>read('supabase/originals-competition/'+f+'.sql','utf8')).join('\n');
const migration=`DO $originals_install$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('originals-competition/1'));
 IF to_regclass('private.originals_release') IS NOT NULL THEN
  IF to_regprocedure('public.originals_live_action(uuid,uuid,bigint,jsonb)') IS NULL OR to_regprocedure('public.delayed_originals_core(uuid,text,integer,bigint,jsonb,text,integer[],bigint,integer)') IS NULL THEN RAISE EXCEPTION 'originals:partial_installation';END IF;
  RETURN;
 END IF;
 EXECUTE $originals_body$\n${body}\n$originals_body$;
END $originals_install$;
NOTIFY pgrst, 'reload schema';\n`;
write('qualification.local/originals/install.sql',migration);
const proof=['live-proof','async-financial-proof','gameplay-proof'].map(f=>read('supabase/originals-competition/'+f+'.sql','utf8')).join('\n');
write('qualification.local/originals/installed-proof.sql','BEGIN;\n'+proof+'\nROLLBACK;\nSELECT true AS proof_rolled_back;');
write('qualification.local/originals/packaged-rollback.sql','BEGIN;\n'+migration+'\n'+migration+'\n'+proof+"\nROLLBACK;\nSELECT to_regclass('private.originals_release') IS NULL AS rolled_back;");
await build({entryPoints:['supabase/functions/delayed-recovery/index.ts'],outfile:'qualification.local/originals/recovery-index.ts',bundle:true,format:'esm',platform:'neutral',packages:'external',logLevel:'error'});
console.log('Prepared closed idempotent migration, rollback proof and recovery worker');
