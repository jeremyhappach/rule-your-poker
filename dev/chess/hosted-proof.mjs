import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {openWordsDatabase} from '../words-gameplay/database.mjs';
const start=`BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';
CREATE TEMP TABLE chess_baseline AS SELECT
 (SELECT count(*) FROM auth.users) users,(SELECT count(*) FROM public.games) games,
 (SELECT count(*) FROM public.player_transactions) transactions,(SELECT count(*) FROM public.game_results) results;
SAVEPOINT candidate_proof;
`;
const end=`
ROLLBACK TO candidate_proof;
DO $$BEGIN IF (SELECT users<>(SELECT count(*) FROM auth.users) OR games<>(SELECT count(*) FROM public.games)
 OR transactions<>(SELECT count(*) FROM public.player_transactions) OR results<>(SELECT count(*) FROM public.game_results) FROM chess_baseline)
 THEN RAISE EXCEPTION 'chess:rollback_failed';END IF;END $$;
SELECT 'PASS: financial proof and rollback containment; no synthetic rows retained' result;
ROLLBACK;`;
const candidate=read('supabase/game-backgrounds/candidate.sql','utf8')+'\n'+read('supabase/chess/candidate.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
const proof=read('supabase/chess/financial-proof.sql','utf8');
write('qualification.local/chess/hosted-candidate.sql',start+candidate+'\n'+proof+end);
write('qualification.local/chess/hosted-installed.sql',start+proof+end);
if(process.argv[2]){
 process.env.PTOWN_WORDS_PG_MODULE??='C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
 const db=await openWordsDatabase(process.argv[2]);
 try{
 const originals=read('supabase/migrations/20261107184515_originals_competitive_release.sql','utf8');
 await db.execute('SET check_function_bodies=off;'+originals.slice(originals.indexOf('CREATE TABLE private.originals_release'),originals.indexOf('CREATE FUNCTION private.originals_config')));
 for(const d of [...JSON.parse(read('dev/chess/installed.json','utf8')),...JSON.parse(read('dev/chess/installed-views.json','utf8'))])await db.execute(d.definition);
 const r=await db.execute(start+candidate+'\n'+proof+end);console.log(JSON.stringify(r.filter(x=>x.rows?.length).map(x=>x.rows)));
 }finally{await db.close();}
}
