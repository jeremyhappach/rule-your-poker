-- Additive Five Alive review projection; existing clients keep their original RPC.
-- Canonical load owns authorization/locks; canonical review RPCs own acknowledgements.
DO $migration$
DECLARE installed regprocedure:=to_regprocedure('public.delayed_five_alive_review_load(uuid,uuid,uuid)');
BEGIN
 IF md5(pg_get_functiondef('public.delayed_five_alive_load(uuid,uuid,uuid)'::regprocedure))<>'39b3f82999c239579a017d6c923c19e5' THEN RAISE EXCEPTION 'five_alive:review_load_preimage_changed'; END IF;
 IF installed IS NOT NULL THEN
  IF md5(pg_get_functiondef(installed))<>'84a22fb01af273c0de7846bcb494669f' THEN RAISE EXCEPTION 'five_alive:review_wrapper_changed'; END IF;
  RETURN;
 END IF;
 EXECUTE $definition$CREATE OR REPLACE FUNCTION public.delayed_five_alive_review_load(p_child uuid, p_actor uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE c private.delayed_children;m private.delayed_matches;result jsonb;
BEGIN
 -- Delegate authorization, expiry and canonical locks to the existing owner.
 result:=public.delayed_five_alive_load(p_child,p_actor,p_request);
 SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_child;
 SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=c.match_id;
 -- Materialize immutable review identities from mutually completed server words.
 -- Parent lock above serializes both viewers and replay; gameplay state is untouched.
 INSERT INTO private.delayed_review_events(child_id,match_id,event_key,kind,actor,round,score,completed_at,receipt)
 SELECT c.id,c.match_id,c.id||':five-alive-review:'||word_review.word_index||':'||v.actor,
  'attempt',v.actor,word_review.word_index+1,NULL,clock_timestamp(),
  jsonb_build_object('game','five-alive','rules',c.config)
 FROM generate_series(0,least(3,(c.state#>>'{fiveAlive,current}')::int)-1) word_review(word_index)
 CROSS JOIN (VALUES(m.organizer),(m.opponent)) v(actor)
 WHERE (c.state#>>ARRAY['fiveAlive','rounds','0',word_review.word_index::text,'completed'])::boolean
   AND (c.state#>>ARRAY['fiveAlive','rounds','1',word_review.word_index::text,'completed'])::boolean
 ON CONFLICT(event_key) DO NOTHING;
 RETURN result||jsonb_build_object(
  'reviewRevision',(SELECT revision FROM private.delayed_matches WHERE id=m.id),
  'wordReviews',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'round',e.round,
    'seen',EXISTS(SELECT FROM private.delayed_review_seen s WHERE s.event_id=e.id AND s.viewer=p_actor))
    ORDER BY e.round),'[]'::jsonb) FROM private.delayed_current_review_events e
    WHERE e.child_id=c.id AND e.actor<>p_actor AND e.event_key LIKE c.id||':five-alive-review:%')
 );
END $function$
$definition$;
END $migration$;
REVOKE ALL ON FUNCTION public.delayed_five_alive_review_load(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_five_alive_review_load(uuid,uuid,uuid) TO service_role;
