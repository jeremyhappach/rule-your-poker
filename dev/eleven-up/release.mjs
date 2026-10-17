// Build the reviewed additive migration from inspected production owner definitions.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const evidence=JSON.parse(await readFile('qualification.local/eleven-up/production-inspection.json','utf8'));
const owner=name=>evidence.definitions.find(x=>x.name===name).definition;
const local=JSON.parse(await readFile('qualification.local/eleven-up/arcade-definitions.json','utf8'));
for(const name of ['arcade_start','arcade_commit']){
 if(owner(name).replaceAll('\r','')!==local.find(x=>x.proname===name).definition.replaceAll('\r',''))throw Error('Production owner drift: '+name);
}
const guards=['arcade_start','arcade_commit'].map(name=>`IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${name}') IS DISTINCT FROM '${createHash('md5').update(owner(name)).digest('hex')}' THEN RAISE EXCEPTION 'eleven_up:owner_drift_${name}';END IF;`).join('\n');
const sources=(await Promise.all(['rules','multiplayer','arcade','arcade-registration'].map(n=>readFile(`supabase/eleven-up/${n}.sql`,'utf8')))).join('\n');
const sql=`-- 11 Up first production smoke. Admission remains closed until publication is verified.\nDO $$ BEGIN\n${guards}\nEND $$;\n${sources}\nALTER PUBLICATION supabase_realtime ADD TABLE public.eleven_up_revisions;\nSELECT cron.schedule('eleven-up-recovery','1 second',$job$SET statement_timeout = '3s'; SELECT private.eleven_up_recover()$job$);\nNOTIFY pgrst,'reload schema';\n`;
await writeFile('supabase/migrations/20261017213901_eleven_up_production_smoke.sql',sql);
const bundle=await build({entryPoints:['supabase/functions/arcade-recovery/index.ts'],bundle:true,platform:'neutral',format:'esm',write:false});
await writeFile('qualification.local/eleven-up/arcade-recovery-bundle.js',bundle.outputFiles[0].text);
console.log('Production owners match; migration and recovery bundle generated.');
