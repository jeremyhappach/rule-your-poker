-- Roles (admin) + Custom Game Names

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END$$;

-- User roles table (do NOT store roles on profiles)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;

-- user_roles policies
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Backfill admin roles from legacy profiles.is_superuser
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM public.profiles
WHERE is_superuser = true
ON CONFLICT (user_id, role) DO NOTHING;

-- Custom game names (admin-managed)
CREATE TABLE IF NOT EXISTS public.custom_game_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

ALTER TABLE public.custom_game_names ENABLE ROW LEVEL SECURITY;

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS handle_updated_at_custom_game_names ON public.custom_game_names;
CREATE TRIGGER handle_updated_at_custom_game_names
BEFORE UPDATE ON public.custom_game_names
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- custom_game_names policies (admin only)
DROP POLICY IF EXISTS "Admins can view custom game names" ON public.custom_game_names;
CREATE POLICY "Admins can view custom game names"
ON public.custom_game_names
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert custom game names" ON public.custom_game_names;
CREATE POLICY "Admins can insert custom game names"
ON public.custom_game_names
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update custom game names" ON public.custom_game_names;
CREATE POLICY "Admins can update custom game names"
ON public.custom_game_names
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete custom game names" ON public.custom_game_names;
CREATE POLICY "Admins can delete custom game names"
ON public.custom_game_names
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Seed with the current built-in custom names so admins can edit them in-app
WITH seed(name) AS (
  SELECT unnest(ARRAY[
    'Half Loin w/ PJ Chz',
    'Pork Chop Sammy',
    'Ched Nugs',
    'Mini Tacos',
    'Cheese FF',
    'Sampler',
    'Potato Skins',
    'Egg Roll',
    'Ribeye Sammy',
    'SW Ranch',
    'Peoria Stadium',
    'Par-a-Dice',
    'War Drive',
    'Farm Rd',
    'Duck''s Place',
    'Gondola Deluxe',
    'Grandview Hotel',
    'Short Change',
    'Generations',
    'Blue Magoo',
    'King Orange',
    'Agatucci''s',
    'Lou''s Drive In',
    'Sheridan Village',
    'Lakeview Museum',
    'Grandview Motel',
    'SOPs',
    'Sullivan''s',
    'Nick''s Place',
    'Grand Prarie',
    'Main St.',
    'Big Al''s',
    'Columbia Terrace',
    'Casey''s'
  ]::text[])
)
INSERT INTO public.custom_game_names (name)
SELECT name
FROM seed
ON CONFLICT (name) DO NOTHING;

-- Update existing "superuser" policies to use roles

-- players: admin delete any
DROP POLICY IF EXISTS "Superusers can delete any players" ON public.players;
CREATE POLICY "Admins can delete any players"
ON public.players
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- profiles: admin management policies
DROP POLICY IF EXISTS "Superusers can delete any profiles" ON public.profiles;
CREATE POLICY "Admins can delete any profiles"
ON public.profiles
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Superusers can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Superusers can update is_active and is_superuser" ON public.profiles;
CREATE POLICY "Admins can update profiles"
ON public.profiles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- game_defaults: admin insert/update
DROP POLICY IF EXISTS "Superusers can insert game defaults" ON public.game_defaults;
CREATE POLICY "Admins can insert game defaults"
ON public.game_defaults
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Superusers can update game defaults" ON public.game_defaults;
CREATE POLICY "Admins can update game defaults"
ON public.game_defaults
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
