import {execFileSync as run} from 'node:child_process';
const exec=(args,options={})=>run('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],...options});
const source='supabase_db_run21-reconciled';
exec(['exec',source,'dropdb','-U','postgres','--if-exists','run21_latency']);
exec(['exec',source,'createdb','-U','postgres','run21_latency']);
exec(['exec',source,'psql','-U','supabase_admin','-d','run21_latency','-c','DROP SCHEMA public']);
const dump=exec(['exec',source,'pg_dump','-U','supabase_admin','-d','postgres','-Fc','--schema=public','--schema=private','--schema=auth','--schema=extensions'],{encoding:null,maxBuffer:128*1024*1024});
exec(['exec','-i',source,'pg_restore','-U','supabase_admin','-d','run21_latency'],{input:dump,maxBuffer:128*1024*1024});
exec(['exec',source,'psql','-U','supabase_admin','-d','run21_latency','-v','ON_ERROR_STOP=1','-c','CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions; CREATE SCHEMA IF NOT EXISTS graphql_public;']);
for(const [kind,port] of [['rest',65431],['auth',65439]]){
 const info=JSON.parse(exec(['inspect',`supabase_${kind}_run21-reconciled`]))[0];
 const network=Object.keys(info.NetworkSettings.Networks)[0];
 const env=info.Config.Env.map(value=>value.replace(/(postgres(?:ql)?:\/\/[^\s]+\/)postgres(?=\?|$)/,'$1run21_latency'));
 const args=['run','-d','--pull=never','--name',`run21_latency_${kind}`,'--network',network,'-p',`127.0.0.1:${port}:${kind==='rest'?3000:9999}`];
 for(const value of env)args.push('-e',value);
 args.push(info.Config.Image,...(info.Config.Cmd??[]));exec(args);
}
console.log('Created isolated local clone and private API containers; existing databases unchanged.');
