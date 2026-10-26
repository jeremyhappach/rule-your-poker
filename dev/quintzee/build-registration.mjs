import {readFileSync as read,writeFileSync as write} from 'node:fs';
const refs=JSON.parse(read('qualification.local/quintzee/release/deployed-reference.json','utf8'));
const names=['arcade_start','arcade_commit','megatouch_begin','advance_ante_phase_exact','megatouch_frozen_stake'];
function once(text,from,to){if(!text.includes(from))throw Error('Deployed reference boundary changed: '+from);return text.replace(from,to);}
const definitions=names.map(name=>{
 let s=refs.find(r=>r.proname===name).definition.replaceAll('\r\n','\n');
 if(name==='arcade_start'){
  s=once(s,"p_game NOT IN (","p_game NOT IN ('quintzee',");
  s=once(s,'rules.id,rules.config,floor(',"rules.id,CASE WHEN p_game='quintzee' THEN rules.config||jsonb_build_object('theme',coalesce((SELECT quintzee_theme FROM public.game_defaults WHERE game_type='quintzee'),'classic')) ELSE rules.config END,floor(");
 }
 if(name==='arcade_commit')s=once(s," IF run.game='boxdrop'", " IF run.game='quintzee' AND status_i='completed' AND private.arcade_quintzee_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;\n IF run.game='boxdrop'");
 if(name==='megatouch_begin'){
  s=once(s,"g.game_type NOT IN(","g.game_type NOT IN('quintzee',");
  s=once(s,"(CASE WHEN g.game_type IN(","(CASE WHEN g.game_type='quintzee' THEN 4 WHEN g.game_type IN(");
  s=once(s," stake_i:=(dg.config->>'ante_amount')::integer;", " IF g.game_type='quintzee' AND (g.real_money IS DISTINCT FROM false OR NOT EXISTS(SELECT 1 FROM private.quintzee_release WHERE singleton AND enabled AND admission_enabled)) THEN RAISE EXCEPTION 'quintzee:fake_money_admission_closed' USING ERRCODE='42501';END IF;\n stake_i:=(dg.config->>'ante_amount')::integer;");
  s=once(s,"  IF g.game_type='battle-31' THEN", "  IF g.game_type='quintzee' THEN\n   s:=private.quintzee_deal(s||jsonb_build_object('theme',dg.config->>'theme'),floor(extract(epoch FROM clock_timestamp())*1000)::bigint);\n   INSERT INTO private.quintzee_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);\n  ELSIF g.game_type='battle-31' THEN");
 }
 if(name==='advance_ante_phase_exact'){
  const marker="WHEN v_game.game_type IN ('eleven-up'";
  s=once(s,marker,"WHEN v_game.game_type IN ('quintzee','eleven-up'");
 }
 if(name==='megatouch_frozen_stake')s=once(s,"OLD.game_type IN(","OLD.game_type IN('quintzee',");
 return s+';';
});
write('supabase/quintzee/registration.sql',definitions.join('\n\n')+'\n');
// Preserve the exact live shared definitions as the guarded migration baseline.
write('supabase/quintzee/registration-hashes.json',JSON.stringify(refs.filter(r=>names.includes(r.proname)).map(({schema,proname,args,hash})=>({schema,proname,args,hash})),null,2)+'\n');
