-- Drop the old constraint and add a new one with more allowed status values
ALTER TABLE public.rounds DROP CONSTRAINT rounds_status_check;

ALTER TABLE public.rounds ADD CONSTRAINT rounds_status_check 
CHECK (status = ANY (ARRAY['pending'::text, 'ante'::text, 'betting'::text, 'revealing'::text, 'processing'::text, 'showdown'::text, 'completed'::text]));