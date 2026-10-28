-- Recoverable creator-only removal. Never delete child/history/financial rows.
CREATE TABLE private.delayed_removals (
 match_id uuid PRIMARY KEY REFERENCES private.delayed_matches(id),
 actor uuid NOT NULL REFERENCES public.profiles(id),request_id uuid NOT NULL,
 prior_status text NOT NULL,removed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.delayed_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.delayed_removals FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER delayed_removals_immutable BEFORE UPDATE OR DELETE ON private.delayed_removals
 FOR EACH ROW EXECUTE FUNCTION private.delayed_immutable();

CREATE FUNCTION public.delayed_remove(p_match uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=auth.uid();m private.delayed_matches;r private.delayed_requests;
 fingerprint jsonb:=jsonb_build_object('op','remove','match',p_match);answer jsonb;at_time timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(731907241);
 PERFORM private.delayed_actor(who);
 IF p_request IS NULL THEN RAISE EXCEPTION 'delayed:request_required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(who::text||p_request::text,317));
 SELECT * INTO m FROM private.delayed_matches WHERE id=p_match FOR UPDATE;
 IF NOT FOUND OR m.organizer IS DISTINCT FROM who OR m.real_money IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'delayed:remove_denied' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM private.delayed_requests WHERE actor=who AND request_id=p_request;
 IF FOUND THEN
  IF r.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict';END IF;
  RETURN r.response;
 END IF;
 SELECT removed_at INTO at_time FROM private.delayed_removals WHERE match_id=m.id;
 IF NOT FOUND THEN
  INSERT INTO private.delayed_removals(match_id,actor,request_id,prior_status)
   VALUES(m.id,who,p_request,m.status) RETURNING removed_at INTO at_time;
  -- A settled match retains its canonical receipt/status; no reversal or new payout.
  UPDATE private.delayed_matches SET status=CASE WHEN status IN('invited','active') THEN 'cancelled' ELSE status END,
   revision=revision+1 WHERE id=m.id;
  UPDATE public.platform_notifications SET actionable=false,read_revision=revision+1,
   revision=revision+1,updated_at=at_time,payload=payload||jsonb_build_object('removed',true)
   WHERE match_id=m.id;
 END IF;
 answer:=jsonb_build_object('id',m.id,'removedAt',at_time);
 INSERT INTO private.delayed_requests VALUES(who,p_request,fingerprint,m.id,answer);
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.delayed_remove(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.delayed_remove(uuid,uuid) TO authenticated;

-- Patch only the existing projections/notification owner, with exact anchors.
DO $$ DECLARE source_i text;old_i text;new_i text;signature_i text;BEGIN
 FOR signature_i,old_i,new_i IN SELECT * FROM (VALUES
 ('public.delayed_list(timestamp with time zone,uuid)',
  'WHERE auth.uid() IN(organizer,opponent)',
  'WHERE NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=delayed_matches.id) AND auth.uid() IN(organizer,opponent)'),
 ('public.delayed_home(uuid)',
  '''serverAt'',floor(extract(epoch FROM clock_timestamp())*1000)',
  '''removedAt'',(SELECT removed_at FROM private.delayed_removals WHERE match_id=m.id),''serverAt'',floor(extract(epoch FROM clock_timestamp())*1000)'),
 ('private.delayed_words_view(uuid,uuid)',
  'IF viewer IS NULL OR viewer NOT IN(m.organizer,m.opponent)',
  'IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) OR viewer IS NULL OR viewer NOT IN(m.organizer,m.opponent)'),
 ('private.delayed_notify(uuid)',
  'FOREACH recipient IN ARRAY ARRAY[m.organizer,m.opponent] LOOP',
  'IF EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RETURN;END IF; FOREACH recipient IN ARRAY ARRAY[m.organizer,m.opponent] LOOP')
 ) p(signature_i,old_i,new_i) LOOP
  source_i:=pg_get_functiondef(signature_i::regprocedure);
  IF (length(source_i)-length(replace(source_i,old_i,'')))/length(old_i)<>1 THEN RAISE EXCEPTION 'delayed:removal_source_changed %',signature_i;END IF;
  EXECUTE replace(source_i,old_i,new_i);
 END LOOP;
 source_i:=pg_get_functiondef('public.platform_notification_center()'::regprocedure);
 old_i:='WHERE user_id=auth.uid()';
 IF (length(source_i)-length(replace(source_i,old_i,'')))/length(old_i)<>2 THEN RAISE EXCEPTION 'delayed:notification_source_changed';END IF;
 EXECUTE replace(source_i,old_i,'WHERE NOT EXISTS(SELECT FROM private.delayed_removals r WHERE r.match_id=platform_notifications.match_id) AND user_id=auth.uid()');
END $$;
