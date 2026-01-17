-- Add show_bridge_on_waiting column to profiles table (default true)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS show_bridge_on_waiting boolean NOT NULL DEFAULT true;