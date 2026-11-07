-- Both competitive modes call the installed Arcade gameplay rules.
CREATE TABLE private.originals_release(
 game text PRIMARY KEY CHECK(game IN('crib-lab','chucky-showdown')),
 live_enabled boolean NOT NULL DEFAULT false,
 async_enabled boolean NOT NULL DEFAULT false,
 live_real_qualified boolean NOT NULL DEFAULT false,
 async_real_qualified boolean NOT NULL DEFAULT false
);
INSERT INTO private.originals_release(game) VALUES('crib-lab'),('chucky-showdown');
ALTER TABLE private.originals_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.originals_release FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.originals_config(game_i text, shared_deck boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE r private.arcade_rulesets;
BEGIN
 SELECT * INTO STRICT r FROM private.arcade_rulesets WHERE game=game_i AND enabled;
 IF r.config->>'version' IS DISTINCT FROM (CASE WHEN game_i='chucky-showdown' THEN 'chucky-showdown/3' ELSE 'crib-lab/2' END) OR (shared_deck AND game_i<>'crib-lab') THEN
  RAISE EXCEPTION 'originals:rules_unavailable';
 END IF;
 RETURN jsonb_build_object('game',game_i,'ruleset',r.id,'gameplay',r.config,'rounds',3,'sharedDeck',shared_deck);
END $$;

-- The optional private deal is consumed by the existing dealing owner.
-- Its hands/stock/cut mapping and all scoring/timing remain in that owner.
DO $deal$
DECLARE definition text:=pg_get_functiondef('private.crib_lab_deal_v1(jsonb,integer,bigint)'::regprocedure);
BEGIN
 IF md5(definition)<>'d1453ce0c6bd0a217dae9e939bf68a51'
 OR position('deck jsonb:=private.cribbage_new_deck();' IN definition)=0
 OR position('RETURN s||jsonb_build_object(' IN definition)=0 THEN RAISE EXCEPTION 'originals:deal_owner_changed';END IF;
 definition:=replace(definition,'deck jsonb:=private.cribbage_new_deck();','deck jsonb:=coalesce(s->''_competitiveDeck'',private.cribbage_new_deck());');
 definition:=replace(definition,'RETURN s||jsonb_build_object(','RETURN (s-''_competitiveDeck'')||jsonb_build_object(');
 EXECUTE definition;
END $deal$;

CREATE FUNCTION private.originals_board(game_i text, operation text, cfg jsonb, round_i integer,
 score_before bigint, b jsonb, at_ms bigint, action_i text DEFAULT NULL,
 items integer[] DEFAULT NULL, level_i integer DEFAULT NULL, deck_i jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE s jsonb:=b; actual_phase text; due bigint; result_i jsonb;
BEGIN
 IF game_i NOT IN('crib-lab','chucky-showdown') OR cfg->>'game' IS DISTINCT FROM game_i
 OR NOT EXISTS(SELECT FROM private.arcade_rulesets WHERE game=game_i AND id=cfg->>'ruleset' AND config=cfg->'gameplay')
 THEN RAISE EXCEPTION 'originals:frozen_rules';END IF;
 IF operation='deal' THEN
  IF round_i NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'originals:round';END IF;
  s:=jsonb_build_object('runId',gen_random_uuid(),'status','active','config',cfg->'gameplay',
    'round',round_i-1,'hand',0,'score',score_before,'results','[]'::jsonb);
  IF game_i='crib-lab' THEN
   IF deck_i IS NOT NULL THEN
    IF jsonb_array_length(deck_i)<>52 OR (SELECT count(DISTINCT (value->>'rank',value->>'suit')) FROM jsonb_array_elements(deck_i)
      WHERE value->>'rank' IN('A','2','3','4','5','6','7','8','9','10','J','Q','K') AND value->>'suit' IN('hearts','diamonds','clubs','spades'))<>52
    THEN RAISE EXCEPTION 'originals:deck';END IF;
    s:=s||jsonb_build_object('_competitiveDeck',deck_i);
   END IF;
   s:=private.crib_lab_deal(s,round_i,at_ms);
  ELSE s:=private.chucky_showdown_deal_v2(s,true,at_ms);
  END IF;
 ELSIF operation='reduce' THEN
  IF b->'config' IS DISTINCT FROM cfg->'gameplay' OR b->>'phase'='stage_complete' THEN RAISE EXCEPTION 'originals:board';END IF;
  IF action_i='abandon' THEN RAISE EXCEPTION 'originals:use_competitive_forfeit';END IF;
  IF game_i='crib-lab' THEN
   IF action_i='tick' THEN s:=private.crib_lab_advance(s,at_ms);
   ELSE s:=private.crib_lab_action(s,action_i,coalesce(items,'{}'),at_ms);END IF;
  ELSE
   IF action_i='tick' THEN s:=private.chucky_showdown_advance_v2(s,at_ms);
   ELSE s:=private.chucky_showdown_act_v2(s,action_i,level_i,at_ms);END IF;
  END IF;
 ELSE RAISE EXCEPTION 'originals:operation';END IF;
 actual_phase:=s->>'phase';
 due:=CASE WHEN game_i='crib-lab' THEN coalesce((s->>'phaseUntil')::bigint,(s->>'deadline')::bigint) ELSE (s->>'due')::bigint END;
 IF actual_phase IN('scoring','round_over') THEN
  result_i:=s->'results'->-1;
  s:=s||jsonb_build_object('gamePhase',actual_phase,'phase','stage_complete','result',result_i);
 END IF;
 -- Scheduling metadata uses a separate key so Crib Lab's time-bonus clock survives.
 RETURN s||jsonb_build_object('nextDue',due);
END $$;

CREATE FUNCTION private.originals_visible(game_i text, b jsonb, at_ms bigint DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE phase_i text:=coalesce(b->>'gamePhase',b->>'phase'); answer jsonb;
BEGIN
 IF b IS NULL OR b='null'::jsonb THEN RETURN NULL;END IF;
 IF game_i='crib-lab' THEN
  answer:=jsonb_build_object('round',b->'round','roundId',b->'roundId','phase',phase_i,'hands',b->'hands',
   'score',b->'score','discardMasks',b->'discardMasks','stockLeft',5-(b->>'stockIndex')::int,
   'swapsLeft',b->'swapsLeft','offer',CASE WHEN phase_i='stock' THEN b->'stock'->((b->>'stockIndex')::int) END,
   'cut',CASE WHEN phase_i IN('cut','swap','scoring') THEN b->'cut' END,
   'durationMs',b#>'{config,durationMs}','deadline',b->'deadline','phaseUntil',b->'phaseUntil',
   'transition',b->'transition','result',CASE WHEN phase_i='scoring' THEN b->'results'->-1 END);
 ELSIF game_i='chucky-showdown' THEN
  answer:=private.chucky_showdown_scene_v2(b||jsonb_build_object('phase',phase_i))||
   jsonb_build_object('config',b->'config','lastShowdown',b->'lastShowdown','lastRound',b->'lastRound','lastFold',b->'lastFold','result',b->'result');
 ELSE RAISE EXCEPTION 'originals:game';END IF;
 RETURN answer||jsonb_build_object('serverAt',at_ms,'status',CASE WHEN b->>'phase'='stage_complete' THEN 'completed' ELSE 'active' END,'completion',NULL);
END $$;
REVOKE ALL ON FUNCTION private.originals_config(text,boolean),
 private.originals_board(text,text,jsonb,integer,bigint,jsonb,bigint,text,integer[],integer,jsonb),
 private.originals_visible(text,jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.originals_async_decks(
 child_id uuid REFERENCES private.delayed_children(id), round integer CHECK(round BETWEEN 1 AND 3),
 deck jsonb NOT NULL, PRIMARY KEY(child_id,round)
);
ALTER TABLE private.originals_async_decks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.originals_async_decks FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.delayed_originals_core(p_child uuid,p_operation text,p_round integer DEFAULT NULL,
 p_score bigint DEFAULT 0,p_board jsonb DEFAULT NULL,p_action text DEFAULT NULL,p_items integer[] DEFAULT NULL,
 p_at bigint DEFAULT NULL,p_level integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.delayed_children; deck_i jsonb;
BEGIN
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 IF c.game_type NOT IN('crib-lab','chucky-showdown') THEN RAISE EXCEPTION 'originals:child';END IF;
 IF p_operation='visible' THEN RETURN private.originals_visible(c.game_type,p_board,p_at);END IF;
 IF p_operation='deal' AND c.game_type='crib-lab' AND (c.config->>'sharedDeck')::boolean THEN
  INSERT INTO private.originals_async_decks VALUES(c.id,p_round,private.cribbage_new_deck()) ON CONFLICT DO NOTHING;
  SELECT deck INTO STRICT deck_i FROM private.originals_async_decks WHERE child_id=c.id AND round=p_round;
 END IF;
 RETURN private.originals_board(c.game_type,p_operation,c.config,p_round,p_score,p_board,p_at,p_action,p_items,p_level,deck_i);
END $$;
REVOKE ALL ON FUNCTION public.delayed_originals_core(uuid,text,integer,bigint,jsonb,text,integer[],bigint,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_originals_core(uuid,text,integer,bigint,jsonb,text,integer[],bigint,integer) TO service_role;
