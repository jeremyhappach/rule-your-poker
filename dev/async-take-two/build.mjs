import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const original=JSON.parse(read('dev/async-take-two/preimage.json'));
const find=n=>original.find(f=>f.name===n),norm=s=>s.replace(/\r/g,'');
const change=(s,a,b)=>{assert(s.includes(a),'missing source anchor '+a);return s.replace(a,()=>b);};
const updates=[];
function patch(n,edit){const f=find(n),before=norm(f.definition),after=edit(before);assert.notEqual(before,after,n);updates.push({...f,before,after});}
const foundation=read('supabase/delayed/take-two-foundation.sql','utf8');
const deal=find('take_two_board_deal');
let helper=norm(deal.definition).replace('private.take_two_board_deal(b jsonb, at_ms bigint)','private.take_two_board_from_deck(b jsonb, at_ms bigint, deck jsonb)');
helper=change(helper,'deck jsonb:=private.take_two_shuffle();','');
helper=change(helper,'BEGIN\n',`BEGIN
 IF jsonb_typeof(deck) IS DISTINCT FROM 'array' OR jsonb_array_length(deck)<>52
 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(deck))<>52
 OR EXISTS(SELECT FROM jsonb_array_elements(deck) x WHERE jsonb_typeof(x)<>'number' OR x::text !~ '^[0-9]+$' OR (x::text)::integer NOT BETWEEN 0 AND 51)
 THEN RAISE EXCEPTION 'take_two:invalid_deck';END IF;
`);
patch('take_two_board_deal',s=>s.slice(0,s.indexOf('AS $function$'))+`AS $function$
BEGIN
 RETURN private.take_two_board_from_deck(b,at_ms,private.take_two_shuffle());
END $function$
`);
for(const n of ['delayed_create','delayed_respond','delayed_load','delayed_commit']){
 patch(n,s=>{
  s=change(s,"'boxdrop','mega-card-golf'","'boxdrop','mega-card-golf','take-two'");
  if(n==='delayed_create')s=change(s,"  WHEN 'mega-card-golf' THEN",`  WHEN 'take-two' THEN
   IF NOT (SELECT enabled FROM private.delayed_take_two_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
   cfg:=private.take_two_rules('take-two/2');
  WHEN 'mega-card-golf' THEN`);
  if(n==='delayed_respond'){
   s=change(s,"  FOR c IN SELECT",`  IF EXISTS(SELECT FROM private.delayed_children WHERE match_id=m.id AND game_type='take-two')
   AND NOT (SELECT enabled FROM private.delayed_take_two_release WHERE singleton) THEN RAISE EXCEPTION 'delayed:admission_closed';END IF;
  FOR c IN SELECT`);
   s=change(s,"   UPDATE private.delayed_children SET state=dealt",`   IF c.game_type='take-two' THEN
    INSERT INTO private.delayed_take_two_deals(child_id,round,deck)
    SELECT c.id,r,private.take_two_shuffle() FROM generate_series(1,3) r;
   END IF;
   UPDATE private.delayed_children SET state=dealt`);
  }return s;
 });
}
patch('delayed_capabilities',s=>change(s," ELSE '[]'::jsonb END END)",` ELSE '[]'::jsonb END
 ||CASE WHEN (SELECT enabled FROM private.delayed_take_two_release WHERE singleton)
 THEN jsonb_build_array(jsonb_build_object('id','take-two','stake',(SELECT ante_amount FROM public.game_defaults WHERE game_type='take-two'),'rules',private.take_two_rules('take-two/2')))
 ELSE '[]'::jsonb END END)`));
patch('delayed_review_board',s=>change(s," WHEN 'ptown-words' THEN"," WHEN 'take-two' THEN private.take_two_visible(b)\n WHEN 'ptown-words' THEN"));
patch('delayed_reviews',s=>change(s,"(e.actor IS DISTINCT FROM who OR e.kind='child');","(e.actor IS DISTINCT FROM who OR e.kind='child') AND private.delayed_take_two_review_allowed(e,who);"));
for(const [n,anchor] of [['delayed_review_begin',' INSERT INTO private.delayed_review_playback'],['delayed_review_ack',' INSERT INTO private.delayed_review_seen']]){
 patch(n,s=>change(s,anchor,` IF NOT private.delayed_take_two_review_allowed(e,who) THEN RAISE EXCEPTION 'delayed:review_unavailable' USING ERRCODE='42501';END IF;
`+anchor));
}
const guarded=updates.map(f=>`DO $patch$
DECLARE current_source text:=replace(pg_get_functiondef('${f.signature}'::regprocedure),chr(13),'');
BEGIN
 IF current_source=$before$${f.before}$before$ THEN EXECUTE $after$${f.after}$after$;
 ELSIF current_source<>$after$${f.after}$after$ THEN RAISE EXCEPTION 'take_two:source_changed ${f.name}';END IF;
END $patch$;`).join('\n');
mkdirSync('qualification.local/async-take-two',{recursive:true});
write('qualification.local/async-take-two/updates.json',JSON.stringify(updates,null,2));
const originalDeal=norm(deal.definition).replace('private.take_two_board_deal(b jsonb, at_ms bigint)','pg_temp.original_take_two_deal(b jsonb, at_ms bigint, deck jsonb)').replace('deck jsonb:=private.take_two_shuffle();','');
write('supabase/delayed/take-two-parity-proof.sql',originalDeal+`;\nDO $parity$
DECLARE deck_i jsonb;b jsonb;version_i text;round_i integer;offset_i integer;score_i bigint;count_i integer:=0;
BEGIN
 FOREACH version_i IN ARRAY ARRAY['take-two/1','take-two/2'] LOOP
  FOR round_i IN 1..3 LOOP
   FOR offset_i IN 0..51 LOOP
    SELECT jsonb_agg((i+offset_i)%52 ORDER BY i) INTO deck_i FROM generate_series(0,51)i;
    FOREACH score_i IN ARRAY ARRAY[0,12345]::bigint[] LOOP
     b:=jsonb_build_object('rules',private.take_two_rules(version_i),'stage',round_i,'score',score_i);
     IF private.take_two_board_from_deck(b,1800000000000,deck_i) IS DISTINCT FROM pg_temp.original_take_two_deal(b,1800000000000,deck_i)
     THEN RAISE EXCEPTION 'take_two:legacy_deal_parity';END IF;count_i:=count_i+1;
    END LOOP;
   END LOOP;
  END LOOP;
 END LOOP;
 IF count_i<>624 THEN RAISE EXCEPTION 'take_two:parity_count';END IF;
END $parity$;\n`);
write('supabase/delayed/take-two.candidate.sql',foundation+'\n'+helper+';\nREVOKE ALL ON FUNCTION private.take_two_board_from_deck(jsonb,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;\n'+guarded+'\n'+read('supabase/delayed/take-two-core.sql','utf8'));
console.log('Prepared closed candidate with',updates.length,'guarded existing function changes; shared scoring unchanged.');
