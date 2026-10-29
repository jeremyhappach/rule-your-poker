-- Controlled hosted qualification only: temporarily closes ordinary admission.
-- Requires the deployed worker, an owned publication window and guarded cleanup.
-- Never run unattended; retain returned fixture IDs for cleanup after one tick.
BEGIN; SET LOCAL lock_timeout='3s';
DO $$ DECLARE a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();m uuid:=gen_random_uuid();c uuid:=gen_random_uuid();
cfg jsonb:=private.quintzee_default_rules();board_i jsonb;s jsonb;at_i timestamptz:=date_trunc('milliseconds',clock_timestamp())-interval '1 hour';ms bigint;
BEGIN
IF NOT EXISTS(SELECT FROM private.delayed_release WHERE admission_enabled) OR EXISTS(SELECT FROM private.delayed_recovery_state WHERE enabled OR token IS NOT NULL) THEN RAISE EXCEPTION 'worker proof gate precondition';END IF;
UPDATE private.delayed_release SET admission_enabled=false;
INSERT INTO auth.users(id)VALUES(a),(b);
INSERT INTO public.profiles(id,username,is_active)VALUES(a,'Async worker proof A '||a,false),(b,'Async worker proof B '||b,false)
ON CONFLICT(id)DO UPDATE SET username=EXCLUDED.username,is_active=false;
INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,status,offer,offer_hash,accepted_at)
VALUES(m,a,b,false,'active',jsonb_build_array(jsonb_build_object('game','quintzee','stake',1,'config',cfg)),'worker-proof',at_i);
ms:=floor(extract(epoch FROM at_i)*1000)::bigint;
board_i:=public.delayed_board_core('quintzee','deal',cfg,0,NULL,NULL,NULL,ms);
s:=jsonb_build_object('version','delayed/1','game','quintzee','child',c,'players',jsonb_build_array(a,b),'round',1,'turn',0,'totals',jsonb_build_object(a,0,b,0),'attempts','[]'::jsonb,'board',board_i,'deck',NULL,'completed',false,'winner',NULL,'segmentStartedAt',ms);
INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,starter,actor,segment,revision,available_at,last_call_at,expires_at,started_at,gameplay_due_at,state)
VALUES(c,m,1,'quintzee',1,cfg,a,a,1,1,at_i,at_i+interval '24 hours',at_i+interval '36 hours',at_i,to_timestamp((board_i->>'deadline')::bigint/1000.0),s);
UPDATE private.delayed_recovery_state SET enabled=true;
END $$;
COMMIT;
SELECT m.id match_id,c.id child_id,m.organizer,m.opponent,c.revision,c.segment,c.gameplay_due_at FROM private.delayed_matches m JOIN private.delayed_children c ON c.match_id=m.id WHERE m.offer_hash='worker-proof';
