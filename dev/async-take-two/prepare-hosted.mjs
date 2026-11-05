import {readFileSync as read,writeFileSync as write} from 'node:fs';
const dir='qualification.local/async-take-two';
const sql=p=>read(p,'utf8').replace(/\r/g,'');
const proof=sql('supabase/delayed/take-two-parity-proof.sql')+'\n'+sql('supabase/delayed/take-two-proof.sql')+'\n'+sql('supabase/delayed/take-two-financial-proof.sql');
const start=`BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='45s';
CREATE TEMP TABLE t2_baseline AS SELECT
 (SELECT count(*) FROM auth.users) users,
 (SELECT count(*) FROM private.delayed_matches) matches,
 (SELECT count(*) FROM public.players) players,
 (SELECT count(*) FROM public.player_transactions) transactions,
 (SELECT count(*) FROM public.game_results) results;
SAVEPOINT candidate_proof;
`;
const end=`
ROLLBACK TO candidate_proof;
DO $$ BEGIN
 IF (SELECT users<>(SELECT count(*) FROM auth.users) OR matches<>(SELECT count(*) FROM private.delayed_matches)
 OR players<>(SELECT count(*) FROM public.players) OR transactions<>(SELECT count(*) FROM public.player_transactions)
 OR results<>(SELECT count(*) FROM public.game_results) FROM t2_baseline) THEN RAISE EXCEPTION 'take_two:rollback_failed';END IF;
END $$;
SELECT 'PASS: canonical rules/deals/privacy plus 61 financial groups in both money modes; synthetic writes rolled back' AS result;
ROLLBACK;`;
write(dir+'/hosted-candidate.sql',start+sql('supabase/delayed/take-two.candidate.sql')+'\n'+proof+end);
write(dir+'/hosted-installed.sql',start+proof+end);
console.log('Prepared complete candidate and installed rollback proofs.');
