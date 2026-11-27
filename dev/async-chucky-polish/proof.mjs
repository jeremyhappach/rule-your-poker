import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const installed=process.argv.includes('--installed');
const ddl=readFileSync('supabase/delayed/lobby-activity.sql','utf8');
const proof=readFileSync('supabase/delayed/lobby-activity-proof.sql','utf8');
mkdirSync('qualification.local/async-chucky-polish',{recursive:true});
writeFileSync('qualification.local/async-chucky-polish/'+(installed?'installed':'candidate')+'.sql',
 "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='90s';\n"+(installed?'':ddl+'\n'+ddl)+'\n'+proof+'\nROLLBACK;');
