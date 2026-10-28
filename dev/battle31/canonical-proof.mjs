import {readFileSync as read,writeFileSync as write} from 'node:fs';import {execFileSync} from 'node:child_process';
const installed=process.argv.includes('--installed');execFileSync(process.execPath,['dev/battle31/launch-proof.mjs','--installed']);
let sql=read('qualification.local/battle31/launch-installed.sql','utf8');
sql=sql.replace('SAVEPOINT qualified;',()=>`${installed?'':read('supabase/battle31/canonical-table.sql','utf8')}\nSAVEPOINT qualified;`);
sql=sql.replace('DO $lifecycle$',()=>read('dev/battle31/canonical-proof.sql','utf8')+'\nDO $lifecycle$');
sql=sql.replace("WHERE p.oid<>'private.pause_all_humans_auto_fold(uuid)'", "WHERE p.proname NOT LIKE 'battle31_%' AND p.oid<>'private.pause_all_humans_auto_fold(uuid)'");
sql=sql.replace("'installed',true",`'installed',${installed},'canonicalTimeline',true`);
write('qualification.local/battle31/canonical-'+(installed?'installed':'candidate')+'.sql',sql);console.log('Prepared canonical rollback proof');
