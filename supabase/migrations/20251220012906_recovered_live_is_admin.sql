-- Simplify: use existing profiles.is_superuser instead of roles table

-- Create a simple helper function that checks is_superuser
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND is_superuser = true
  );
$$;

-- Update custom_game_names policies to use is_admin
DROP POLICY IF EXISTS "Admins can view custom game names" ON public.custom_game_names;
CREATE POLICY "Admins can view custom game names"
ON public.custom_game_names
FOR SELECT
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert custom game names" ON public.custom_game_names;
CREATE POLICY "Admins can insert custom game names"
ON public.custom_game_names
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update custom game names" ON public.custom_game_names;
CREATE POLICY "Admins can update custom game names"
ON public.custom_game_names
FOR UPDATE
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete custom game names" ON public.custom_game_names;
CREATE POLICY "Admins can delete custom game names"
ON public.custom_game_names
FOR DELETE
USING (public.is_admin(auth.uid()));
