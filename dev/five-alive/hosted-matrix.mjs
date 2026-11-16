// Builds one rollback-contained SQL proof using actual shared TS reducer outputs.
// Input is freshly created synthetic isolated fixtures, never production rows.
import {randomUUID} from 'node:crypto';
export function buildMatrix(rows,rules){
 const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
 const json=v=>quote(JSON.stringify(v))+'::jsonb';
 const invoke=sql=>`SET LOCAL ROLE service_role; DO $step$ BEGIN PERFORM ${sql}; END $step$; RESET ROLE;`;
 const fail=(sql,pattern)=>`DO $reject$ BEGIN BEGIN EXECUTE ${quote(sql)}; RAISE EXCEPTION 'proof:expected_rejection'; EXCEPTION WHEN OTHERS THEN IF SQLERRM !~ ${quote(pattern)} THEN RAISE; END IF; END; END $reject$;`;
 const parts=[`BEGIN; UPDATE private.delayed_words_health SET last_tick=clock_timestamp();
 CREATE TEMP TABLE fa_observed(label text,real boolean,match uuid,delta integer,settlements integer,batches integer,postings integer);
 CREATE FUNCTION pg_temp.fa_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.match_id::text=current_setting('fa.fail',true) THEN RAISE EXCEPTION 'fa:injected_after_finance';END IF;RETURN NEW;END $$;
 CREATE TRIGGER fa_matrix_failure BEFORE INSERT ON private.delayed_settlements FOR EACH ROW EXECUTE FUNCTION pg_temp.fa_failure();
 CREATE FUNCTION pg_temp.fa_verify(m uuid,real_i boolean,expected integer,children integer,label_i text) RETURNS void LANGUAGE plpgsql AS $$
 DECLARE a uuid;b uuid;winner uuid;loser uuid;batch public.gameplay_transfer_batches;
 BEGIN SELECT organizer,opponent INTO STRICT a,b FROM private.delayed_matches WHERE id=m;
 IF (SELECT count(*) FROM private.delayed_settlements WHERE match_id=m)<>1 OR (SELECT count(*) FROM private.delayed_outcomes WHERE match_id=m)<>children THEN RAISE EXCEPTION 'proof:receipts';END IF;
 IF (SELECT count(*) FROM public.players WHERE game_id=m)<>2 OR (SELECT chips FROM public.players WHERE game_id=m AND user_id=a)<>expected OR (SELECT chips FROM public.players WHERE game_id=m AND user_id=b)<>-expected THEN RAISE EXCEPTION 'proof:chips';END IF;
 IF (SELECT count(*) FROM public.session_player_snapshots WHERE game_id=m)<>2 OR EXISTS(SELECT FROM public.session_player_snapshots s JOIN public.players p ON p.id=s.player_id WHERE s.game_id=m AND s.chips<>p.chips) THEN RAISE EXCEPTION 'proof:snapshots';END IF;
 IF (SELECT count(*) FROM public.gameplay_transfer_batches WHERE game_id=m)<>(CASE WHEN expected=0 THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'proof:batch_count';END IF;
 IF expected<>0 THEN
 SELECT id INTO winner FROM public.players WHERE game_id=m AND chips>0;SELECT id INTO loser FROM public.players WHERE game_id=m AND chips<0;
 SELECT * INTO STRICT batch FROM public.gameplay_transfer_batches WHERE game_id=m;
 IF batch.unmatched_deltas<>'{}' OR jsonb_array_length(batch.transfers)<>1 OR (batch.transfers->0->>'amount')::int<>abs(expected) OR batch.transfers#>>'{0,from,playerId}'<>loser::text OR batch.transfers#>>'{0,to,playerId}'<>winner::text OR (batch.opening_balances->>('player:'||winner))::int<>0 OR (batch.opening_balances->>('player:'||loser))::int<>0 OR (batch.closing_balances->>('player:'||winner))::int<>abs(expected) OR (batch.closing_balances->>('player:'||loser))::int<>-abs(expected) THEN RAISE EXCEPTION 'proof:balanced_endpoints';END IF;END IF;
 IF (SELECT count(*) FROM public.player_transactions WHERE source_game_id=m AND transaction_type='SessionResult')<>(CASE WHEN real_i THEN 2 ELSE 0 END) OR EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=m AND amount<>CASE WHEN profile_id=a THEN expected ELSE -expected END) THEN RAISE EXCEPTION 'proof:account_postings';END IF;
 IF (SELECT status FROM public.games WHERE id=m)<>'session_ended' OR (SELECT status FROM private.delayed_matches WHERE id=m)<>'settled' OR (SELECT count(*) FROM public.game_results WHERE game_id=m)<>1 THEN RAISE EXCEPTION 'proof:terminal';END IF;
 PERFORM private.delayed_finalize(m);
 INSERT INTO fa_observed SELECT label_i,real_i,m,expected,(SELECT count(*) FROM private.delayed_settlements WHERE match_id=m),(SELECT count(*) FROM public.gameplay_transfer_batches WHERE game_id=m),(SELECT count(*) FROM public.player_transactions WHERE source_game_id=m);
 END $$;`];
 const recovery=[];
 for(const row of rows){
  let game=row.state.fiveAlive,revision=Number(row.revision),segment=Number(row.segment);
  const command=(actor,word)=>{
   const next=rules.submitSealedGuess(game,actor,word,()=>true),request=randomUUID();
   const fp={child:row.id,revision,segment,intent:{type:'guess',word}};
   const winner=next.current===3?rules.completedMatchOutcome(next).winner:null;
   const sql=`public.delayed_five_alive_commit(${[row.id,actor,request].map(quote).join(',')},${revision},${segment},${json(fp)},${json(next)},${winner?quote(winner):'NULL'})`;
   if(next.current!==game.current)segment++;revision++;game=next;return sql;
  };
  const siblings=rows.filter(r=>r.match_id===row.match_id),index=siblings.indexOf(row);
  const expected=row.label==='draw'||row.label==='both-timeout'||row.label==='continuation'?0:row.label==='opponent-win'?-7:7;
  if(row.label==='recovery'){
   recovery.push({...row,prepare:invoke(command(row.organizer,game.answers[0].word))});continue;
  }
  if(row.label==='organizer-win'){
   parts.push(fail(`UPDATE private.delayed_children SET stake=8 WHERE id=${quote(row.id)}`,'frozen_child'));
   parts.push(fail(`UPDATE private.delayed_matches SET real_money=NOT real_money WHERE id=${quote(row.match_id)}`,'frozen_offer'));
   parts.push('SET LOCAL ROLE authenticated;',fail(`SELECT public.delayed_five_alive_load(${quote(row.id)},${quote(row.organizer)},NULL)`,'permission denied'),'RESET ROLE;');
   parts.push('SET LOCAL ROLE service_role;',fail(`SELECT public.delayed_five_alive_load(${quote(row.id)},'fd481f5b-689e-4441-ba84-cbdfa654fabf',NULL)`,'not_authorized'),'RESET ROLE;');
   for(const stake of [0,10000,1.5])parts.push(`SELECT set_config('request.jwt.claim.sub',${quote(row.organizer)},true);`,fail(`SELECT public.delayed_create(gen_random_uuid(),${quote(row.opponent)},${row.real},${json([{game:'five-alive',stake}])})`,'invalid_child'));
  }
  let last;
  if(['forfeit','both-timeout'].includes(row.label)){
   if(row.label==='forfeit')parts.push(invoke(command(row.organizer,game.answers[0].word)));
   parts.push(`UPDATE private.delayed_children SET available_at=t-interval '36 hours',last_call_at=t-interval '12 hours',expires_at=t FROM (SELECT clock_timestamp()-interval '1 second' t) q WHERE id=${quote(row.id)};`);
   parts.push(`DO $expiry$ DECLARE c private.delayed_children; BEGIN SELECT * INTO c FROM private.delayed_children WHERE id=${quote(row.id)};IF NOT private.delayed_expire(c.id,c.segment,c.expires_at) THEN RAISE EXCEPTION 'proof:expiry';END IF;IF private.delayed_expire(c.id,c.segment,c.expires_at) THEN RAISE EXCEPTION 'proof:expiry_replayed';END IF;END $expiry$;`);
  }else{
   for(let round=0;round<3;round++){
    const word=game.answers[round].word,wrong=word==='STONE'?'BREAD':'STONE';
    if(row.label==='opponent-win'||row.label==='continuation'&&index===1)parts.push(invoke(command(row.organizer,wrong)));
    parts.push(invoke(command(row.organizer,word)));
    if(['organizer-win','injected'].includes(row.label)||row.label==='continuation'&&index===0)parts.push(invoke(command(row.opponent,wrong)));
    last=command(row.opponent,word);
    if(row.label==='injected'&&round===2){
     parts.push(`SELECT set_config('fa.fail',${quote(row.match_id)},true);`,fail(`SELECT ${last}`,'fa:injected_after_finance'));
     parts.push(`DO $atomic$ BEGIN IF EXISTS(SELECT FROM private.delayed_outcomes WHERE match_id=${quote(row.match_id)}) OR EXISTS(SELECT FROM public.games WHERE id=${quote(row.match_id)}) OR EXISTS(SELECT FROM public.player_transactions WHERE source_game_id=${quote(row.match_id)}) OR EXISTS(SELECT FROM public.gameplay_transfer_batches WHERE game_id=${quote(row.match_id)}) OR EXISTS(SELECT FROM public.session_player_snapshots WHERE game_id=${quote(row.match_id)}) THEN RAISE EXCEPTION 'proof:partial_finance';END IF;END $atomic$;SELECT set_config('fa.fail','',true);`);
    }
    parts.push(invoke(last));
   }
  }
  if(index<siblings.length-1){
   const next=siblings[index+1];parts.push(`CREATE TEMP TABLE fa_next_${row.real?'real':'fake'} AS SELECT state,revision FROM private.delayed_children WHERE id=${quote(next.id)};`,invoke(last),`DO $continuation$ BEGIN IF EXISTS(SELECT FROM private.delayed_settlements WHERE match_id=${quote(row.match_id)}) OR (SELECT ROW(state,revision) FROM private.delayed_children WHERE id=${quote(next.id)}) IS DISTINCT FROM (SELECT ROW(state,revision) FROM fa_next_${row.real?'real':'fake'}) THEN RAISE EXCEPTION 'proof:successor';END IF;END $continuation$;`);
  }else{
   if(last)parts.push(invoke(last));
   parts.push(`SET CONSTRAINTS ALL IMMEDIATE;SELECT pg_temp.fa_verify(${quote(row.match_id)},${row.real},${expected},${siblings.length},${quote(row.label)});SET CONSTRAINTS ALL DEFERRED;`);
  }
 }
 parts.push('SELECT * FROM fa_observed ORDER BY real,label;ROLLBACK;');
 return {sql:parts.join('\n'),recovery};
}
