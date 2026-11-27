import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const installed=process.argv.includes('--installed');
const candidate=installed?'':read('supabase/delayed/flow-repair.sql');
const repair=read('supabase/delayed/flow-repair-incident.sql');
const before=`CREATE TEMP TABLE flow_incident_before AS SELECT id,to_jsonb(c) body FROM private.delayed_children c WHERE match_id='678aebe0-29ff-4a0e-a4f1-0282ea622afc';
CREATE TEMP TABLE flow_parent_before AS SELECT to_jsonb(m) body FROM private.delayed_matches m WHERE id='678aebe0-29ff-4a0e-a4f1-0282ea622afc';
CREATE TEMP TABLE flow_seen_before AS SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.event_id,s.viewer),'[]') body FROM private.delayed_review_seen s JOIN private.delayed_review_events e ON e.id=s.event_id WHERE e.match_id='678aebe0-29ff-4a0e-a4f1-0282ea622afc';`;
const sql=['BEGIN; SET LOCAL lock_timeout=\'5s\'; SET LOCAL statement_timeout=\'90s\';',before,candidate,candidate,repair,repair,
 read('supabase/delayed/flow-repair-proof.sql'),read('supabase/optional-bonus/async-proof.sql'),read('supabase/admin-board-undo/proof.sql'),'ROLLBACK;'].join('\n');
mkdirSync('qualification.local/async-flow',{recursive:true});
writeFileSync('qualification.local/async-flow/'+(installed?'installed':'candidate')+'-proof.sql',sql);
