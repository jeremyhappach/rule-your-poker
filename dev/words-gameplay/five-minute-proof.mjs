// Emit one rollback-contained qualification query. Pipe to the approved database runner.
import {readFileSync as read,readdirSync} from 'node:fs';
const root='supabase/ptown-words/';
let financial=read(root+'proof.sql','utf8');
// The old recovery test sweeps every active game. Hosted qualification must touch only new fixtures.
financial=financial.slice(0,financial.indexOf(' -- Durable recovery'))+financial.slice(financial.indexOf(' PERFORM pg_temp.words_assert(NOT has_function_privilege'));
const accounts=sql=>sql.replace(/INSERT INTO public.profiles\(id,username,is_active\) VALUES\(users\[i\],'([^']+)'\|\|users\[i\],true\) ON CONFLICT\(id\) DO UPDATE SET is_active=true;/g,
 (_,label)=>`UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=users[i];UPDATE public.profiles SET is_active=true,username='${label}'||users[i] WHERE id=users[i];`);
const migration=readdirSync('supabase/migrations').find(n=>n.endsWith('_words_five_minute_turns.sql'));
const candidate=process.argv.includes('--candidate')?read('supabase/migrations/'+migration,'utf8'):'';
process.stdout.write("BEGIN;SET LOCAL statement_timeout='60s';"+candidate+read(root+'core-proof.sql','utf8')+accounts(financial)+accounts(read(root+'banks-release-proof.sql','utf8').replaceAll("'ptown-words/2'","'ptown-words/4'"))+read(root+'five-minute-proof.sql','utf8')+'ROLLBACK;');
