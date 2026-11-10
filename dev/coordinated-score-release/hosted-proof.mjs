import {readFileSync,writeFileSync} from 'node:fs';
const candidate=readFileSync('supabase/coordinated-score-release/candidate.sql','utf8'),installed=process.argv.includes('--installed');
const entries=[['supabase/ptown-polish/horses-proof.sql','horses-blitz/4','horses-blitz/5'],['supabase/ptown-polish/drop-proof.sql','357-drop/5','357-drop/6'],['supabase/ptown-polish/horses-proof.sql'],['supabase/ptown-polish/drop-proof.sql'],['supabase/arcade-smoke-polish/horses-v3-proof.sql'],...['','_v2','_v3','_v4'].map(v=>['supabase/tests/drop357'+v+'_proof.sql']),['supabase/coordinated-score-release/version-proof.sql']];
const proofs=entries.map(([file,from,to],i)=>{let s=readFileSync(file,'utf8');if(from)s=s.replaceAll(from,to);
 // Hosted leaderboards already contain genuine scores; require the fixture
 // entries without assuming the global board was empty before this proof.
 s=s.replaceAll("jsonb_array_length(response->'rows')=3","jsonb_array_length(response->'rows')>=3").replaceAll("'30')->'rows')=3","'30')->'rows')>=3");
 const game=file.includes('horses')?'horses-blitz':'357-drop';
 // Genuine production top-ten rows can hide zero-score test runs. The public
 // result-specific rank still covers every result, including those below ten.
 for(const name of ['reply','response'])s=s.replaceAll(`(SELECT count(DISTINCT x->>'rank') FROM jsonb_array_elements(${name}->'rows')x WHERE x->>'score'='0')=1`,`(SELECT count(DISTINCT public.arcade_leaderboard(r.user_id,r.game,'all',r.id)#>>'{latestResult,rank}') FROM private.arcade_runs r WHERE r.user_id IN(actor,stranger) AND r.game='${game}' AND r.status='completed' AND r.score=0)=1`);
 return `SAVEPOINT proof_${i};\n`+s.replace(/^BEGIN;\r?\n/m,'').replace(/^ROLLBACK;\r?$/gm,'').replace('-- CANDIDATE_DDL','')+`\nROLLBACK TO SAVEPOINT proof_${i};\n`;});
const historical=`CREATE TEMP TABLE coordinated_old_rules ON COMMIT DROP AS SELECT id,config FROM private.arcade_rulesets WHERE id NOT IN('horses-blitz/5','357-drop/6');
CREATE TEMP TABLE coordinated_historical_results ON COMMIT DROP AS SELECT run_id,record FROM private.arcade_results WHERE game IN('horses-blitz','357-drop');
CREATE TEMP TABLE coordinated_old_offers ON COMMIT DROP AS SELECT d,roll,v,private.horses_blitz_set(d,roll,private.horses_blitz_rules(v)) result FROM (SELECT to_jsonb(ARRAY[a,b,c,d,e]) d FROM generate_series(1,6)a,generate_series(1,6)b,generate_series(1,6)c,generate_series(1,6)d,generate_series(1,6)e WHERE a<=b AND b<=c AND c<=d AND d<=e) dice CROSS JOIN generate_series(1,3)roll CROSS JOIN unnest(ARRAY['horses-blitz/1','horses-blitz/2','horses-blitz/3','horses-blitz/4'])v;
`;
const end=`DO $$ BEGIN
 IF EXISTS(SELECT FROM coordinated_old_rules old JOIN private.arcade_rulesets current USING(id) WHERE old.config<>current.config) THEN RAISE EXCEPTION 'old configuration changed';END IF;
 IF EXISTS(SELECT FROM coordinated_old_offers WHERE result<>private.horses_blitz_set(d,roll,private.horses_blitz_rules(v))) THEN RAISE EXCEPTION 'old offer changed';END IF;
 IF EXISTS(SELECT FROM coordinated_historical_results old JOIN private.arcade_results current USING(run_id) WHERE old.record<>current.record) THEN RAISE EXCEPTION 'historical receipt changed';END IF;
 IF private.arcade_score_group('horses-blitz','horses-blitz/5')=private.arcade_score_group('horses-blitz','horses-blitz/4') OR private.arcade_score_group('357-drop','357-drop/6')=private.arcade_score_group('357-drop','357-drop/5') THEN RAISE EXCEPTION 'new leaderboard not segregated';END IF;
 IF EXISTS(SELECT FROM private.arcade_rulesets WHERE id IN('horses-blitz/5','357-drop/6') AND enabled) THEN RAISE EXCEPTION 'candidate admission open';END IF;
END $$;`;
const sql=`BEGIN;\nSET LOCAL lock_timeout='500ms';\nSET LOCAL statement_timeout='60s';\n${historical}\n${installed?'':candidate}\n${proofs.join('\n')}\n${end}\nROLLBACK;\nSELECT 'PASS: 10 rollback-contained scoring/lifecycle proofs, 3024 frozen historical offers, historical receipts, leaderboard and personal-best separation, pinned active runs; no candidate or fixture persisted' result;\n`;
writeFileSync('qualification.local/coordinated/hosted-'+(installed?'installed':'candidate')+'.sql',sql);console.log(sql.length,'bytes; installed:',installed);
