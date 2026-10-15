import {c,dir} from './helpers.mjs';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const all=['deployed-functions','deployed-shared-0','deployed-shared-1','deployed-deps-1','deployed-deps-2','deployed-deps-3'].flatMap(f=>JSON.parse(readFileSync(dir+f+'.json')));
try {
 const fn=all.find(f=>f.signature==='private.advance_due_canonical_game_timers(integer)');await c.query(fn.definition);
 execFileSync(process.execPath,['supabase/farkle/financial-correction/20261015/race.mjs'],{stdio:'inherit'});
}finally {await c.query(readFileSync('supabase/farkle/financial-correction/20261015/candidate.sql','utf8'));await c.end();}
