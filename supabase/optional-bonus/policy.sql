-- Match orchestration only. Frozen board scoring/qualification functions are reused.
CREATE OR REPLACE FUNCTION private.optional_bonus_winner(game text,cfg jsonb,players jsonb,totals jsonb,rounds jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE player text; qualified text[]:='{}'; amount bigint; floor_i bigint; eligible boolean;
BEGIN
 IF jsonb_array_length(players)<>2 OR game NOT IN('tri-towers','quintzee','boxdrop','eleven-up','royal-flash') THEN RETURN NULL;END IF;
 IF cfg->>'version' IS NULL OR
  game='quintzee' AND cfg->>'version' NOT IN('quintzee/1','quintzee/2','quintzee/3') OR
  game='boxdrop' AND cfg->>'version'<>'boxdrop/1' OR
  game='eleven-up' AND cfg->>'version' NOT IN('eleven-up/1','eleven-up/2','eleven-up/3') OR
  game='royal-flash' AND cfg->>'version' NOT IN('royal-flash/1','royal-flash/2','royal-flash/3') THEN RETURN NULL;END IF;
 FOR player IN SELECT jsonb_array_elements_text(players) LOOP
  -- Both main rounds must be authoritative and complete; no guessed eligibility.
  IF (SELECT array_agg(DISTINCT (r->>'round')::integer ORDER BY (r->>'round')::integer)
      FROM jsonb_array_elements(rounds) r WHERE r->>'actor'=player) IS DISTINCT FROM ARRAY[1,2] THEN RETURN NULL;END IF;
  amount:=(totals->>player)::bigint;
  IF amount IS NULL OR amount<0 THEN RETURN NULL;END IF;
  eligible:=CASE game WHEN 'tri-towers' THEN private.tri_towers_bonus_qualified_v2(amount,cfg)
   WHEN 'quintzee' THEN private.quintzee_required_rounds(amount)=3
   WHEN 'boxdrop' THEN private.boxdrop_required_rounds(amount)=3
   WHEN 'eleven-up' THEN private.eleven_up_bonus_qualified(amount,cfg)
   WHEN 'royal-flash' THEN private.royal_flash_bonus_qualified(amount,cfg) END;
  IF eligible THEN qualified:=array_append(qualified,player);END IF;
 END LOOP;
 IF cardinality(qualified)<>1 THEN RETURN NULL;END IF;
 player:=qualified[1];amount:=(totals->>player)::bigint;
 -- TriTowers can subtract for each of the 23 undealt stock cards. Even the
 -- worst legal bonus must leave a strict lead; qualification alone is insufficient.
 IF game='tri-towers' THEN
  IF cfg->>'version' NOT IN('tri-towers/2','tri-towers/3','tri-towers/4','tri-towers/5') OR (cfg->>'drawPenalty')::bigint<0 OR NOT(cfg?'drawPenalty') THEN RETURN NULL;END IF;
  floor_i:=greatest(0,amount-23*(cfg->>'drawPenalty')::bigint);
 ELSE
  -- Quintzee, Boxdrop and Royal Flash add nonnegative round points. 11 Up starts
  -- with a full rack: every penalized refill spends a previously earned removal
  -- value of that exact slot, so a round cannot consume the pre-round total.
  floor_i:=amount;
 END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements_text(players) p WHERE p<>player AND floor_i<=(totals->>p)::bigint) THEN RETURN NULL;END IF;
 RETURN player;
