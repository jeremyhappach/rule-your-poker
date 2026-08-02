
DELETE FROM chip_stack_emoticons WHERE game_id = '31deb029-264d-4c6d-af9f-a2e711f2fdd8';
DELETE FROM chat_messages WHERE game_id = '31deb029-264d-4c6d-af9f-a2e711f2fdd8';
DELETE FROM cribbage_events WHERE round_id IN (SELECT id FROM rounds WHERE game_id = '31deb029-264d-4c6d-af9f-a2e711f2fdd8');
DELETE FROM player_cards WHERE round_id IN (SELECT id FROM rounds WHERE game_id = '31deb029-264d-4c6d-af9f-a2e711f2fdd8');
DELETE FROM player_actions WHERE round_id IN (SELECT id FROM rounds WHERE game_id = '31deb029-264d-4c6d-af9f-a2e711f2fdd8');
DELETE FROM session_player_snapshots WHERE game_id = '31deb029-264d-4c6d-af9f-a2e711f2fdd8';
DELETE FROM rounds WHERE game_id = '31deb029-264d-4c6d-af9f-a2e711f2fdd8';
DELETE FROM dealer_games WHERE session_id = '31deb029-264d-4c6d-af9f-a2e711f2fdd8';
DELETE FROM players WHERE game_id = '31deb029-264d-4c6d-af9f-a2e711f2fdd8';
DELETE FROM games WHERE id = '31deb029-264d-4c6d-af9f-a2e711f2fdd8';
