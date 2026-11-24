
CREATE FUNCTION pg_temp.words_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'words_polish:%',label;END IF;END$$;
DO $proof$
DECLARE s jsonb;t jsonb;r jsonb;v text;enabled boolean;seconds integer;saved_enabled boolean;saved_seconds integer;
BEGIN
 FOR v IN SELECT unnest(ARRAY['ptown-words/1','ptown-words/2','ptown-words/3','ptown-words/4']) LOOP
  PERFORM pg_temp.words_assert(private.ptown_words_valid_rules(private.ptown_words_rules_for(v)),'legacy rule valid '||v);
 END LOOP;
 FOREACH enabled IN ARRAY ARRAY[false,true] LOOP
  FOREACH seconds IN ARRAY ARRAY[30,120,300,3600] LOOP
   r:=private.ptown_words_live_rules(jsonb_build_object('words_timer_enabled',enabled,'words_turn_seconds',seconds));
   s:=private.ptown_words_deal(jsonb_build_object('rules',r,'players',jsonb_build_array(jsonb_build_object('id',gen_random_uuid()),jsonb_build_object('id',gen_random_uuid()))),1000);
   PERFORM pg_temp.words_assert(CASE WHEN enabled THEN (s->>'deadline')::bigint=1000+seconds*1000 ELSE s->'deadline'='null'::jsonb END,'initial timer');
   t:=private.ptown_words_reduce(s,'tick',NULL,1000+seconds*1000);
   PERFORM pg_temp.words_assert(CASE WHEN enabled THEN (t->>'turn')::int=2 ELSE t=s END,'expiry or no expiry');
   t:=private.ptown_words_reduce(s,'pass',NULL,2000);
   PERFORM pg_temp.words_assert(CASE WHEN enabled THEN (t->>'deadline')::bigint=2000+seconds*1000 ELSE t->'deadline'='null'::jsonb END,'next turn timer');
   IF NOT enabled THEN
    BEGIN PERFORM private.ptown_words_reduce(s,'time_bank','[{"slot":0}]',2000);RAISE EXCEPTION 'bank should be unavailable';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:time_bank_unavailable' THEN RAISE;END IF;END;
   END IF;
  END LOOP;
 END LOOP;
 BEGIN PERFORM private.ptown_words_live_rules('{"words_turn_seconds":0}');RAISE EXCEPTION 'invalid timer accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:timer_config' THEN RAISE;END IF;END;
 SELECT words_timer_enabled,words_turn_seconds INTO saved_enabled,saved_seconds FROM public.game_defaults WHERE game_type='ptown-words';
 UPDATE public.game_defaults SET words_timer_enabled=false,words_turn_seconds=120 WHERE game_type='ptown-words';
 r:=private.ptown_words_live_rules('{}');
 PERFORM pg_temp.words_assert(r->>'timerEnabled'='false' AND r->>'turnMs'='120000','saved Live defaults applied');
 PERFORM pg_temp.words_assert(private.ptown_words_rules()->>'version'='ptown-words/4' AND private.ptown_words_rules()->>'turnMs'='300000','async default unchanged by Live defaults');
 UPDATE public.game_defaults SET words_timer_enabled=saved_enabled,words_turn_seconds=saved_seconds WHERE game_type='ptown-words';
END $proof$;
DO $proof$
DECLARE a uuid;b uuid;m uuid;c uuid;s jsonb;h jsonb;e uuid;hash text;
BEGIN
 SELECT x.a,x.b INTO a,b FROM fa_actors x;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 m:=public.delayed_create(gen_random_uuid(),b,false,'[{"game":"ptown-words","stake":5}]');
 SELECT offer_hash INTO hash FROM private.delayed_matches WHERE id=m;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);PERFORM public.delayed_respond(m,gen_random_uuid(),hash,'accept');
 SELECT id,state INTO c,s FROM private.delayed_children WHERE match_id=m;
 PERFORM pg_temp.words_assert(s#>>'{rules,version}'='ptown-words/4' AND s#>>'{rules,turnMs}'='300000','async unchanged');
 -- Rollback-only review fixtures exercise the real review-capture trigger and ACK owner.
 s:=s||jsonb_build_object('turn',2,'scores',jsonb_build_object(a::text,12,b::text,24),'moves',jsonb_build_array(jsonb_build_object('turn',1,'playerId',b,'action','place','points',24,'words','[]'::jsonb)));
 UPDATE private.delayed_children SET state=s WHERE id=c;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 h:=public.delayed_home(m);
 PERFORM pg_temp.words_assert(h#>>ARRAY['lineup','0','scores',b::text]='0' AND h#>>ARRAY['lineup','0','pendingResults',b::text]='1','unread first score stays zero');
 SELECT id INTO e FROM private.delayed_current_review_events WHERE child_id=c AND actor=b AND round=1;
 PERFORM public.delayed_review_begin(e);
 PERFORM pg_temp.words_assert(public.delayed_home(m)#>>ARRAY['lineup','0','scores',b::text]='0','begin does not expose score');
 PERFORM public.delayed_review_ack(e);PERFORM public.delayed_review_ack(e);
 PERFORM pg_temp.words_assert(public.delayed_home(m)#>>ARRAY['lineup','0','scores',b::text]='24','ACK reveals exact cumulative score');
 s:=s||jsonb_build_object('turn',3,'scores',jsonb_build_object(a::text,12,b::text,42),'moves',(s->'moves')||jsonb_build_array(jsonb_build_object('turn',2,'playerId',b,'action','place','points',18,'words','[]'::jsonb)));
 UPDATE private.delayed_children SET state=s WHERE id=c;
 PERFORM pg_temp.words_assert(public.delayed_home(m)#>>ARRAY['lineup','0','scores',b::text]='24','later unread retains last viewed score');
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM pg_temp.words_assert(public.delayed_home(m)#>>ARRAY['lineup','0','scores',b::text]='42','own score stays current');
END $proof$;

-- Also run proof.sql with both timer options, and the Five Alive privacy proof.

