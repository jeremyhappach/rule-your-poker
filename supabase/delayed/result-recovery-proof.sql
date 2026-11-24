-- Added to the existing full rollback-contained financial/replay proof.
DO $proof$
DECLARE a uuid;b uuid;m uuid;c uuid;hash text;s jsonb;h jsonb;r jsonb;e uuid;before_state jsonb;
 legacy jsonb;before_seen bigint;before_commands bigint;label text;
BEGIN
 SELECT x.a,x.b INTO a,b FROM fa_actors x;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 m:=public.delayed_create(gen_random_uuid(),b,false,'[{"game":"ptown-words","stake":5}]');
 SELECT offer_hash INTO hash FROM private.delayed_matches WHERE id=m;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);PERFORM public.delayed_respond(m,gen_random_uuid(),hash,'accept');
 SELECT id,state INTO c,s FROM private.delayed_children WHERE match_id=m;
 -- Two saved opponent turns, with a previously disclosed nonzero baseline.
 s:=s||jsonb_build_object('turn',2,'scores',jsonb_build_object(a::text,250,b::text,195),
  'moves',jsonb_build_array(jsonb_build_object('turn',1,'playerId',b,'action','place','points',195,'words','[]'::jsonb)));
 UPDATE private.delayed_children SET state=s,actor=b WHERE id=c;
 legacy:=private.ptown_words_visible(s,a::text)||jsonb_build_object('serverAt',1795490000000,'revision',2);
 INSERT INTO private.delayed_word_commands(child_id,actor,request_id,fingerprint,response)
 VALUES(c,a,gen_random_uuid(),'{"action":"begin_turn"}',legacy);
 s:=s||jsonb_build_object('turn',3,'scores',jsonb_build_object(a::text,250,b::text,237),
  'moves',(s->'moves')||jsonb_build_array(jsonb_build_object('turn',2,'playerId',b,'action','place','points',42,'words','[]'::jsonb)));
 UPDATE private.delayed_children SET state=s WHERE id=c;
 SELECT count(*) INTO before_seen FROM private.delayed_review_seen;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 h:=public.delayed_home(m);r:=public.delayed_reviews(c);
 PERFORM pg_temp.fa_assert(h#>>ARRAY['lineup','0','scores',b::text]='195','legacy nonzero score retained');
 PERFORM pg_temp.fa_assert(h#>>'{lineup,0,reviewCount}'='0' AND jsonb_array_length(r->'events')=2,'active game has zero result obligations and retains history');
 PERFORM pg_temp.fa_assert(r->>'turnReviewId'=(SELECT id::text FROM private.delayed_review_events WHERE child_id=c AND round=2),'entry selects only latest opponent turn');
 PERFORM pg_temp.fa_assert((SELECT x->>'beforeScore'='0' AND x->>'afterScore'='195' FROM jsonb_array_elements(r->'events') x WHERE x->>'round'='1'),'history retains temporal cumulative scores');
 PERFORM pg_temp.fa_assert((SELECT count(*) FROM private.delayed_review_seen)=before_seen,'no fabricated legacy ACK');
 PERFORM pg_temp.fa_assert(public.delayed_words_inspect(c)#>>ARRAY['scores',b::text]='195','inspection conceals new cumulative score');
 PERFORM pg_temp.fa_assert(jsonb_array_length(public.delayed_words_inspect(c)->'moves')=1,'inspection conceals new play history');
 SELECT state INTO before_state FROM private.delayed_children WHERE id=c;
 SELECT count(*) INTO before_commands FROM private.delayed_word_commands;
 SELECT id INTO e FROM private.delayed_review_events WHERE child_id=c AND round=2;
 PERFORM public.delayed_review_begin(e);
 PERFORM pg_temp.fa_assert(public.delayed_home(m)#>>'{lineup,0,reviewCount}'='0','interrupted turn reveal is not a final result');
 -- A late historical ACK cannot regress the previously disclosed total.
 PERFORM public.delayed_review_ack((SELECT id FROM private.delayed_review_events WHERE child_id=c AND round=1));
 PERFORM pg_temp.fa_assert(public.delayed_home(m)#>>ARRAY['lineup','0','scores',b::text]='195','old replay does not regress disclosed total');
 SELECT id INTO e FROM private.delayed_review_events WHERE child_id=c AND round=2;
 PERFORM public.delayed_review_begin(e);PERFORM public.delayed_review_ack(e);PERFORM public.delayed_review_ack(e);
 h:=public.delayed_home(m);
 PERFORM pg_temp.fa_assert(h#>>ARRAY['lineup','0','scores',b::text]='237' AND h#>>'{lineup,0,reviewCount}'='0','ACK reconciles exact score and count');
 PERFORM pg_temp.fa_assert((SELECT state=before_state AND actor=b FROM private.delayed_children WHERE id=c)
  AND (SELECT count(*) FROM private.delayed_word_commands)=before_commands,'review never progresses game or clock');
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM pg_temp.fa_assert(public.delayed_home(m)#>>ARRAY['lineup','0','scores',b::text]='237','own authoritative score unchanged');
 -- Zero-point events remain eligible, including when turn ownership changes.
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 FOREACH label IN ARRAY ARRAY['pass','exchange','timeout'] LOOP
  s:=s||jsonb_build_object('turn',(s->>'turn')::int+1,'moves',(s->'moves')||jsonb_build_array(
   jsonb_build_object('turn',(s->>'turn')::int,'playerId',b,'action',CASE WHEN label='timeout' THEN 'pass' ELSE label END,'points',0,'timeout',label='timeout','words','[]'::jsonb)));
  UPDATE private.delayed_children SET state=s,actor=a WHERE id=c;
 END LOOP;
 PERFORM pg_temp.fa_assert(public.delayed_home(m)#>>'{lineup,0,reviewCount}'='0','ordinary turns are never final result obligations');
 PERFORM pg_temp.fa_assert(public.delayed_home(m)#>>ARRAY['lineup','0','scores',b::text]='237','zero changes retain nonzero baseline');
 PERFORM set_config('request.jwt.claim.sub',(SELECT outsider::text FROM fa_actors),true);
 BEGIN PERFORM public.delayed_reviews(c);RAISE EXCEPTION 'unauthorized review';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.delayed_review_ack(e);RAISE EXCEPTION 'unauthorized ACK';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 -- New games have legitimate zero prior disclosure and no compatibility shortcut.
 m:=public.delayed_create(gen_random_uuid(),b,false,'[{"game":"ptown-words","stake":5}]');
 SELECT offer_hash INTO hash FROM private.delayed_matches WHERE id=m;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);PERFORM public.delayed_respond(m,gen_random_uuid(),hash,'accept');
 SELECT id,state INTO c,s FROM private.delayed_children WHERE match_id=m;
 s:=s||jsonb_build_object('turn',2,'scores',jsonb_build_object(a::text,0,b::text,42),
  'moves',jsonb_build_array(jsonb_build_object('turn',1,'playerId',b,'action','place','points',42,'words','[]'::jsonb)));
 UPDATE private.delayed_children SET state=s WHERE id=c;
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM pg_temp.fa_assert(public.delayed_home(m)#>>ARRAY['lineup','0','scores',b::text]='0','legitimate zero baseline');
 PERFORM pg_temp.fa_assert(public.delayed_words_inspect(c)->'moves'='[]'::jsonb,'new board inspection hides unrevealed play');
 -- A new masked response can never become a legacy disclosure baseline.
 INSERT INTO private.delayed_word_commands(child_id,actor,request_id,fingerprint,response)
 VALUES(c,a,gen_random_uuid(),'{"action":"begin_turn"}',public.delayed_words_inspect(c));
 PERFORM pg_temp.fa_assert(public.delayed_home(m)#>>ARRAY['lineup','0','scores',b::text]='0','versioned responses cannot reveal unread points');
END $proof$;
DO $final$
DECLARE c private.delayed_children;m private.delayed_matches;r jsonb;
BEGIN
 SELECT * INTO c FROM private.delayed_children x WHERE x.game_type='ptown-words' AND x.terminal
  AND NOT EXISTS(SELECT FROM private.delayed_removals z WHERE z.match_id=x.match_id) LIMIT 1;
 IF FOUND THEN
  SELECT * INTO m FROM private.delayed_matches WHERE id=c.match_id;
  PERFORM set_config('request.jwt.claim.sub',m.organizer::text,true);
  r:=public.delayed_reviews(c.id);
  PERFORM pg_temp.fa_assert(r#>'{finalBoard,scores}'=c.state->'scores','explicit final review retains adjusted totals');
  PERFORM pg_temp.fa_assert(r#>>'{finalBoard,identity,sessionId}'=m.id::text
   AND r#>>'{finalBoard,phase}'='complete' AND r#>>'{finalBoard,finished}'='true','final review identity and lifecycle');
 END IF;
END $final$;
SELECT 'PASS result access, nonzero/zero legacy scores, replay, interruption, both viewers, zero-point turns, privacy and no gameplay writes' AS result_recovery;
