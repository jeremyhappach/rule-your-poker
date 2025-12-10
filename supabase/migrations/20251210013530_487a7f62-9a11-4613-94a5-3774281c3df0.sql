-- Change is_active default to true for new users
ALTER TABLE public.profiles ALTER COLUMN is_active SET DEFAULT true;

-- Set the two specific users as superusers by their email
UPDATE public.profiles 
SET is_superuser = true 
WHERE id IN (
  SELECT id FROM auth.users 
  WHERE email IN ('jeremyhappach@yahoo.com', 'jeremyhappach@gmail.com')
);

-- Create RLS policy for superusers to update any profile's is_active and is_superuser
CREATE POLICY "Superusers can update is_active and is_superuser"
ON public.profiles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p 
    WHERE p.id = auth.uid() AND p.is_superuser = true
  )
);