-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create games table
CREATE TABLE public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed')),
  current_round INTEGER DEFAULT 0 CHECK (current_round >= 0 AND current_round <= 3),
  pot INTEGER DEFAULT 0 CHECK (pot >= 0),
  buy_in INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view games"
  ON public.games FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create games"
  ON public.games FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update games"
  ON public.games FOR UPDATE
  USING (true);

-- Create players table
CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chips INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL CHECK (position >= 1 AND position <= 4),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'folded', 'eliminated')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(game_id, user_id),
  UNIQUE(game_id, position)
);

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view players"
  ON public.players FOR SELECT
  USING (true);

CREATE POLICY "Users can insert themselves as players"
  ON public.players FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can update players"
  ON public.players FOR UPDATE
  USING (true);

-- Create rounds table
CREATE TABLE public.rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number IN (1, 2, 3)),
  pot INTEGER DEFAULT 0 CHECK (pot >= 0),
  cards_dealt INTEGER NOT NULL CHECK (cards_dealt IN (3, 5, 7)),
  status TEXT NOT NULL DEFAULT 'betting' CHECK (status IN ('betting', 'revealing', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(game_id, round_number)
);

ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rounds"
  ON public.rounds FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create rounds"
  ON public.rounds FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update rounds"
  ON public.rounds FOR UPDATE
  USING (true);

-- Create player actions table
CREATE TABLE public.player_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('stay', 'fold')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(round_id, player_id)
);

ALTER TABLE public.player_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view actions"
  ON public.player_actions FOR SELECT
  USING (true);

CREATE POLICY "Players can insert own actions"
  ON public.player_actions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.players
    WHERE players.id = player_id AND players.user_id = auth.uid()
  ));

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for games table
CREATE TRIGGER set_games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'Player_' || substring(NEW.id::text from 1 for 8))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_actions;