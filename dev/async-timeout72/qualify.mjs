import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('qualification.local/async-timeout72',{recursive:true});
const commands=[
 ['app',['node_modules/vitest/vitest.mjs','run','src','--maxWorkers=2','--minWorkers=1','--silent']],
 ['harness',['node_modules/vitest/vitest.mjs','run','e2e/fullSeam/manifest.test.ts','e2e/targetGauntlet/manifest.test.ts','e2e/humanChaos/manifest.test.ts','e2e/humanChaos/target.test.ts','e2e/humanChaos/support/continuousObserver.test.ts','e2e/humanChaos/support/mutationProgress.test.ts','e2e/humanChaos/support/scenarioObserver.test.ts','e2e/humanChaos/support/transitionPresentation.test.ts','e2e/humanChaos/support/threeFiveSevenPresentationDriver.test.ts','e2e/humanChaos/support/decisionCapture.test.ts','e2e/humanChaos/support/diceRollCapture.test.ts','e2e/liveness/support/crossCountryNetwork.test.ts','--maxWorkers=2','--silent']],
 ['tooling',['--test','scripts/deployment/change-policy.test.mjs','scripts/storage/report.test.mjs','scripts/storage/cleanup.test.mjs','scripts/storage/monitor.test.mjs']],
 ['build',['node_modules/vite/bin/vite.js','build']],
 ['size',['scripts/build-size-report.mjs','dist','--max-bytes','90000000']]
];
for(const [name,args] of commands){
 const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:20_000_000,env:{...process.env,VITE_ASYNC_PUSH_ENABLED:'true'}});
 writeFileSync(`qualification.local/async-timeout72/${name}.log`,(r.stdout??'')+(r.stderr??''));
 console.log(name,r.status,(r.stdout??'').slice(-700));
 if(r.status!==0){console.error(r.error??r.stderr);process.exit(r.status??1);}
}
