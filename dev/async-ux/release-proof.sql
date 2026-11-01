-- Caller must use BEGIN/ROLLBACK. Synthetic identities only; no recovery sweep.
CREATE FUNCTION pg_temp.ux_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'async UX proof: %',label;END IF;END $$;
CREATE TEMP TABLE ux_checks(evidence jsonb);
DO $$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); mode boolean; p uuid; req uuid; accept_req uuid;
 h text; home jsonb; answer jsonb; c private.delayed_children; n integer; before_count bigint; expiry timestamptz;
 lineup jsonb:='[{"game":"ptown-words","stake":7},{"game":"run21","stake":3},{"game":"tri-towers","stake":5},{"game":"quintzee","stake":5},{"game":"boxdrop","stake":5}]';
BEGIN
 INSERT INTO auth.users(id) VALUES(a),(b);
 INSERT INTO public.profiles(id,username,is_active) VALUES(a,'Async UX proof '||a,true),(b,'Async UX proof '||b,true)
 ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,is_active=true;
 SELECT count(*) INTO before_count FROM public.player_transactions WHERE profile_id NOT IN(a,b);
 FOREACH mode IN ARRAY ARRAY[false,true] LOOP
  SET CONSTRAINTS ALL DEFERRED;
  PERFORM set_config('request.jwt.claim.sub',a::text,true);req:=gen_random_uuid();SET LOCAL ROLE authenticated;
  p:=public.delayed_create(req,b,mode,lineup);
  PERFORM pg_temp.ux_assert(public.delayed_create(req,b,mode,lineup)=p,'create replay identity');
  home:=public.delayed_home(p);h:=home->>'offerHash';RESET ROLE;
  PERFORM pg_temp.ux_assert((home->>'realMoney')::boolean=mode AND (home->>'exposure')::int=25 AND jsonb_array_length(home->'lineup')=5,'money/lineup/exposure projection');
  PERFORM pg_temp.ux_assert((SELECT expires_at=created_at+interval '72 hours' FROM private.delayed_matches WHERE id=p),'72-hour invitation policy');
  PERFORM set_config('request.jwt.claim.sub',b::text,true);SET LOCAL ROLE authenticated;
  PERFORM pg_temp.ux_assert(EXISTS(SELECT FROM jsonb_array_elements(public.platform_notification_center()->'items') x WHERE x->>'match_id'=p::text AND x->>'kind'='invitation' AND (x->>'actionable')::boolean),'invitation delivered to authorized center');
  BEGIN PERFORM public.delayed_respond(p,gen_random_uuid(),'stale','accept');RAISE EXCEPTION 'ux:stale accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:offer_changed' THEN RAISE;END IF;END;
  RESET ROLE;
  PERFORM pg_temp.ux_assert((SELECT status='invited' FROM private.delayed_matches WHERE id=p) AND NOT EXISTS(SELECT FROM public.games WHERE id=p),'rejected terms preserve pending/no finances');
  accept_req:=gen_random_uuid();SET LOCAL ROLE authenticated;
  answer:=public.delayed_respond(p,accept_req,h,'accept');
  PERFORM pg_temp.ux_assert(public.delayed_respond(p,accept_req,h,'accept')=answer,'accept receipt replay');
  BEGIN PERFORM public.delayed_respond(p,gen_random_uuid(),h,'accept');RAISE EXCEPTION 'ux:second acceptance';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'delayed:offer_changed' THEN RAISE;END IF;END;
  RESET ROLE;
  PERFORM pg_temp.ux_assert((SELECT count(*)=1 FROM private.delayed_requests WHERE match_id=p AND fingerprint->>'op'='accept') AND NOT EXISTS(SELECT FROM public.games WHERE id=p) AND NOT EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=p),'acceptance exactly once, zero funding');
  n:=0;
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=p ORDER BY ordinal LOOP
   n:=n+1;
   PERFORM private.delayed_record_outcome(c.id,c.revision,CASE WHEN n>2 THEN 'draw' ELSE 'normal' END,CASE WHEN n=1 THEN a WHEN n=2 THEN b ELSE NULL END,jsonb_build_object('syntheticBoundary',true,'ordinal',n));
   IF n<5 THEN
    PERFORM pg_temp.ux_assert(NOT EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=p) AND NOT EXISTS(SELECT FROM public.games WHERE id=p),'child completion stays provisional');
    PERFORM set_config('request.jwt.claim.sub',a::text,true);SET LOCAL ROLE authenticated;
    home:=public.delayed_home(p);RESET ROLE;
    PERFORM pg_temp.ux_assert(home->>'status'='active' AND (home->>'completed')::int=n AND jsonb_array_length(home->'lineup')=5,'mixed children retain unified parent');
   END IF;
  END LOOP;
  SET CONSTRAINTS ALL IMMEDIATE;
  answer:=private.delayed_finalize(p);
  PERFORM pg_temp.ux_assert(private.delayed_finalize(p)=answer,'parent replay stable');
  PERFORM pg_temp.ux_assert((SELECT count(*)=1 AND min(organizer_delta)=4 AND min(opponent_delta)=-4 FROM private.delayed_settlements WHERE match_id=p),'one net +4/-4 parent receipt');
  PERFORM pg_temp.ux_assert((SELECT count(*)=2 AND bool_and(chips=CASE user_id WHEN a THEN 4 ELSE -4 END) FROM public.players WHERE game_id=p),'canonical chips +4/-4');
  PERFORM pg_temp.ux_assert((SELECT count(*)=2 AND bool_and(chips=CASE user_id WHEN a THEN 4 ELSE -4 END) FROM public.session_player_snapshots WHERE game_id=p),'final snapshots +4/-4');
  PERFORM pg_temp.ux_assert((SELECT count(*)=1 AND bool_and(unmatched_deltas='{}'::jsonb) FROM public.gameplay_transfer_batches WHERE game_id=p),'one balanced canonical batch');
  PERFORM pg_temp.ux_assert((SELECT count(*)=CASE WHEN mode THEN 2 ELSE 0 END AND coalesce(sum(amount),0)=0 FROM public.player_transactions WHERE source_game_id=p),'real exactly two balanced postings / fake zero postings');
  PERFORM set_config('request.jwt.claim.sub',b::text,true);SET LOCAL ROLE authenticated;
  PERFORM pg_temp.ux_assert(EXISTS(SELECT FROM jsonb_array_elements(public.platform_notification_center()->'items') x WHERE x->>'match_id'=p::text AND x->>'kind'='settled' AND (x->>'actionable')::boolean),'result notification delivered');
  home:=public.delayed_home(p);RESET ROLE;
  PERFORM pg_temp.ux_assert(home->>'status'='settled' AND (home->>'realMoney')::boolean=mode AND (home->>'net')::int=-4,'reconnect terminal money and net');
  INSERT INTO ux_checks VALUES(jsonb_build_object('realMoney',mode,'children',5,'parentReceipts',1,'canonicalChips',jsonb_build_array(4,-4),'canonicalBatches',1,'accountPostings',CASE WHEN mode THEN 2 ELSE 0 END,'invitationAndResultDelivery',true,'duplicateAndFreshRequestAcceptanceSafe',true,'mixedChildrenAndReconnect',true));
 END LOOP;
 PERFORM pg_temp.ux_assert((SELECT count(*) FROM public.player_transactions WHERE profile_id NOT IN(a,b))=before_count,'no customer accounting changes');
END $$;
SELECT jsonb_agg(evidence) AS checks FROM ux_checks;

