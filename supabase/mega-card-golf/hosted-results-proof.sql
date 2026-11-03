-- Read-only qualification of committed, allowlisted synthetic fixtures.
BEGIN;
SET LOCAL statement_timeout='15s';
CREATE FUNCTION pg_temp.assert_mega_hosted(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'mega hosted: %',label;END IF;END $$;
DO $$DECLARE m private.mega_live_matches;r private.delayed_matches;c private.delayed_children;s private.delayed_settlements;p jsonb;expected bigint;BEGIN
 PERFORM pg_temp.assert_mega_hosted((SELECT count(*)>=12 FROM private.mega_live_matches x WHERE EXISTS(SELECT FROM private.mega_test_live q WHERE q.game_id=x.game_id)),'all live configurations admitted');
 FOR m IN SELECT x.* FROM private.mega_live_matches x WHERE EXISTS(SELECT FROM private.mega_test_live WHERE game_id=x.game_id) LOOP
  PERFORM pg_temp.assert_mega_hosted(m.settlement IS NOT NULL AND m.finished,'live settled and terminal');
  PERFORM pg_temp.assert_mega_hosted((SELECT real_money IS FALSE AND status='session_ended' FROM public.games WHERE id=m.game_id),'fake session ends');
  PERFORM pg_temp.assert_mega_hosted(jsonb_array_length(m.state->'results')=(m.state#>>'{rules,course,holes}')::int*jsonb_array_length(m.state->'players'),'one result per player per hole');
  FOR p IN SELECT value FROM jsonb_array_elements(m.state->'players') LOOP
   SELECT sum((value->>'score')::bigint) INTO expected FROM jsonb_array_elements(m.state->'results') WHERE value->>'actor'=p->>'id';
   PERFORM pg_temp.assert_mega_hosted(expected=(m.state->'scores'->>(p->>'id'))::bigint,'signed cumulative total');
   PERFORM pg_temp.assert_mega_hosted((SELECT chips=100+(m.settlement->>id::text)::integer FROM public.players WHERE id=(p->>'id')::uuid),'actual canonical chip movement');
  END LOOP;
  PERFORM pg_temp.assert_mega_hosted((SELECT sum(value::integer)=0 FROM jsonb_each_text(m.settlement)),'zero-sum live settlement');
  PERFORM pg_temp.assert_mega_hosted((SELECT count(*)=1 FROM public.game_results WHERE dealer_game_id=m.dealer_game_id),'one live canonical result');
  PERFORM pg_temp.assert_mega_hosted((SELECT count(*)=jsonb_array_length(m.state->'players') FROM public.session_player_snapshots WHERE dealer_game_id=m.dealer_game_id),'one final snapshot per player');
  PERFORM pg_temp.assert_mega_hosted(NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE dealer_game_id=m.dealer_game_id AND unmatched_deltas<>'{}') AND (SELECT count(*) FROM public.gameplay_transfer_batches WHERE dealer_game_id=m.dealer_game_id)=CASE WHEN EXISTS(SELECT FROM jsonb_each_text(m.settlement) WHERE value::int<>0) THEN 1 ELSE 0 END,'one balanced live batch');
 END LOOP;
 PERFORM pg_temp.assert_mega_hosted(EXISTS(SELECT FROM private.mega_live_matches WHERE state#>>'{rules,course,holes}'='3' AND state#>>'{results,-1,reason}'='timeout' AND settlement IS NOT NULL AND finished),'real worker settles final timeout without clients');
 PERFORM pg_temp.assert_mega_hosted((SELECT count(*)>=3 FROM private.delayed_matches dm JOIN private.mega_test_async q ON q.match_id=dm.id WHERE dm.status='settled'),'all async course matrices settled');
 FOR r IN SELECT dm.* FROM private.delayed_matches dm JOIN private.mega_test_async q ON q.match_id=dm.id LOOP
  PERFORM pg_temp.assert_mega_hosted(NOT r.real_money,'async stays fake money');
  IF r.status<>'settled' THEN
   PERFORM pg_temp.assert_mega_hosted(NOT EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=r.id),'no parent settlement before all children finish');CONTINUE;
  END IF;
  SELECT * INTO STRICT s FROM private.delayed_settlements WHERE match_id=r.id;
  PERFORM pg_temp.assert_mega_hosted(s.organizer_delta+s.opponent_delta=0 AND s.organizer_delta=(SELECT sum(organizer_delta) FROM private.delayed_outcomes WHERE match_id=r.id),'one net parent settlement equals children');
  PERFORM pg_temp.assert_mega_hosted((SELECT count(*)=1 FROM public.game_results WHERE id=s.result_id AND dealer_game_id=s.dealer_game_id),'one canonical async result');
  PERFORM pg_temp.assert_mega_hosted(NOT EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE dealer_game_id=s.dealer_game_id AND unmatched_deltas<>'{}') AND (SELECT count(*) FROM public.gameplay_transfer_batches WHERE dealer_game_id=s.dealer_game_id)=CASE WHEN s.organizer_delta<>0 THEN 1 ELSE 0 END,'one balanced async batch');
  FOR c IN SELECT * FROM private.delayed_children WHERE match_id=r.id LOOP
   PERFORM pg_temp.assert_mega_hosted(c.terminal AND jsonb_array_length(c.state->'attempts')=2*(c.config#>>'{course,holes}')::int,'async hole-level completion');
   PERFORM pg_temp.assert_mega_hosted((SELECT count(*)=1 FROM private.delayed_outcomes WHERE child_id=c.id),'one child outcome');
   FOR p IN SELECT to_jsonb(value) FROM jsonb_array_elements_text(c.state->'players') LOOP
    PERFORM pg_temp.assert_mega_hosted((SELECT sum((value->>'score')::bigint) FROM jsonb_array_elements(c.state->'attempts') WHERE value->>'actor'=p#>>'{}')=(c.state->'totals'->>(p#>>'{}'))::bigint,'async signed cumulative totals');
   END LOOP;
  END LOOP;
 END LOOP;
 PERFORM pg_temp.assert_mega_hosted(NOT EXISTS(SELECT FROM public.platform_notifications n JOIN private.mega_test_async q ON q.match_id=n.match_id GROUP BY n.user_id,n.match_id,n.kind HAVING count(*)>1),'notification deduplication');
 PERFORM pg_temp.assert_mega_hosted(NOT EXISTS(SELECT FROM public.platform_notifications n JOIN private.mega_test_async q ON q.match_id=n.match_id WHERE n.user_id NOT IN(q.actor,q.opponent)),'synthetic notifications stay isolated');
 PERFORM pg_temp.assert_mega_hosted(NOT EXISTS(SELECT FROM private.push_deliveries d JOIN private.push_events e ON e.id=d.event_id JOIN private.mega_test_async q ON q.match_id=e.match_id),'no physical push to synthetic accounts');
 PERFORM pg_temp.assert_mega_hosted(NOT EXISTS(SELECT FROM private.push_events e JOIN private.mega_test_live q ON q.game_id=e.table_id),'no synthetic-table notification broadcasts');
END $$;
SELECT jsonb_build_object('passed',true,'live_matches',(SELECT count(*) FROM private.mega_live_matches),'async_settled',(SELECT count(*) FROM private.delayed_settlements s JOIN private.mega_test_async q ON q.match_id=s.match_id),'flags',(SELECT to_jsonb(r) FROM private.mega_competition_release r),'worker',(SELECT to_jsonb(r)-'token' FROM private.delayed_recovery_state r)) evidence;
ROLLBACK;
