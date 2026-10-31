-- READ-ONLY ACTIVATION GATE. Run in addition to hosted Auth/device qualification.
-- Passing algorithm tests or dormant installation does not waive these checks.
DO $$
BEGIN
 IF EXISTS(SELECT FROM (VALUES
  ('America/Vancouver','2026-11-01 05:00'),('America/Edmonton','2026-11-01 06:00'),
  ('Africa/Casablanca','2026-11-01 12:00'),('America/Winnipeg','2026-11-01 07:00'),
  ('America/Havana','2026-11-01 08:00')) golden(zone,expected)
  WHERE to_char('2026-11-01T12:00:00Z'::timestamptz AT TIME ZONE zone,'YYYY-MM-DD HH24:MI')<>expected)
 THEN RAISE EXCEPTION 'notifications:tzdata_2026f_qualification_required'; END IF;
 -- The fanout explicitly mirrors these restrictive SELECT owners. Additional or
 -- changed visibility restrictions require review before enabling this package.
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='games' AND cmd='SELECT' AND permissive='RESTRICTIVE')<>2
 OR NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='public' AND tablename='games' AND policyname='run21_release_visibility' AND qual='run21_session_visible(id)')
 OR NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='public' AND tablename='games' AND policyname='three_five_seven_conceal_games' AND qual='three_five_seven_row_visible(id, true)')
 THEN RAISE EXCEPTION 'notifications:visibility_review_required'; END IF;
END $$;
