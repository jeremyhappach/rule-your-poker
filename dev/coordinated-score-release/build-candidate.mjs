import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const baseline=JSON.parse(readFileSync('qualification.local/coordinated-db-baseline.json'));
const d=baseline.definitions,cfg=JSON.parse(readFileSync('dev/coordinated-score-release/horses-v5.json'));
const changes=[];
const replace=(s,a,b)=>{if(!s.includes(a))throw Error('Missing authority anchor: '+a);return s.replaceAll(a,b);};
const edit=(key,fn)=>changes.push({key,old:d[key],sql:fn(d[key])});
const hbConfig={version:'horses-blitz/5',matrix:cfg.matrix,earlyPercent:cfg.early,naturalPercent:cfg.natural,fiveOnesBase:cfg.ones,timePerSecond:cfg.time};
edit('private.horses_blitz_rules(text)',s=>replace(s," RAISE EXCEPTION 'horses_blitz:rules';",` IF version='horses-blitz/5' THEN RETURN private.horses_blitz_rules('horses-blitz/4')||'${JSON.stringify(hbConfig)}'::jsonb;END IF;\n RAISE EXCEPTION 'horses_blitz:rules';`));
edit('private.horses_blitz_set(jsonb,integer,jsonb)',s=>{
 s=replace(s,"cfg->>'version'<>'horses-blitz/4'","cfg->>'version' NOT IN ('horses-blitz/4','horses-blitz/5')");
 s=replace(s,'base_i:=2600','base_i:=CASE WHEN cfg->>\'version\'=\'horses-blitz/5\' THEN 1600 ELSE 2600 END');
 return replace(s,'WHEN 1 THEN 1.30','WHEN 1 THEN CASE WHEN cfg->>\'version\'=\'horses-blitz/5\' THEN 1.25 ELSE 1.30 END');
});
for(const key of ['private.horses_blitz_finish(jsonb,bigint,text)','private.horses_blitz_valid(jsonb)'])edit(key,s=>replace(s,'*50',"*(CASE WHEN s#>>'{config,version}'='horses-blitz/5' THEN 15 ELSE 50 END)"));
const drop5=baseline.rules.find(r=>r.id==='357-drop/5').config;
const drop6={...drop5,version:'357-drop/6',threeRow:{ranks:[2,4,5,6,7,8,9,10,11,12,13,15],pair:[80,100,120,145,175,210,250,300,360,430,510,620],trips:[800,880,970,1070,1170,1290,1420,1560,1720,1880,2050,2240],kickerMultiplier:2}};
let sql=`-- Coordinated release: install frozen scoring versions with admission CLOSED.\n-- Existing registry rows, pinned runs, results and command receipts are untouched.\n`;
sql+=`CREATE OR REPLACE FUNCTION private.drop357_v6_rules() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '${JSON.stringify(drop6)}'::jsonb $$;\n`;
sql+=`CREATE OR REPLACE FUNCTION private.drop357_lane(cards integer[],lane integer,cfg jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb;v integer[];base integer:=0;bonus integer:=0;ix integer;
BEGIN
 result:=private.drop357_lane(cards,lane);
 IF lane<>3 OR cfg->>'version' IS DISTINCT FROM '357-drop/6' THEN RETURN result;END IF;
 IF cfg IS DISTINCT FROM private.drop357_v6_rules() THEN RAISE EXCEPTION '357:rules';END IF;
 v:=ARRAY(SELECT value::integer FROM jsonb_array_elements_text(result->'vector'));
 ix:=array_position(ARRAY[2,4,5,6,7,8,9,10,11,12,13,15],v[2])-1;
 IF v[1]=3 THEN base:=(cfg#>'{threeRow,trips}'->>ix)::integer;
 ELSIF v[1]=1 THEN base:=(cfg#>'{threeRow,pair}'->>ix)::integer+2*v[3];END IF;
 bonus:=CASE WHEN (result->>'natural')::boolean THEN round(base*0.20)::integer ELSE 0 END;
 RETURN result||jsonb_build_object('points',base,'bonus',bonus,'score',base+bonus);
END $$;
REVOKE ALL ON FUNCTION private.drop357_v6_rules(),private.drop357_lane(integer[],integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
`;
edit('private.drop357_v4_action(jsonb,text,integer[],bigint)',s=>replace(s,'private.drop357_lane(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(row_i)),(ARRAY[3,5,7])[i+1])',"private.drop357_lane(ARRAY(SELECT value::integer FROM jsonb_array_elements_text(row_i)),(ARRAY[3,5,7])[i+1],s->'config')"));
edit('private.drop357_valid(jsonb)',s=>replace(s,'private.drop357_lane(cards,(ARRAY[3,5,7])[i+1])',"private.drop357_lane(cards,(ARRAY[3,5,7])[i+1],s->'config')"));
for(const key of ['private.drop357_v4_valid(jsonb)','private.drop357_deal_dispatch(jsonb,bigint,integer)','private.drop357_valid_dispatch(jsonb)','private.drop357_select_ruleset(text)','arcade_drop357_step(uuid,uuid,bigint,text,uuid,text,integer[],uuid)'])edit(key,s=>{
 s=replace(s,"'357-drop/5')","'357-drop/5','357-drop/6')");
 return key==='private.drop357_v4_valid(jsonb)'?replace(s,'BEGIN',"BEGIN\n IF s#>>'{config,version}'='357-drop/6' AND s->'config' IS DISTINCT FROM private.drop357_v6_rules() THEN RETURN false;END IF;"):s;
});
for(const c of changes){const sig=c.key.startsWith('private.')?c.key:'public.'+c.key,hash=createHash('md5').update(c.old).digest('hex');
 // Validate the inspected deployed definition immediately before replacing it.
 // Reapplication is allowed only when the exact candidate definition is present.
 const nextHash=createHash('md5').update(c.sql).digest('hex');
 sql+=`DO $guard$ BEGIN IF md5(pg_get_functiondef('${sig}'::regprocedure)) NOT IN ('${hash}','${nextHash}') THEN RAISE EXCEPTION 'coordinated:authority_drift ${sig}';END IF;END $guard$;\n${c.sql};\n`;
}
sql+=`INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES ('horses-blitz/5','horses-blitz',private.horses_blitz_rules('horses-blitz/5'),false),('357-drop/6','357-drop',private.drop357_v6_rules(),false) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN IF (SELECT config FROM private.arcade_rulesets WHERE id='horses-blitz/5') IS DISTINCT FROM private.horses_blitz_rules('horses-blitz/5') OR (SELECT config FROM private.arcade_rulesets WHERE id='357-drop/6') IS DISTINCT FROM private.drop357_v6_rules() THEN RAISE EXCEPTION 'coordinated:ruleset_drift';END IF;END $$;
`;
mkdirSync('supabase/coordinated-score-release',{recursive:true});writeFileSync('supabase/coordinated-score-release/candidate.sql',sql);
writeFileSync('qualification.local/coordinated/changed-functions.json',JSON.stringify(changes.map(c=>c.key)));
console.log('Candidate generated:',changes.length,'scoped function updates; both new versions disabled.');
