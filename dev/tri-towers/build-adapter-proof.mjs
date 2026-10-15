// Uses inspected deployed finance definitions, copied into pg_temp. It NEVER
// executes candidate DDL against public/private or writes an application row.
import {readFile,writeFile} from 'node:fs/promises';
const candidate=await readFile('supabase/tri-towers/authority.sql','utf8');
const defs=JSON.parse(await readFile('qualification.local/tri-towers/finance-source.json','utf8'));
const tables={public:['games','players','profiles','dealer_games','rounds','game_results','session_player_snapshots','gameplay_transfer_pending_changes','gameplay_transfer_batches','system_settings'],
 private:['dealer_game_setup_commits','session_abandonment_watches','postgame_forced_absence_watches']};
const clone=Object.entries(tables).flatMap(([schema,names])=>names.map(name=>`CREATE TEMP TABLE ${name} (LIKE ${schema}.${name} INCLUDING ALL) ON COMMIT DROP;`)).join('\n');
const relocate=s=>s.replaceAll('public.','pg_temp.').replaceAll('private.','pg_temp.').replaceAll('pg_temp.app_role','public.app_role').replaceAll('pg_temp.has_role','public.has_role');
const finance=defs.filter(f=>!(f.name==='resolve_postgame_participation'&&f.definition.startsWith('CREATE OR REPLACE FUNCTION public.'))).map(f=>relocate(f.definition)+';').join('\n');
const schema=relocate(candidate.slice(0,candidate.indexOf('-- Explicit grants only'))).replaceAll('CREATE TABLE ','CREATE TEMP TABLE ');
const sequences=`DO $safe$ DECLARE a record; sequence_name text;BEGIN
 FOR a IN SELECT c.relname,att.attname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute att ON att.attrelid=c.oid JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=att.attnum WHERE n.oid=pg_my_temp_schema() AND pg_get_expr(d.adbin,d.adrelid) LIKE '%nextval%' LOOP
 sequence_name:='tri_seq_'||a.relname||'_'||a.attname;EXECUTE format('CREATE TEMP SEQUENCE %I',sequence_name);
 EXECUTE format('ALTER TABLE pg_temp.%I ALTER COLUMN %I SET DEFAULT nextval(%L)',a.relname,a.attname,'pg_temp.'||sequence_name);END LOOP;END $safe$;`;
const triggers=`CREATE TRIGGER tri_journal AFTER UPDATE OF chips ON pg_temp.players FOR EACH ROW EXECUTE FUNCTION pg_temp.journal_gameplay_player_chip_change();
CREATE TRIGGER tri_stage BEFORE UPDATE OF chips ON pg_temp.players FOR EACH ROW EXECUTE FUNCTION pg_temp.stage_gameplay_player_transfer_cursor();
CREATE CONSTRAINT TRIGGER tri_finalize AFTER INSERT ON pg_temp.gameplay_transfer_pending_changes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pg_temp.finalize_gameplay_transfer_batch();`;
const proof=await readFile('supabase/tri-towers/adapter-proof.sql','utf8');
const sql=`BEGIN;SET LOCAL statement_timeout='10s';SET LOCAL lock_timeout='100ms';\n${clone}\n${sequences}\n${finance}\n${schema}\n${triggers}\n${proof}\nROLLBACK;`;
// Reject any unrelocated application mutation, FK or function target.
if(/(?:UPDATE|INSERT INTO|DELETE FROM|REFERENCES|ALTER TABLE|ON FUNCTION|CREATE(?: OR REPLACE)? FUNCTION)\s+(?:public|private)\./i.test(sql))throw Error('Unsafe application reference in isolated proof');
await writeFile('qualification.local/tri-towers/adapter-proof.sql',sql);
