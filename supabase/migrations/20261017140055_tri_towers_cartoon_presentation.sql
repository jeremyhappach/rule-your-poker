-- Read-only display statistics. Gameplay, clocks and financial authority are unchanged.
CREATE INDEX IF NOT EXISTS arcade_receipts_run_revision ON private.arcade_command_receipts(run_id,revision);

CREATE OR REPLACE FUNCTION private.arcade_tri_high_run(run private.arcade_runs) RETURNS integer
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH receipts AS (
  SELECT revision,CASE WHEN left(fingerprint,1)='[' THEN fingerprint::jsonb END AS command
  FROM private.arcade_command_receipts WHERE run_id=run.id AND revision<=run.revision
 ), actions AS (
  SELECT revision,command->>3 AS action FROM receipts WHERE command->>2=run.state->>'roundId'
 ), segments AS (
  SELECT *,sum(CASE WHEN action='draw' THEN 1 ELSE 0 END) OVER(ORDER BY revision ROWS UNBOUNDED PRECEDING) AS segment FROM actions
 ), streaks AS (SELECT count(*) FILTER(WHERE action='remove') AS streak FROM segments GROUP BY segment)
 SELECT greatest(coalesce(max(streak),0),coalesce((run.state#>>'{board,run}')::integer,0))::integer FROM streaks
$$;
REVOKE ALL ON FUNCTION private.arcade_tri_high_run(private.arcade_runs) FROM PUBLIC,anon,authenticated,service_role;

-- New clients opt in. Old clients keep byte-for-byte equivalent snapshot fields.
-- Calls delegate to the existing authenticated snapshot/action owners in this transaction.
CREATE OR REPLACE FUNCTION public.tri_towers_present(p_dealer_game_id uuid,p_request_id uuid DEFAULT NULL,
 p_revision bigint DEFAULT NULL,p_action text DEFAULT NULL,p_index integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; high_i integer;
BEGIN
 IF p_action IS NULL THEN v:=public.tri_towers_snapshot(p_dealer_game_id);
 ELSE v:=public.tri_towers_action(p_dealer_game_id,p_request_id,p_revision,p_action,p_index);END IF;
 SELECT greatest(coalesce(max((frame->>'run')::integer),0),coalesce((v->>'run')::integer,0)) INTO high_i
 FROM private.tri_towers_history WHERE dealer_game_id=p_dealer_game_id AND revision<=(v->>'revision')::bigint
  AND frame#>>'{identity,roundId}'=v#>>'{identity,roundId}' AND frame->>'stage'=v->>'stage'
  AND frame->>'activePlayerId'=v->>'activePlayerId';
 RETURN v||jsonb_build_object('highRun',high_i);
END $$;
REVOKE ALL ON FUNCTION public.tri_towers_present(uuid,uuid,bigint,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tri_towers_present(uuid,uuid,bigint,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION private.arcade_tri_projection(run private.arcade_runs,at_ms bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE s jsonb:=run.state; b jsonb:=s->'board'; v jsonb; result jsonb:=s->'results'->-1;
BEGIN
 v:=private.tri_towers_visible(b)-ARRAY['activePlayerId','cursor'];
 SELECT jsonb_object_agg(k,v->k) INTO v FROM unnest(ARRAY['rules','phase','cards','removed','waste','run','score','deadline','event','stockRemaining']) k;
 RETURN jsonb_build_object('id',run.id,'game',run.game,'ruleset',run.ruleset,'revision',run.revision,'status',run.status,
  'serverAt',at_ms,'score',run.score,'dueAt',run.due_at,'events','[]'::jsonb,
  'highRun',private.arcade_tri_high_run(run),
  'completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id),
  'view',v||jsonb_build_object('roundId',s->>'roundId','round',s->'round','result',CASE WHEN b->>'phase'='stage_complete' THEN result ELSE NULL END,
   'scorePresentation',CASE WHEN b->>'phase'='stage_complete' THEN jsonb_build_object('startedAt',(b->>'deadline')::bigint-(run.config->>'holdMs')::bigint,
    'endsAt',(b->>'deadline')::bigint,'from',result->'scoreBefore','to',result->'score') ELSE NULL END));
END $$;
REVOKE ALL ON FUNCTION private.arcade_tri_projection(private.arcade_runs,bigint) FROM PUBLIC,anon,authenticated,service_role;
