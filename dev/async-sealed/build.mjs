import {readFileSync,writeFileSync} from 'node:fs';
const base=JSON.parse(readFileSync('dev/async-sealed/preimages.json','utf8'));
const pushes=JSON.parse(readFileSync('dev/async-sealed/push-preimages.json','utf8'));
const get=name=>base.find(x=>x.name===name).definition;
const replace=(s,from,to)=>{if(!s.includes(from))throw Error('Missing SQL anchor: '+from);return s.replace(from,to);};
const parts=[readFileSync('supabase/delayed/sealed-rounds.sql','utf8')];
const triStep=JSON.parse(readFileSync('dev/async-sealed/routing-preimages.json','utf8')).find(x=>x.name==='delayed_tri_bonus_step').definition;
parts.push(replace(triStep,'BEGIN\n',`BEGIN
 IF EXISTS(SELECT FROM private.delayed_children WHERE id=p_child AND private.delayed_sealed(delayed_children)) THEN RAISE EXCEPTION 'delayed:sealed_flow_required';END IF;
`));
let s=get('delayed_respond');
s=replace(s,'   UPDATE private.delayed_children SET state=dealt',`   IF m.policy_version='delayed/sealed/1' AND c.game_type IN('run21','tri-towers','quintzee','boxdrop','mega-card-golf','take-two','crib-lab','chucky-showdown') THEN
    first_actor:=m.organizer;dealt:=private.delayed_sealed_initial(c,m);
   END IF;
   UPDATE private.delayed_children SET state=dealt`);parts.push(s);
s=get('delayed_load');s=replace(s,' RETURN private.delayed_child_record(c)||',` IF private.delayed_sealed(c) AND p_actor IS NOT NULL THEN RETURN public.delayed_sealed_load(p_child,p_actor,p_request);END IF;
 RETURN private.delayed_child_record(c)||`);parts.push(s);
for(const name of ['delayed_commit','delayed_board_action','delayed_bonus_choice']) {
 s=get(name);s=replace(s,'BEGIN\n',`BEGIN
 IF EXISTS(SELECT FROM private.delayed_children WHERE id=p_child AND private.delayed_sealed(delayed_children)) THEN RAISE EXCEPTION 'delayed:sealed_flow_required';END IF;
`);parts.push(s);
}
s=get('delayed_child_record');s=replace(s,"'organizer',m.organizer", "'sealed',private.delayed_sealed(c),'organizer',m.organizer");parts.push(s);
s=get('five_alive_or_actor');s=replace(s," IF c.game_type<>'five-alive'",` IF private.delayed_sealed(c) THEN RETURN private.delayed_sealed_can_play(c,p_actor);END IF;
 IF c.game_type<>'five-alive'`);parts.push(s);
s=get('optional_bonus_async_offer');s=replace(s,'BEGIN\n',`BEGIN
 IF private.delayed_sealed(NEW) THEN RETURN NEW;END IF;
`);parts.push(s);
s=get('delayed_expire');s=replace(s," IF c.game_type='chess'",` IF private.delayed_sealed(c) THEN RETURN false;END IF;
 IF c.game_type='chess'`);parts.push(s);
