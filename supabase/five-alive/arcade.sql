-- Candidate only. Five Alive's default admission remains closed.
-- The existing Arcade start owner remains responsible for access, maintenance,
-- request receipts, one active run and the recovery health gate.
DO $$
DECLARE src text;old_part text:=$part$'quintzee','run21'$part$;new_part text:=$part$'five-alive','quintzee','run21'$part$;
BEGIN
 src:=pg_get_functiondef('public.arcade_start(uuid,uuid,text)'::regprocedure);
 IF strpos(src,new_part)>0 THEN RETURN; END IF;
 IF strpos(src,old_part)=0 OR strpos(substr(src,strpos(src,old_part)+length(old_part)),old_part)>0 THEN
  RAISE EXCEPTION 'five_alive:arcade_start_preimage_changed';
 END IF;
 EXECUTE replace(src,old_part,new_part);
END $$;

INSERT INTO private.arcade_rulesets(id,game,config,enabled)
VALUES('five-alive/1','five-alive',
 '{"version":"five-alive/1","poolVersion":"esdb-five-alive/1","rounds":3,"guesses":6,"baseScores":[1000,700,490,343,240,168],"multipliers":[80,100,120,140,160]}'::jsonb,false);

-- Called only by the authenticated Arcade service. Start, secret assignment,
-- first state and their existing receipts commit in the same transaction.
CREATE FUNCTION public.arcade_five_alive_start(p_actor uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE start_row jsonb;run private.arcade_runs;answers jsonb;rounds jsonb;s jsonb;result jsonb;
BEGIN
 start_row:=public.arcade_start(p_actor,p_request,'five-alive');
 SELECT * INTO STRICT run FROM private.arcade_runs WHERE id=(start_row->>'id')::uuid FOR UPDATE;
 IF run.game<>'five-alive' OR run.user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 IF run.state IS NULL THEN
  answers:=private.five_alive_allocate('arcade',run.id,run.config->>'poolVersion');
  SELECT jsonb_agg(jsonb_build_object('answer',a->>'word','difficulty',a->'difficulty','guesses','[]'::jsonb,'completed',false) ORDER BY ord)
   INTO rounds FROM jsonb_array_elements(answers) WITH ORDINALITY x(a,ord);
  s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'status','active','score',0,'rounds',rounds,'current',0);
  result:=public.arcade_commit(p_actor,run.id,run.revision,s,NULL,NULL,NULL,NULL);
  IF result->>'outcome'<>'committed' THEN RAISE EXCEPTION 'five_alive:initialization_conflict';END IF;
  SELECT * INTO STRICT run FROM private.arcade_runs WHERE id=run.id;
 END IF;
 RETURN private.arcade_record(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000));
END $$;
REVOKE ALL ON FUNCTION public.arcade_five_alive_start(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.arcade_five_alive_start(uuid,uuid) TO service_role;
