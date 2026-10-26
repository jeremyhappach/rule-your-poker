import {readFileSync as read,writeFileSync as write} from 'node:fs';
let core=read('supabase/quintzee/version-one.sql','utf8').replaceAll('quintzee_v1_','quintzee_v2_').replaceAll('quintzee/1','quintzee/2');
core=core.replace("'introMs',2500", "'readyMs',30000,'introMs',2500");core=core.replace("'phase','intro','deadline',at_ms+(r->>'introMs')::bigint", "'phase','ready','deadline',at_ms+(r->>'readyMs')::bigint");
const a=core.indexOf(" IF b->>'phase'='intro' THEN"),z=core.indexOf(" IF b->>'phase'<>'playing'",a);
core=core.slice(0,a)+` IF b->>'phase'='ready' THEN
  due:=(b->>'deadline')::bigint;
  IF action='tick' THEN RETURN b;END IF;
  IF action<>'start' OR cardinality(coalesce(items,ARRAY[]::integer[]))<>0 OR at_ms>due THEN RAISE EXCEPTION 'quintzee:start_expired';END IF;
  RETURN private.quintzee_v2_roll(b||jsonb_build_object('phase','playing','startedAt',at_ms,'deadline',at_ms+(b#>>'{rules,durationMs}')::bigint),NULL);
 END IF;
`+core.slice(z);
core=core.replace("ELSIF action='score' THEN","ELSIF action IN('score','score_zero') THEN").replace("IF points<=0 THEN RAISE EXCEPTION 'quintzee:no_match'; END IF;","IF (points=0) IS DISTINCT FROM (action='score_zero') THEN RAISE EXCEPTION 'quintzee:zero_confirmation_required';END IF;");core=core.replace(" IF (b->>'rollsRemaining')::integer=0 AND b->'potentials'='{}'::jsonb THEN RETURN private.quintzee_v2_finish(b,'no_matches',at_ms); END IF;",'');
core=core.replace("EXIT WHEN (s->>'finished')::boolean OR", "EXIT WHEN s#>>'{board,phase}'='ready' OR (s->>'finished')::boolean OR");
write('supabase/quintzee/version-two.sql','-- LOCAL candidate. v1 definitions remain unchanged; scoring formulas are identical.\n'+core);
