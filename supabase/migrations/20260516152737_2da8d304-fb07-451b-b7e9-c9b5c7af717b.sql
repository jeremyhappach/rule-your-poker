-- ============================================================================
-- P0 LIVE RESTORE: Cribbage game ccc1192c (dealer_game 871bb653)
-- ============================================================================
-- Authoritative pre-corruption snapshot located in:
--   round 093879f2 (hand 12, round_number=1, phase=pegging, 2 cards played)
--
-- Corruption events to undo:
--   - round d833d2b3 (hand 12, round_number=2) created at 15:17:34
--   - round 7b2172b9 (hand 12, round_number=3) created at 15:18:57
--   - round 72865116 (hand 13, round_number=1) created at 15:23:37
--   - game_result 573c7494 (hand 13, -15/-15 to both players)
--   - players.status set to 'folded' during spurious hand
--
-- All edits are scoped tightly by id. No other game touched.
-- ============================================================================

BEGIN;

-- 1) Refund the -15/-15 deducted by the spurious hand-13 result.
UPDATE public.players SET chips = chips + 15, status = 'active'
WHERE id IN (
  '38ae4fcf-13c0-4c2a-8f3f-501091f67f2f',
  'bedef661-0a74-4392-855b-389f91151d18'
);

-- 2) Remove the spurious game_results row.
DELETE FROM public.game_results WHERE id = '573c7494-61da-49ec-a8a8-b317f7b1425a';

-- 3) Remove player_cards rows tied to the corrupted rounds (FK-style cleanup).
DELETE FROM public.player_cards
WHERE round_id IN (
  'd833d2b3-bfbd-47e1-986e-5d3445f0b095',
  '7b2172b9-ac6f-4f84-8fb0-6b49f4dbe1a9',
  '72865116-d7a8-45d9-9aa5-9181b676882c'
);

-- 4) Remove the corrupted rounds themselves.
DELETE FROM public.rounds
WHERE id IN (
  'd833d2b3-bfbd-47e1-986e-5d3445f0b095',  -- hand 12 round_number=2
  '7b2172b9-ac6f-4f84-8fb0-6b49f4dbe1a9',  -- hand 12 round_number=3
  '72865116-d7a8-45d9-9aa5-9181b676882c'   -- hand 13 round_number=1
);

-- 5) Reset round 093879f2 (authoritative pre-corruption snapshot) status back to 'betting'.
--    cribbage_state JSON already holds phase=pegging with 2 cards played — leave it intact.
UPDATE public.rounds
SET status = 'betting'
WHERE id = '093879f2-3dca-4219-a287-7a25f49fb67a';

-- 6) Reset the game record back to hand 12, clear all next-round flags. Leave is_paused=true
--    so the two players can resume manually when both are present.
UPDATE public.games
SET total_hands = 12,
    current_round = 1,
    status = 'in_progress',
    awaiting_next_round = false,
    next_round_number = null,
    last_round_result = null,
    all_decisions_in = false
WHERE id = 'ccc1192c-2ddc-4ad1-870a-1717d38c0e3b';

COMMIT;
