-- Add field to store Chucky's actual cards in rounds table
ALTER TABLE public.rounds
ADD COLUMN chucky_cards jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.rounds.chucky_cards IS 'Stores Chucky''s cards for Holm game showdowns';
