DO $$
DECLARE a uuid;b uuid;m uuid;child uuid;r jsonb;s jsonb;board jsonb;at_i bigint;h jsonb;
BEGIN
 SELECT x.a,x.b INTO a,b FROM sealed_actors x;
 UPDATE private.delayed_sealed_release SET enabled=true WHERE singleton;
 m:=pg_temp.sealed_fixture('take-two',false);SELECT id INTO child FROM private.delayed_children WHERE match_id=m;
 UPDATE private.delayed_children SET available_at=clock_timestamp()-interval '12 hours' WHERE id=child;
 r:=public.delayed_sealed_load(child,a);s:=r->'state';at_i:=floor(extract(epoch FROM (r->>'available_at')::timestamptz)*1000);
 board:=public.delayed_take_two_core(child,'deal',1,0,NULL,NULL,NULL,at_i);
 PERFORM public.delayed_sealed_commit(child,a,(r->>'revision')::bigint,s||jsonb_build_object('board',board,'segmentStartedAt',at_i),'action',at_i,false,gen_random_uuid(),jsonb_build_object('revision',r->'revision','segment',r->'segment','intent',jsonb_build_object('type','start')));
 PERFORM set_config('request.jwt.claim.sub',b::text,true);h:=public.delayed_home(m);
 PERFORM pg_temp.sealed_assert((h#>>'{lineup,0,playableDeadline}')::timestamptz>clock_timestamp() AND h#>>'{lineup,0,playable}'='true','opponent deadline cannot hide available independent round');
 PERFORM set_config('request.jwt.claim.sub',a::text,true);h:=public.delayed_home(m);
 PERFORM pg_temp.sealed_assert((h#>>'{lineup,0,playableDeadline}')::timestamptz<=clock_timestamp(),'own deadline remains authoritative');
END $$;
SELECT 'PASS: viewer-specific playable deadlines' sealed_deadline_proof;