END $$;
REVOKE ALL ON FUNCTION private.optional_bonus_winner(text,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.optional_bonus_live_actor(game text,s jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE players jsonb; rounds jsonb;
BEGIN
 IF s->>'stage'<>'3' OR s->>'phase' NOT IN('intro','ready','playing') THEN RETURN NULL;END IF;
 SELECT jsonb_agg(p->>'id' ORDER BY n) INTO players FROM jsonb_array_elements(s->'players') WITH ORDINALITY t(p,n);
 SELECT coalesce(jsonb_agg(jsonb_build_object('actor',r->'playerId','round',r->'stage')),'[]') INTO rounds FROM jsonb_array_elements(s->'stages') r;
 RETURN private.optional_bonus_winner(game,s->'rules',players,s->'scores',rounds);
END $$;
REVOKE ALL ON FUNCTION private.optional_bonus_live_actor(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.optional_bonus_live_offer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text;game text:=TG_ARGV[0];
BEGIN
 -- Never change an already-running bonus or any Arcade/fake-money match.
 IF TG_OP='UPDATE' AND OLD.state->>'stage'<>'3' AND NEW.state->>'stage'='3'
    AND EXISTS(SELECT FROM public.games WHERE id=NEW.game_id AND real_money) THEN
  actor:=private.optional_bonus_live_actor(game,NEW.state);
  IF actor IS NOT NULL AND actor=NEW.state->'players'->((NEW.state->>'turnIndex')::integer)->>'id' THEN
   NEW.state:=NEW.state||jsonb_build_object('optionalBonus',jsonb_build_object('actor',actor,'choice','pending'));
  END IF;
 ELSIF NEW.state#>>'{optionalBonus,choice}'='pending' AND NEW.state->>'phase' IN('stage_complete','complete') THEN
  NEW.state:=jsonb_set(NEW.state,'{optionalBonus,choice}','"expired"');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.optional_bonus_live_offer() FROM PUBLIC,anon,authenticated,service_role;

-- Existing live qualification excludes Quintzee real money. Do not activate it.
DO $$ DECLARE game text;prefix text;BEGIN
 FOREACH game IN ARRAY ARRAY['tri-towers','boxdrop','eleven-up','royal-flash'] LOOP
  prefix:=replace(game,'-','_');
  EXECUTE format('DROP TRIGGER IF EXISTS optional_bonus_offer ON private.%I',prefix||'_matches');
  EXECUTE format('CREATE TRIGGER optional_bonus_offer BEFORE UPDATE OF state ON private.%I FOR EACH ROW EXECUTE FUNCTION private.optional_bonus_live_offer(%L)',prefix||'_matches',game);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.competitive_bonus_choice(p_game text,p_dealer_game_id uuid,p_request_id uuid,p_revision bigint,p_choice text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prefix text; m record;g public.games;actor uuid:=auth.uid();player uuid;prior record;allowed boolean;answer jsonb;
 command jsonb:=jsonb_build_object('revision',p_revision,'bonusChoice',p_choice);at_ms bigint;
BEGIN
 IF p_game IS NULL OR p_game NOT IN('tri-towers','boxdrop','eleven-up','royal-flash') OR p_request_id IS NULL OR p_revision IS NULL OR p_choice IS NULL OR p_choice NOT IN('play','skip') THEN RAISE EXCEPTION 'bonus:invalid_command';END IF;
 prefix:=replace(p_game,'-','_');
 EXECUTE format('SELECT * FROM private.%I WHERE dealer_game_id=$1',prefix||'_matches') INTO STRICT m USING p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 EXECUTE format('SELECT * FROM private.%I WHERE dealer_game_id=$1 FOR UPDATE',prefix||'_matches') INTO STRICT m USING p_dealer_game_id;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND status<>'left' AND NOT is_bot;
 EXECUTE format('SELECT private.%I($1)',prefix||'_actor_allowed') INTO allowed USING actor;
 IF player IS NULL OR NOT coalesce(allowed,false) OR NOT EXISTS(SELECT FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'bonus:participant_required' USING ERRCODE='42501';END IF;
 EXECUTE format('SELECT * FROM private.%I WHERE dealer_game_id=$1 AND request_id=$2',prefix||'_requests') INTO prior USING p_dealer_game_id,p_request_id;
 IF prior.request_id IS NOT NULL THEN
  IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'bonus:replay_conflict';END IF;
  EXECUTE format('SELECT public.%I($1)',prefix||'_snapshot') INTO answer USING p_dealer_game_id;RETURN answer;
 END IF;
 IF NOT g.real_money OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM p_game OR g.status<>'in_progress' OR m.finished OR g.is_paused OR m.settlement IS NOT NULL THEN RAISE EXCEPTION 'bonus:inactive';END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'bonus:stale_revision';END IF;
 IF m.state#>>'{optionalBonus,choice}' IS DISTINCT FROM 'pending' OR m.state#>>'{optionalBonus,actor}' IS DISTINCT FROM player::text
  OR private.optional_bonus_live_actor(p_game,m.state) IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'bonus:not_eligible' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT FROM public.players WHERE id=player AND auto_fold) THEN RAISE EXCEPTION 'bonus:inactive_autoplay';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF at_ms>=(m.state->>'deadline')::bigint THEN RAISE EXCEPTION 'bonus:deadline';END IF;
 m.state:=jsonb_set(m.state,'{optionalBonus,choice}',to_jsonb(p_choice));
 IF p_choice='skip' THEN
  m.state:=(m.state-ARRAY['result'])||jsonb_build_object('phase','complete','deadline',0,'turnIndex',2,'event',jsonb_build_object('label','Bonus skipped','points',0));
 END IF;
 EXECUTE format('INSERT INTO private.%I VALUES($1,$2,$3,$4)',prefix||'_requests') USING p_dealer_game_id,p_request_id,actor,command;
 EXECUTE format('UPDATE private.%I SET state=$2,revision=revision+1 WHERE dealer_game_id=$1',prefix||'_matches') USING p_dealer_game_id,m.state;
 IF p_choice='skip' THEN EXECUTE format('SELECT private.%I($1)',prefix||'_settle') USING p_dealer_game_id;END IF;
 EXECUTE format('SELECT public.%I($1)',prefix||'_snapshot') INTO answer USING p_dealer_game_id;RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.competitive_bonus_choice(text,uuid,uuid,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.competitive_bonus_choice(text,uuid,uuid,bigint,text) TO authenticated;

-- An older client taking a normal legal bonus action has chosen Play. Keep all
-- existing membership, deadline, request-receipt and settlement checks intact.
DO $$ DECLARE prefix text;signature regprocedure;source text;needle text;BEGIN
 FOREACH prefix IN ARRAY ARRAY['tri_towers','boxdrop','eleven_up','royal_flash'] LOOP
  signature:=to_regprocedure('public.'||prefix||'_action(uuid,uuid,bigint,text,'||CASE WHEN prefix='tri_towers' THEN 'integer' ELSE 'integer[]' END||')');
  source:=pg_get_functiondef(signature);needle:=' m.state:=private.'||prefix||'_reduce(m.state,p_action,';
  IF position('optionalBonus,choice' IN source)>0 THEN CONTINUE;END IF;
  IF position(needle IN source)=0 THEN RAISE EXCEPTION 'bonus:action_source_changed %',prefix;END IF;
  EXECUTE replace(source,needle,E' IF m.state#>>''{optionalBonus,choice}''=''pending'' THEN m.state:=jsonb_set(m.state,''{optionalBonus,choice}'',''"play"'');END IF;\n'||needle);
 END LOOP;
END $$;
