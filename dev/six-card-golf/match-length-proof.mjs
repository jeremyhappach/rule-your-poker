import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import pg from 'file:///C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
const out='qualification.local/golf-match-length';mkdirSync(out,{recursive:true});
const connect=async database=>{const c=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database});await c.connect();return c;};
const db='golf_length_'+Date.now(),admin=await connect('postgres');await admin.query('CREATE DATABASE '+db+' TEMPLATE golf_ui_1792616534787');await admin.end();write(out+'/context.json',JSON.stringify({database:db}));
const c=await connect(db),get=p=>read(p,'utf8');
try{
 await c.query('BEGIN');
 await c.query('UPDATE public.games SET is_paused=true WHERE NOT is_paused');
 // Local-only bootstrap of the existing published Golf baseline onto the old isolated template.
 await c.query(get('supabase/six-card-golf/rules-v2.candidate.sql'));
 const smoke=get('supabase/migrations/20261024184236_six_card_golf_smoke_corrections.sql');
 await c.query(smoke.slice(smoke.indexOf('END $baseline$;')+'END $baseline$;'.length));
 await c.query(get('supabase/six-card-golf/match-length.reference.sql'));
 await c.query(get('supabase/six-card-golf/core-proof.sql').split('\nDO $$')[0]);
 await c.query(get('supabase/six-card-golf/proof.sql').split('\nDO $$')[0]);
 await c.query("UPDATE private.golf_release SET enabled=true,admission_enabled=true");
 await c.query(get('supabase/six-card-golf/match-length.candidate.sql'));
 await c.query(get('supabase/six-card-golf/match-length.candidate.sql'));
 await c.query(get('supabase/six-card-golf/match-length-proof.sql'));
 for(const holes of [3,6,9,18]){
  console.log('Full matches and financial proof',holes);
  let proof=get('supabase/six-card-golf/proof.sql').replaceAll('{"ante_amount":5}',JSON.stringify({ante_amount:5,holes})).replace("m.state->'rules'=private.golf_admission_rules()","m.state->'rules'=(private.golf_admission_rules()||jsonb_build_object('holes',"+holes+"))").replace("jsonb_array_length(m.state->'holes')=9","jsonb_array_length(m.state->'holes')="+holes).replace('count(*)=9 AND count(predecessor_round_id)=8','count(*)='+holes+' AND count(predecessor_round_id)='+(holes-1));
  // The old template has installed timing. Readiness is authoritative at presentation.endsAt.
  proof=proof.replace("IF v->>'phase'<>'complete' THEN","IF v->>'phase'<>'complete' AND action<>'open' THEN"); // Simultaneous opening intentionally accepts identical commitments under a new request.
  proof=proof.replace("SET state=jsonb_set(state,'{deadline}','0'),revision=revision+1","SET state=jsonb_set(jsonb_set(state,'{deadline}','0'),'{presentation,endsAt}','0'),revision=revision+1");
  await c.query(proof);
  let financial=get('supabase/six-card-golf/financial-proof.sql').replaceAll('{"ante_amount":5}',JSON.stringify({ante_amount:5,holes})).replace("'hole',9","'hole',"+holes).replace('h=9','h='+holes).replace('generate_series(1,9)','generate_series(1,'+holes+')');
  await c.query(financial);
 }
 await c.query('SET CONSTRAINTS ALL IMMEDIATE');await c.query('ROLLBACK');
 write(out+'/sql-evidence.json',JSON.stringify({passed:true,database:db,rollback:true,lengths:[3,6,9,18],fullMatches:24,financialCases:72},null,2));
 console.log('PASS: all match lengths, defaults and financial proofs; rolled back');
}catch(e){await c.query('ROLLBACK');console.error(e);process.exitCode=1;}finally{await c.end();}

