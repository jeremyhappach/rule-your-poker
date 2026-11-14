-- Run after core-proof.sql, proof.sql and banks-release-proof.sql (with /4 admission expectation), inside rollback.
-- All persistent writes below belong to newly generated synthetic identities.
DO $proof$
DECLARE version text; duration bigint; s jsonb; t jsonb; players jsonb:='[{"id":"p1"},{"id":"p2"}]';
BEGIN
 PERFORM pg_temp.words_assert(private.ptown_words_rules()=private.ptown_words_rules_for('ptown-words/4'),'new admissions use /4');
 PERFORM pg_temp.words_assert(private.ptown_words_rules_for('ptown-words/4')-'version'-'turnMs'=private.ptown_words_rules_for('ptown-words/2')-'version'-'turnMs','only version and base turn length change');
 FOREACH version IN ARRAY ARRAY['ptown-words/1','ptown-words/2','ptown-words/3','ptown-words/4'] LOOP
  duration:=CASE version WHEN 'ptown-words/4' THEN 300000 WHEN 'ptown-words/3' THEN 129600000 ELSE 180000 END;
  s:=private.ptown_words_deal(jsonb_build_object('rules',private.ptown_words_rules_for(version),'players',players),1000);
  PERFORM pg_temp.words_assert((s->>'deadline')::bigint=1000+duration,'frozen deal duration '||version);
  t:=private.ptown_words_reduce(s,'pass',NULL,2000);
  PERFORM pg_temp.words_assert((t->>'deadline')::bigint=2000+duration AND t#>>'{rules,version}'=version,'next turn preserves duration '||version);
  IF version<>'ptown-words/3' THEN
   PERFORM pg_temp.words_assert(private.ptown_words_reduce(s,'tick',NULL,1000+duration-1)=s,'no early expiry '||version);
   t:=private.ptown_words_reduce(s,'tick',NULL,1000+duration);
   PERFORM pg_temp.words_assert(t->'moves'->-1->>'reason'='timeout' AND (t->>'deadline')::bigint=1000+2*duration,'exact expiry and timeout provenance '||version);
   PERFORM pg_temp.words_assert(private.ptown_words_reduce(t,'tick',NULL,1000+duration)=t,'duplicate timeout leaves successor unchanged '||version);
  END IF;
  IF version IN ('ptown-words/2','ptown-words/4') THEN
   t:=private.ptown_words_reduce(s,'time_bank','[{"slot":0}]',2000);
   PERFORM pg_temp.words_assert((t->>'deadline')::bigint=(s->>'deadline')::bigint+180000,'bank stays three minutes '||version);
  END IF;
 END LOOP;
 BEGIN PERFORM private.ptown_words_deal(jsonb_build_object('rules',private.ptown_words_rules()||'{"turnMs":1}','players',players),1000);RAISE EXCEPTION 'missing rule tamper guard';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ptown_words:rules' THEN RAISE;END IF;END;
END $proof$;
-- Reproduce an offer created by the previous admission owner, preserving its actual offer hash.
DO $prepare$ BEGIN
 EXECUTE replace(replace(pg_get_functiondef('public.delayed_create(uuid,uuid,boolean,jsonb)'::regprocedure),'public.delayed_create(', 'pg_temp.words_old_offer('),'private.ptown_words_rules()', 'private.ptown_words_rules_for(''ptown-words/2'')');
END $prepare$;
DO $async$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid()];u uuid;m uuid;c private.delayed_children;s jsonb;v jsonb;a jsonb;request uuid;version text;duration bigint;i int;started bigint;old_segment bigint;old_expiry timestamptz;
BEGIN
 FOREACH u IN ARRAY users LOOP
  INSERT INTO auth.users(id) VALUES(u);
  UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=u;
  UPDATE public.profiles SET is_active=true,username='Words timer proof '||u WHERE id=u;
 END LOOP;
 FOREACH version IN ARRAY ARRAY['ptown-words/2','ptown-words/4'] LOOP
  PERFORM set_config('request.jwt.claim.sub',users[1]::text,true);
  IF version='ptown-words/2' THEN m:=pg_temp.words_old_offer(gen_random_uuid(),users[2],false,'[{"game":"ptown-words","stake":7}]');
  ELSE m:=(pg_temp.words_rpc(users[1],format('SELECT to_jsonb(public.delayed_create(%L,%L,false,%L::jsonb))',gen_random_uuid(),users[2],'[{"game":"ptown-words","stake":7}]'))#>>'{}')::uuid; END IF;
  SELECT * INTO c FROM private.delayed_children WHERE match_id=m;
  PERFORM pg_temp.words_assert(c.config->>'version'=version,'offer freezes version '||version);
  PERFORM pg_temp.words_rpc(users[2],format('SELECT to_jsonb(public.delayed_respond(%L,%L,%L,%L))',m,gen_random_uuid(),(SELECT offer_hash FROM private.delayed_matches WHERE id=m),'accept'));
  SELECT * INTO c FROM private.delayed_children WHERE match_id=m;
  PERFORM pg_temp.words_assert(c.state#>>'{rules,version}'=version AND c.gameplay_due_at IS NULL,'accepted frozen offer awaits entry '||version);
  duration:=(c.config->>'turnMs')::bigint;
  request:=gen_random_uuid();started:=floor(extract(epoch FROM clock_timestamp())*1000);
  v:=pg_temp.words_rpc(c.actor,format('SELECT public.delayed_words_action(%L,%L,%s,%L)',c.id,request,c.revision,'begin_turn'));
  a:=pg_temp.words_rpc(c.actor,format('SELECT public.delayed_words_action(%L,%L,%s,%L)',c.id,request,c.revision,'begin_turn'));
  PERFORM pg_temp.words_assert(a=v,'begin-turn replay is identical '||version);
  SELECT * INTO c FROM private.delayed_children WHERE match_id=m;
  PERFORM pg_temp.words_assert((c.state->>'deadline')::bigint BETWEEN started+duration AND started+duration+2000 AND c.gameplay_due_at=to_timestamp((c.state->>'deadline')::bigint/1000.0),'entered authoritative duration '||version);
  PERFORM pg_temp.words_assert(c.expires_at>clock_timestamp()+interval '35 hours' AND c.expires_at<clock_timestamp()+interval '37 hours','36-hour availability retained '||version);
  s:=c.state;
  v:=pg_temp.words_rpc(c.actor,format('SELECT public.delayed_words_action(%L,%L,%s,%L,%L::jsonb)',c.id,gen_random_uuid(),c.revision,'time_bank','[{"slot":0}]'));
  SELECT * INTO c FROM private.delayed_children WHERE match_id=m;
  PERFORM pg_temp.words_assert((c.state->>'deadline')::bigint=(s->>'deadline')::bigint+180000,'async bank remains three minutes '||version);
  UPDATE private.delayed_children SET state=jsonb_set(state,'{deadline}',to_jsonb(floor(extract(epoch FROM clock_timestamp())*1000)::bigint-1000)),gameplay_due_at=clock_timestamp()-interval '1 second' WHERE id=c.id;
  old_segment:=c.segment;old_expiry:=c.expires_at;
  PERFORM pg_temp.words_assert(private.delayed_expire(c.id,c.segment,c.expires_at),'async playable expiry passes '||version);
  SELECT * INTO c FROM private.delayed_children WHERE match_id=m;
  PERFORM pg_temp.words_assert(NOT c.terminal AND c.gameplay_due_at IS NULL AND c.state->'moves'->-1->>'reason'='timeout','expiry retains turn flow and provenance '||version);
  PERFORM pg_temp.words_assert(NOT private.delayed_expire(c.id,old_segment,old_expiry),'stale expiry cannot advance successor '||version);
 END LOOP;
END $async$;
SELECT 'Five-minute live/async timing, legacy offers, banks, expiry and replay passed' proof;
