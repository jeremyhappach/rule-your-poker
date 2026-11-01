import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const images=JSON.parse(readFileSync('dev/web-push/real-money-preimage.json'));
const hash=s=>createHash('md5').update(s).digest('hex');
const rows=images.map(f=>{
 const before=f.definition.replaceAll('\r','');
 if(hash(before)!==f.hash)throw Error('preimage hash');
 const needle=f.signature==='private.push_invited()'?' OR m.real_money':' AND NOT m.real_money';
 const after=before.replaceAll(needle,'');
 if(after===before)throw Error('missing exclusion');
 return {signature:f.signature,before:f.hash,after:hash(after),needle};
});
const values=rows.map(r=>`('${r.signature}','${r.before}','${r.after}','${r.needle}')`).join(',\n  ');
const sql=`-- Enable the existing async push lifecycle in both money modes.
-- No new public API/grant, payload field, financial/gameplay owner or delivery policy.
-- Exact deployed-source guards reject drift. Reapplication is inert, including baseline seeding.
DO $migration$
DECLARE f record; source text;
BEGIN
 FOR f IN SELECT * FROM (VALUES
  ${values}
 ) AS expected(signature,before_hash,after_hash,needle) LOOP
  source:=replace(pg_get_functiondef(f.signature::regprocedure),chr(13),'');
  IF md5(source) NOT IN(f.before_hash,f.after_hash) THEN
   RAISE EXCEPTION 'real_money_async_push: unexpected definition %',f.signature;
  END IF;
 END LOOP;

 IF md5(replace(pg_get_functiondef('private.push_sync(uuid)'::regprocedure),chr(13),''))='${rows.find(r=>r.signature==='private.push_sync(uuid)').before}' THEN
  -- Serialize with the parent-first lock used by push_sync. Observe current
  -- turns without emitting events: existing waiting turns must never backfill.
  PERFORM id FROM private.delayed_matches WHERE real_money AND status IN('invited','active') ORDER BY id FOR UPDATE;
  INSERT INTO private.push_episodes(match_id,user_id,keys)
   SELECT m.id,u.user_id,ARRAY(SELECT c.id::text||':'||c.segment
    FROM private.delayed_children c WHERE c.match_id=m.id AND c.actor=u.user_id
     AND NOT c.terminal AND c.expires_at>clock_timestamp()
     AND (c.gameplay_due_at IS NULL OR c.gameplay_due_at>clock_timestamp())
     AND NOT EXISTS(SELECT FROM private.delayed_removals WHERE match_id=m.id)
    ORDER BY c.id)
   FROM private.delayed_matches m CROSS JOIN LATERAL unnest(ARRAY[m.organizer,m.opponent]) u(user_id)
   WHERE m.real_money AND m.status='active'
   ON CONFLICT(match_id,user_id) DO UPDATE SET keys=EXCLUDED.keys;
 END IF;

 FOR f IN SELECT * FROM (VALUES
  ${values}
 ) AS expected(signature,before_hash,after_hash,needle) LOOP
  source:=replace(pg_get_functiondef(f.signature::regprocedure),chr(13),'');
  IF md5(source)=f.before_hash THEN EXECUTE replace(source,f.needle,''); END IF;
  IF md5(replace(pg_get_functiondef(f.signature::regprocedure),chr(13),''))<>f.after_hash THEN
   RAISE EXCEPTION 'real_money_async_push: incorrect installed definition %',f.signature;
  END IF;
 END LOOP;
END $migration$;
`;
writeFileSync('supabase/migrations/20261101172147_real_money_async_push.sql',sql);
console.log(JSON.stringify(rows.map(({signature,before,after})=>({signature,before,after}))));
