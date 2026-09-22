import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'vite';
import {fixture,sql} from './run21-latency/local.mjs';
const vite=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,entries:[]}});
const e=await vite.ssrLoadModule('/src/lib/run21/engine.ts'),rules=await vite.ssrLoadModule('/src/lib/run21/rules.ts');
const {fixtureDeck}=await vite.ssrLoadModule('/src/lib/run21/fixtures.ts');
const {chooseAction}=await vite.ssrLoadModule('/src/lib/run21/bot.ts');
const {DEFAULT_CONFIG}=await vite.ssrLoadModule('/src/lib/run21/model.ts');
const f=await fixture();
const literal=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
try{
 let at=Date.now(),m=e.createMatch({sessionId:f.row.game_id,dealerGameId:f.row.dealer_game_id,handNumber:1},f.row.participants.map(({id,seat,name,kind})=>({id,seat,name,kind})),f.row.stake,DEFAULT_CONFIG,at);
 const states=[];
 function command(id,intent,time=at){at=time;const r=m.rounds.at(-1);const result=e.applyCommand(m,{identity:m.identity,roundId:r.id,playerId:id,requestId:randomUUID(),revision:r.boards[id].revision,intent},{kind:'service'},at);assert.equal(result.status,'accepted');m=result.state;}
 for(let round=1;round<=4;round++){
  m=e.prepareRound(m,round===1?f.row.first_round_id:randomUUID(),m.rounds.at(-1)?.id??null,fixtureDeck([],17),at);
  command(m.rounds.at(-1).active_player_id,{type:'ready'});
  for(let actor=0;actor<2;actor++){
   const id=m.rounds.at(-1).active_player_id;let actions=0;
   while(!m.rounds.at(-1).boards[id].result&&actions++<60){
    const choice=chooseAction(e.project(m,id),at,{seed:17,minActionMs:1,maxActionMs:1});
    command(id,choice.intent);
    if(actions===1)states.push(structuredClone(m));
    if(round<=3&&actions>=12&&!m.rounds.at(-1).boards[id].result){command(id,{type:'expire'},m.rounds.at(-1).boards[id].deadline);}
    if(round===4&&actor===0&&actions>=12&&!m.rounds.at(-1).boards[id].result){command(id,{type:'expire'},m.rounds.at(-1).boards[id].deadline);}
   }
   assert(actions>10);
   at=m.rounds.at(-1).scorePresentation.endsAt;m=e.advanceScorePresentation(m,at);
  }
  if(m.winnerId)break;
  for(const p of m.players)command(p.id,{type:'acknowledge'});
 }
 assert(m.winnerId,'Expected real fourth-round winner');
 m=e.recordSettlement(m,{...e.settlementIntent(m),resultId:randomUUID(),transferBatchId:randomUUID(),at});states.push(m);
 // Put the migration and assertions under one rollback/apply transaction.
 // Production carries the same explicit transaction because db push does not add one.
 const migration=['20260922210908_run21_bounded_live_journal.sql','20260922215153_run21_admission_in_commit.sql','20260922222445_run21_public_admission.sql'].map(file=>fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/^BEGIN;\r?\n/m,'').replace(/^COMMIT;\s*$/m,'')).join('\n');
 let proof=`DO $proof$ DECLARE result jsonb; original jsonb; BEGIN\n`;
 proof+=`IF has_function_privilege('authenticated','public.run21_server_commit_admitted(uuid,uuid,bigint,jsonb,bigint)','execute') OR has_function_privilege('anon','public.run21_server_commit_admitted(uuid,uuid,bigint,jsonb,bigint)','execute') THEN RAISE EXCEPTION 'admitted commit exposed';END IF;
 BEGIN PERFORM public.run21_server_commit_admitted(NULL,'${f.row.dealer_game_id}',0,NULL,NULL);RAISE EXCEPTION 'null actor allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE private.run21_app_test_release SET enabled=false;
 BEGIN PERFORM public.run21_server_commit_admitted('${f.user}','${f.row.dealer_game_id}',0,NULL,NULL);RAISE EXCEPTION 'disabled gate allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE private.run21_app_test_release SET enabled=true;
 DELETE FROM private.run21_release_allowlist WHERE user_id='${f.user}';
 DELETE FROM public.user_roles WHERE user_id='${f.user}' AND role='admin';
 IF public.is_admin('${f.user}') OR NOT private.run21_actor_allowed('${f.user}') THEN RAISE EXCEPTION 'ordinary active player denied';END IF;
 UPDATE public.profiles SET is_active=false WHERE id='${f.user}';
 BEGIN PERFORM public.run21_server_commit_admitted('${f.user}','${f.row.dealer_game_id}',0,NULL,NULL);RAISE EXCEPTION 'inactive profile allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE public.profiles SET is_active=true WHERE id='${f.user}';
 UPDATE public.players SET status='left' WHERE game_id='${f.row.game_id}' AND user_id='${f.user}';
 BEGIN PERFORM public.run21_server_commit_admitted('${f.user}','${f.row.dealer_game_id}',0,NULL,NULL);RAISE EXCEPTION 'former member allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE public.players SET status='active' WHERE game_id='${f.row.game_id}' AND user_id='${f.user}';
 original:=to_jsonb(m) FROM private.run21_matches m WHERE dealer_game_id='${f.row.dealer_game_id}';
 result:=public.run21_server_commit_admitted('${f.user}','${f.row.dealer_game_id}',0,NULL,NULL);
 IF result->'record' IS DISTINCT FROM original THEN RAISE EXCEPTION 'no-op changed snapshot';END IF;
 `;
 // Real gate and canonical membership checked inside every commit.
 let seq=0,revision=0;
 for(const state of states){const delta={...state,events:state.events.filter(event=>event.sequence>seq)};
  proof+=`result:=public.run21_server_commit_admitted('${f.user}','${f.row.dealer_game_id}',${revision++},${literal(delta)},NULL); IF result->>'outcome'<>'committed' THEN RAISE EXCEPTION 'commit failed'; END IF;\n`;
  seq=state.eventSequence;
 }
 proof+=`IF (SELECT count(*) FROM private.run21_events WHERE dealer_game_id='${f.row.dealer_game_id}')<>${seq} THEN RAISE EXCEPTION 'journal gap';END IF;
 IF (public.run21_server_load('${f.row.game_id}')->0->'state'->'events') IS DISTINCT FROM ${literal(m.events)} THEN RAISE EXCEPTION 'history changed'; END IF;
 IF jsonb_array_length(public.run21_server_load_current('${f.row.game_id}',NULL)->0->'state'->'events')<>0 THEN RAISE EXCEPTION 'hot journal';END IF;
 IF (public.run21_server_commit_admitted('${f.user}','${f.row.dealer_game_id}',0,${literal(m)},NULL)->>'outcome')<>'conflict' THEN RAISE EXCEPTION 'CAS bypass';END IF;
 IF has_function_privilege('authenticated','public.run21_server_load_current(uuid,bigint)','execute') OR has_function_privilege('anon','public.run21_server_admit(uuid,uuid)','execute') OR has_table_privilege('service_role','private.run21_events','select') THEN RAISE EXCEPTION 'privacy grant';END IF;
 IF (public.run21_server_admit('00000000-0000-4000-8000-000000000099','${f.row.game_id}')->>'allowed')::boolean THEN RAISE EXCEPTION 'gate bypass';END IF;
 IF (SELECT count(*) FROM private.run21_settlements WHERE dealer_game_id='${f.row.dealer_game_id}')<>1 THEN RAISE EXCEPTION 'settlement missing';END IF;
 original:=public.run21_server_load('${f.row.game_id}');
 result:=public.run21_server_commit_admitted('${f.user}','${f.row.dealer_game_id}',${revision},original->0->'state',NULL);
 IF result->>'outcome'<>'committed' OR result->'record'->'state' IS DISTINCT FROM original->0->'state' THEN RAISE EXCEPTION 'legacy response changed';END IF;
 BEGIN
 PERFORM public.run21_server_commit_admitted('${f.user}','${f.row.dealer_game_id}',${revision+1},jsonb_set(original->0->'state','{events,0,type}','"tampered"'),NULL);
 RAISE EXCEPTION 'rewrite accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'run21:journal_rewrite' THEN RAISE;END IF;END;
 INSERT INTO public.user_roles(user_id,role) VALUES('${f.user}','admin');
 END $proof$;`;
 fs.writeFileSync('qualification.local/journal-proof.sql',proof);
 sql('BEGIN;\n'+migration+'\n'+proof+'\nROLLBACK;');console.log('Complete local journal rollback proof passed.');
 sql('BEGIN;\n'+migration+'\n'+proof+'\nCOMMIT; NOTIFY pgrst,\'reload schema\';');console.log('Local candidate apply and repeated proof passed.');
 fs.writeFileSync('qualification.local/proof-result.json',JSON.stringify({rounds:m.rounds.length,events:seq,commits:revision,settlement:true,rollback:true,repeated:true}));
}finally{await f.cleanup();await vite.close();}
