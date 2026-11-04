import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
let sql=read('supabase/mega-card-golf/competition-proof.sql','utf8').replaceAll('\r\n','\n');
const patch=(a,b)=>{assert(sql.includes(a),a);sql=sql.replace(a,b);};
patch('before_counts jsonb;','before_counts jsonb; admin_i uuid:=gen_random_uuid();');
patch('BEGIN\n FOR i',`BEGIN
 INSERT INTO auth.users(id) VALUES(admin_i);
 UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=admin_i;
 UPDATE public.profiles SET is_active=true WHERE id=admin_i;
 INSERT INTO public.user_roles(user_id,role) VALUES(admin_i,'admin');
 FOR i`);
patch('INSERT INTO auth.users(id) VALUES(users[i]);',`INSERT INTO auth.users(id,raw_app_meta_data) VALUES(users[i],'{"account_access_rollback_proof":true}');
 PERFORM pg_temp.mega_login(admin_i);PERFORM public.admin_set_account_access(users[i],true);`);
sql=sql.replace(/ UPDATE private\.(mega_competition_release|delayed_words_health|delayed_recovery_state|delayed_release) SET[^;]+;\n/g,'');
patch("PERFORM set_config('request.jwt.claim.role','service_role',true);UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed';PERFORM set_config('request.jwt.claim.role','authenticated',true);",'');
patch('  -- Deliberate terminal settlement fixture;',`  -- Suspend a participant before existing server settlement; no forced forfeit.
  PERFORM pg_temp.mega_login(admin_i);PERFORM public.admin_set_account_access(users[1],false);
  SET LOCAL ROLE service_role;
  BEGIN PERFORM public.mega_live_load(d,users[1]);RAISE EXCEPTION 'suspended live read admitted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  RESET ROLE;
  -- Deliberate terminal settlement fixture;`);
patch('  SET CONSTRAINTS ALL DEFERRED;',`  PERFORM pg_temp.mega_login(admin_i);PERFORM public.admin_set_account_access(users[1],true);
  SET CONSTRAINTS ALL DEFERRED;`);
write('supabase/account-access/live-financial-proof.sql',sql);
