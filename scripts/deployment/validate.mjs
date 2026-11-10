import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Match the production push code path on Windows, CI and Vercel, even when
// local/preview env files omit the flag. This changes test processes only.
export function qualify(env=process.env,run=spawnSync){
  if(!env.npm_execpath)throw Error('Run qualification through npm run validate.');
  const options={stdio:'inherit',env:{...env,VITE_ASYNC_PUSH_ENABLED:'true'}};
  for(const script of ['typecheck','test:unit','test:release-tooling']){
    const result=run(process.execPath,[env.npm_execpath,'run',script],options);
    if(result.error)throw result.error;
    if(result.status!==0)return result.status??1;
  }
  return 0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  console.log('Release qualification: VITE_ASYNC_PUSH_ENABLED=true');
  process.exitCode=qualify();
}
