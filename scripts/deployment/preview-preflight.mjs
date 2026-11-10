// Read-only guard before requesting an additional preview; never deploys.
import {execFileSync} from 'node:child_process';
import {productionSha} from './change-policy.mjs';

const git=args=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const head=git(['rev-parse','HEAD']);
if(git(['status','--porcelain','--untracked-files=normal'])){
  console.log('LOCAL_CHANGES: finish qualification and commit before requesting a preview.');
  process.exitCode=1;
}else{
  try{
    const live=await productionSha();
    console.log(live===head
      ? `ALREADY_IN_PRODUCTION: ${head}. Reuse https://holm357.com for read-only UI/static checks. Do not create another preview unless preview environment behavior or isolated testing is required.`
      : `PREVIEW_NOT_REPLACED_BY_PRODUCTION: candidate ${head}; production ${live}. Check report:storage --candidate-sha ${head} for an existing READY preview before creating one.`);
  }catch{console.log('UNKNOWN: production could not be verified. Required preview testing remains required.');process.exitCode=1;}
}
