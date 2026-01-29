-- Backfill game_results rows where dealer_game_id is NULL and game_type contains a UUID
-- This fixes a historical bug where recordGameResult arguments were swapped or dealer_game_id was missing

-- Step 1: Fix rows where game_type is a UUID (was incorrectly passed as game_type instead of dealer_game_id)
UPDATE public.game_results
SET 
  dealer_game_id = game_type::uuid,
  game_type = (
    SELECT dg.game_type 
    FROM public.dealer_games dg 
    WHERE dg.id = game_results.game_type::uuid
    LIMIT 1
  )
WHERE dealer_game_id IS NULL
  AND game_type IS NOT NULL
  AND game_type ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM public.dealer_games dg WHERE dg.id = game_results.game_type::uuid
  );

-- Step 2: For rows still missing dealer_game_id, try to infer it from the dealer_games table
-- by matching the session (game_id) and checking if there's a dealer_game that contains this time window
UPDATE public.game_results gr
SET dealer_game_id = (
  SELECT dg.id
  FROM public.dealer_games dg
  WHERE dg.session_id = gr.game_id
    AND gr.created_at >= dg.started_at
    AND gr.created_at < COALESCE(
      (SELECT dg2.started_at FROM public.dealer_games dg2 
       WHERE dg2.session_id = dg.session_id 
       AND dg2.started_at > dg.started_at 
       ORDER BY dg2.started_at ASC LIMIT 1),
      dg.started_at + interval '4 hours'
    )
  ORDER BY dg.started_at DESC
  LIMIT 1
)
WHERE gr.dealer_game_id IS NULL
  AND gr.game_type IS NOT NULL
  AND gr.game_type NOT LIKE '%-%-%-%-%';  -- Not a UUID pattern