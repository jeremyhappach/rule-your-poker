-- Create insert audit table
CREATE TABLE public.insert_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  operation text NOT NULL DEFAULT 'INSERT',
  success boolean NOT NULL DEFAULT true,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.insert_audit_log ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (triggers run as table owner)
CREATE POLICY "Anyone can insert audit logs"
  ON public.insert_audit_log FOR INSERT
  WITH CHECK (true);

-- Allow anyone to read audit logs
CREATE POLICY "Anyone can read audit logs"
  ON public.insert_audit_log FOR SELECT
  USING (true);

-- Trigger function for rounds table
CREATE OR REPLACE FUNCTION public.audit_rounds_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.insert_audit_log (table_name, record_id, metadata)
  VALUES (
    'rounds',
    NEW.id,
    jsonb_build_object(
      'game_id', NEW.game_id,
      'dealer_game_id', NEW.dealer_game_id,
      'hand_number', NEW.hand_number,
      'round_number', NEW.round_number,
      'status', NEW.status
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log failure but don't block the insert
  INSERT INTO public.insert_audit_log (table_name, record_id, success, error_message)
  VALUES ('rounds', COALESCE(NEW.id, gen_random_uuid()), false, SQLERRM);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger function for game_results table
CREATE OR REPLACE FUNCTION public.audit_game_results_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.insert_audit_log (table_name, record_id, metadata)
  VALUES (
    'game_results',
    NEW.id,
    jsonb_build_object(
      'game_id', NEW.game_id,
      'dealer_game_id', NEW.dealer_game_id,
      'hand_number', NEW.hand_number,
      'winner_player_id', NEW.winner_player_id,
      'pot_won', NEW.pot_won,
      'is_chopped', NEW.is_chopped,
      'game_type', NEW.game_type
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.insert_audit_log (table_name, record_id, success, error_message)
  VALUES ('game_results', COALESCE(NEW.id, gen_random_uuid()), false, SQLERRM);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger function for player_cards table
CREATE OR REPLACE FUNCTION public.audit_player_cards_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.insert_audit_log (table_name, record_id, metadata)
  VALUES (
    'player_cards',
    NEW.id,
    jsonb_build_object(
      'player_id', NEW.player_id,
      'round_id', NEW.round_id,
      'cards_count', jsonb_array_length(COALESCE(NEW.cards, '[]'::jsonb))
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.insert_audit_log (table_name, record_id, success, error_message)
  VALUES ('player_cards', COALESCE(NEW.id, gen_random_uuid()), false, SQLERRM);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers
CREATE TRIGGER audit_rounds_insert_trigger
  AFTER INSERT ON public.rounds
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_rounds_insert();

CREATE TRIGGER audit_game_results_insert_trigger
  AFTER INSERT ON public.game_results
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_game_results_insert();

CREATE TRIGGER audit_player_cards_insert_trigger
  AFTER INSERT ON public.player_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_player_cards_insert();

-- Add index for quick lookups
CREATE INDEX idx_insert_audit_log_table_created 
  ON public.insert_audit_log (table_name, created_at DESC);

CREATE INDEX idx_insert_audit_log_success 
  ON public.insert_audit_log (success) WHERE success = false;