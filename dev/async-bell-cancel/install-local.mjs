import {connect} from '../async-words/local.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
const {database}=JSON.parse(readFileSync('qualification.local/async-bell-cancel/context.json'));
const c=await connect(database);
try {
 await c.query('CREATE TABLE IF NOT EXISTS auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz)');
 await c.query('ALTER TABLE auth.sessions ADD COLUMN IF NOT EXISTS not_after timestamptz');
 if(!(await c.query("SELECT to_regclass('private.push_events') v")).rows[0].v){
 await c.query(readFileSync('supabase/web-push/candidate.sql','utf8'));
 await c.query(readFileSync('supabase/web-push/invitations.sql','utf8'));
 }
 await c.query('ALTER TABLE public.platform_notifications ADD COLUMN IF NOT EXISTS registration_user_id uuid');
 const candidate=readFileSync('supabase/async-bell-cancel/candidate.sql','utf8');
 const definitions=[...candidate.matchAll(/\$before\$([\s\S]*?)\$before\$/g)].map(m=>m[1]);
 const opp=readFileSync('supabase/migrations/20261107034130_async_turn_notification_opponents.sql','utf8');
 const start=opp.indexOf('CREATE OR REPLACE FUNCTION private.async_opponent_name');
 const end=opp.indexOf('$$;',start);
 console.log('opponent offsets',start,end);
 if(start<0||end<0)throw Error('Missing opponent helper');
 await c.query(opp.slice(start,end+3));
 for(const definition of definitions)await c.query(definition);
 await c.query(candidate);
 await c.query("UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()");
 console.log('installed candidate in isolated clone',database);
} finally{await c.end();}

