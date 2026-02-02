-- Create cribbage_events table for tracking all scoring events
CREATE TABLE public.cribbage_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  dealer_game_id uuid REFERENCES public.dealer_games(id) ON DELETE CASCADE,
  hand_number integer NOT NULL DEFAULT 1,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'pegging', 'hand_scoring', 'crib_scoring', 'his_heels', 'go'
  event_subtype text, -- '15', 'pair', 'run_3', 'flush', 'nobs', '31', 'last_card', etc.
  card_played jsonb, -- The card just played (for pegging events)
  cards_involved jsonb NOT NULL DEFAULT '[]'::jsonb, -- Cards forming the combo
  cards_on_table jsonb DEFAULT '[]'::jsonb, -- All played cards at moment (for pegging)
  running_count integer, -- Pegging count when played
  points integer NOT NULL DEFAULT 0, -- Points earned (can be 0)
  scores_after jsonb NOT NULL DEFAULT '{}'::jsonb, -- { "player_id": score, ... }
  sequence_number integer NOT NULL DEFAULT 0, -- Ordering within hand
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for efficient querying by round and dealer_game
CREATE INDEX idx_cribbage_events_round_id ON public.cribbage_events(round_id);
CREATE INDEX idx_cribbage_events_dealer_game_id ON public.cribbage_events(dealer_game_id);
CREATE INDEX idx_cribbage_events_hand_number ON public.cribbage_events(dealer_game_id, hand_number);

-- Enable RLS
ALTER TABLE public.cribbage_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for fire-and-forget inserts and read access
CREATE POLICY "Anyone can insert cribbage events"
ON public.cribbage_events
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can view cribbage events"
ON public.cribbage_events
FOR SELECT
USING (true);

-- Add to insert audit log trigger (following existing pattern)
CREATE OR REPLACE FUNCTION public.audit_cribbage_events_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.insert_audit_log (table_name, record_id, success, metadata)
  VALUES ('cribbage_events', NEW.id, true, jsonb_build_object(
    'event_type', NEW.event_type,
    'points', NEW.points,
    'hand_number', NEW.hand_number
  ));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.insert_audit_log (table_name, record_id, success, error_message)
  VALUES ('cribbage_events', COALESCE(NEW.id, gen_random_uuid()), false, SQLERRM);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_cribbage_events_insert_trigger
AFTER INSERT ON public.cribbage_events
FOR EACH ROW
EXECUTE FUNCTION public.audit_cribbage_events_insert();