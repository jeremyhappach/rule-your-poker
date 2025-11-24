-- Update the profiles INSERT policy to allow bot profile creation
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile or bot profiles" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  auth.uid() = id OR username LIKE 'Bot %'
);