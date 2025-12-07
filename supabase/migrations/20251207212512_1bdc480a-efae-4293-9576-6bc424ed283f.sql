-- Allow superusers to delete any players
CREATE POLICY "Superusers can delete any players" 
ON public.players 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_superuser = true
  )
);

-- Allow superusers to delete any profiles (for cleaning up bot profiles)
CREATE POLICY "Superusers can delete any profiles" 
ON public.profiles 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.is_superuser = true
  )
);