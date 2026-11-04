import {readFileSync as read,writeFileSync as write} from 'node:fs';
import assert from 'node:assert/strict';
const old=JSON.parse(read('dev/account-access/deployed-preimage.json','utf8'));
let sql=read('supabase/account-access/core.sql','utf8');
const replace=(s,a,b)=>{assert(s.includes(a),`Missing patch anchor: ${a}`);return s.replace(a,b);};
let registration=old.functions.find(f=>f.name==='handle_new_user').def;
registration=replace(registration,'BEGIN','BEGIN\n  INSERT INTO public.account_access(user_id) VALUES(NEW.id);');
registration=replace(registration,'(id, username, email)','(id, username, email, is_active)');
registration=replace(registration,'NEW.email\n','NEW.email, false\n');
sql+='\n'+registration+';\n';
let profile=old.functions.find(f=>f.name==='guard_profile_authority').def;
profile=replace(profile,'BEGIN',`BEGIN
 IF private.account_registered(NEW.id) AND NEW.is_active IS DISTINCT FROM private.account_enabled(NEW.id) THEN
  RAISE EXCEPTION 'account:use_access_command' USING ERRCODE='42501';
 END IF;`);
// The new projection is enforced even for service role writes; keep the original
// immutable identity and role source checks unchanged.
sql+='\n'+profile+';\n';
let role=old.functions.find(f=>f.name==='admin_set_user_role').def;
role=replace(role,"IF v_actor IS NULL OR NOT public.has_role(v_actor,'admin'::public.app_role) THEN", "IF v_actor IS NULL OR NOT private.account_enabled(v_actor) OR NOT public.has_role(v_actor,'admin'::public.app_role) THEN");
role=replace(role,'IF p_enabled THEN',`IF NOT p_enabled AND private.account_enabled(p_user_id) AND NOT EXISTS(
 SELECT FROM public.account_access a JOIN public.user_roles r ON r.user_id=a.user_id
 WHERE a.enabled AND a.user_id<>p_user_id AND r.role='admin') THEN
 RAISE EXCEPTION 'account:last_enabled_admin' USING ERRCODE='42501'; END IF;
 IF p_enabled THEN`);
sql+='\n'+role+';\n';
for(const f of old.functions){
 if(f.schema!=='public'||f.name==='admin_set_user_role'||!f.args||!/LANGUAGE plpgsql/.test(f.def)||/\n STABLE/.test(f.def))continue;
 const actor=f.args.includes('p_actor')?'p_actor':f.args.includes('p_verified_user_id')?'p_verified_user_id':f.args.includes('p_user_id')?'p_user_id':null;
 if(!actor)continue;
 assert(/\bBEGIN\b/i.test(f.def));
 sql+='\n-- Fresh access lock before existing gameplay/recovery ownership: '+f.name+'\n'+f.def.replace(/\bBEGIN\b/i,`BEGIN\n IF ${actor} IS NOT NULL THEN PERFORM private.require_account_enabled(${actor}); END IF;`)+';\n';
}
for(const f of JSON.parse(read('dev/account-access/canasta-preimage.json','utf8'))){
 if(f.name==='canasta_server_load')sql+='\n'+replace(f.def,'BEGIN','BEGIN\n IF p_user IS NOT NULL THEN PERFORM private.require_account_enabled(p_user); END IF;')+';\n';
 if(f.name==='canasta_server_commit')sql+='\n'+replace(f.def,'BEGIN',`BEGIN
 IF p_context->>'kind'<>'recover' THEN PERFORM private.require_account_enabled((p_context->>'userId')::uuid); END IF;`)+';\n';
}
for(const t of old.tables){
 if(t.schema==='realtime'&&t.name!=='messages'||t.schema==='storage'&&t.name!=='objects')continue;
 const table=`"${t.schema}"."${t.name}"`;
 if(!t.rls)sql+=`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\nCREATE POLICY account_prior_grants ON ${table} FOR ALL TO authenticated USING(true) WITH CHECK(true);\n`;
 sql+=`CREATE POLICY account_access_required ON ${table} AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT private.account_enabled(auth.uid()))) WITH CHECK((SELECT private.account_enabled(auth.uid())));\n`;
}
sql+=`\nCREATE FUNCTION public.account_assert_enabled(p_actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
 BEGIN PERFORM private.require_account_enabled(p_actor); END $$;
 REVOKE ALL ON FUNCTION public.account_assert_enabled(uuid) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.account_assert_enabled(uuid) TO service_role;\n`;
