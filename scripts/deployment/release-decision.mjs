import {appendFileSync} from 'node:fs';
import {compareCommits,isSha,productionSha} from './change-policy.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export function releaseDecision(head,live,options){
  if(!isSha(head))throw Error('Invalid expected release SHA');
  if(live===head)return {action:'publish',head,live,reason:'Production serves the exact expected commit'};
  const diff=compareCommits(live,head,options);
  return {...diff,action:diff.skip?'skip':'wait',live};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const head=process.env.EXPECTED_SHA;
  if(!isSha(head))throw Error('EXPECTED_SHA must be a full Git SHA');
  let complete=false;
  for(let attempt=0;attempt<60;attempt++){
    try{
      const decision=releaseDecision(head,await productionSha());
      console.log(JSON.stringify(decision));
      if(decision.action!=='wait'){
        if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`publish=${decision.action==='publish'}\n`);
        if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
          decision.action==='publish'?`Production verified: ${head}.\n`:`Documentation-only publication intentionally skipped. Production remains ${decision.live}; no release signal for unbuilt ${head}.\n`);
        complete=true;break;
      }
    }catch(error){console.log('Awaiting verifiable production: '+error.message);}
    if(attempt<59)await new Promise(resolve=>setTimeout(resolve,10000));
  }
  if(!complete)throw Error('Production never served the expected commit; no release signal published');
}
