import {readFileSync as read,writeFileSync as write} from 'node:fs';
export function migration(){
 const preimage=JSON.parse(read('dev/production-polish/preimage.json'));
 const checks=preimage.map(d=>{const signature=d.schema+'.'+d.name+'('+d.args.split(', ').map(arg=>arg.replace(/^\w+\s+/,'' )).join(',')+')';return ` IF md5(pg_get_functiondef('${signature}'::regprocedure)) IS DISTINCT FROM '${d.hash}' THEN RAISE EXCEPTION 'optional_bonus:preimage_changed ${d.name}';END IF;`;}).join('\n');
 return "SET LOCAL lock_timeout='1s';\nSET LOCAL statement_timeout='30s';\nDO $$ BEGIN\n"+checks+'\nEND $$;\n'+['policy','async'].map(name=>read('supabase/optional-bonus/'+name+'.sql','utf8')).join('\n');
}
if(process.argv.includes('--write')){
 write('.polish-authority/migration.sql',migration());
 const restore=JSON.parse(read('dev/production-polish/preimage.json')).filter(d=>d.schema==='public').map(d=>d.definition).join('\n');
 write('.polish-authority/rollback.sql',"-- Execute only after restoring the prior frontend/API deployment. No player data changes.\n"+['tri_towers','boxdrop','eleven_up','royal_flash'].map(p=>'DROP TRIGGER IF EXISTS optional_bonus_offer ON private.'+p+'_matches;').join('\n')+'\nDROP TRIGGER IF EXISTS optional_bonus_offer ON private.delayed_children;\n'+restore);
 console.log('Prepared guarded migration and data-preserving rollback');
}
