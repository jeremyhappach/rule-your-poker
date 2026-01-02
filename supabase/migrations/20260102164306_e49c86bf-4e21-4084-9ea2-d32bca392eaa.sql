-- Create player_transactions table for accounting
CREATE TABLE public.player_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('SessionResult', 'Deposit', 'Payout')),
  amount NUMERIC(10, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster balance lookups
CREATE INDEX idx_player_transactions_profile_id ON public.player_transactions(profile_id);
CREATE INDEX idx_player_transactions_date ON public.player_transactions(date DESC);

-- Enable Row Level Security
ALTER TABLE public.player_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
CREATE POLICY "Users can view own transactions"
ON public.player_transactions
FOR SELECT
USING (profile_id = auth.uid());

-- Admins can view all transactions
CREATE POLICY "Admins can view all transactions"
ON public.player_transactions
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Admins can insert manual transactions (Deposit, Payout)
CREATE POLICY "Admins can insert transactions"
ON public.player_transactions
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Allow system inserts for SessionResult (via security definer function)
-- We'll create a function to handle auto-inserts when games complete

-- Create function to insert session results when a real money game completes
CREATE OR REPLACE FUNCTION public.record_session_results()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snapshot RECORD;
  game_name TEXT;
BEGIN
  -- Only trigger when status changes to 'completed' and it's a real money game
  IF NEW.status = 'completed' 
     AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.real_money = true THEN
    
    -- Get the game name
    game_name := COALESCE(NEW.name, 'Unnamed Session');
    
    -- Insert a transaction for each player snapshot from this session
    FOR snapshot IN 
      SELECT DISTINCT ON (user_id) user_id, chips, username
      FROM public.session_player_snapshots
      WHERE game_id = NEW.id
      ORDER BY user_id, hand_number DESC
    LOOP
      -- Only insert for non-bot players (user_id should be a real profile)
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = snapshot.user_id) THEN
        INSERT INTO public.player_transactions (profile_id, transaction_type, amount, notes)
        VALUES (snapshot.user_id, 'SessionResult', snapshot.chips, game_name);
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-insert session results
CREATE TRIGGER on_game_completed_record_results
  AFTER UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.record_session_results();

-- Enable realtime for player_transactions (optional, for future use)
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_transactions;