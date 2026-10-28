import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
const path='qualification.local/ptown-words/real-money';mkdirSync(path,{recursive:true});
const pre=JSON.parse(read('dev/ptown-words/real-money-preimage.json','utf8'));
const owners=['ptown_words_configure(uuid,uuid,integer,text,jsonb,timestamp with time zone)','ptown_words_capabilities(uuid)','private.megatouch_begin(uuid,uuid)'];
const guard=owners.map(signature=>{const f=pre.functions.find(f=>f.signature===signature);if(!f)throw Error(signature);return `IF md5(pg_get_functiondef('${signature}'::regprocedure)) IS DISTINCT FROM '${f.md5}' THEN RAISE EXCEPTION 'Words money preimage changed: ${signature}';END IF;`;}).join('\n');
write(path+'/candidate.sql',`SET LOCAL lock_timeout='5s';DO $guard$ BEGIN ${guard} END $guard$;\n`+read('supabase/ptown-words/real-money.candidate.sql','utf8'));
let proof=read('supabase/ptown-words/proof.sql','utf8')
 .replace(/ UPDATE private.game_recovery_dispatch_state[^;]+;\r?\n/g,'')
 .replaceAll('PERFORM private.ptown_words_recover()','PERFORM private.ptown_words_recover(dealer)')
 .replaceAll(',100,false FROM generate_series',',0,false FROM generate_series')
 .replaceAll('sum(chips)=200','sum(chips)=0').replaceAll('sum(chips)=100*n','sum(chips)=0')
 .replaceAll('chips=100+(n-1)*5','chips=(n-1)*5')
 .replace('IF mode=0 AND n=2 AND tie_case=0 THEN','IF n=2 AND tie_case=0 THEN')
 .replace("AND NEW.chips IS DISTINCT FROM OLD.chips",'')
 .replace('BEFORE UPDATE ON public.players','BEFORE INSERT ON public.session_player_snapshots')
 .replace('DROP TRIGGER words_proof_fail_transfer ON public.players','DROP TRIGGER words_proof_fail_transfer ON public.session_player_snapshots')
 .replace("'failed financial write rolls back result and settlement'","'failure after transfers rolls back result and settlement'");
const before='  SET CONSTRAINTS ALL DEFERRED;';
proof=proof.replace(before,`
  PERFORM pg_temp.words_assert((SELECT bool_and(p.chips=(m.settlement->>p.id::text)::integer) FROM public.players p JOIN private.ptown_words_matches m ON m.game_id=p.game_id WHERE m.dealer_game_id=dealer),'every signed chip delta equals immutable settlement');
  PERFORM pg_temp.words_assert((SELECT bool_and(chips=-5) FROM public.players WHERE game_id=game AND id<>proof_players[1] AND (tie_case=0 OR id<>proof_players[2])) IS NOT FALSE,'every losing player pays exactly the frozen stake');
  IF mode=1 AND tie_case=1 THEN
   PERFORM pg_temp.words_assert((SELECT count(*)=n AND coalesce(sum(amount),0)=0 FROM public.player_transactions WHERE source_game_id=game AND transaction_type='SessionResult'),'exactly one balanced real-account posting per human');
   PERFORM pg_temp.words_assert((SELECT count(*)=n FROM public.player_transactions tx JOIN public.players p ON p.user_id=tx.profile_id AND p.game_id=tx.source_game_id WHERE tx.source_game_id=game AND tx.transaction_type='SessionResult' AND tx.amount=p.chips),'real-account postings equal final canonical chips');
  ELSE PERFORM pg_temp.words_assert(NOT EXISTS(SELECT 1 FROM public.player_transactions WHERE source_game_id=game),'fake money and ongoing real sessions do not post accounts early');END IF;
${before}`);
proof=proof.replace("PERFORM set_config('ptown_words.proof_fail','off',true);",`PERFORM set_config('ptown_words.proof_fail','off',true);
   PERFORM pg_temp.words_assert(NOT EXISTS(SELECT 1 FROM public.gameplay_transfer_batches WHERE dealer_game_id=dealer) AND NOT EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE dealer_game_id=dealer) AND NOT EXISTS(SELECT 1 FROM public.player_transactions WHERE source_game_id=game),'injected post-transfer failure leaves no ledger, snapshots or accounts');`);
// Live /2 controls are exercised in a real-money session as well as the existing
// fake-money browser/authority suite; /3 async is preserved and checked separately.
const banks=read('supabase/ptown-words/banks-release-proof.sql','utf8').replace("VALUES(g,'game_selection',false,2,deadline","VALUES(g,'game_selection',true,2,deadline");
write(path+'/financial-proof.sql',read('supabase/ptown-words/core-proof.sql','utf8')+'\n'+proof+'\n'+banks);
console.log('Prepared guarded closed admission delta, 12 signed-balance financial cases and real /2 control proof');
