-- Read-only metadata export. Save the result array as
-- qualification.local/tri-towers/finance-source.json. No player data is read.
SELECT p.proname AS name,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','private') AND p.proname IN (
 'settle_gameplay_chip_transfers','split_whole_chips_clockwise',
 'journal_gameplay_player_chip_change','journal_gameplay_pot_chip_change',
 'stage_gameplay_player_transfer_cursor','stage_gameplay_pot_transfer_cursor',
 'finalize_gameplay_transfer_batch','resolve_postgame_participation');
