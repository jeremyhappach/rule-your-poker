-- History is a downstream, transaction-owned projection. It never moves chips
-- or advances a game. Private storage has one authenticated, redacting reader.
SET LOCAL lock_timeout = '5s';
-- Match the session -> participant -> round lock order of gameplay commands
-- before acquiring DDL locks, so the short backfill cannot form a lock cycle.
LOCK TABLE public.games IN EXCLUSIVE MODE;
LOCK TABLE public.players,public.rounds,public.game_results,public.player_actions,public.player_cards,public.gameplay_transfer_batches IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE private.history_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  dealer_game_id uuid NOT NULL REFERENCES public.dealer_games(id) ON DELETE CASCADE,
  hand_number integer NOT NULL,
  game_type text NOT NULL,
  participants jsonb NOT NULL DEFAULT '[]',
  opening jsonb NOT NULL DEFAULT '{}',
  closing jsonb,
  scores_after jsonb,
  terminal boolean NOT NULL DEFAULT false,
  provenance text NOT NULL DEFAULT 'captured',
  next_sequence bigint NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  open_transaction bigint,
  UNIQUE(dealer_game_id,hand_number)
);
CREATE INDEX history_hands_session ON private.history_hands(game_id,dealer_game_id,hand_number);
CREATE TABLE private.history_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id uuid NOT NULL REFERENCES private.history_hands(id) ON DELETE CASCADE,
  round_id uuid,
  round_number integer,
  sequence bigint NOT NULL,
  source_key text NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  audience uuid[], -- NULL is public; explicit audience grants are never inferred by a reader.
  source_transaction bigint,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(hand_id,source_key),
  UNIQUE(hand_id,sequence)
);
CREATE INDEX history_events_transaction ON private.history_events(source_transaction,hand_id);
ALTER TABLE private.history_hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.history_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.history_hands,private.history_events FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.history_scores(s jsonb, kind text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN kind='gin-rummy' THEN s->'matchScores'
 ELSE (SELECT jsonb_object_agg(key,value->'pegScore') FROM jsonb_each(CASE WHEN jsonb_typeof(s->'playerStates')='object' THEN s->'playerStates' ELSE '{}'::jsonb END)) END
$$;

CREATE FUNCTION private.history_ensure(g uuid,d uuid,h integer,legacy boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
DECLARE hid uuid; roster jsonb; stacks jsonb; typ text; initial_pot integer;
BEGIN
 IF d IS NULL OR h IS NULL THEN RETURN NULL; END IF;
 SELECT id INTO hid FROM private.history_hands WHERE dealer_game_id=d AND hand_number=h;
 IF FOUND THEN RETURN hid; END IF;
 SELECT game_type INTO typ FROM public.dealer_games WHERE id=d AND session_id=g;
 IF NOT FOUND THEN RAISE EXCEPTION 'history:identity_mismatch'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('playerId',p.id,'userId',p.user_id,
   'name',coalesce(s.username,pr.username,CASE WHEN p.is_bot THEN 'Bot' ELSE 'Player' END),
   'position',p.position) ORDER BY p.position),'[]'),
   coalesce(jsonb_object_agg(p.id::text,p.chips),'{}') INTO roster,stacks
 FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id
 LEFT JOIN LATERAL (SELECT username FROM public.session_player_snapshots
   WHERE game_id=g AND player_id=p.id AND dealer_game_id=d ORDER BY hand_number LIMIT 1) s ON true
 WHERE p.game_id=g AND (legacy OR (p.status='active' AND NOT p.sitting_out));
 IF legacy THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('playerId',player_id,'userId',user_id,'name',username)),'[]') INTO roster
   FROM (SELECT DISTINCT ON(player_id) player_id,user_id,username FROM public.session_player_snapshots
     WHERE game_id=g AND dealer_game_id=d ORDER BY player_id,hand_number) s;
 END IF;
 SELECT pot INTO initial_pot FROM public.games WHERE id=g;
 INSERT INTO private.history_hands(game_id,dealer_game_id,hand_number,game_type,participants,opening,provenance,open_transaction)
 VALUES(g,d,h,typ,roster,CASE WHEN legacy THEN '{}'::jsonb ELSE jsonb_build_object('stacks',stacks,'pot',initial_pot,'boundary','hand_open') END,
   CASE WHEN legacy THEN 'legacy_partial' ELSE 'captured' END,CASE WHEN legacy THEN NULL ELSE txid_current() END)
 ON CONFLICT(dealer_game_id,hand_number) DO NOTHING RETURNING id INTO hid;
 IF hid IS NULL THEN SELECT id INTO hid FROM private.history_hands WHERE dealer_game_id=d AND hand_number=h; END IF;
 RETURN hid;
