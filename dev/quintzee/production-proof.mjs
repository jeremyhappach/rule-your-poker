import {installCandidate} from './install-candidate.mjs';
import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {context,connect} from './database.mjs';
const ctx=await context(),c=await connect(ctx.database);
const paths=['defaults','version-one','adapter-functions','multiplayer','arcade','bots','recovery','registration'];
try{
 await c.query('BEGIN');
 // This isolated template predates the accepted Boxdrop integration. Supply
 // missing pure completion validators from their checked-in authority sources;
 // do not weaken the current shared commit function or fabricate substitutes.
 await installCandidate(c);
 await c.query(read('supabase/quintzee/production-proof.sql','utf8'));
 await c.query(read('supabase/quintzee/extended-proof.sql','utf8'));
 await c.query('ROLLBACK');
 mkdirSync('dev/quintzee/evidence/release',{recursive:true});
 write('dev/quintzee/evidence/release/rollback.json',JSON.stringify({local:true,rolledBack:true,passed:true,scope:'Frozen 93,312 scoring matrix; 2/3/4-player ties; immutable themes/rules; real-money configure denial; canonical winner/tie/replay/continuation/recovery; pause/bots; Arcade result/isolation. Independent concurrency and browser qualification are separate.'},null,2));
 console.log('Quintzee canonical rollback proof passed');
}catch(e){await c.query('ROLLBACK');console.error({message:e.message,code:e.code,where:e.where});process.exitCode=1;}finally{await c.end();}
