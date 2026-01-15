-- Add email and last_seen_at columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone;