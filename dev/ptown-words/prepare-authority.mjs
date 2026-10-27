import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=read('supabase/boxdrop/multiplayer.sql','utf8').replaceAll('\r\n','\n');
const evidence=JSON.parse(read('dev/ptown-words/deployed-contract.json','utf8'));
const rename=s=>s.replaceAll('boxdrop','ptown_words').replaceAll("'ptown_words'","'ptown-words'").replaceAll('Boxdrop','Ptown Words');
const fn=name=>{const deployed=evidence.functions.find(f=>f.name===name);if(deployed)return deployed.definition+';\n';const start=source.indexOf('CREATE OR REPLACE FUNCTION '+name);if(start<0)throw Error(name);const end=source.indexOf('$function$',source.indexOf('$function$',start)+10);return source.slice(start,end+10)+';\n';};
mkdirSync('supabase/ptown-words',{recursive:true});
let schema=rename(source.slice(0,source.indexOf('-- Same approved-account')));
schema=schema.replace('command jsonb NOT NULL,','command jsonb NOT NULL, response jsonb,');
schema=schema.replace('created_at timestamptz','last_request_at bigint NOT NULL DEFAULT 0,\n created_at timestamptz');
const helpers=['private.boxdrop_actor_allowed','public.boxdrop_capabilities','private.boxdrop_publish','public.boxdrop_snapshot','public.boxdrop_history','boxdrop_configure','boxdrop_settle','boxdrop_finish_postgame','public.boxdrop_close','private.boxdrop_pause'];
let authority=helpers.map(name=>rename(fn(name))).join('\n');
authority=authority.replace('private.ptown_words_visible(m.state)','private.ptown_words_visible(m.state,viewer::text)');
authority=authority.replace("IF coalesce(jsonb_array_length(people),0) <>2", "IF coalesce(jsonb_array_length(people),0) NOT BETWEEN 2 AND 4");
authority=authority.replace("IF coalesce(g.pot,0)<>0", "IF EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) THEN RAISE EXCEPTION 'ptown_words:humans_only';END IF;\n IF coalesce(g.pot,0)<>0");
authority=authority.replace("SELECT array_agg(key::uuid ORDER BY key) INTO winners FROM jsonb_each_text(m.state->'scores') WHERE value::integer=(SELECT max(value::integer) FROM jsonb_each_text(m.state->'scores'));", "SELECT array_agg(value::uuid ORDER BY value) INTO winners FROM jsonb_array_elements_text(m.state->'winnerIds');\n IF coalesce(cardinality(winners),0)=0 THEN RAISE EXCEPTION 'ptown_words:missing_winners';END IF;");
authority=authority.replace("'achievements',private.ptown_words_record_scores(m.dealer_game_id)","'achievements','{}'::jsonb");
write('supabase/ptown-words/authority.sql',schema+'\n'+authority);

const originals=['megatouch_begin','advance_ante_phase_exact','megatouch_frozen_stake'];
let registration='';
for(const name of originals){
 const original=evidence.functions.find(f=>f.name===name).definition;
 const hash=createHash('md5').update(original).digest('hex');
 const sig={megatouch_begin:'private.megatouch_begin(uuid,uuid)',advance_ante_phase_exact:'private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)',megatouch_frozen_stake:'private.megatouch_frozen_stake()'}[name];
 registration+=`DO $guard$ BEGIN IF md5(pg_get_functiondef('${sig}'::regprocedure)) IS DISTINCT FROM '${hash}' THEN RAISE EXCEPTION 'ptown_words:shared_owner_drift:${name}';END IF;END $guard$;\n`;
 let updated=original.replaceAll("'quintzee','eleven-up'","'ptown-words','quintzee','eleven-up'");
 if(name==='megatouch_begin'){
  updated=updated.replace("WHEN g.game_type='quintzee' THEN 4","WHEN g.game_type IN('ptown-words','quintzee') THEN 4");
  updated=updated.replace("  IF g.game_type='quintzee' THEN\n", "  IF g.game_type='ptown-words' THEN\n   IF EXISTS(SELECT 1 FROM jsonb_array_elements(people)p WHERE (p->>'isBot')::boolean) OR NOT EXISTS(SELECT 1 FROM private.ptown_words_release WHERE singleton AND enabled AND admission_enabled) THEN RAISE EXCEPTION 'ptown_words:admission_closed';END IF;\n   s:=private.ptown_words_deal(s,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);\n   INSERT INTO private.ptown_words_matches(dealer_game_id,game_id,round_id,state,stake) VALUES(p_dealer,p_game,r,s,stake_i);\n  ELSIF g.game_type='quintzee' THEN\n");
 }
 if(updated===original)throw Error('Missing registration anchor '+name);
 registration+=updated+';\n';
}
write('supabase/ptown-words/registration.sql',registration);
// Full pinned vocabulary enters the same database transaction as rule installation.
const words=read('server/ptownWords/dictionaries/enable2k-1/words.txt','utf8');
if(createHash('sha256').update(words).digest('hex')!=='d5ec7b3b1d35db798cee044fe3ec37e7cc0a96a00dee5695ad34c767f1797925')throw Error('Dictionary integrity');
mkdirSync('qualification.local/ptown-words',{recursive:true});
write('qualification.local/ptown-words/lexicon.sql',`INSERT INTO private.ptown_words_lexicon(version,word) SELECT 'enable2k/1',word FROM string_to_table($words$${words.slice(0,-1)}$words$,E'\\n') word;\nDO $$ BEGIN IF (SELECT count(*) FROM private.ptown_words_lexicon)<>173528 THEN RAISE EXCEPTION 'ptown_words:lexicon_count';END IF;END $$;`);
console.log('Prepared authority, guarded registrations and full pinned database vocabulary');
