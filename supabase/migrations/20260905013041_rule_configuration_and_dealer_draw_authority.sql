-- Configuration and dealer draws are committed by their validated commands.
-- Lifecycle and participant closure are delivered in the following work packages.
CREATE FUNCTION private.guard_browser_rule_configuration() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND (
   OLD.buy_in IS DISTINCT FROM NEW.buy_in
   OR    OLD.ante_amount IS DISTINCT FROM NEW.ante_amount
   OR    OLD.rollover_amount IS DISTINCT FROM NEW.rollover_amount
   OR    OLD.pussy_tax IS DISTINCT FROM NEW.pussy_tax
   OR    OLD.leg_value IS DISTINCT FROM NEW.leg_value
   OR    OLD.pussy_tax_enabled IS DISTINCT FROM NEW.pussy_tax_enabled
   OR    OLD.pussy_tax_value IS DISTINCT FROM NEW.pussy_tax_value
   OR    OLD.legs_to_win IS DISTINCT FROM NEW.legs_to_win
   OR    OLD.pot_max_enabled IS DISTINCT FROM NEW.pot_max_enabled
   OR    OLD.pot_max_value IS DISTINCT FROM NEW.pot_max_value
   OR    OLD.chucky_cards IS DISTINCT FROM NEW.chucky_cards
   OR    OLD.rabbit_hunt IS DISTINCT FROM NEW.rabbit_hunt
   OR    OLD.reveal_at_showdown IS DISTINCT FROM NEW.reveal_at_showdown
   OR    OLD.points_to_win IS DISTINCT FROM NEW.points_to_win
   OR    OLD.skunk_enabled IS DISTINCT FROM NEW.skunk_enabled
   OR    OLD.skunk_threshold IS DISTINCT FROM NEW.skunk_threshold
   OR    OLD.double_skunk_enabled IS DISTINCT FROM NEW.double_skunk_enabled
   OR    OLD.double_skunk_threshold IS DISTINCT FROM NEW.double_skunk_threshold
   OR    OLD.timeout_enforcement_enabled IS DISTINCT FROM NEW.timeout_enforcement_enabled
   OR    OLD.timeout_action IS DISTINCT FROM NEW.timeout_action
   OR    OLD.game_setup_timer_seconds IS DISTINCT FROM NEW.game_setup_timer_seconds
   OR    OLD.ante_decision_timer_seconds IS DISTINCT FROM NEW.ante_decision_timer_seconds
   OR    OLD.dealer_selection_state IS DISTINCT FROM NEW.dealer_selection_state
 ) THEN
  RAISE EXCEPTION 'rule_configuration:authoritative_command_required' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_browser_rule_configuration BEFORE UPDATE ON public.games
FOR EACH ROW EXECUTE FUNCTION private.guard_browser_rule_configuration();
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.dealer_games FROM PUBLIC,anon,authenticated;
NOTIFY pgrst, 'reload schema';
