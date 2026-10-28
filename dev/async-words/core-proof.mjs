import {connect} from './local.mjs';import {readFileSync as read,writeFileSync as write} from 'node:fs';import assert from 'node:assert/strict';
const {database}=JSON.parse(read('qualification.local/async-words/context.json','utf8')),db=await connect(database);
try{
 const core=read('supabase/ptown-words/core-proof.sql','utf8');
 for(const async of [false,true]){await db.query('BEGIN');await db.query(async?core.replaceAll('private.ptown_words_rules()',"private.ptown_words_rules_for('ptown-words/3')"):core);await db.query('ROLLBACK');}
 await db.query('BEGIN');const old=JSON.parse(read('dev/async-words/preimage.json','utf8')).functions.find(f=>f.name==='ptown_words_reduce').definition;await db.query(old.replace('private.ptown_words_reduce','pg_temp.words_previous'));
 let state=(await db.query("SELECT private.ptown_words_deal(jsonb_build_object('rules',private.ptown_words_rules(),'players','[{\"id\":\"a\"},{\"id\":\"b\"}]'::jsonb),1000) s")).rows[0].s;
 for(const version of ['ptown-words/1','ptown-words/2']){
 state.rules=(await db.query('SELECT private.ptown_words_rules_for($1) r',[version])).rows[0].r;
 for(const [action,items]of [['pass',null],...(version.endsWith('/2')?[['time_bank',[{slot:0}]],['time_bank',[{slot:1}]]]:[]),['tick',null]]){
 const at=action==='tick'?state.deadline:2000;
 const r=(await db.query('SELECT private.ptown_words_reduce($1,$2,$3,$4) current,pg_temp.words_previous($1,$2,$3,$4) previous',[state,action,items?JSON.stringify(items):null,at])).rows[0];assert.deepEqual(r.current,r.previous);
 }
 }
 await db.query('ROLLBACK');write('qualification.local/async-words/core.json',JSON.stringify({passed:true,checks:['full core proof live /2 and async /3: dictionary, blanks, crosswords, premiums, exchange, pass, rack-out, tie, privacy','exact old/new reducer output equality for live /1,/2 pass, timeout and /2 banks']}));console.log('PASS shared Words core, async configuration and live /1,/2 equivalence');
}finally{await db.query('ROLLBACK');await db.end();}
