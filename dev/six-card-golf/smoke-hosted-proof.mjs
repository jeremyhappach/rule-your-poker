// Reuse the reviewed hosted containment and complete forward-release matrix.
// Offline generation only; no connection or production mutation here.
import {readFileSync as read} from 'node:fs';
let source=read('dev/six-card-golf/forward-proof.mjs','utf8');
source=source.replace("from './hosted-unit.mjs'","from '"+new URL('./hosted-unit.mjs',import.meta.url).href+"'")
 .replace("qualification.local/six-card-golf/forward-","qualification.local/golf-sweep-smoke/hosted-")
 .replace('supabase/six-card-golf/presentation.candidate.sql','supabase/six-card-golf/smoke-corrections.candidate.sql')
 .replace("['core',sanitizeFixture('core-proof',core)],",'')
 .replace("suites.push(['presentation',timing]);",'// Timing itself is unchanged; test the new opening contract in each full match.');
globalThis.smokeTransform=(name,sql)=>{
 if(name.startsWith('proof-')){
  sql=sql.replace("IF v->>'phase'<>'complete' THEN","IF v->>'phase'<>'complete' AND action<>'open' THEN");
  sql=sql.replace('   FOR turn_i IN 1..2000 LOOP', `
   rev:=m.revision;round_i:=m.round_id;
   FOR i IN 1..n LOOP
    PERFORM pg_temp.golf_login(users[i]);v:=public.golf_snapshot(dealer);
    PERFORM pg_temp.golf_assert((v->>'canAct')::boolean AND v->>'openingMode'='simultaneous','each opening participant admitted');
    v:=public.golf_action(dealer,round_i,pg_temp.golf_fixture_uuid(),rev,'open',ARRAY[0,3]);
    IF i<n THEN
     PERFORM pg_temp.golf_assert(v->>'phase'='opening' AND NOT (v->>'canAct')::boolean,'opening barrier and own receipt');
     PERFORM pg_temp.golf_assert(NOT EXISTS(SELECT FROM jsonb_each(v->'tableaus') b CROSS JOIN LATERAL jsonb_array_elements(b.value->'cards') card WHERE card<>'null'::jsonb),'no early revealed cards');
    END IF;
   END LOOP;
   PERFORM pg_temp.golf_assert(v->>'phase'='playing' AND (v->>'turnIndex')::integer=((v->>'dealerIndex')::integer+1)%n,'barrier restores first actor');
   FOR turn_i IN 1..2000 LOOP`);
 }
 if(name==='recovery')sql=sql.replace(" SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;\n PERFORM pg_temp.golf_login(u);",
 ` UPDATE public.games SET timeout_enforcement_enabled=false,timeout_action='none' WHERE id=g;
 PERFORM private.golf_recover();
 PERFORM pg_temp.golf_assert((SELECT is_paused FROM public.games WHERE id=g),'shared opening expiry');
 PERFORM pg_temp.golf_login(u);
 PERFORM public.set_game_paused(g,false,d,(SELECT pause_version FROM public.games WHERE id=g));
 SELECT * INTO m FROM private.golf_matches WHERE dealer_game_id=d;
 PERFORM pg_temp.golf_login(u);`);
 return sql;
};
source=source.replace('const units=[];','for(const suite of suites)suite[1]=globalThis.smokeTransform(suite[0],suite[1]); const units=[];');
// Production history hashing can exceed 15 seconds after a complete four-seat match.
// Lock acquisition remains capped at 100ms; failed requests still roll back entirely.
source=source.replaceAll("statement_timeout='15s'","statement_timeout='30s'").replaceAll("idle_in_transaction_session_timeout='20s'","idle_in_transaction_session_timeout='35s'");
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
