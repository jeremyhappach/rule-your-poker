// Disposable PostgreSQL clone. Current authority definitions are copied exactly;
// correction/audit tables remain empty because the race has no historic undo.
import {connect} from '../async-words/local.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const root=await connect('postgres'),database='async_sealed_race_'+Date.now(),template='drop357_v2_1794766303197';
await root.query('CREATE DATABASE '+database+' TEMPLATE '+template);await root.end();
writeFileSync('qualification.local/async-sealed/local-context.json',JSON.stringify({database,template}));
const db=await connect(database);
try{
 const schema=read('dev/async-sealed/evidence/current-schema.json');
 for(const t of schema.filter(t=>t.kind==='r'))await db.query('CREATE TABLE IF NOT EXISTS private.'+t.name+' ('+t.definition+')');
 let views=schema.filter(t=>t.kind==='v');
 while(views.length){let progress=0;const pending=[];for(const v of views){try{await db.query('CREATE OR REPLACE VIEW private.'+v.name+' AS '+v.definition);progress++;}catch(e){if(e.code!=='42P01')throw e;pending.push(v);}}if(!progress)throw Error('Missing view dependencies: '+pending.map(v=>v.name));views=pending;}
 const originals=read('dev/async-sealed/preimages.json'),routing=read('dev/async-sealed/routing-preimages.json');
 const names=['delayed_finalize','delayed_record_outcome','delayed_child_record','delayed_capture_reviews','five_alive_or_actor','delayed_notify','delayed_turn_window'];
 for(const f of [...originals.filter(f=>names.includes(f.name)),...routing.filter(f=>f.name==='delayed_notify_before_reviews'),...read('dev/async-sealed/evidence/current-financial.json')])await db.query(f.definition);
 // Current deployed account-posting conflict target (admin undo generation).
 await db.query("ALTER TABLE public.player_transactions ADD COLUMN session_result_generation integer NOT NULL DEFAULT 0 CHECK(session_result_generation>=0); DROP INDEX public.player_transactions_session_result_game_profile_key; CREATE UNIQUE INDEX player_transactions_session_result_game_profile_key ON public.player_transactions(source_game_id,profile_id,session_result_generation) WHERE transaction_type='SessionResult' AND source_game_id IS NOT NULL");
 await db.query("ALTER TABLE private.delayed_children DROP CONSTRAINT delayed_children_check; ALTER TABLE private.delayed_children ADD CONSTRAINT delayed_children_check CHECK(available_at IS NULL OR expires_at=available_at+interval '36 hours' OR expires_at=available_at+interval '72 hours'); DROP TRIGGER IF EXISTS delayed_turn_window ON private.delayed_children; CREATE TRIGGER delayed_turn_window BEFORE INSERT OR UPDATE ON private.delayed_children FOR EACH ROW EXECUTE FUNCTION private.delayed_turn_window()");
 await db.query(readFileSync('supabase/delayed/sealed-rounds.sql','utf8'));
 console.log('READY',database);
}finally{await db.end();}
