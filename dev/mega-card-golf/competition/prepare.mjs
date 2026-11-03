import {readFileSync as read,writeFileSync as write} from 'node:fs';
const base=[...JSON.parse(read('dev/mega-card-golf/competition/installed-functions.json')),...JSON.parse(read('dev/mega-card-golf/competition/installed-lifecycle.json'))];
const source=name=>{const f=base.find(f=>f.name===name);if(!f)throw Error('Missing inspected function '+name);return f.definition;};
const replace=(s,from,to)=>{if(s.split(from).length!==2)throw Error('Ambiguous/missing anchor '+from);return s.replace(from,()=>to);};
const clone=s=>s.replaceAll('golf_','mega_live_').replaceAll('golf:','mega:').replaceAll('six-card-golf','mega-card-golf').replaceAll('Six-Card Golf','Mega Card Golf');
let schema=read('supabase/mega-card-golf/competition-schema.sql','utf8');
schema=replace(schema,"ALTER TABLE public.game_defaults ADD COLUMN",read('supabase/mega-card-golf/competition-qualification.sql','utf8')+'\nALTER TABLE public.game_defaults ADD COLUMN');
schema=replace(schema,"(SELECT live_enabled FROM private.mega_competition_release WHERE singleton) AND (p_game IS NULL", "((SELECT live_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_live_allowed(auth.uid(),p_game)) AND (p_game IS NULL");
schema=replace(schema,"OR EXISTS(SELECT FROM public.dealer_games d", "OR private.mega_test_live_allowed(actor,session_id) OR EXISTS(SELECT FROM public.dealer_games d");
schema=replace(schema,"AND (SELECT live_enabled FROM private.mega_competition_release WHERE singleton)\n$$;", "AND ((SELECT live_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_live_allowed(actor,session_id)) AND (NOT EXISTS(SELECT FROM private.mega_test_accounts WHERE user_id=actor) OR private.mega_test_live_allowed(actor,session_id))\n$$;");
const parts=[schema];
let configure=clone(source('public.golf_configure')).replace('public.mega_live_configure','public.mega_configure');
configure=replace(configure,"private.mega_live_admission_rules()||jsonb_build_object('holes',coalesce(p_config->'holes','9'::jsonb))","private.mega_competition_config(p_config->'mega')||jsonb_build_object('holes',coalesce(p_config#>'{mega,course,holes}','9'::jsonb))");
configure=configure.replace(/ INSERT INTO private\.mega_live_qualified_matches\([\s\S]*?WHERE NOT \(p->>'isBot'\)::boolean;/,'');
configure=configure.replace('NOT BETWEEN 2 AND 4','NOT BETWEEN 2 AND 8');
configure=replace(configure,"IF coalesce(g.pot,0)<>0", "IF EXISTS(SELECT FROM jsonb_array_elements(people) p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'mega:humans_required';END IF;\n IF coalesce(g.pot,0)<>0");
parts.push(configure);
let begin=clone(source('private.golf_begin')).replace('NOT BETWEEN 2 AND 4','NOT BETWEEN 2 AND 8');
begin=replace(begin,"s:=private.mega_live_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);", "s:=s||jsonb_build_object('phase','ready','turnIndex',0,'deadline',floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'board',NULL,'runs','{}'::jsonb,'results','[]'::jsonb);");
parts.push(begin,clone(source('private.golf_settle')),clone(source('private.golf_finish_postgame')),read('supabase/mega-card-golf/competition-commit.sql','utf8'));
// Existing roster liability owner, scoped to the new table. No rule core copied.
const lifecycle=read('supabase/six-card-golf/lifecycle.sql','utf8');
parts.push(clone(lifecycle.slice(lifecycle.indexOf('CREATE OR REPLACE FUNCTION private.golf_roster_guard()'))));
// Add one branch at the inspected canonical ante handoff and frozen-stake owner.
const patches=[];
let ante=source('private.advance_ante_phase_exact');
ante=replace(ante,"WHEN v_game.game_type='six-card-golf' THEN", "WHEN v_game.game_type='mega-card-golf' THEN\n      SELECT private.mega_live_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;\n    WHEN v_game.game_type='six-card-golf' THEN");patches.push(['private.advance_ante_phase_exact',ante]);
let stake=source('private.megatouch_frozen_stake');stake=replace(stake,"'six-card-golf'","'six-card-golf','mega-card-golf'");patches.push(['private.megatouch_frozen_stake',stake]);
parts.push("ALTER TABLE private.delayed_children DROP CONSTRAINT delayed_children_game_type_check; ALTER TABLE private.delayed_children ADD CONSTRAINT delayed_children_game_type_check CHECK(game_type IN('ptown-words','run21','tri-towers','quintzee','boxdrop','mega-card-golf'));");
for(const name of ['public.delayed_load','public.delayed_commit','public.delayed_create','public.delayed_respond']){
 let s=source(name);s=replace(s,"'run21','tri-towers','quintzee','boxdrop')","'run21','tri-towers','quintzee','boxdrop','mega-card-golf')");
 if(name==='public.delayed_create')s=replace(s,"WHEN 'boxdrop' THEN cfg:=private.boxdrop_rules();END CASE;", "WHEN 'boxdrop' THEN cfg:=private.boxdrop_rules();\n  WHEN 'mega-card-golf' THEN\n   IF NOT (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;\n   cfg:=private.mega_competition_config(item->'config');END CASE;");
 if(name==='public.delayed_respond')s=replace(s,"IF m.real_money AND", "IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='mega-card-golf') AND NOT (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;\n IF m.real_money AND");
 if(name==='public.delayed_create'){
  s=replace(s,"IF NOT (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) THEN", "IF NOT ((SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_async_allowed(actor_i,p_opponent,p_request,NULL,p_real_money)) THEN");
  s=replace(s," INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash)", " IF EXISTS(SELECT FROM private.mega_test_accounts WHERE user_id IN(actor_i,p_opponent)) THEN\n  IF NOT private.mega_test_async_allowed(actor_i,p_opponent,p_request,NULL,p_real_money) OR jsonb_array_length(p_lineup)>4 OR EXISTS(SELECT FROM jsonb_array_elements(p_lineup) x WHERE x->>'game'<>'mega-card-golf') THEN RAISE EXCEPTION 'mega:test_offer_scope';END IF;\n  UPDATE private.mega_test_async SET match_id=parent WHERE actor=actor_i AND request_id=p_request AND match_id IS NULL;\n END IF;\n INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash)");
 }
 if(name==='public.delayed_respond')s=replace(s,"AND NOT (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) THEN", "AND NOT ((SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR private.mega_test_async_allowed(m.organizer,m.opponent,NULL,m.id,m.real_money)) THEN");
 patches.push([name,s]);
}
let capabilities=source('public.delayed_capabilities');
capabilities=replace(capabilities,"'rules',private.boxdrop_rules())) END)","'rules',private.boxdrop_rules()))||CASE WHEN (SELECT async_enabled FROM private.mega_competition_release WHERE singleton) OR (private.mega_test_actor(auth.uid()) AND EXISTS(SELECT FROM private.mega_test_async WHERE actor=auth.uid() AND expires_at>statement_timestamp() AND match_id IS NULL)) THEN jsonb_build_array(jsonb_build_object('id','mega-card-golf','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='mega-card-golf'),'rules',private.mega_competition_config(),'courses',private.mega_competition_courses())) ELSE '[]'::jsonb END END)");patches.push(['public.delayed_capabilities',capabilities]);
let review=source('private.delayed_review_board');review=replace(review,"WHEN 'ptown-words' THEN", "WHEN 'mega-card-golf' THEN b-ARRAY['decks','owner']||jsonb_build_object('serverAt',0,'dueAt',(b->>'deadline')::bigint,'stockRemaining',(b#>>'{config,stockAllowance}')::int-(b->>'draws')::int,'discardsRemaining',(b#>>'{config,discardAllowance}')::int-(b->>'discards')::int)\n WHEN 'ptown-words' THEN");patches.push(['private.delayed_review_board',review]);
let home=source('public.delayed_home');home=replace(home,"WHEN 'boxdrop' THEN private.boxdrop_required_rounds(pts)","WHEN 'boxdrop' THEN private.boxdrop_required_rounds(pts)\n     WHEN 'mega-card-golf' THEN (c.config#>>'{course,holes}')::int");home=replace(home,"'scores',scores,'pendingResults'", "'scores',scores,'holeResults',CASE WHEN c.game_type='mega-card-golf' THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('actor',a->>'actor','hole',a->'round','score',a->'score','at',a->'at')),'[]') FROM jsonb_array_elements(coalesce(c.state->'attempts','[]')) a WHERE a->>'actor'=who::text OR EXISTS(SELECT FROM private.delayed_review_events e JOIN private.delayed_review_seen seen ON seen.event_id=e.id AND seen.viewer=who WHERE e.child_id=c.id AND e.actor::text=a->>'actor' AND e.round=(a->>'round')::int)) END,'pendingResults'");patches.push(['public.delayed_home',home]);
let recovery=source('private.delayed_words_recover');recovery=replace(recovery,"<=clock_timestamp()) THEN RETURN n;END IF;","<=clock_timestamp()) AND NOT EXISTS(SELECT FROM private.mega_live_matches WHERE NOT finished AND paused_at IS NULL AND CASE WHEN settlement IS NULL THEN (state->>'deadline')::bigint ELSE (state#>>'{terminal,deadline}')::bigint END<=floor(extract(epoch FROM clock_timestamp())*1000)) THEN RETURN n;END IF;");patches.push(['private.delayed_words_recover',recovery]);
for(const [name,next] of patches){const f=base.find(f=>f.name===name);parts.push(`DO $guard$ BEGIN IF md5(pg_get_functiondef('${f.signature}'::regprocedure)) IS DISTINCT FROM '${f.hash}' THEN RAISE EXCEPTION 'mega:owner_changed:${f.signature}';END IF;END $guard$;\n${next}`);}
parts.push(read('supabase/mega-card-golf/competition-async.sql','utf8'));
parts.push("REVOKE ALL ON FUNCTION public.mega_configure(uuid,uuid,integer,text,jsonb,timestamptz) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.mega_configure(uuid,uuid,integer,text,jsonb,timestamptz) TO authenticated;");
parts.push("DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'mega_live_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;");
const candidate=parts.map(p=>p.trim().endsWith(';')?p:p+';').join('\n\n');
write('supabase/mega-card-golf/competition.candidate.sql',candidate);
write('supabase/migrations/20261103191500_mega_card_golf_competition.sql',`-- Closed registration only; does not activate gameplay. Generated by dev/mega-card-golf/competition/prepare.mjs.
BEGIN;
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(hashtext('mega-competition/1'));
DO $registration$
BEGIN
 IF to_regclass('private.mega_competition_release') IS NOT NULL THEN
  IF NOT EXISTS(SELECT FROM private.mega_competition_release WHERE singleton AND schema_revision='mega-competition/1') THEN RAISE EXCEPTION 'mega:registration_drift';END IF;
  RETURN;
 END IF;
 EXECUTE $candidate$${candidate}$candidate$;
END $registration$;
COMMIT;
`);
console.log('Prepared closed-admission candidate from '+base.length+' inspected definitions');
