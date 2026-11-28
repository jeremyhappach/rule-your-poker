-- Append after sealed-proof.sql and generated shared-core TypeScript templates.
DO $$
DECLARE a uuid;b uuid;m uuid;child uuid;cfg jsonb;g text;real_i boolean;hash text;command jsonb;state_i jsonb;row_i jsonb;result jsonb;actor uuid;fp jsonb;at_i bigint;request uuid;
BEGIN
 SELECT x.a,x.b INTO a,b FROM sealed_actors x;
 FOREACH real_i IN ARRAY ARRAY[false,true] LOOP
  FOREACH g IN ARRAY ARRAY['run21','mega-card-golf'] LOOP
   SELECT config INTO cfg FROM sealed_ts_config WHERE game=g;
   PERFORM set_config('request.jwt.claim.sub',a::text,true);
   m:=public.delayed_create(gen_random_uuid(),b,real_i,jsonb_build_array(jsonb_build_object('game',g,'stake',3,'config',cfg)));
   SELECT offer_hash INTO hash FROM private.delayed_matches WHERE id=m;PERFORM set_config('request.jwt.claim.sub',b::text,true);PERFORM public.delayed_respond(m,gen_random_uuid(),hash,'accept');
   SELECT id INTO child FROM private.delayed_children WHERE match_id=m;
   UPDATE private.delayed_children SET available_at=clock_timestamp()-interval '13 hours' WHERE id=child;
   FOR command IN SELECT data FROM sealed_ts_commands WHERE data->>'game'=g ORDER BY seq LOOP
    -- The fourth zero-point Run21 round is deliberately left unpaired.
    IF g='run21' AND command->>'round'='4' AND command->>'actor'='00000000-0000-4000-8000-000000000002' THEN CONTINUE;END IF;
    command:=replace(replace(replace(command::text,'00000000-0000-4000-8000-000000000001',a::text),'00000000-0000-4000-8000-000000000002',b::text),'00000000-0000-4000-8000-000000000003',child::text)::jsonb;
    actor:=(command->>'actor')::uuid;row_i:=public.delayed_sealed_load(child,actor);state_i:=row_i->'state';at_i:=(command->>'at')::bigint;
    state_i:=state_i||jsonb_build_object('board',command#>'{state,board}','deck',command#>'{state,deck}','segmentStartedAt',command#>'{state,segmentStartedAt}');
    IF (command->>'advanced')::boolean THEN state_i:=jsonb_set(state_i,'{attempts}',(state_i->'attempts')||jsonb_build_array(command#>'{state,attempts,-1}'));END IF;
    request:=gen_random_uuid();fp:=jsonb_build_object('child',child,'revision',row_i->'revision','segment',row_i->'segment','intent',command->'intent');
    result:=public.delayed_sealed_commit(child,actor,(row_i->>'revision')::bigint,state_i,'action',at_i,(command->>'advanced')::boolean,request,fp);
    PERFORM pg_temp.sealed_assert(result->>'outcome'='committed','shared TypeScript core accepted: '||g);
    PERFORM pg_temp.sealed_assert(public.delayed_sealed_commit(child,actor,(row_i->>'revision')::bigint,state_i,'action',at_i,(command->>'advanced')::boolean,request,fp)->>'outcome'='duplicate','TypeScript command replay');
   END LOOP;
   IF g='run21' THEN
    PERFORM pg_temp.sealed_assert((SELECT (state->>'round')::int=4 AND NOT terminal FROM private.delayed_children WHERE id=child),'Run21 shared tie extension');
    UPDATE private.delayed_children SET available_at=clock_timestamp()-interval '80 hours' WHERE id=child;
    row_i:=public.delayed_sealed_load(child,b);at_i:=floor(extract(epoch FROM (row_i->>'expires_at')::timestamptz)*1000);
    result:=public.delayed_sealed_commit(child,b,(row_i->>'revision')::bigint,row_i->'state','tick',at_i,false);
    PERFORM pg_temp.sealed_assert(result#>>'{record,outcome,winner}'=a::text,'single submitter wins timeout');
   END IF;
   PERFORM pg_temp.sealed_assert((SELECT terminal FROM private.delayed_children WHERE id=child),'TypeScript game terminal');
   PERFORM pg_temp.sealed_finance(m,real_i);
  END LOOP;
 END LOOP;
END $$;
SELECT 'PASS: shared Run21 tie extension, Mega holes, both canonical money modes' sealed_typescript_proof;
