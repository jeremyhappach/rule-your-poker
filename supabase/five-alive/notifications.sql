-- Existing delayed notification and recovery owners remain authoritative.
CREATE FUNCTION private.five_alive_or_actor(c private.delayed_children,p_actor uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE game jsonb;round_i integer;idx integer;
BEGIN
 IF c.terminal OR p_actor IS NULL THEN RETURN false;END IF;
 IF c.game_type<>'five-alive' THEN RETURN c.actor=p_actor;END IF;
 game:=c.state->'fiveAlive';round_i:=(game->>'current')::integer;
 IF round_i IS NULL OR round_i NOT BETWEEN 0 AND 2 THEN RETURN false;END IF;
 idx:=CASE WHEN game->'players'->>0=p_actor::text THEN 0 WHEN game->'players'->>1=p_actor::text THEN 1 ELSE NULL END;
 IF idx IS NULL THEN RETURN false;END IF;
 RETURN coalesce((game->'rounds'->idx->round_i->>'completed')::boolean=false,false);
END $$;
REVOKE ALL ON FUNCTION private.five_alive_or_actor(private.delayed_children,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $$
DECLARE src text;old_i text;new_i text;signature text;
BEGIN
 signature:='private.delayed_notify_before_reviews(uuid)';
 src:=pg_get_functiondef(signature::regprocedure);
 old_i:='AND NOT terminal AND actor=recipient';
 new_i:='AND NOT terminal AND private.five_alive_or_actor(delayed_children,recipient)';
 IF strpos(src,new_i)=0 THEN
  IF strpos(src,old_i)=0 OR strpos(substr(src,strpos(src,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:turn_notification_preimage_changed';END IF;
  EXECUTE replace(src,old_i,new_i);
 END IF;

 signature:='private.delayed_notify(uuid)';src:=pg_get_functiondef(signature::regprocedure);
 old_i:='match_id=parent AND actor=who AND NOT terminal';
 new_i:='match_id=parent AND private.five_alive_or_actor(delayed_children,who) AND NOT terminal';
 IF strpos(src,new_i)=0 THEN
  IF strpos(src,old_i)=0 OR strpos(substr(src,strpos(src,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:review_notification_preimage_changed';END IF;
  src:=replace(src,old_i,new_i);
 END IF;
 old_i:='match_id=parent AND actor=m.organizer AND NOT terminal';
 new_i:='match_id=parent AND private.five_alive_or_actor(delayed_children,m.organizer) AND NOT terminal';
 IF strpos(src,new_i)=0 THEN
  IF strpos(src,old_i)=0 OR strpos(substr(src,strpos(src,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:accepted_notification_preimage_changed';END IF;
  src:=replace(src,old_i,new_i);
 END IF;
 EXECUTE src;

 signature:='private.delayed_words_recover_local()';src:=pg_get_functiondef(signature::regprocedure);
 old_i:='n.user_id=work_child.actor';
 new_i:='private.five_alive_or_actor(work_child,n.user_id)';
 IF strpos(src,new_i)=0 THEN
  IF strpos(src,old_i)=0 OR strpos(substr(src,strpos(src,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:last_call_preimage_changed';END IF;
  src:=replace(src,old_i,new_i);
 END IF;
 old_i:=$old$IF c.game_type='ptown-words' AND private.delayed_expire$old$;
 new_i:=$new$IF c.game_type IN('ptown-words','five-alive') AND private.delayed_expire$new$;
 IF strpos(src,new_i)=0 THEN
  IF strpos(src,old_i)=0 OR strpos(substr(src,strpos(src,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:recovery_preimage_changed';END IF;
  src:=replace(src,old_i,new_i);
 END IF;
 EXECUTE src;

 signature:='public.delayed_home(uuid)';src:=pg_get_functiondef(signature::regprocedure);
 old_i:=$old$IF c.game_type IN('chess','ptown-words') THEN scores:=c.state->'scores';$old$;
 new_i:=$new$IF c.game_type IN('chess','ptown-words') THEN scores:=c.state->'scores';
  ELSIF c.game_type='five-alive' THEN
   IF c.state->'fiveAlive' IS NOT NULL THEN
    scores:=jsonb_build_object(c.state#>>'{fiveAlive,players,0}',c.state#>'{fiveAlive,sharedScores,0}',c.state#>>'{fiveAlive,players,1}',c.state#>'{fiveAlive,sharedScores,1}');
   END IF;$new$;
 IF strpos(src,$needle$c.state#>'{fiveAlive,sharedScores,0}'$needle$)=0 THEN
  IF strpos(src,old_i)=0 OR strpos(substr(src,strpos(src,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:home_scores_preimage_changed';END IF;
  src:=replace(src,old_i,new_i);
 END IF;
 old_i:=$old$item||jsonb_build_object('scores',scores$old$;
 new_i:=$new$item||CASE WHEN c.game_type='five-alive' THEN jsonb_build_object('playable',h->>'status'='active' AND NOT (h->>'held')::boolean AND c.expires_at>statement_timestamp() AND private.five_alive_or_actor(c,who),'opponentPlayable',h->>'status'='active' AND NOT (h->>'held')::boolean AND c.expires_at>statement_timestamp() AND private.five_alive_or_actor(c,CASE WHEN who=m.organizer THEN m.opponent ELSE m.organizer END)) ELSE '{}'::jsonb END||jsonb_build_object('scores',scores$new$;
 -- delayed_home has no match row variable; its parent projection supplies IDs.
 new_i:=replace(new_i,'who=m.organizer THEN m.opponent ELSE m.organizer','who::text=(h->>''organizer'') THEN (h->>''opponent'')::uuid ELSE (h->>''organizer'')::uuid');
 IF strpos(src,$needle$'opponentPlayable',private.five_alive_or_actor$needle$)=0 THEN
  IF strpos(src,old_i)=0 OR strpos(substr(src,strpos(src,old_i)+length(old_i)),old_i)>0 THEN RAISE EXCEPTION 'five_alive:home_preimage_changed';END IF;
  src:=replace(src,old_i,new_i);
 END IF;
 EXECUTE src;
END $$;
