import assert from 'node:assert/strict';
export async function timezoneProof(db,checks){
 await db.query('RESET ROLE');
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
 const local=(zone,instant)=>q("SELECT to_char(private.push_local_time($1,$2::timestamptz),'YYYY-MM-DD HH24:MI:SS') v",[zone,instant]);
 assert.equal(await q('SELECT count(*)::int v FROM private.push_timezone_names'),597);
 assert.equal(await local('US/Central','2026-11-01T12:00:00Z'),await local('America/Chicago','2026-11-01T12:00:00Z'));
 assert.equal(await local('Canada/Mountain','2026-11-01T12:00:00Z'),'2026-11-01 06:00:00');
 assert.equal(await local('America/New_York','2026-03-08T06:59:59Z'),'2026-03-08 01:59:59');
 assert.equal(await local('America/New_York','2026-03-08T07:00:00Z'),'2026-03-08 03:00:00');
 for(const instant of['2026-11-01T05:30:00Z','2026-11-01T06:30:00Z'])assert.equal(await local('America/New_York',instant),'2026-11-01 01:30:00');
 assert.equal(await local('Asia/Kathmandu','2026-11-01T12:00:00Z'),'2026-11-01 17:45:00');
 assert.equal(await local('Australia/Lord_Howe','2026-10-03T15:29:59Z'),'2026-10-04 01:59:59');
 assert.equal(await local('Australia/Lord_Howe','2026-10-03T15:30:00Z'),'2026-10-04 02:30:00');
 for(const [zone,instant,message]of [['Bad/Zone','2026-11-01T12:00:00Z','push:invalid_timezone'],['UTC','2019-12-31T23:59:59Z','push:timezone_out_of_range'],['UTC','2038-01-01T00:00:00Z','push:timezone_out_of_range']])await assert.rejects(local(zone,instant),new RegExp(message));
 assert.equal(await q("SELECT count(*)::int v FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname IN('push_timezone_rules','push_timezone_names') AND c.relrowsecurity AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')"),2);
 assert.equal(await q("SELECT has_function_privilege('authenticated','private.push_local_time(text,timestamptz)','EXECUTE') OR has_function_privilege('service_role','private.push_local_time(text,timestamptz)','EXECUTE') OR has_function_privilege('anon','private.push_local_time(text,timestamptz)','EXECUTE') v"),false);
 checks.push('pinned IANA2026f:597 names, aliases, five golden zones, fractional offsets, DST folds/gaps, strict coverage and revoked direct access');
}
