CREATE FUNCTION public.admin_board_undo(p_request uuid,p_mode text,p_game text,p_id uuid,p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who uuid:=private.board_undo_authorize();r jsonb;restored jsonb;s jsonb;info jsonb;
 f private.board_undo_frames;prior private.board_undo_audits;g public.games;oldg public.games;oldr public.rounds;
 c private.delayed_children;m private.delayed_matches;o private.delayed_outcomes;sett private.delayed_settlements;
 result_i public.game_results;batch_i public.gameplay_transfer_batches;entry public.player_transactions;
 inverse_i jsonb;reversals uuid[]:='{}';financial_i jsonb:='{}';account_i jsonb:='[]';reply jsonb;
 generation_i integer;at_i timestamptz:=clock_timestamp();at_ms bigint;remaining_i bigint;financial_id uuid;
 expiry_i timestamptz;started_i boolean;net_i jsonb;
BEGIN
 IF p_request IS NULL OR p_revision IS NULL THEN RAISE EXCEPTION 'board_undo:request_required';END IF;
 PERFORM pg_advisory_xact_lock(731907241);
 SELECT * INTO prior FROM private.board_undo_audits WHERE id=p_request;
 IF FOUND THEN
  IF (prior.actor,prior.mode,prior.game_type,prior.match_id,prior.expected_revision) IS DISTINCT FROM (who,p_mode,p_game,p_id,p_revision) THEN RAISE EXCEPTION 'board_undo:request_conflict';END IF;
  RETURN jsonb_build_object('outcome','already_undone','sessionId',prior.session_id,'revision',(prior.restored_row->>'revision')::bigint);
 END IF;
 r:=private.board_undo_row(p_mode,p_game,p_id);
 IF p_mode='async' THEN
  SELECT * INTO STRICT m FROM private.delayed_matches WHERE id=(r->>'match_id')::uuid FOR UPDATE;
  SELECT * INTO STRICT c FROM private.delayed_children WHERE id=p_id FOR UPDATE;r:=to_jsonb(c);
  IF private.delayed_held(m.id) OR EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id) THEN RAISE EXCEPTION 'board_undo:match_unavailable';END IF;
 ELSE
  PERFORM 1 FROM public.rounds WHERE id=(r->>'round_id')::uuid FOR UPDATE;
  SELECT * INTO STRICT g FROM public.games WHERE id=(r->>'game_id')::uuid FOR UPDATE;
  IF p_game='chess' THEN PERFORM 1 FROM private.chess_matches WHERE dealer_game_id=p_id FOR UPDATE;
  ELSE PERFORM 1 FROM private.ptown_words_matches WHERE dealer_game_id=p_id FOR UPDATE;END IF;
  r:=private.board_undo_row(p_mode,p_game,p_id);
 END IF;
 IF (r->>'revision')::bigint<>p_revision THEN RAISE EXCEPTION 'board_undo:match_changed';END IF;
 info:=public.admin_board_undo_info(p_mode,p_game,p_id);
 IF NOT (info->>'available')::boolean THEN RAISE EXCEPTION 'board_undo:%',info->>'reason';END IF;
 SELECT * INTO STRICT f FROM private.board_undo_frames WHERE mode=p_mode AND game_type=p_game AND match_id=p_id ORDER BY revision DESC LIMIT 1;
 at_ms:=floor(extract(epoch FROM at_i)*1000);
 s:=f.before_row->'state';
 -- Rebase remaining turn time, not an old wall-clock timestamp. A timeout
 -- restores one standard turn window; untimed games retain null deadlines.
 remaining_i:=CASE WHEN s->>'deadline' IS NULL THEN NULL WHEN f.kind='timeout' THEN
  coalesce((s->>'clockDuration')::bigint,(s#>>'{rules,turnMs}')::bigint)
  ELSE greatest(0,(s->>'deadline')::bigint-coalesce((f.before_row->>'paused_at')::bigint,floor(extract(epoch FROM f.created_at)*1000)::bigint)) END;
 s:=(s-ARRAY['terminal','movePresentation'])||jsonb_build_object('adminUndoId',p_request,'deadline',CASE WHEN remaining_i IS NOT NULL THEN at_ms+remaining_i END);
 IF s ? 'turnStartedAt' THEN s:=s||jsonb_build_object('turnStartedAt',at_ms);END IF;
 restored:=f.before_row||jsonb_build_object('state',s,'revision',p_revision+1);
 IF p_mode='async' THEN
  started_i:=f.before_row->>'started_at' IS NOT NULL;
  expiry_i:=CASE WHEN f.before_row->>'expires_at' IS NOT NULL THEN at_i+CASE WHEN f.kind='timeout' THEN interval '72 hours' ELSE greatest(interval '0 seconds',(f.before_row->>'expires_at')::timestamptz-f.created_at) END END;
  IF NOT started_i AND expiry_i IS NOT NULL OR c.config->>'version'='ptown-words/3' THEN
   s:=s||jsonb_build_object('deadline',floor(extract(epoch FROM expiry_i)*1000)::bigint);
   restored:=restored||jsonb_build_object('state',s);
  END IF;
  restored:=restored||jsonb_build_object('terminal',false,'segment',c.segment+1,'actor',s->'players'->(s->>'turnIndex')::int->'id',
   'available_at',expiry_i-interval '72 hours','last_call_at',expiry_i-interval '24 hours','expires_at',expiry_i,
   'started_at',CASE WHEN started_i THEN at_i END,
   'gameplay_due_at',CASE WHEN remaining_i IS NOT NULL AND started_i THEN to_timestamp((at_ms+remaining_i)/1000.0) END);
  SELECT * INTO o FROM private.delayed_current_outcomes WHERE child_id=c.id;
  SELECT * INTO sett FROM private.delayed_current_settlements WHERE match_id=m.id;
  IF sett.match_id IS NOT NULL THEN
   financial_id:=sett.game_id;
   SELECT * INTO result_i FROM public.game_results WHERE id=sett.result_id;
   SELECT * INTO batch_i FROM public.gameplay_transfer_batches WHERE game_id=sett.game_id AND dealer_game_id=sett.dealer_game_id AND reason='win' AND result_i.pot_won>0 ORDER BY cursor DESC LIMIT 1;
  END IF;
 ELSE
  oldg:=jsonb_populate_record(NULL::public.games,f.session_before);oldr:=jsonb_populate_record(NULL::public.rounds,f.round_before);
  IF EXISTS(SELECT FROM public.players p WHERE p.game_id=g.id AND p.id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(s->'players')x) AND (p.status='left' OR p.position IS NULL)) THEN RAISE EXCEPTION 'board_undo:participant_left';END IF;
  SELECT * INTO result_i FROM public.game_results WHERE dealer_game_id=p_id AND settlement_key=CASE p_game WHEN 'chess' THEN 'chess_terminal' ELSE 'ptown_words_terminal' END;
  IF result_i.id IS NOT NULL THEN
   financial_id:=g.id;
   SELECT * INTO batch_i FROM public.gameplay_transfer_batches WHERE game_id=g.id AND dealer_game_id=p_id AND reason='win' AND result_i.pot_won>0 ORDER BY cursor DESC LIMIT 1;
  END IF;
  restored:=restored||jsonb_build_object('settlement',NULL,'finished',false,'paused_at',CASE WHEN g.is_paused THEN at_ms END);
  -- Restore only this game's lifecycle; never overwrite a later dealer game.
  UPDATE public.games SET admin_board_undo_id=p_request,status='in_progress',game_type=p_game,current_game_uuid=p_id,current_round=oldg.current_round,
   total_hands=oldg.total_hands,dealer_position=oldg.dealer_position,config_complete=true,
   session_ended_at=NULL,game_over_at=NULL,last_round_result=oldg.last_round_result,
   pending_session_end=oldg.pending_session_end,awaiting_next_round=false,config_deadline=NULL,ante_decision_deadline=NULL WHERE id=g.id;
 END IF;
 IF financial_id IS NOT NULL THEN
  IF result_i.pot_won>0 AND batch_i.id IS NULL THEN RAISE EXCEPTION 'board_undo:financial_receipt_unavailable';END IF;
  IF batch_i.id IS NOT NULL THEN
   SELECT jsonb_object_agg(id,amount) INTO net_i FROM (SELECT id,sum(amount) amount FROM (
    SELECT t#>>'{from,playerId}' id,-(t->>'amount')::int amount FROM jsonb_array_elements(batch_i.transfers)t
    UNION ALL SELECT t#>>'{to,playerId}',(t->>'amount')::int FROM jsonb_array_elements(batch_i.transfers)t
   ) x GROUP BY id HAVING sum(amount)<>0) n;
   IF EXISTS(SELECT FROM jsonb_each_text(result_i.player_chip_changes) x WHERE x.value::int<>coalesce((net_i->>x.key)::int,0))
    OR EXISTS(SELECT FROM jsonb_each_text(net_i) x WHERE x.value::int<>coalesce((result_i.player_chip_changes->>x.key)::int,0)) THEN RAISE EXCEPTION 'board_undo:financial_receipt_mismatch';END IF;
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO account_i FROM public.player_transactions t
   WHERE source_game_id=financial_id AND transaction_type='SessionResult' AND NOT EXISTS(SELECT FROM public.player_transactions v WHERE v.reversal_of=t.id);
  FOR entry IN SELECT * FROM public.player_transactions WHERE id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(account_i)x) ORDER BY profile_id FOR UPDATE LOOP
   reply:=public.admin_reverse_account_entry(gen_random_uuid(),entry.id,'Admin undo of '||p_game||' move or timeout '||p_request);
   reversals:=array_append(reversals,(reply->>'id')::uuid);
  END LOOP;
  IF batch_i.id IS NOT NULL THEN
   IF batch_i.unmatched_deltas<>'{}'::jsonb THEN RAISE EXCEPTION 'board_undo:unbalanced_original';END IF;
   SELECT jsonb_agg(jsonb_build_object('from',t->'to','to',t->'from','amount',t->'amount') ORDER BY n DESC) INTO inverse_i FROM jsonb_array_elements(batch_i.transfers) WITH ORDINALITY x(t,n);
   IF jsonb_array_length(inverse_i)>0 THEN PERFORM public.settle_gameplay_chip_transfers(financial_id,inverse_i,'transfer');END IF;
  END IF;
 END IF;
 financial_i:=jsonb_build_object('result',to_jsonb(result_i),'batch',to_jsonb(batch_i),'accountEntries',account_i,'settlement',to_jsonb(sett),'outcome',to_jsonb(o));
 INSERT INTO private.board_undo_audits(id,frame_id,actor,mode,game_type,match_id,session_id,expected_revision,before_row,restored_row,financial_before,reversal_ids)
 VALUES(p_request,f.id,who,p_mode,p_game,p_id,f.session_id,p_revision,r,restored,financial_i,reversals);
 IF p_mode='async' THEN
  -- Use the established correction generation so original financial receipts
  -- remain available for audit and the next completion settles afresh.
  SELECT coalesce(max(generation),0)+1 INTO generation_i FROM private.delayed_corrections WHERE match_id=m.id;
  INSERT INTO private.delayed_corrections(id,child_id,match_id,actor,reason,fingerprint,before_child,restored_child,before_parent,original_outcome,original_settlement,reversal_ids,financial_game_id,transaction_id,executor_role,created_at,generation)
  VALUES(p_request,c.id,m.id,who,'Admin board undo',jsonb_build_object('boardUndo',true,'turn',s->'turn'),r,restored,to_jsonb(m),coalesce(to_jsonb(o),'{}'),coalesce(to_jsonb(sett),'{}'),reversals,gen_random_uuid(),txid_current(),session_user,at_i,generation_i);
  c:=jsonb_populate_record(NULL::private.delayed_children,restored);
  UPDATE private.delayed_children SET state=c.state,revision=c.revision,actor=c.actor,segment=c.segment,terminal=false,
   available_at=c.available_at,last_call_at=c.last_call_at,expires_at=c.expires_at,started_at=c.started_at,gameplay_due_at=c.gameplay_due_at WHERE id=p_id;
  UPDATE private.delayed_matches SET status='active',settled_at=NULL,revision=revision+1 WHERE id=m.id;
  PERFORM private.delayed_notify(m.id);
 ELSE
  IF result_i.id IS NOT NULL THEN
   -- Retain a clearly marked, zero-net historical result; its exact original is
   -- in the immutable audit. The terminal key is free for the next completion.
   UPDATE public.game_results SET settlement_key=settlement_key||':undone:'||p_request,
    winner_player_id=NULL,winner_username='Undone by admin',winning_hand_description='Admin undo '||p_request,
    pot_won=0,player_chip_changes='{}',is_chopped=true WHERE id=result_i.id;
  END IF;
  UPDATE public.rounds SET status=oldr.status,decision_deadline=CASE WHEN remaining_i IS NOT NULL THEN to_timestamp((at_ms+remaining_i)/1000.0) END,current_turn_position=oldr.current_turn_position WHERE id=oldr.id;
  IF p_game='chess' THEN UPDATE private.chess_matches SET state=s,revision=p_revision+1,settlement=NULL,finished=false,paused_at=(restored->>'paused_at')::bigint WHERE dealer_game_id=p_id;
  ELSE UPDATE private.ptown_words_matches SET state=s,revision=p_revision+1,settlement=NULL,finished=false,paused_at=(restored->>'paused_at')::bigint WHERE dealer_game_id=p_id;END IF;
  UPDATE public.session_player_snapshots ss SET chips=p.chips,created_at=at_i FROM public.players p WHERE ss.dealer_game_id=p_id AND ss.player_id=p.id;
 END IF;
 RETURN jsonb_build_object('outcome','undone','sessionId',f.session_id,'revision',p_revision+1,'reversalIds',reversals);
END $$;
REVOKE ALL ON FUNCTION public.admin_board_undo(uuid,text,text,uuid,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_board_undo(uuid,text,text,uuid,bigint) TO authenticated;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'board_undo_%' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;
