import {buildDecision} from './change-policy.mjs';

try{
  const decision=await buildDecision(process.env);
  console.log(JSON.stringify({action:decision.skip?'SKIP_DOCUMENTATION':'BUILD',...decision}));
  process.exitCode=decision.skip?0:1; // Vercel's ignored-build convention.
}catch(error){console.log('BUILD: '+error.message);process.exitCode=1;}
