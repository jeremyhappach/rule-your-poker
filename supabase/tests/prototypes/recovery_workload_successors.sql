-- Run after each mixed window has drained; read-only assertions and evidence.
DO $proof$
DECLARE expected recovery_workload_probe.hands%ROWTYPE; count_next integer;
BEGIN
  FOR expected IN SELECT * FROM recovery_workload_probe.hands LOOP
    SELECT count(*) INTO count_next FROM public.rounds r
      JOIN recovery_workload_probe.successors s ON s.round_id=r.id
      JOIN recovery_workload_probe.ticks t ON t.xid=s.xid
    WHERE r.game_id=expected.game_id AND r.dealer_game_id=expected.dealer_game_id
      AND r.hand_number=expected.expected_hand AND r.round_number=1
      AND r.id<>expected.round_id AND t.outcome='completed';
    IF count_next<>1 THEN RAISE EXCEPTION 'workload_successor:missing_or_duplicate:%',expected.round_id; END IF;
  END LOOP;
  SELECT * INTO expected FROM recovery_workload_probe.hands ORDER BY armed_at DESC LIMIT 1;
  IF FOUND AND NOT EXISTS(SELECT 1 FROM public.games
    WHERE id=expected.game_id AND current_game_uuid=expected.dealer_game_id
      AND total_hands=expected.expected_hand AND real_money=false AND status='in_progress') THEN
    RAISE EXCEPTION 'workload_successor:latest_identity_mismatch';
  END IF;
  IF EXISTS(SELECT 1 FROM private.game_recovery_failures)
    OR EXISTS(SELECT 1 FROM private.game_recovery_unit_failures) THEN
    RAISE EXCEPTION 'workload_successor:recovery_failure';
  END IF;
END;
$proof$;
SELECT h.phase,h.game_id,h.dealer_game_id,h.round_id AS predecessor,r.id AS successor,
  h.expected_hand,r.hand_number,extract(epoch FROM t.completed_at-h.armed_at)*1000 AS recovery_latency_ms
FROM recovery_workload_probe.hands h JOIN public.rounds r
  ON r.game_id=h.game_id AND r.dealer_game_id=h.dealer_game_id
    AND r.hand_number=h.expected_hand AND r.round_number=1
JOIN recovery_workload_probe.successors s ON s.round_id=r.id
JOIN recovery_workload_probe.ticks t ON t.xid=s.xid
ORDER BY h.armed_at;
