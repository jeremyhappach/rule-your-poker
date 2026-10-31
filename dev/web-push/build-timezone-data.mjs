import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
// Git may check text out with CRLF on Windows; verify the pinned canonical LF bytes.
const path='dev/web-push/tzdata/2026f-packed.json',bytes=Buffer.from(readFileSync(path,'utf8').replace(/\r\n/g,'\n'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'3103c5c0eaa879615da630b74e2373ad9b571e0eae992e0b2a3db6e4475de2ce');
const data=JSON.parse(bytes);assert.equal(data.version,'2026f');
const from=Date.parse('2020-01-01T00:00:00Z'),until=Date.parse('2038-01-01T00:00:00Z');
function digit(c){const n=c.charCodeAt(0);return n>96?n-87:n>64?n-29:n-48;}
function base60(s){let sign=1;if(s[0]==='-'){sign=-1;s=s.slice(1);}const [whole,part='']=s.split('.');let n=0,scale=1;for(const c of whole)n=n*60+digit(c);for(const c of part){scale/=60;n+=digit(c)*scale;}return n*sign;}
const zones=new Map(),names=new Map();
for(const packed of data.zones){
 const [name,,off,idx,delta]=packed.split('|'),offsets=off.split(' ').map(base60),indices=[...idx].map(base60);
 let total=0;const ends=delta.split(' ').map(v=>{total+=base60(v)*60000;return Math.round(total);});ends[indices.length-1]=Infinity;
 const transitions=[];let start=-Infinity,initial;
 for(let i=0;i<indices.length;i++){
  const end=ends[i],offset=Math.round(-offsets[indices[i]]*60);
  if(start<=from&&end>from)initial=offset;
  if(start>from&&start<until)transitions.push([Math.round(start/1000),offset]);
  start=end;
 }
 assert(Number.isFinite(initial),name);zones.set(name,{initial,transitions});names.set(name,name);
}
let links=data.links.map(x=>x.split('|'));
while(links.length){const remaining=[];for(const [a,b]of links){if(names.has(a))names.set(b,names.get(a));else if(names.has(b))names.set(a,names.get(b));else remaining.push([a,b]);}assert(remaining.length<links.length,'Unresolved timezone alias');links=remaining;}
const q=s=>"'"+s.replaceAll("'","''")+"'";
for(const c of JSON.parse(readFileSync('dev/web-push/timezone-golden.json','utf8')).cases){const r=zones.get(names.get(c.zone)),at=Date.parse(c.instant);let offset=r.initial;for(const [epoch,next]of r.transitions)if(epoch*1000<=at)offset=next;assert.equal(new Date(at+offset*1000).toISOString().slice(0,16).replace('T',' '),c.expected,c.zone);}
let sql=`-- Pinned public IANA 2026f reference data from Moment Timezone 0.6.6 (MIT).
-- Source SHA256: 3103c5c0eaa879615da630b74e2373ad9b571e0eae992e0b2a3db6e4475de2ce.
-- Explicit coverage: 2020-01-01 inclusive through 2038-01-01 exclusive. No host tzdata fallback.
CREATE TABLE private.push_timezone_rules(name text PRIMARY KEY, version text NOT NULL CHECK(version='2026f'), valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL, initial_offset integer NOT NULL, transitions jsonb NOT NULL);
CREATE TABLE private.push_timezone_names(name text PRIMARY KEY, canonical text NOT NULL REFERENCES private.push_timezone_rules(name));
ALTER TABLE private.push_timezone_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.push_timezone_names ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.push_timezone_rules,private.push_timezone_names FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.push_timezone_rules VALUES\n`;
sql += [...zones].map(([name,r])=>`(${q(name)},'2026f','2020-01-01T00:00:00Z','2038-01-01T00:00:00Z',${r.initial},${q(JSON.stringify(r.transitions))}::jsonb)`).join(',\n')+';\n';
sql += 'INSERT INTO private.push_timezone_names VALUES\n'+[...names].sort(([a],[b])=>a.localeCompare(b)).map(([n,c])=>`(${q(n)},${q(c)})`).join(',\n')+';\n';
sql += `CREATE FUNCTION private.push_local_time(zone_name text, at_time timestamptz) RETURNS timestamp
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.push_timezone_rules; offset_seconds integer;
BEGIN
 SELECT z.* INTO r FROM private.push_timezone_names n JOIN private.push_timezone_rules z ON z.name=n.canonical WHERE n.name=zone_name;
 IF NOT FOUND THEN RAISE EXCEPTION 'push:invalid_timezone'; END IF;
 IF at_time IS NULL OR at_time<r.valid_from OR at_time>=r.valid_until THEN RAISE EXCEPTION 'push:timezone_out_of_range'; END IF;
 SELECT (t->>1)::integer INTO offset_seconds FROM jsonb_array_elements(r.transitions) t WHERE (t->>0)::bigint<=extract(epoch FROM at_time) ORDER BY (t->>0)::bigint DESC LIMIT 1;
 RETURN (at_time AT TIME ZONE 'UTC')+make_interval(secs=>coalesce(offset_seconds,r.initial_offset));
END $$;
REVOKE ALL ON FUNCTION private.push_local_time(text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
`;
const candidate=readFileSync('supabase/web-push/candidate.sql','utf8');
function definition(name){const start=candidate.indexOf('CREATE FUNCTION '+name+'(');assert(start>=0);const end=candidate.indexOf('\n$$;',start);const plEnd=candidate.indexOf('\nEND $$;',start);const stop=plEnd>=0&&(end<0||plEnd<end)?plEnd+8:end+4;assert(stop>start);return candidate.slice(start,stop).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');}
sql+=definition('private.push_quiet_at').replaceAll('(at_time AT TIME ZONE p.quiet_zone)','private.push_local_time(p.quiet_zone,at_time)')+'\n';
sql+=definition('public.notification_preferences').replace("pg_catalog.pg_timezone_names WHERE name=p_patch->>k AND (name='UTC' OR name LIKE '%/%') AND name NOT LIKE 'posix/%' AND name NOT LIKE 'right/%'","private.push_timezone_names WHERE name=p_patch->>k")+'\n';
writeFileSync('supabase/web-push/timezone.sql',sql);
writeFileSync('dev/web-push/tzdata/provenance.json',JSON.stringify({source:'https://raw.githubusercontent.com/moment/moment-timezone/0.6.6/data/packed/latest.json',iana:'2026f',sourceSha256:createHash('sha256').update(bytes).digest('hex'),canonicalZones:zones.size,names:names.size,from:new Date(from).toISOString(),until:new Date(until).toISOString(),sqlSha256:createHash('sha256').update(sql).digest('hex')},null,2));
console.log(JSON.stringify({zones:zones.size,names:names.size,sqlBytes:Buffer.byteLength(sql)}));
