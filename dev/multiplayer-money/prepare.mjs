import {readFileSync as read,writeFileSync as write,mkdirSync} from 'node:fs';
const dir='.codex/evidence/multiplayer-money/',out='supabase/multiplayer-money/';mkdirSync(dir,{recursive:true});
const migration=read(out+'admission.sql','utf8');
const candidate=migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION'),migration.indexOf('-- Open independently'));
let proof='BEGIN;\nSET LOCAL statement_timeout=\'25s\';\n'+ (process.argv.includes('--installed')?['tri_towers','eleven_up','royal_flash'].map(f=>`UPDATE private.${f}_release SET admission_enabled=true WHERE singleton;`).join('\n'):candidate)+'\n';
const select=[];
for(const family of ['tri_towers','eleven_up','royal_flash']){
 const fixtures=family+'_money_fixture_games';
 proof+=`CREATE TEMP TABLE ${fixtures}(id uuid PRIMARY KEY);\n`;
 let recovery=candidate.slice(candidate.indexOf(`CREATE OR REPLACE FUNCTION private.${family}_recover()`));recovery=recovery.slice(0,recovery.indexOf('$function$',recovery.indexOf('AS $function$')+14)+10);
 if(!recovery.endsWith('$function$'))throw Error('Recovery extraction failed '+family);
 recovery=recovery.replaceAll('WHERE NOT work.finished',`WHERE work.game_id IN(SELECT id FROM pg_temp.${fixtures}) AND NOT work.finished`).replaceAll('WHERE NOT finished',`WHERE game_id IN(SELECT id FROM pg_temp.${fixtures}) AND NOT finished`);
 // The temporary scope filter prevents touching any existing production session.
 proof+=recovery+';\n';
 let body=read(out+'matrix.sql','utf8')+'\n'+read(out+'flow.sql','utf8');
 body=body.replaceAll('__FAMILY__',family).replaceAll('__GAME__',family.replaceAll('_','-'));
 body=body.replaceAll('money_assert',family+'_money_assert').replaceAll('money_evidence',family+'_money_evidence').replaceAll('fail_after_chips',family+'_fail_after_chips').replaceAll('qualification_after_chips',family+'_qualification_after_chips');
 body=body.replaceAll("  INSERT INTO public.players(id,game_id,user_id",`  INSERT INTO pg_temp.${fixtures} VALUES(g);\n  INSERT INTO public.players(id,game_id,user_id`);
 body=body.replace(/SELECT \* FROM \w+_money_evidence[^;]*;/g,'');
 proof+=body+'\n';
 select.push(`SELECT '${family}' game,case_name,game_id,dealer_game_id,before_balances,after_balances,result,batch FROM ${family}_money_evidence WHERE case_name IN('real 2-player winner','real 3-player split','real 7-player winner','play','recovery')`);
}
proof+='SELECT jsonb_agg(to_jsonb(e)) AS evidence FROM ('+select.join('\nUNION ALL\n')+')e;\nROLLBACK;\n';
write(dir+'production-proof.sql',proof);
console.log(JSON.stringify({installed:process.argv.includes('--installed'),proofBytes:proof.length}));
