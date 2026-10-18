import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect,candidate} from './database.mjs';
let base=read('supabase/eleven-up/smoke-production-proof.sql','utf8').replaceAll('eleven_up','royal_flash').replaceAll('eleven-up','royal-flash').replaceAll('eleven_assert','royal_assert').replaceAll('arcade_eleven','arcade_royal').replaceAll('11 Up','Royal Flash').replaceAll('royal_flash_admission_rules','royal_flash_rules');
const begin=base.indexOf(" b:=private.royal_flash_board_deal"),end=base.indexOf(' FOR case_i IN 1..3 LOOP',begin);
base=base.slice(0,begin)+` b:=private.royal_flash_board_deal(jsonb_build_object('rules',private.royal_flash_rules(),'score',0),1000);
 PERFORM pg_temp.royal_assert(jsonb_array_length(b->'slots')=25 AND jsonb_array_length(b->'deck')=52 AND (SELECT count(DISTINCT c)=52 FROM jsonb_array_elements(b->'deck')c),'unique deck and grid');
 PERFORM pg_temp.royal_assert(NOT(private.royal_flash_visible(b)?'deck') AND NOT(private.royal_flash_visible(b)?'cursor'),'redaction');
 b:=private.royal_flash_board_reduce(b,'tick',NULL,3500);v:=private.royal_flash_board_reduce(b,'place',ARRAY[0],4000);
 PERFORM pg_temp.royal_assert(v->'slots'->0=b->'current' AND v->'current'=b->'deck'->1 AND (v->>'deadline')::bigint=154000,'placement starts full clock');
 a:=private.royal_flash_board_reduce(v,'place',ARRAY[0],4100);
 PERFORM pg_temp.royal_assert(a->'slots'->0=v->'current' AND (a->>'placements')::integer=2,'replacement consumes card');
 PERFORM pg_temp.royal_assert((private.royal_flash_board_reduce(v,'take_score',NULL,154000)#>>'{result,timeBonus}')::integer=0 AND private.royal_flash_board_reduce(v,'take_score',NULL,154000)#>>'{result,reason}'='timeout','exact deadline timeout wins');
 PERFORM pg_temp.royal_assert(private.royal_flash_bonus_qualified(200000,private.royal_flash_rules()) AND NOT private.royal_flash_bonus_qualified(199999,private.royal_flash_rules()),'bonus boundary');
 PERFORM pg_temp.royal_assert(private.royal_flash_hand('[0,9,10,11,12]',private.royal_flash_rules())->>'kind'='royal_flush','royal');
 PERFORM pg_temp.royal_assert(private.royal_flash_hand('[0,1,2,3,4]',private.royal_flash_rules())->>'kind'='straight_flush','ace low');
 PERFORM pg_temp.royal_assert(private.royal_flash_hand('[12,0,1,2,3]',private.royal_flash_rules())->>'kind'='flush','no wrap');
 b:=private.royal_flash_board_reduce(b,'place',ARRAY[0],4000);
 `+base.slice(end);
base=base.replaceAll("'group',ARRAY[16,20,32]","'place',ARRAY[0]").replaceAll("'pass'","'take_score'");
base=base.replace('SELECT state INTO terminal', 'PERFORM pg_temp.royal_accept(game,dealer);\n  SELECT state INTO terminal');
base=base.replace("UPDATE private.royal_flash_matches SET state=jsonb_set(state,'{deadline}'", "PERFORM pg_temp.royal_accept(game,dealer);\n UPDATE private.royal_flash_matches SET state=jsonb_set(state,'{deadline}'");
const wrapper=`CREATE FUNCTION pg_temp.royal_accept(game uuid,dealer uuid) RETURNS void LANGUAGE plpgsql AS $wrap$
 DECLARE p record;actor text:=current_setting('request.jwt.claim.sub',true);
 BEGIN
 FOR p IN SELECT id,user_id FROM public.players WHERE game_id=game AND status='active' AND NOT sitting_out AND NOT is_bot AND ante_decision IS NULL LOOP
 PERFORM set_config('request.jwt.claim.sub',p.user_id::text,true);PERFORM public.submit_ante_decision(game,dealer,p.id,'ante_up');END LOOP;
 PERFORM public.advance_ante_phase(game,dealer);PERFORM set_config('request.jwt.claim.sub',actor,true);
 END $wrap$;\n`;
write('supabase/royal-flash/proof.sql',wrapper+base);
const {database}=JSON.parse(read('qualification.local/royal-flash/context.json'));
const c=await connect(database);
try{await c.query('BEGIN');if(!(await c.query("SELECT to_regclass('private.royal_flash_matches') present")).rows[0].present)await c.query(candidate());const r=await c.query(wrapper+base+read('supabase/royal-flash/core-proof.sql','utf8'));console.log(r.at(-1).rows);await c.query('ROLLBACK');write('qualification.local/royal-flash/proof.json',JSON.stringify({database,passed:true,at:new Date().toISOString()}));}
catch(e){console.error(e.message,e.where);await c.query('ROLLBACK');process.exitCode=1;}finally{await c.end();}
