import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['dev/arcade/tri.browser.mjs'],{env:{...process.env,TRI_CARTOON_PROOF:'1'},stdio:'inherit'});
process.exitCode=result.status;