s=get('mega_delayed_guard');
s=replace(s,"attempt->>'actor' IS DISTINCT FROM OLD.actor::text", "attempt->>'actor' IS DISTINCT FROM (CASE WHEN private.delayed_sealed(NEW) THEN attempt->>'actor' ELSE OLD.actor::text END)");
s=replace(s,"PERFORM private.mega_assert_board(attempt->'board',NEW.config,OLD.state->'board');", "PERFORM private.mega_assert_board(attempt->'board',NEW.config,CASE WHEN private.delayed_sealed(NEW) THEN OLD.state#>ARRAY['parts',attempt->>'actor','board'] ELSE OLD.state->'board' END);");parts.push(s);
s=get('delayed_take_two_review_allowed');s=replace(s," SELECT (c.game_type", " SELECT CASE WHEN private.delayed_sealed(c) THEN e.actor=who OR e.kind='child' OR e.round<(c.state->>'round')::int ELSE (c.game_type");s=replace(s,' FROM private.delayed_children c',' END FROM private.delayed_children c');parts.push(s);
s=get('delayed_home_before_reviews');s=replace(s,"'id',m.id,'status'", "'policyVersion',m.policy_version,'id',m.id,'status'");parts.push(s);
s=get('delayed_home');s=replace(s," item:=item||jsonb_build_object('reviewCount'",` IF private.delayed_sealed(c) THEN
  SELECT jsonb_object_agg(q.person_key,q.score),jsonb_object_agg(q.person_key,q.completed),jsonb_object_agg(q.person_key,q.pending)
   INTO scores,progress,pending_counts FROM (
    SELECT player.id person_key,coalesce(sum((a->>'score')::bigint) FILTER(WHERE player.id=who::text OR (a->>'round')::int<(c.state->>'round')::int),0) score,
     count(a) completed,count(a) FILTER(WHERE player.id<>who::text AND (a->>'round')::int>=(c.state->>'round')::int) pending
    FROM jsonb_array_elements_text(c.state->'players') player(id) LEFT JOIN LATERAL jsonb_array_elements(c.state->'attempts') a ON a->>'actor'=player.id GROUP BY player.id
   ) q;
  item:=item||jsonb_build_object('flowVersion','delayed/sealed/1','completedRounds',progress,'round',c.state->'round',
   'playable',h->>'status'='active' AND NOT (h->>'held')::boolean AND private.delayed_sealed_can_play(c,who),
   'opponentPlayable',h->>'status'='active' AND NOT (h->>'held')::boolean AND private.delayed_sealed_can_play(c,CASE WHEN who::text=h->>'organizer' THEN (h->>'opponent')::uuid ELSE (h->>'organizer')::uuid END),
   'startedAt',to_timestamp((c.state#>>ARRAY['parts',who::text,'segmentStartedAt'])::bigint/1000.0));
 END IF;
 item:=item||jsonb_build_object('reviewCount'`);parts.push(s);
s=get('delayed_reviews');s=replace(s,"'terminal',c.terminal,'actor',c.actor,'segment',c.segment,'revision',c.revision,'started',c.started_at IS NOT NULL",`'terminal',c.terminal,'actor',CASE WHEN private.delayed_sealed(c) THEN (private.delayed_sealed_record(c,who)->>'actor')::uuid ELSE c.actor END,'segment',CASE WHEN private.delayed_sealed(c) THEN (c.state#>>ARRAY['parts',who::text,'segment'])::bigint ELSE c.segment END,'revision',c.revision,'started',CASE WHEN private.delayed_sealed(c) THEN nullif(c.state#>ARRAY['parts',who::text,'board'],'null') IS NOT NULL ELSE c.started_at IS NOT NULL END`);parts.push(s);
s=get('delayed_presence_allowed');s=replace(s,"WHERE topic_i='delayed-playing:'",`CROSS JOIN LATERAL (SELECT who FROM unnest(ARRAY[m.organizer,m.opponent]) who WHERE CASE WHEN private.delayed_sealed(c) THEN private.delayed_sealed_can_play(c,who) ELSE who=c.actor END) participant
  WHERE topic_i='delayed-playing:'`);s=s.replaceAll("||c.actor::text||", "||participant.who::text||").replaceAll('auth.uid()=c.actor','auth.uid()=participant.who');parts.push(s);
for(const item of pushes){
 s=item.definition.replaceAll('c.actor=who','private.five_alive_or_actor(c,who)').replaceAll('c.actor=e.user_id','private.five_alive_or_actor(c,e.user_id)');
 if(item.name==='async_badge_snapshot')s=replace(s,"c.game_type='five-alive' THEN", "(c.game_type='five-alive' OR private.delayed_sealed(c)) THEN");
 parts.push(s);
}
const homeIndex=parts.findIndex(part=>part.startsWith('CREATE OR REPLACE FUNCTION public.delayed_home(p_match'));
parts[homeIndex]=replace(parts[homeIndex],"jsonb_build_object('playable',h->>'status'", "jsonb_build_object('round',least(3,coalesce((c.state#>>'{fiveAlive,current}')::int,0)+1),'playable',h->>'status'");
const sql=parts.map(part=>part.trimEnd().endsWith(';')?part:part+';').join('\n\n');
writeFileSync('supabase/migrations/20261127225944_async_simultaneous_sealed_rounds.sql',sql);
console.log('Built sealed-round migration: '+Buffer.byteLength(sql)+' bytes');
