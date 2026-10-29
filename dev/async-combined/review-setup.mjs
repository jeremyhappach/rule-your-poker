import {connect} from '../async-words/local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
const prior=JSON.parse(read('qualification.local/async-combined/context.json'));
if(!/^ptown_words_real_\d+$/.test(prior.template))throw Error('Unexpected local fixture');
const root=await connect('postgres'),database='async_reviews_'+Date.now();
await root.query('CREATE DATABASE '+database+' TEMPLATE '+prior.template);await root.end();
const db=await connect(database);
try {
 const shared=JSON.parse(read('dev/async-combined/shared-preimage.json'));
 await db.query(read('supabase/delayed/polish-local.sql','utf8'));
 await db.query('CREATE TABLE IF NOT EXISTS private.gameplay_rulesets(id text PRIMARY KEY,game text NOT NULL,config jsonb NOT NULL)');
 await db.query("INSERT INTO private.gameplay_rulesets VALUES('run21/3','run21',$1) ON CONFLICT(id) DO NOTHING",[shared.run21]);
 for(const f of [...JSON.parse(read('dev/async-combined/quintzee-preimage.json')),...shared.functions])await db.query(f.definition);
 await db.query('ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS quintzee_round_seconds integer NOT NULL DEFAULT 240');
 await db.query("UPDATE public.game_defaults SET quintzee_round_seconds=$1 WHERE game_type='quintzee'",[shared.quintzee.durationMs/1000]);
 for(const name of ['combined-humans','combined-removal','combined-gameplay','combined-board-core','combined-recovery','combined-admission','combined-views','combined-incidents'])await db.query(read('supabase/delayed/'+name+'.sql','utf8'));
 for(const f of JSON.parse(read('dev/async-combined/review-preimage.json')))await db.query(f.definition);
 const constraints=await db.query("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='public.platform_notifications'::regclass");
 console.log(JSON.stringify(constraints.rows));
 await db.query('BEGIN');await db.query(read('supabase/delayed/reviews.sql','utf8'));await db.query('ROLLBACK');
 write('qualification.local/async-combined/review-context.json',JSON.stringify({database}));
 console.log('Local candidate SQL rollback compile passed',database);
}finally{await db.end();}
