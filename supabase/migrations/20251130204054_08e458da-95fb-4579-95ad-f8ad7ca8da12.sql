-- Add Holm game configuration fields to games table
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS buck_position integer,
ADD COLUMN IF NOT EXISTS chucky_cards integer DEFAULT 4;

-- Add community cards to rounds table
ALTER TABLE public.rounds 
ADD COLUMN IF NOT EXISTS community_cards jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS community_cards_revealed integer DEFAULT 0;

-- Add column to track if player is playing against Chucky
ALTER TABLE public.rounds
ADD COLUMN IF NOT EXISTS chucky_active boolean DEFAULT false;