END $$;

CREATE FUNCTION private.history_append(h uuid,r uuid,rn integer,k text,t text,a uuid,p jsonb,
  viewers uuid[] DEFAULT NULL,at_time timestamptz DEFAULT clock_timestamp(),legacy boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private AS $$
DECLARE seq bigint;
BEGIN
 IF h IS NULL THEN RETURN; END IF;
 PERFORM 1 FROM private.history_hands WHERE id=h FOR UPDATE;
 IF EXISTS(SELECT 1 FROM private.history_events WHERE hand_id=h AND source_key=k) THEN RETURN; END IF;
 UPDATE private.history_hands SET next_sequence=next_sequence+1,updated_at=clock_timestamp()
 WHERE id=h RETURNING next_sequence INTO seq;
 INSERT INTO private.history_events(hand_id,round_id,round_number,sequence,source_key,event_type,actor_id,payload,audience,occurred_at,source_transaction)
 VALUES(h,r,rn,seq,k,t,a,coalesce(p,'{}'),viewers,at_time,CASE WHEN legacy THEN NULL ELSE txid_current() END);
END $$;

-- Only resolved cards explicitly admitted by an authoritative exposure are stored.
CREATE FUNCTION private.history_cards(cards jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(c ORDER BY ord),'[]') FROM jsonb_array_elements(coalesce(cards,'[]')) WITH ORDINALITY x(c,ord)
 WHERE coalesce(c->>'masked','false')<>'true' AND c->>'rank' IN ('A','2','3','4','5','6','7','8','9','10','J','Q','K')
 AND c->>'suit' IN ('hearts','diamonds','clubs','spades','♥','♦','♣','♠')
$$;

CREATE FUNCTION private.history_project_round(r public.rounds,previous jsonb DEFAULT '{}',legacy boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
DECLARE hid uuid; typ text; s jsonb; old_s jsonb; scores jsonb; baseline jsonb; old_scores jsonb;
 actor text; ps jsonb; play jsonb; idx integer; old_len integer; new_len integer;
 pts integer; seq text; target jsonb; awards jsonb; end_scores jsonb; terminal_state boolean;
BEGIN
 hid:=private.history_ensure(r.game_id,r.dealer_game_id,r.hand_number,legacy);
 IF hid IS NULL THEN RETURN; END IF;
 SELECT game_type INTO typ FROM private.history_hands WHERE id=hid;
 PERFORM private.history_append(hid,r.id,r.round_number,'round:'||r.id,'round',NULL,
   jsonb_build_object('roundNumber',r.round_number),NULL,r.created_at,legacy);
 IF typ='gin-rummy' THEN s:=r.gin_rummy_state; old_s:=previous->'gin_rummy_state';
 ELSIF typ='cribbage' THEN s:=r.cribbage_state; old_s:=previous->'cribbage_state'; END IF;
 IF s IS NOT NULL THEN
   scores:=private.history_scores(s,typ);
   IF NOT legacy AND old_s IS NULL THEN
     UPDATE private.history_hands SET opening=opening||jsonb_build_object('scores',scores) WHERE id=hid AND NOT(opening ? 'scores');
   END IF;
   terminal_state:=s->>'winnerPlayerId' IS NOT NULL;
   IF (typ='gin-rummy' AND s->>'phase'='complete') OR (typ='cribbage' AND (r.status='completed' OR s->>'phase'='complete')) THEN
     UPDATE private.history_hands SET scores_after=scores,terminal=terminal OR terminal_state,
       closing=coalesce(closing,CASE WHEN provenance='captured' THEN opening - 'scores' ELSE '{}'::jsonb END)||jsonb_build_object('scores',scores)
     WHERE id=hid;
   END IF;
 END IF;
 IF typ='gin-rummy' AND s IS NOT NULL THEN
   IF NOT legacy AND s->'lastAction' IS NOT NULL AND s->'lastAction' IS DISTINCT FROM old_s->'lastAction' THEN
     actor:=s#>>'{lastAction,playerId}';
     PERFORM private.history_append(hid,r.id,r.round_number,'gin-action:'||r.id||':'||coalesce(s->>'actionCount','0'),
       'action',actor::uuid,jsonb_build_object('action',s#>>'{lastAction,type}'),NULL,clock_timestamp(),false);
   END IF;
   -- A knock is the game's explicit public exposure boundary. Never use an
   -- arbitrary complete state (e.g. stock exhaustion) as exposure permission.
   IF s->>'phase' IN ('knocking','laying_off','scoring') OR (s->>'phase'='complete' AND jsonb_typeof(s->'knockResult')='object') THEN
     FOR actor,ps IN SELECT key,value FROM jsonb_each(s->'playerStates') LOOP
       PERFORM private.history_append(hid,r.id,r.round_number,'gin-expose:'||r.id||':'||actor||':'||coalesce(s->>'actionCount','0'),
         'exposure',actor::uuid,jsonb_build_object('cards',private.history_cards(ps->'hand'),'reason','knock'),NULL,r.created_at,legacy);
     END LOOP;
   END IF;
   IF jsonb_typeof(s->'knockResult')='object' THEN
     PERFORM private.history_append(hid,r.id,r.round_number,'gin-score:'||r.id,'gin_result',(s#>>'{knockResult,winnerId}')::uuid,
       jsonb_build_object('result',s->'knockResult','scoresAfter',scores,'playerStates',s->'playerStates'),NULL,r.created_at,legacy);
   END IF;
 ELSIF typ='cribbage' AND s IS NOT NULL THEN
   new_len:=jsonb_array_length(coalesce(s#>'{pegging,playedCards}','[]'));
   old_len:=jsonb_array_length(coalesce(old_s#>'{pegging,playedCards}','[]'));
   FOR idx IN 0..new_len-1 LOOP
     play:=s#>ARRAY['pegging','playedCards',idx::text];
     PERFORM private.history_append(hid,r.id,r.round_number,'crib-play:'||r.id||':'||idx,'pegging_play',(play->>'playerId')::uuid,
       jsonb_build_object('cards',private.history_cards(jsonb_build_array(play->'card'))),NULL,r.created_at,legacy);
   END LOOP;
   -- A counting plan's baseline excludes all counting points, including when
   -- the final play and complete counting result arrive in one state update.
   baseline:=coalesce(s#>'{countingPlan,baselineScores}',scores);
   old_scores:=private.history_scores(old_s,'cribbage');
   IF NOT legacy AND old_s->>'phase' IN ('pegging','cutting','discarding') AND scores IS DISTINCT FROM old_scores THEN
     FOR actor,ps IN SELECT key,value FROM jsonb_each(coalesce(baseline,'{}')) LOOP
       pts:=(ps#>>'{}')::integer-coalesce((old_scores->>actor)::integer,0);
       IF pts>0 THEN
         seq:=coalesce(s#>>'{pegging,eventSequence}',s#>>'{lastEvent,id}',new_len::text);
         PERFORM private.history_append(hid,r.id,r.round_number,'crib-award:'||r.id||':'||seq||':'||actor,
           CASE WHEN s#>>'{lastEvent,type}'='his_heels' THEN 'heels' ELSE 'pegging_award' END,actor::uuid,
           jsonb_build_object('points',pts,'scoresAfter',baseline,'reason',s#>>'{lastEvent,label}'),NULL,clock_timestamp(),false);
       END IF;
     END LOOP;
   END IF;
   IF s->>'phase' IN ('pegging','counting','complete') AND s->'cutCard' IS NOT NULL THEN
     PERFORM private.history_append(hid,r.id,r.round_number,'crib-cut:'||r.id,'community',NULL,
       jsonb_build_object('cards',private.history_cards(jsonb_build_array(s->'cutCard'))),NULL,r.created_at,legacy);
   END IF;
   -- Counting is an exposure; a pegging win does not expose the unplayed crib.
   IF jsonb_typeof(s->'countingPlan')='object' THEN
     PERFORM private.history_append(hid,r.id,r.round_number,'crib-crib:'||r.id,'exposure',(s->>'dealerPlayerId')::uuid,
       jsonb_build_object('cards',private.history_cards(s->'crib'),'reason','crib'),NULL,r.created_at,legacy);
     IF r.status='completed' OR s->>'phase'='complete' THEN
       awards:='{}';
       FOR actor,ps IN SELECT key,value FROM jsonb_each(scores) LOOP
         awards:=awards||jsonb_build_object(actor,greatest(0,(ps#>>'{}')::integer-coalesce((baseline->>actor)::integer,0)));
       END LOOP;
       PERFORM private.history_append(hid,r.id,r.round_number,'crib-count:'||r.id,'counting',NULL,
         jsonb_build_object('awards',awards,'scoresAfter',scores,'plan',s->'countingPlan'),NULL,r.created_at,legacy);
     END IF;
   END IF;
 ELSIF typ IN ('holm','holm-game') THEN
   IF coalesce(r.community_cards_revealed,0)>0 THEN
     PERFORM private.history_append(hid,r.id,r.round_number,'board:'||r.id||':'||r.community_cards_revealed,'community',NULL,
       jsonb_build_object('cards',private.history_cards((SELECT jsonb_agg(c) FROM jsonb_array_elements(coalesce(r.community_cards,'[]')) WITH ORDINALITY x(c,n) WHERE n<=r.community_cards_revealed))),NULL,r.created_at,legacy);
   END IF;
   IF coalesce(r.chucky_cards_revealed,0)>0 THEN
     PERFORM private.history_append(hid,r.id,r.round_number,'chucky:'||r.id||':'||r.chucky_cards_revealed,'exposure',NULL,
       jsonb_build_object('cards',private.history_cards((SELECT jsonb_agg(c) FROM jsonb_array_elements(coalesce(r.chucky_cards,'[]')) WITH ORDINALITY x(c,n) WHERE n<=r.chucky_cards_revealed)),'name','Chucky','reason','chucky'),NULL,r.created_at,legacy);
   END IF;
 ELSIF r.status='completed' AND (r.horses_state IS NOT NULL OR r.yahtzee_state IS NOT NULL) THEN
   PERFORM private.history_append(hid,r.id,r.round_number,'dice:'||r.id,'dice_result',NULL,
     jsonb_build_object('state',coalesce(r.horses_state,r.yahtzee_state)),NULL,r.created_at,legacy);
 END IF;
   IF r.status='completed' AND NOT legacy THEN
   UPDATE private.history_hands SET closing=coalesce(closing,opening - 'scores') WHERE id=hid;
 END IF;
END $$;

CREATE FUNCTION private.history_round_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,private AS $$ BEGIN
 IF current_user IN ('anon','authenticated') THEN RETURN NEW; END IF;
 PERFORM private.history_project_round(NEW,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END);
 RETURN NEW;
END $$;
CREATE TRIGGER history_round AFTER INSERT OR UPDATE OF status,gin_rummy_state,cribbage_state,horses_state,yahtzee_state,community_cards,chucky_cards,community_cards_revealed,chucky_cards_revealed
ON public.rounds FOR EACH ROW EXECUTE FUNCTION private.history_round_trigger();

CREATE FUNCTION private.history_action_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,private AS $$ DECLARE r public.rounds; hid uuid; BEGIN
 IF current_user IN ('anon','authenticated') THEN RETURN NEW; END IF;
 SELECT * INTO r FROM public.rounds WHERE id=NEW.round_id;
 hid:=private.history_ensure(r.game_id,r.dealer_game_id,r.hand_number);
 PERFORM private.history_append(hid,r.id,r.round_number,'action:'||NEW.id,'action',NEW.player_id,jsonb_build_object('action',NEW.action_type),NULL,NEW.created_at);
 RETURN NEW;
END $$;
CREATE TRIGGER history_action AFTER INSERT ON public.player_actions FOR EACH ROW EXECUTE FUNCTION private.history_action_trigger();

CREATE FUNCTION private.history_exposure_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,private AS $$ DECLARE r public.rounds; hid uuid; viewers uuid[]; BEGIN
 IF current_user IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF NOT NEW.is_public AND coalesce(cardinality(NEW.visible_to_user_ids),0)=0 THEN RETURN NEW; END IF;
 SELECT * INTO r FROM public.rounds WHERE id=NEW.round_id;
 hid:=private.history_ensure(r.game_id,r.dealer_game_id,r.hand_number);
 viewers:=CASE WHEN NEW.is_public THEN NULL ELSE NEW.visible_to_user_ids END;
 PERFORM private.history_append(hid,r.id,r.round_number,'expose:'||NEW.id||':'||md5(coalesce(viewers::text,'public')||NEW.cards::text),
   'exposure',NEW.player_id,jsonb_build_object('cards',private.history_cards(NEW.cards),'reason','revealed'),viewers);
 RETURN NEW;
END $$;
CREATE TRIGGER history_exposure AFTER INSERT OR UPDATE OF is_public,visible_to_user_ids ON public.player_cards
FOR EACH ROW EXECUTE FUNCTION private.history_exposure_trigger();

CREATE FUNCTION private.history_project_result(res public.game_results,legacy boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
DECLARE hid uuid; rid uuid; rn integer; st jsonb; pid text; delta jsonb; verified_money boolean;
BEGIN
 hid:=private.history_ensure(res.game_id,res.dealer_game_id,res.hand_number,legacy);
 IF hid IS NULL THEN RETURN; END IF;
 verified_money:=NOT legacy OR res.settlement_key IS NOT NULL OR res.event_kind IS NOT NULL;
 IF res.game_type='gin-rummy' AND res.settlement_key IS DISTINCT FROM 'gin_rummy_terminal' THEN verified_money:=res.settlement_key='gin_rummy_hand_history'; END IF;
 -- 357 settlement keys carry exact round identity; never assign by timestamp.
 SELECT id,round_number INTO rid,rn FROM public.rounds WHERE dealer_game_id=res.dealer_game_id AND hand_number=res.hand_number
   AND (res.settlement_key LIKE '%'||id::text||'%' OR
     (SELECT count(*) FROM public.rounds WHERE dealer_game_id=res.dealer_game_id AND hand_number=res.hand_number)=1)
 ORDER BY round_number LIMIT 1;
 PERFORM private.history_append(hid,rid,rn,'result:'||res.id,'result',res.winner_player_id,
   jsonb_build_object('resultId',res.id,'kind',res.event_kind,'settlementKey',res.settlement_key,'name',res.winner_username,
     'description',res.winning_hand_description,'amount',CASE WHEN verified_money THEN res.pot_won END,
     'deltas',CASE WHEN verified_money THEN res.player_chip_changes ELSE '{}'::jsonb END,'financialRecorded',coalesce(verified_money,false),'isChopped',res.is_chopped),NULL,res.created_at,legacy);
 -- A terminal wrapper can normalize a just-inserted result inside this same
 -- transaction. The event follows that row before it is visible to readers.
 IF NOT legacy THEN
   UPDATE private.history_events SET payload=jsonb_build_object('resultId',res.id,'kind',res.event_kind,
     'settlementKey',res.settlement_key,'name',res.winner_username,'description',res.winning_hand_description,
     'amount',res.pot_won,'deltas',res.player_chip_changes,'financialRecorded',true,'isChopped',res.is_chopped)
   WHERE hand_id=hid AND source_key='result:'||res.id AND source_transaction=txid_current();
 END IF;
 IF res.settlement_key IN ('cribbage_terminal','gin_rummy_terminal','three_five_seven_terminal','horses_terminal','yahtzee_terminal')
   OR res.event_kind::text='chucky_final_award' THEN
   UPDATE private.history_hands SET terminal=true WHERE id=hid;
 END IF;
END $$;
CREATE FUNCTION private.history_result_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,private AS $$ DECLARE res public.game_results; BEGIN
 IF current_user IN ('anon','authenticated') THEN RETURN NEW; END IF;
 SELECT * INTO res FROM public.game_results WHERE id=NEW.id;
 IF FOUND THEN PERFORM private.history_project_result(res); END IF;
 RETURN NEW;
END $$;
-- Result identity exists before the deferred financial batch is emitted.
CREATE TRIGGER history_result AFTER INSERT OR UPDATE ON public.game_results
FOR EACH ROW EXECUTE FUNCTION private.history_result_trigger();

CREATE FUNCTION private.history_transfer_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,private AS $$
DECLARE hid uuid; candidates uuid[]; opening_state jsonb; closing_state jsonb; endpoint text; val jsonb; actor text;
BEGIN
 IF current_user IN ('anon','authenticated') THEN RETURN NEW; END IF;
 SELECT array_agg(DISTINCT h.id) INTO candidates FROM private.history_hands h
 WHERE h.game_id=NEW.game_id AND h.dealer_game_id=NEW.dealer_game_id AND
   (h.open_transaction=txid_current() OR EXISTS(SELECT 1 FROM private.history_events e WHERE e.hand_id=h.id AND e.source_transaction=txid_current() AND e.event_type IN ('result','action')));
 -- Ambiguous multi-hand transfers stay unprojected, rather than attributing
 -- money using a timestamp or the session's current hand.
 IF cardinality(candidates) IS DISTINCT FROM 1 THEN RETURN NEW; END IF;
 hid:=candidates[1];
 PERFORM private.history_append(hid,NULL,NULL,'transfer:'||NEW.id,'financial',NULL,
   jsonb_build_object('batchId',NEW.id,'cursor',NEW.cursor,'reason',NEW.reason,'opening',NEW.opening_balances,'closing',NEW.closing_balances));
 SELECT opening,coalesce(closing,opening) INTO opening_state,closing_state FROM private.history_hands WHERE id=hid;
 IF NEW.reason='ante' AND EXISTS(SELECT 1 FROM private.history_hands WHERE id=hid AND open_transaction=txid_current()) THEN
   FOR endpoint,val IN SELECT key,value FROM jsonb_each(NEW.opening_balances) LOOP
     IF endpoint='pot' THEN opening_state:=jsonb_set(opening_state,'{pot}',val);
     ELSIF endpoint LIKE 'player:%' THEN opening_state:=jsonb_set(opening_state,'{stacks}',coalesce(opening_state->'stacks','{}')||jsonb_build_object(substr(endpoint,8),val)); END IF;
   END LOOP;
 END IF;
 FOR endpoint,val IN SELECT key,value FROM jsonb_each(NEW.closing_balances) LOOP
   IF endpoint='pot' THEN closing_state:=jsonb_set(closing_state,'{pot}',val);
   ELSIF endpoint LIKE 'player:%' THEN
     actor:=substr(endpoint,8);
     closing_state:=jsonb_set(closing_state,'{stacks}',coalesce(closing_state->'stacks','{}')||jsonb_build_object(actor,val));
   END IF;
 END LOOP;
 UPDATE private.history_hands SET opening=opening_state,closing=closing_state,updated_at=clock_timestamp() WHERE id=hid;
 RETURN NEW;
END $$;
CREATE TRIGGER history_transfer AFTER INSERT ON public.gameplay_transfer_batches FOR EACH ROW EXECUTE FUNCTION private.history_transfer_trigger();

-- Historical visibility is tied to the card owner/exposure, never the current
-- game type. This also closes the old completed-round and admin shortcuts.
DROP POLICY IF EXISTS "Observers can view exposed cards" ON public.player_cards;
DROP POLICY IF EXISTS "Players can view all cards in completed rounds" ON public.player_cards;
DROP POLICY IF EXISTS three_five_seven_hidden_cards_select ON public.player_cards;
CREATE POLICY history_cards_visible ON public.player_cards FOR SELECT TO authenticated USING (
 is_public OR auth.uid()=ANY(coalesce(visible_to_user_ids,'{}'::uuid[]))
 OR EXISTS(SELECT 1 FROM public.players p WHERE p.id=player_cards.player_id AND p.user_id=auth.uid())
 OR EXISTS(SELECT 1 FROM public.session_player_snapshots s WHERE s.player_id=player_cards.player_id AND s.user_id=auth.uid())
);
CREATE POLICY history_cards_visibility_boundary ON public.player_cards AS RESTRICTIVE FOR SELECT TO authenticated USING (
 is_public OR auth.uid()=ANY(coalesce(visible_to_user_ids,'{}'::uuid[]))
 OR EXISTS(SELECT 1 FROM public.players p WHERE p.id=player_cards.player_id AND p.user_id=auth.uid())
 OR EXISTS(SELECT 1 FROM public.session_player_snapshots s WHERE s.player_id=player_cards.player_id AND s.user_id=auth.uid())
);

CREATE FUNCTION public.get_hand_history(p_game_id uuid,p_dealer_game_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private AS $$
DECLARE uid uuid:=auth.uid(); result jsonb;
BEGIN
 IF uid IS NULL OR NOT(
   EXISTS(SELECT 1 FROM public.players WHERE game_id=p_game_id AND user_id=uid)
   OR EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE game_id=p_game_id AND user_id=uid)
   OR public.has_role(uid,'admin')) THEN RAISE EXCEPTION 'history:not_authorized' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'gameType',d.game_type,'startedAt',d.started_at,'config',d.config,
   'hands',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'handNumber',h.hand_number,'participants',h.participants,
     'opening',h.opening,'closing',h.closing,'scoresAfter',h.scores_after,'terminal',h.terminal,'provenance',h.provenance,
     'events',coalesce((SELECT jsonb_agg(jsonb_build_object(
       'id',e.id,'roundId',e.round_id,'roundNumber',e.round_number,'sequence',e.sequence,'type',e.event_type,
       'actorId',e.actor_id,'payload',e.payload,'occurredAt',e.occurred_at) ORDER BY e.sequence)
       FROM private.history_events e WHERE e.hand_id=h.id AND (p_dealer_game_id IS NOT NULL OR e.event_type='result') AND (e.audience IS NULL OR uid=ANY(e.audience))),'[]'))
     ORDER BY h.hand_number) FROM private.history_hands h WHERE h.dealer_game_id=d.id),'[]')) ORDER BY d.started_at DESC),'[]')
 INTO result FROM public.dealer_games d WHERE d.session_id=p_game_id AND (p_dealer_game_id IS NULL OR d.id=p_dealer_game_id);
 RETURN jsonb_build_object('version',1,'games',result);
END $$;
REVOKE ALL ON FUNCTION public.get_hand_history(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_hand_history(uuid,uuid) TO authenticated;

-- Backfill only retained evidence. No current stacks, hidden hands, timestamp
-- result-to-round guesses, legacy client scores, or settlement replay.
DO $backfill$
DECLARE r public.rounds; res public.game_results; a record; hid uuid; previous_scores jsonb; score_kind text;
BEGIN
 FOR r IN SELECT rr.* FROM public.rounds rr JOIN public.games gg ON gg.id=rr.game_id WHERE rr.dealer_game_id IS NOT NULL AND gg.session_ended_at IS NOT NULL ORDER BY rr.created_at,rr.id LOOP
   PERFORM private.history_project_round(r,'{}',true);
 END LOOP;
 FOR res IN SELECT gr.* FROM public.game_results gr JOIN public.games gg ON gg.id=gr.game_id WHERE gr.dealer_game_id IS NOT NULL AND gg.session_ended_at IS NOT NULL ORDER BY gr.created_at,gr.id LOOP
   PERFORM private.history_project_result(res,true);
 END LOOP;
 FOR a IN SELECT pa.*,rr.game_id,rr.dealer_game_id,rr.hand_number,rr.round_number FROM public.player_actions pa JOIN public.rounds rr ON rr.id=pa.round_id JOIN public.games gg ON gg.id=rr.game_id WHERE rr.dealer_game_id IS NOT NULL AND gg.session_ended_at IS NOT NULL ORDER BY pa.created_at,pa.id LOOP
   hid:=private.history_ensure(a.game_id,a.dealer_game_id,a.hand_number,true);
   PERFORM private.history_append(hid,a.round_id,a.round_number,'action:'||a.id,'action',a.player_id,jsonb_build_object('action',a.action_type),NULL,a.created_at,true);
 END LOOP;
 FOR a IN SELECT pc.*,rr.game_id,rr.dealer_game_id,rr.hand_number,rr.round_number FROM public.player_cards pc JOIN public.rounds rr ON rr.id=pc.round_id JOIN public.games gg ON gg.id=rr.game_id WHERE rr.dealer_game_id IS NOT NULL AND gg.session_ended_at IS NOT NULL AND (pc.is_public OR cardinality(pc.visible_to_user_ids)>0) LOOP
   hid:=private.history_ensure(a.game_id,a.dealer_game_id,a.hand_number,true);
   PERFORM private.history_append(hid,a.round_id,a.round_number,'legacy-expose:'||a.id,'exposure',a.player_id,
     jsonb_build_object('cards',private.history_cards(a.cards),'reason','recorded_reveal'),CASE WHEN a.is_public THEN NULL ELSE a.visible_to_user_ids END,a.created_at,true);
 END LOOP;
 -- Complete predecessor scores are safe opening scores. Counts and pegging
 -- totals use the authoritative baseline, not browser-written cribbage_events.
 FOR r IN SELECT rr.* FROM public.rounds rr JOIN public.dealer_games d ON d.id=rr.dealer_game_id JOIN public.games gg ON gg.id=rr.game_id WHERE gg.session_ended_at IS NOT NULL AND d.game_type IN ('cribbage','gin-rummy') ORDER BY rr.dealer_game_id,rr.hand_number LOOP
   SELECT game_type INTO score_kind FROM public.dealer_games WHERE id=r.dealer_game_id;
   SELECT scores_after INTO previous_scores FROM private.history_hands WHERE dealer_game_id=r.dealer_game_id AND hand_number=r.hand_number-1;
   IF previous_scores IS NOT NULL THEN
     UPDATE private.history_hands SET opening=opening||jsonb_build_object('scores',previous_scores) WHERE dealer_game_id=r.dealer_game_id AND hand_number=r.hand_number RETURNING id INTO hid;
     IF score_kind='cribbage' AND r.cribbage_state#>'{countingPlan,baselineScores}' IS NOT NULL THEN
       FOR a IN SELECT key,value FROM jsonb_each(r.cribbage_state#>'{countingPlan,baselineScores}') LOOP
         PERFORM private.history_append(hid,r.id,r.round_number,'legacy-peg-total:'||r.id||':'||a.key,'pegging_total',a.key::uuid,
           jsonb_build_object('points',greatest(0,(a.value#>>'{}')::integer-(previous_scores->>a.key)::integer-
           CASE WHEN r.cribbage_state#>>'{cutCard,rank}'='J' AND r.cribbage_state->>'dealerPlayerId'=a.key THEN 2 ELSE 0 END)),NULL,r.created_at,true);
       END LOOP;
     END IF;
   END IF;
 END LOOP;
 -- Terminal snapshots are authoritative only for their exact recorded hand.
 UPDATE private.history_hands h SET closing=coalesce(h.closing,'{}')||jsonb_build_object('stacks',s.stacks)
 FROM (SELECT game_id,dealer_game_id,hand_number,jsonb_object_agg(player_id::text,chips) stacks FROM public.session_player_snapshots WHERE dealer_game_id IS NOT NULL GROUP BY game_id,dealer_game_id,hand_number) s
 WHERE h.game_id=s.game_id AND h.dealer_game_id=s.dealer_game_id AND h.hand_number=s.hand_number AND h.terminal;
END $backfill$;

-- Internal projection writers are never browser APIs.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'history_%' LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
 END LOOP;
END $$;
