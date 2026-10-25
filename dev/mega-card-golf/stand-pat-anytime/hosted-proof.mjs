// Generate the contained installed-contract proof and validate it on loopback first.
import {createServer} from 'vite';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {connect} from '../database.mjs';
const dir='dev/mega-card-golf/stand-pat-anytime/evidence.local/';
const baseline=JSON.parse(read(dir+'release-baseline.json'));
const registration=read('supabase/migrations/20261025070429_mega_anytime_stand_pat.sql','utf8').replaceAll('\r\n','\n');
const vite=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},optimizeDeps:{noDiscovery:true,entries:[]}});
try{
 const {createRun,applyIntent,recoverRun}=await vite.ssrLoadModule('/src/lib/megaCardGolf/engine.ts');
 const config=baseline.courses.find(c=>c.id==='sunny-meadows'),deck=Array.from({length:52},(_,i)=>i);
 const initial=createRun('fixture','fixture',config,Array.from({length:config.holes},()=>deck),0,'mega-card-golf/4');
 let template=initial;
 while(template.status==='active'){
  let at=template.deadline-config.completionSeconds*1000+1;
  while(template.phase==='opening')template=applyIntent(template,{type:'open',indices:[template.exposed.findIndex(x=>!x)]},at++);
  if(template.hole%2)template=applyIntent(template,{type:'draw'},at++);
  template=applyIntent(template,{type:'stand-pat'},at++);
  if(template.status==='active')template=recoverRun(template,template.deadline);
 }
 const q=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
 const body=`SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='20s';
DO $proof$ DECLARE actor uuid;other uuid;r jsonb;old jsonb;done jsonb;answer jsonb;h text;cfg text;request uuid;v integer; BEGIN
 SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY run_id),'')) INTO h FROM private.arcade_results t;
 SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY c.id)::text) INTO cfg FROM private.arcade_mega_courses c;
 SELECT p.id INTO actor FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE private.arcade_allowed(p.id) AND NOT EXISTS(SELECT 1 FROM private.arcade_runs r WHERE r.user_id=p.id AND status='active') ORDER BY p.id LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'proof:no_idle_actor';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||'mega-card-golf',0));
 IF EXISTS(SELECT 1 FROM private.arcade_runs WHERE user_id=actor AND game='mega-card-golf' AND status='active') THEN RAISE EXCEPTION 'proof:actor_became_active';END IF;
 SELECT id INTO other FROM public.profiles WHERE id<>actor LIMIT 1;
 UPDATE private.arcade_recovery_state SET last_completed_at=clock_timestamp(),failure=NULL;
 UPDATE private.arcade_rulesets SET enabled=false WHERE id='mega-card-golf/4';
 r:=public.arcade_mega_start(actor,gen_random_uuid(),'sunny-meadows');IF r->>'ruleset'<>'mega-card-golf/3' THEN RAISE EXCEPTION 'proof:disabled_fallback';END IF;
 UPDATE private.arcade_runs SET status='abandoned' WHERE id=(r->>'id')::uuid;
 FOR v IN 1..3 LOOP
  UPDATE private.arcade_rulesets SET enabled=(id='mega-card-golf/'||v) WHERE game='mega-card-golf';
  request:=gen_random_uuid();old:=public.arcade_mega_start(actor,request,'sunny-meadows');IF old->>'ruleset'<>'mega-card-golf/'||v THEN RAISE EXCEPTION 'proof:legacy';END IF;
  UPDATE private.arcade_rulesets SET enabled=true WHERE id='mega-card-golf/4';
  IF public.arcade_mega_start(actor,gen_random_uuid(),'sunny-meadows')->>'id'<>old->>'id' THEN RAISE EXCEPTION 'proof:active';END IF;
  UPDATE private.arcade_runs SET status='abandoned' WHERE id=(old->>'id')::uuid;
  IF public.arcade_mega_start(actor,request,'sunny-meadows')->>'ruleset'<>old->>'ruleset' THEN RAISE EXCEPTION 'proof:late_receipt';END IF;
 END LOOP;
 UPDATE private.arcade_rulesets SET enabled=true WHERE game='mega-card-golf';
 r:=public.arcade_mega_start(actor,gen_random_uuid(),'sunny-meadows');IF r->>'ruleset'<>'mega-card-golf/4' THEN RAISE EXCEPTION 'proof:v4';END IF;
 answer:=public.arcade_mega_commit(actor,(r->>'id')::uuid,0,${q(initial)}||jsonb_build_object('id',r->>'id','owner',actor,'config',r->'config','deadline',floor(extract(epoch FROM clock_timestamp())*1000)+(r#>>'{config,completionSeconds}')::bigint*1000));
 IF answer->>'outcome'<>'committed' THEN RAISE EXCEPTION 'proof:initialize';END IF;r:=answer->'record';
 done:=${q(template)}||jsonb_build_object('id',r->>'id','owner',actor,'config',r->'config');
 BEGIN PERFORM public.arcade_mega_commit(other,(r->>'id')::uuid,(r->>'revision')::bigint,done);RAISE EXCEPTION 'proof:owner';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%not_found%' AND SQLERRM NOT LIKE '%forbidden%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.arcade_mega_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,done||jsonb_build_object('ruleset','mega-card-golf/3'));RAISE EXCEPTION 'proof:version';EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%invalid_state%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.arcade_mega_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,done||jsonb_build_object('score',9999));RAISE EXCEPTION 'proof:tampered_score_accepted';EXCEPTION WHEN OTHERS THEN IF SQLERRM='proof:tampered_score_accepted' THEN RAISE;END IF;END;
 request:=gen_random_uuid();answer:=public.arcade_mega_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,done,request,'stand-pat-proof');IF answer->>'outcome'<>'committed' THEN RAISE EXCEPTION 'proof:commit';END IF;
 answer:=public.arcade_mega_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,done,request,'stand-pat-proof');IF answer->>'outcome'<>'duplicate' THEN RAISE EXCEPTION 'proof:duplicate';END IF;
 answer:=public.arcade_mega_commit(actor,(r->>'id')::uuid,(r->>'revision')::bigint,done,gen_random_uuid(),'competing');IF answer->>'outcome'<>'conflict' OR (SELECT count(*) FROM private.arcade_results WHERE run_id=(r->>'id')::uuid)<>1 THEN RAISE EXCEPTION 'proof:once';END IF;
 IF public.arcade_mega_start(actor,gen_random_uuid(),'sunny-meadows')->>'id'=r->>'id' THEN RAISE EXCEPTION 'proof:continuation';END IF;
 IF public.arcade_load(actor,(r->>'id')::uuid)->>'status'<>'completed' THEN RAISE EXCEPTION 'proof:reconnect';END IF;
 IF has_function_privilege('anon','public.arcade_mega_start(uuid,uuid,text)','EXECUTE') OR has_function_privilege('authenticated','public.arcade_mega_commit(uuid,uuid,bigint,jsonb,uuid,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'proof:grants';END IF;
 IF (SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY run_id),'')) FROM private.arcade_results t WHERE run_id<>(r->>'id')::uuid)<>h THEN RAISE EXCEPTION 'proof:history';END IF;
 IF (SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY c.id)::text) FROM private.arcade_mega_courses c)<>cfg THEN RAISE EXCEPTION 'proof:course_board_change';END IF;
END $proof$; ROLLBACK; SELECT 'PASS: /1-/3 preservation, disabled fallback, /4 start, owner/version/score guards, canonical Stand Pat completion, duplicate/conflict/reconnect/continuation, service-only grants, history/course preservation; rolled back' qualification;`;
 const installed='BEGIN ISOLATION LEVEL REPEATABLE READ;\n'+body,candidate='BEGIN ISOLATION LEVEL REPEATABLE READ;\n'+registration+'\n'+body;
 const name='mega_golf_v4_hosted_check_'+Date.now(),admin=await connect('template1');await admin.query('CREATE DATABASE '+name+' TEMPLATE mega_golf_1792719651984');await admin.end();
 const db=await connect(name);
 try{
  for(const f of baseline.functions)await db.query(f.definition);
  for(const r of baseline.rulesets)await db.query('INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled',[r.id,r.game,r.config,r.enabled]);
  await db.query(candidate);await db.query(registration);await db.query(installed);
  write(dir+'candidate-proof.sql',candidate);write(dir+'installed-proof.sql',installed);
  console.log('PASS: candidate and installed rollback proof on matching local definitions; '+name);
 }finally{await db.end();}
}finally{await vite.close();}