// Registration shares the existing outbox, subscriptions, retry leases and quiet hours.
sql+=`ALTER TABLE private.push_defaults ADD COLUMN registrations_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE private.push_events ADD COLUMN registration_user_id uuid REFERENCES auth.users(id);
ALTER TABLE private.push_events DROP CONSTRAINT push_events_kind_check, DROP CONSTRAINT push_events_check;
ALTER TABLE private.push_events ADD CONSTRAINT push_events_kind_check CHECK(kind IN('invite','turn','last_call','table_open','registration')),
 ADD CONSTRAINT push_events_check CHECK(
 (kind='registration' AND registration_user_id IS NOT NULL AND match_id IS NULL AND table_id IS NULL AND epoch=0) OR
 (kind='table_open' AND registration_user_id IS NULL AND table_id IS NOT NULL AND match_id IS NULL AND epoch=0) OR
 (kind IN('invite','turn','last_call') AND registration_user_id IS NULL AND table_id IS NULL AND match_id IS NOT NULL));
CREATE UNIQUE INDEX push_registration_recipient ON private.push_events(registration_user_id,user_id) WHERE kind='registration';
CREATE FUNCTION private.account_registered_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recipient uuid; event_i uuid;
BEGIN
 FOR recipient IN SELECT d.user_id FROM private.push_defaults d JOIN public.account_access a ON a.user_id=d.user_id
  WHERE d.registrations_enabled AND a.enabled AND public.has_role(d.user_id,'admin'::public.app_role) LOOP
  INSERT INTO private.push_events(user_id,registration_user_id,epoch,kind,keys) VALUES(recipient,NEW.id,0,'registration','{}')
  ON CONFLICT(registration_user_id,user_id) WHERE kind='registration' DO NOTHING RETURNING id INTO event_i;
  IF event_i IS NOT NULL THEN
   INSERT INTO private.push_deliveries(event_id,subscription_id,binding)
   SELECT event_i,id,binding FROM private.push_subscriptions WHERE user_id=recipient AND NOT disabled ON CONFLICT DO NOTHING;
  END IF;
 END LOOP; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.account_registered_push() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_account_registered_push AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.account_registered_push();\n`;
for(const f of old.push){let s=f.def;
 if(f.name==='push_eligible'){
  s=replace(s,"AND ((e.kind='table_open'",`AND ((e.kind='registration' AND public.has_role(e.user_id,'admin'::public.app_role)
   AND EXISTS(SELECT FROM private.push_defaults WHERE user_id=e.user_id AND registrations_enabled)
   AND EXISTS(SELECT FROM public.account_access WHERE user_id=e.registration_user_id AND NOT enabled AND NOT ever_enabled))
 OR (e.kind='table_open'`);
 }else if(f.name==='notification_preferences'){
  s=replace(s,"IF k IN('invitations'","IF k IN('registrations','invitations'");
  s=replace(s,'INSERT INTO private.push_defaults(user_id)',`IF p_patch ? 'registrations' AND NOT public.has_role(who,'admin'::public.app_role) THEN RAISE EXCEPTION 'push:admin_required' USING ERRCODE='42501'; END IF;
  INSERT INTO private.push_defaults(user_id)`);
  s=replace(s,'SET invitations_enabled=',"SET registrations_enabled=coalesce((p_patch->>'registrations')::boolean,registrations_enabled), invitations_enabled=");
  s=replace(s,"IF p_patch->>'newTable'='false' THEN",`IF p_patch->>'registrations'='false' THEN
   UPDATE private.push_deliveries d SET state='skipped',lease=NULL,lease_until=NULL FROM private.push_events e
    WHERE e.id=d.event_id AND e.user_id=who AND e.kind='registration' AND d.state IN('pending','sending');
  END IF;
  IF p_patch->>'newTable'='false' THEN`);
  s=replace(s,"RETURN jsonb_build_object('invitations'","RETURN CASE WHEN public.has_role(who,'admin'::public.app_role) THEN jsonb_build_object('registrations',coalesce(p.registrations_enabled,false)) ELSE '{}'::jsonb END || jsonb_build_object('invitations'");
 }else{
  s=replace(s,'IF private.push_user_active(e.user_id) THEN',"IF e.kind<>'registration' AND private.push_user_active(e.user_id) THEN");
  if(f.name==='async_push_authorize'){
   s=replace(s,"IF e.kind='table_open' THEN expiry", "IF e.kind='registration' THEN NULL; ELSIF e.kind='table_open' THEN expiry");
   s=replace(s,"'eventId',e.id,'matchId'","'registrationUserId',e.registration_user_id,'username',CASE WHEN e.kind='registration' THEN (SELECT username FROM public.profiles WHERE id=e.registration_user_id) END,'eventId',e.id,'matchId'");
  }
 }
 sql+='\n'+s+';\n';
}
sql+="\nNOTIFY pgrst,'reload schema';\n";
write('supabase/account-access/candidate.sql',sql);
console.log('Built account candidate from deployed definitions:',sql.length,'bytes');
