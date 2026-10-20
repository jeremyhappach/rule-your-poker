-- Trip Flip catalog metadata; existing image paths and permissions are preserved.
SET LOCAL lock_timeout='100ms';
ALTER TABLE public.arcade_game_artwork DROP CONSTRAINT arcade_game_artwork_game_check;
ALTER TABLE public.arcade_game_artwork ADD CONSTRAINT arcade_game_artwork_game_check CHECK(game IN('run21','tri-towers','yahtzee','trip-flip'));
INSERT INTO public.arcade_game_artwork(game) VALUES('trip-flip') ON CONFLICT(game) DO NOTHING;
ALTER POLICY arcade_artwork_upload ON storage.objects
WITH CHECK (bucket_id='arcade-artwork' AND (SELECT public.is_admin(auth.uid()))
 AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active)
 AND name ~ '^(run21|tri-towers|yahtzee|trip-flip)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$');
