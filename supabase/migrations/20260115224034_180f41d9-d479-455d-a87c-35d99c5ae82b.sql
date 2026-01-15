-- Update the handle_new_user function to include email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'Player_' || substring(NEW.id::text from 1 for 8)),
    NEW.email
  );
  RETURN NEW;
END;
$function$;

-- Backfill existing profiles with emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL;