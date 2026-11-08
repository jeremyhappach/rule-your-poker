// Compile one rollback-contained proof; send the resulting file through Supabase MCP.
import {readFileSync,writeFileSync} from 'node:fs';
const installed=process.argv.includes('--installed');
const files=['supabase/ptown-polish/rules-proof.sql','supabase/ptown-polish/horses-proof.sql','supabase/ptown-polish/drop-proof.sql',
 'supabase/arcade-smoke-polish/horses-v3-proof.sql',...['','_v2','_v3','_v4'].map(v=>'supabase/tests/drop357'+v+'_proof.sql'),'supabase/delayed/words-play-clock-proof.sql'];
const candidate=['horses','drop'].map(n=>readFileSync('supabase/ptown-polish/'+n+'.sql','utf8')).join('\n');
const proofs=files.map((file,i)=>`SAVEPOINT proof_${i};\n`+readFileSync(file,'utf8').replace(/^BEGIN;\r?\n/m,'').replace(/^ROLLBACK;\r?$/gm,'').replace('-- CANDIDATE_DDL','')+`\nROLLBACK TO SAVEPOINT proof_${i};\n`);
const sql=`BEGIN;\nSET LOCAL lock_timeout='2s';\nSET LOCAL statement_timeout='60s';\n${installed?'':candidate}\nUPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp();\n${proofs.join('\n')}\nROLLBACK;\nSELECT 'PASS: ${files.length} rollback proofs; all fixtures, ledger writes and candidate DDL rolled back' result;\n`;
writeFileSync('qualification.local/ptown-polish/'+(installed?'hosted-installed':'hosted-candidate')+'.sql',sql);
console.log('Compiled',files.length,'proofs;',sql.length,'bytes; installed:',installed);
