CREATE TABLE private.three_five_seven_release (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 real_money_admission_enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE private.three_five_seven_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.three_five_seven_release FROM PUBLIC,anon,authenticated;
INSERT INTO private.three_five_seven_release(singleton,real_money_admission_enabled) VALUES(true,false);

CREATE FUNCTION private.guard_three_five_seven_admission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE blocked boolean;
BEGIN
 IF NEW.game_type NOT IN ('3-5-7','3-5-7-game','357') THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='dealer_games' THEN
  SELECT real_money INTO blocked FROM public.games WHERE id=NEW.session_id;
 ELSE
  blocked:=NEW.real_money AND NEW.status IN ('ante_decision','in_progress');
  IF TG_OP='UPDATE' THEN
   blocked:=blocked AND (OLD.current_game_uuid IS DISTINCT FROM NEW.current_game_uuid
     OR OLD.game_type IS DISTINCT FROM NEW.game_type OR NOT OLD.real_money
     OR OLD.status NOT IN ('ante_decision','in_progress'));
  END IF;
 END IF;
 IF coalesce(blocked,false) AND NOT EXISTS(
  SELECT 1 FROM private.three_five_seven_release WHERE singleton AND real_money_admission_enabled
 ) THEN RAISE EXCEPTION 'three_five_seven:real_money_admission_closed' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_three_five_seven_admission() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER three_five_seven_admission BEFORE INSERT ON public.dealer_games
FOR EACH ROW EXECUTE FUNCTION private.guard_three_five_seven_admission();
CREATE TRIGGER three_five_seven_admission BEFORE INSERT OR UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION private.guard_three_five_seven_admission();
