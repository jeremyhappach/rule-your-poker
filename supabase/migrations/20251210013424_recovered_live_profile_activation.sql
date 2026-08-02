-- Add is_active column to profiles (default false for new users)
ALTER TABLE public.profiles 
ADD COLUMN is_active boolean NOT NULL DEFAULT false;

-- Set existing users with specific emails as active superusers
UPDATE public.profiles 
SET is_active = true, is_superuser = true 
WHERE id IN (
  SELECT id FROM auth.users 
  WHERE email IN ('jeremyhappach@yahoo.com', 'jeremyhappach@gmail.com')
);

-- Set all other existing users as active (but not superuser)
UPDATE public.profiles 
SET is_active = true 
WHERE is_active = false 
AND id NOT IN (
  SELECT id FROM auth.users 
  WHERE email IN ('jeremyhappach@yahoo.com', 'jeremyhappach@gmail.com')
);

-- Add RLS policy for superusers to update any profile (for managing active/superuser status)
CREATE POLICY "Superusers can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() AND p.is_superuser = true
  )
);
