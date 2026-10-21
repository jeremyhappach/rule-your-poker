-- Add Battle 31 to the inspected released authority; never replace other games' bodies.
-- Baseline: bb1ec308 (Race Poker v2 and 11 Up bots/Ready). Strict preimages also
-- protect standalone local installation; release.sql guards the complete package.
DO $battle31_registration$
DECLARE f record; original text; updated text;
BEGIN
 FOR f IN SELECT * FROM (VALUES
  ('private.megatouch_begin(uuid,uuid)','b472381c64aad306d7a7359a8ccc2248'),
  ('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)','f3582431c00322facc1daaa81c20b682'),
  ('private.megatouch_frozen_stake()','b42707fd97a6547a849a801190da8ac1')
 ) expected(signature,hash) LOOP
  original:=replace(pg_get_functiondef(to_regprocedure(f.signature)),chr(13)||chr(10),chr(10));
  IF md5(original) IS DISTINCT FROM f.hash THEN RAISE EXCEPTION 'battle31:registration_owner_drift:%',f.signature;END IF;
  updated:=replace(original,',''race-poker'')',',''race-poker'',''battle-31'')');
  IF f.signature='private.megatouch_begin(uuid,uuid)' THEN
   updated:=replace(updated,$before$  IF g.game_type='race-poker' THEN$before$,$after$  IF g.game_type='battle-31' THEN
   IF NOT EXISTS(SELECT 1 FROM private.battle31_release WHERE singleton AND enabled AND CASE WHEN g.real_money THEN real_qualified ELSE fake_qualified END) THEN RAISE EXCEPTION 'battle31:admission_closed';END IF;
   s:=private.battle31_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
   INSERT INTO private.battle31_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);
  ELSIF g.game_type='race-poker' THEN$after$);
  END IF;
  IF updated=original THEN RAISE EXCEPTION 'battle31:registration_patch_missing:%',f.signature;END IF;
  EXECUTE updated;
 END LOOP;
END $battle31_registration$;
