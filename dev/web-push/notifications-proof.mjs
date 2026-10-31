import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';

export async function installCreationFixture(db){
 // The old local template predates create_session. Load its unchanged repository
 // definition (confirmed against the deployed definition), not a notification stub.
 const old=readFileSync('supabase/migrations/20260905021826_atomic_session_creation_and_final_player_authority.sql','utf8');
 const current=readFileSync('supabase/migrations/20260905030750_secure_game_randomness_and_four_card_crib.sql','utf8');
 await db.query(current.match(/CREATE FUNCTION private\.secure_random_int[\s\S]+?END \$\$;/)[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
 await db.query(old.match(/CREATE TABLE private\.session_creation_requests\([\s\S]+?\n\);/)[0].replace('CREATE TABLE','CREATE TABLE IF NOT EXISTS'));
 await db.query(current.match(/CREATE OR REPLACE FUNCTION public\.create_session[\s\S]+?END \$function\$;/)[0]);
}

export async function notificationsProof(db,peer,checks){
 await db.query('RESET ROLE');await peer.query('RESET ROLE');
 await db.query("UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL");
 const a=randomUUID(),b=randomUUID(),off=randomUUID(),sidA=randomUUID(),sidB=randomUUID(),match=randomUUID(),child=randomUUID();
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
 const role=async(c,who)=>{await c.query('RESET ROLE');if(who){await c.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[who,JSON.stringify({sub:who,session_id:who===a?sidA:sidB})]);await c.query('SET ROLE authenticated');}else await c.query('SET ROLE service_role');};
 const settings=patch=>q('SELECT public.notification_preferences($1::jsonb) v',[patch]);
 const args=c=>[c.eventId,c.subscriptionId,c.lease];
 const auth=c=>q('SELECT public.async_push_authorize($1,$2,$3) v',args(c));
 const receipt=c=>q("SELECT public.async_push_receipt($1,$2,$3,'sent') v",args(c));
 const claim=()=>q('SELECT public.async_push_claim() v');
 const denied=async(sql,p=[])=>{await db.query('SAVEPOINT rejected');await assert.rejects(db.query(sql,p));await db.query('ROLLBACK TO SAVEPOINT rejected');};
 for(const id of[a,b,off]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[id,'Notifications fixture '+id]);}
 await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2),($3,$4)',[sidA,a,sidB,b]);
 await role(db,b);assert.deepEqual(await settings(null),{asyncDefault:false,newTable:false,quietEnabled:false,quietStart:'22:00',quietEnd:'07:00',quietZone:'UTC'});
 await settings({asyncDefault:true});
 const sub=await q('SELECT public.async_push_subscribe($1,$2,$3) v',['https://web.push.apple.com/notifications-'+b,'B'.repeat(87),'A'.repeat(22)]);
 await db.query('RESET ROLE');await db.query("INSERT INTO private.delayed_matches(id,organizer,opponent,real_money,offer,offer_hash,status,accepted_at) VALUES($1,$2,$3,false,'{}','notifications-proof','active',now())",[match,a,b]);
 await role(db,b);await settings({asyncDefault:false,newTable:true,quietEnabled:true,quietStart:'22:00',quietEnd:'07:00',quietZone:'America/New_York'});
 assert.equal(await q('SELECT public.async_push_preference($1) v',[match]),true);
 checks.push('new notification settings preserve existing personal match overrides and leave every new-table opt-in off by default');
 await db.query('BEGIN');
 for(const patch of[{quietZone:'CST'},{quietZone:'Etc/Imaginary'},{quietStart:'25:00'},{quietEnd:'22:00:30'},{quietEnabled:null},{newTable:'true'},{userId:a}])await denied('SELECT public.notification_preferences($1::jsonb)',[patch]);
 await role(db,off);await denied('SELECT public.async_push_preference($1,true)',[match]);
 await db.query('RESET ROLE');await db.query('SET ROLE anon');await denied('SELECT public.notification_preferences()');await denied('SELECT public.notification_table($1)',[randomUUID()]);
 await db.query('RESET ROLE');await db.query('SET ROLE service_role');await denied('SELECT public.notification_preferences()');await denied('SELECT * FROM private.push_defaults');await denied('SELECT private.push_table_allowed($1,$2)',[randomUUID(),b]);
 await db.query('ROLLBACK');await db.query('RESET ROLE');
 const at=(start,end,zone,instant)=>q(`SELECT private.push_quiet_at(ROW($1,false,false,true,$2::time,$3::time,$4)::private.push_defaults,$5::timestamptz) v`,[b,start,end,zone,instant]);
 const transition=(start,end,zone,instant,quiet)=>q(`SELECT private.push_quiet_transition(ROW($1,false,false,true,$2::time,$3::time,$4)::private.push_defaults,$5::timestamptz,$6) v`,[b,start,end,zone,instant,quiet]);
 for(const [instant,expected]of[['2026-01-01T21:59:59Z',false],['2026-01-01T22:00Z',true],['2026-01-02T06:59:59Z',true],['2026-01-02T07:00Z',false]])assert.equal(await at('22:00','07:00','UTC',instant),expected);
 assert.equal(await at('09:00','17:00','UTC','2026-01-01T12:00Z'),true);assert.equal(await at('09:00','17:00','UTC','2026-01-01T17:00Z'),false);
 assert.equal(await at('07:00','07:00','UTC','2026-01-01T18:00Z'),true);
 for(const instant of['2026-11-01T05:30Z','2026-11-01T06:30Z'])assert.equal(await at('01:15','01:45','America/New_York',instant),true);
 assert.equal((await transition('01:30','02:30','America/New_York','2026-03-08T06:59Z',false)).toISOString(),'2026-03-08T07:00:00.000Z');
 assert.equal((await transition('01:15','01:45','America/New_York','2026-11-01T05:30Z',false)).toISOString(),'2026-11-01T05:45:00.000Z');
 assert.equal((await transition('01:15','01:45','America/New_York','2026-11-01T05:45Z',true)).toISOString(),'2026-11-01T06:15:00.000Z');
 assert.equal(await at('22:00','07:00','Asia/Tokyo','2026-01-01T15:00Z'),true);assert.equal(await at('22:00','07:00','America/New_York','2026-01-01T15:00Z'),false);
 assert.equal((await transition('01:45','02:15','Australia/Lord_Howe','2026-10-03T15:29Z',false)).toISOString(),'2026-10-03T15:30:00.000Z');
 assert.equal(await at('22:00','07:00','Asia/Kathmandu','2026-01-01T16:15Z'),true);
 checks.push('quiet start/end boundaries, overnight/daytime, equal-times all-day, zone changes, spring gap and both fall folds pass');

 // Versioned golden results are an activation gate, distinct from algorithm tests.
 const golden=JSON.parse(readFileSync('dev/web-push/timezone-golden.json','utf8'));
 const pinned=!!await q("SELECT to_regprocedure('private.push_local_time(text,timestamp with time zone)') IS NOT NULL v");
 const observations=[];for(const c of golden.cases){const actual=await q(pinned?"SELECT to_char(private.push_local_time($2,$1::timestamptz),'YYYY-MM-DD HH24:MI') v":"SELECT to_char($1::timestamptz AT TIME ZONE $2,'YYYY-MM-DD HH24:MI') v",[c.instant,c.zone]);observations.push({...c,actual,pass:actual===c.expected});}
 if(pinned)assert(observations.every(x=>x.pass),'Pinned authority must pass every current golden');
 writeFileSync('qualification.local/web-push/timezone-compatibility.json',JSON.stringify({requiredIana:golden.requiredIana,pinnedAuthority:pinned,activationReady:observations.every(x=>x.pass),observations,productionUpgradePerformed:false},null,2));
 checks.push('IANA 2026f golden compatibility recorded separately; mismatches block activation and are not waived by DST algorithm tests');

 await role(db,b);await settings({quietEnabled:true,quietStart:'00:00',quietEnd:'00:00',quietZone:'UTC'});
 await db.query('RESET ROLE');
 await db.query("INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at) VALUES($1,$2,1,'ptown-words',1,'{}',$3,1,now(),now()+interval '24 hours',now()+interval '36 hours')",[child,match,b]);
 await db.query('UPDATE private.delayed_children SET segment=segment+1 WHERE id=$1',[child]);
 await db.query("UPDATE private.delayed_children SET available_at=now()-interval '25 hours',last_call_at=now()-interval '1 hour',expires_at=now()+interval '11 hours' WHERE id=$1",[child]);
 await role(db);assert.equal(await claim(),null);
 await role(db,b);await settings({quietEnabled:false});await role(db);
 const reminder=await claim();assert(reminder);assert.equal((await auth(reminder)).payload.kind,'last_call');await receipt(reminder);assert.equal(await claim(),null);
 checks.push('quiet-hours queue emits only one current Last Call per match after window end; stale epochs and turn backlog disappear');
 // Multiple original transitions can still be actionable simultaneously. Only one
 // current due reminder leaves the morning queue, even with two independent workers.
 await role(db,b);await settings({quietEnabled:true});await db.query('RESET ROLE');
 const secondChild=randomUUID();await db.query("INSERT INTO private.delayed_children(id,match_id,ordinal,game_type,stake,config,actor,segment,available_at,last_call_at,expires_at) VALUES($1,$2,2,'ptown-words',1,'{}',$3,1,now(),now()+interval '24 hours',now()+interval '36 hours')",[secondChild,match,b]);
 await db.query('UPDATE private.delayed_children SET segment=segment+1 WHERE id=$1',[child]);await role(db);assert.equal(await claim(),null);
 await role(db,b);await settings({quietEnabled:false});await role(db);await role(peer);
 const morning=await Promise.all([claim(),peer.query('SELECT public.async_push_claim() v').then(r=>r.rows[0].v)]);
 assert.equal(morning.filter(Boolean).length,1);await receipt(morning.find(Boolean));assert.equal(await claim(),null);
 checks.push('multiple still-actionable quiet-time transitions coalesce to one morning reminder under competing workers');
 // Independently committed settings change after claim, before authorization.
 await db.query('RESET ROLE');await db.query("UPDATE private.delayed_children SET segment=segment+1,available_at=now(),last_call_at=now()+interval '24 hours',expires_at=now()+interval '36 hours' WHERE id=$1",[child]);
 await role(db);const racing=await claim();assert(racing);
 await role(peer,b);await peer.query("SELECT public.notification_preferences('{\"quietEnabled\":true,\"quietStart\":\"00:00\",\"quietEnd\":\"00:00\"}')");
 assert.equal(await auth(racing),null);assert.equal(await receipt(racing),false);
 await role(db,b);await settings({quietEnabled:false});await role(db);const resumed=await claim();assert(resumed);await receipt(resumed);
 await db.query('RESET ROLE');await db.query('UPDATE private.delayed_children SET segment=segment+1 WHERE id=$1',[child]);await role(db);const expired=await claim();assert(expired);
 await db.query('RESET ROLE');await db.query("UPDATE private.delayed_children SET gameplay_due_at=now()-interval '1 second' WHERE id=$1",[child]);await role(db);assert.equal(await auth(expired),null);
 checks.push('quiet preference race defers claimed work without consuming it; deadline expiry still suppresses the reminder');
 await db.query('RESET ROLE');await db.query("UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL");
 await role(db,a);await settings({newTable:true});
 const request=randomUUID();const create=()=>q("SELECT public.create_session($1,'Local notification proof',true,1) v",[request]);
 const table=await create();assert.equal(table.outcome,'created');assert.equal((await create()).game_id,table.game_id);
 await db.query('RESET ROLE');assert.equal(await q("SELECT count(*)::int v FROM private.push_events WHERE table_id=$1 AND kind='table_open'",[table.game_id]),1);
 assert.equal(await q('SELECT user_id v FROM private.push_events WHERE table_id=$1',[table.game_id]),b);
 assert.equal(await q('SELECT coalesce(sum(chips),0)::int v FROM public.players WHERE game_id=$1',[table.game_id]),0);
 await db.query("UPDATE public.games SET updated_at=clock_timestamp(),status='waiting',current_round=current_round+1 WHERE id=$1",[table.game_id]);
 assert.equal(await q('SELECT count(*)::int v FROM private.push_events WHERE table_id=$1',[table.game_id]),1);
 await role(db,b);assert.deepEqual(await q('SELECT public.notification_table($1) v',[table.game_id]),{sessionId:table.game_id,realMoney:true});
 await role(db);const tableClaim=await claim();assert(tableClaim);assert.equal((await auth(tableClaim)).payload.tableId,table.game_id);
 await role(peer,b);await peer.query("SELECT public.notification_preferences('{\"newTable\":false}')");assert.equal(await auth(tableClaim),null);
 await role(db,b);await settings({newTable:true});await role(db);assert.equal(await claim(),null);
 checks.push('actual create_session first opening fans out once to opted-in eligible nonhosts; creation retry and updates never reannounce; opt-out cancels a claimed table alert');
 await role(db,a);const fake=await q("SELECT public.create_session($1,'Local fake table fixture',false,1) v",[randomUUID()]);
 await db.query('RESET ROLE');await db.query('UPDATE public.games SET real_money=true WHERE id=$1',[fake.game_id]);assert.equal(await q('SELECT count(*)::int v FROM private.push_events WHERE table_id=$1',[fake.game_id]),0);
 await role(db,off);await settings({newTable:true});await db.query('RESET ROLE');await db.query('UPDATE public.games SET updated_at=clock_timestamp() WHERE id=$1',[table.game_id]);
 assert.equal(await q('SELECT count(*)::int v FROM private.push_events WHERE table_id=$1 AND user_id=$2',[table.game_id,off]),0);
 checks.push('fake-to-real changes and later opt-ins do not retroactively announce an existing table');

 const newTable=async()=>{await role(db,a);return q("SELECT public.create_session($1,'Local eligibility fixture',true,1) v",[randomUUID()]);};
 const savepointMutation=async(tableId,sql,params)=>{await db.query('RESET ROLE');await db.query('BEGIN');await db.query(sql,params);await role(db,b);
  if(sql.includes('profiles'))await assert.rejects(q('SELECT public.notification_table($1) v',[tableId]),{code:'42501'});
  else assert.equal(await q('SELECT public.notification_table($1) v',[tableId]),null);await db.query('ROLLBACK');};
 await savepointMutation(table.game_id,"UPDATE public.games SET status='session_ended' WHERE id=$1",[table.game_id]);
 await savepointMutation(table.game_id,"UPDATE public.games SET pending_session_end=true WHERE id=$1",[table.game_id]);
 await savepointMutation(table.game_id,'UPDATE public.profiles SET is_active=false WHERE id=$1',[b]);
 await savepointMutation(table.game_id,"INSERT INTO public.system_settings(key,value) VALUES('maintenance_mode','{\"enabled\":true}') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[]);
 // A future restricted visibility helper must remain authoritative to fanout/landing.
 await db.query('RESET ROLE');await db.query('BEGIN');
 await db.query("CREATE OR REPLACE FUNCTION public.three_five_seven_row_visible(p_game_id uuid,p_resolved_only boolean DEFAULT true) RETURNS boolean LANGUAGE sql STABLE AS 'SELECT false'");
 await role(db,b);assert.equal(await q('SELECT public.notification_table($1) v',[table.game_id]),null);await db.query('ROLLBACK');
 await db.query('RESET ROLE');await db.query('BEGIN');
 const seats=Array.from({length:6},()=>randomUUID());
 for(const id of seats){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true',[id,'Seat fixture '+id]);}
 await db.query("INSERT INTO public.players(game_id,user_id,position,chips,status,is_bot) SELECT $1,id,n+1,0,'active',false FROM unnest($2::uuid[]) WITH ORDINALITY u(id,n)",[table.game_id,seats]);
 await role(db,b);assert.equal(await q('SELECT public.notification_table($1) v',[table.game_id]),null);await db.query('ROLLBACK');
 checks.push('landing denies closed/ending/full tables, inactive accounts, maintenance and concealed visibility without any seat or financial mutation');

 await role(db,b);await settings({quietEnabled:true,quietStart:'00:00',quietEnd:'00:00'});const quietTable=await newTable();
 await db.query('RESET ROLE');assert.equal(await q('SELECT count(*)::int v FROM private.push_events WHERE table_id=$1 AND user_id=$2',[quietTable.game_id,b]),0);
 await role(db,b);await settings({quietEnabled:false});await role(db);assert.equal(await claim(),null);
 const late=await newTable();await db.query('RESET ROLE');await db.query("UPDATE private.push_events SET created_at=now()-interval '6 minutes' WHERE table_id=$1",[late.game_id]);await role(db);assert.equal(await claim(),null);
 const closed=await newTable();await role(db);const closeClaim=await claim();assert(closeClaim);
 await peer.query('RESET ROLE');await peer.query("UPDATE public.games SET pending_session_end=true WHERE id=$1",[closed.game_id]);assert.equal(await auth(closeClaim),null);
 checks.push('quiet-time new tables are dropped with no morning backlog; five-minute expiry and close-after-claim authorization races pass');
 await db.query('RESET ROLE');await db.query("UPDATE private.push_deliveries SET state='skipped',lease=NULL,lease_until=NULL");
 const reboundTable=await newTable();await role(db);const reboundClaim=await claim();assert(reboundClaim);
 await role(peer,a);await peer.query('SELECT public.async_push_subscribe($1,$2,$3)',['https://web.push.apple.com/notifications-'+b,'B'.repeat(87),'A'.repeat(22)]);
 assert.equal(await auth(reboundClaim),null);await db.query('RESET ROLE');assert.equal(await q('SELECT binding<>$2 v FROM private.push_subscriptions WHERE id=$1',[sub.id,sub.binding]),true);
 checks.push('new-table delivery uses the same account/session/device binding fence as async delivery');
 checks.push('expanded Notifications database qualification passed');
}
