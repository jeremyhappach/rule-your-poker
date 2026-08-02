UPDATE public.players
SET auto_fold = false, current_decision = NULL, decision_locked = false
WHERE game_id = 'ccc1192c-2ddc-4ad1-870a-1717d38c0e3b'
  AND (auto_fold = true OR current_decision IS NOT NULL OR decision_locked = true);

UPDATE public.rounds
SET decision_deadline = NULL
WHERE game_id = 'ccc1192c-2ddc-4ad1-870a-1717d38c0e3b'
  AND decision_deadline IS NOT NULL;
