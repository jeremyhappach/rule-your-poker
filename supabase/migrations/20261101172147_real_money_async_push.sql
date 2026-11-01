-- Enable the existing async push lifecycle in both money modes.
-- No new public API/grant, payload field, financial/gameplay owner or delivery policy.
-- Exact deployed-source guards reject drift. Reapplication is inert, including baseline seeding.
DO $migration$
DECLARE f record; source text;
BEGIN
 FOR f IN SELECT * FROM (VALUES
  ('private.push_eligible(private.push_events,private.push_subscriptions)','a5785a0fe88209117d461cdcb8c654cd','d249f8c74fef22d48fd563fe02a87191',' AND NOT m.real_money'),
  ('private.push_invited()','48aef17906b4e979c0cae213f75d16f7','95ad02846eb0fe3a31da5d54e27b03c1',' OR m.real_money'),
  ('private.push_sync(uuid)','9e4910c0c847bf7a959f07d66f02056a','282687ae2c9e7a5f0fe4e26bd1e45fd5',' AND NOT m.real_money')
 ) AS expected(signature,before_hash,after_hash,needle) LOOP
  source:=replace(pg_get_functiondef(f.signature::regprocedure),chr(13),'');
  IF md5(source) NOT IN(f.before_hash,f.after_hash) THEN
   RAISE EXCEPTION 'real_money_async_push: unexpected definition %',f.signature;
  END IF;
 END LOOP;

 IF md5(replace(pg_get_functiondef('private.push_sync(uuid)'::regprocedure),chr(13),''))='9e4910c0c847bf7a959f07d66f02056a' THEN
  -- Serialize with the parent-first lock used by push_sync. Observe current
  -- turns without emitting events: existing waiting turns must never backfill.
  PERFORM id FROM private.delayed_matches WHERE real_money AND status IN('invited','active') ORDER BY id FOR UPDATE;
  INSERT INTO private.push_episodes(match_id,user_id,keys)
   SELECT m.id,u.user_id,ARRAY(SELECT c.id::text||':'||c.segment
    FROM private.delayed_children c WHERE c.match_id=m.id AND c.actor=u.user_id
     AND NOT c.terminal AND c.expires_at>clock_timestamp()
     AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
     AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id)
    ORDER BY c.id)
   FROM private.delayed_matches m CROSS JOIN LATERAL unnest(ARRAY[m.organizer,m.opponent]) u(user_id)
   WHERE m.real_money AND m.status='active'
   ON CONFLICT(match_id,user_id) DO UPDATE SET keys=EXCLUDED.keys;
 END IF;

 FOR f IN SELECT * FROM (VALUES
  ('private.push_eligible(private.push_events,private.push_subscriptions)','a5785a0fe88209117d461cdcb8c654cd','d249f8c74fef22d48fd563fe02a87191',' AND NOT m.real_money'),
  ('private.push_invited()','48aef17906b4e979c0cae213f75d16f7','95ad02846eb0fe3a31da5d54e27b03c1',' OR m.real_money'),
  ('private.push_sync(uuid)','9e4910c0c847bf7a959f07d66f02056a','282687ae2c9e7a5f0fe4e26bd1e45fd5',' AND NOT m.real_money')
 ) AS expected(signature,before_hash,after_hash,needle) LOOP
  source:=replace(pg_get_functiondef(f.signature::regprocedure),chr(13),'');
  IF md5(source)=f.before_hash THEN EXECUTE replace(source,f.needle,''); END IF;
  IF md5(replace(pg_get_functiondef(f.signature::regprocedure),chr(13),''))<>f.after_hash THEN
   RAISE EXCEPTION 'real_money_async_push: incorrect installed definition %',f.signature;
  END IF;
 END LOOP;
END $migration$;
