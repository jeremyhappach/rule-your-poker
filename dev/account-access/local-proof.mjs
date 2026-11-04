import {connect} from '../async-words/local.mjs';
import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {concurrency} from './concurrency.mjs';
const name=read('dev/account-access/local-database.txt','utf8').trim();
const db=await connect(name);
try{
 await db.query('BEGIN');
 // The existing local game fixture has a deliberately minimal Auth schema.
 await db.query(`ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text,
 ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
 ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb DEFAULT '{}';
 CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`);
 const candidate=read('supabase/account-access/candidate.sql','utf8');
 // Local clone predates Mega live tables; exercise the exact account authority
 // here. Hosted rollback proofs exercise all adapters and financial triggers.
 await db.query(candidate.slice(0,candidate.indexOf('-- Fresh access lock')).replace("ALTER ROLE authenticator SET pgrst.db_pre_request='public.account_request_guard';",''));
 await db.query(`DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
 CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
 DROP TRIGGER IF EXISTS guard_profile_authority ON public.profiles;
 CREATE TRIGGER guard_profile_authority BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.guard_profile_authority();`);
 await db.query(read('supabase/account-access/proof.sql','utf8'));
 if(process.argv.includes('--concurrency')){await db.query('COMMIT');await concurrency(name);}
 else {await db.query('ROLLBACK');console.log('Account proof PASS; rolled back');}
}
finally{await db.end();}
