import {connect} from './bots-fixture.mjs';
import {writeFile} from 'node:fs/promises';
const database=process.argv[2];if(!/^tri_bots_/.test(database??''))throw Error('isolated bot proof database required');
const c=await connect(database),runs=[];let busy=false;
async function wake(){if(busy)return;busy=true;const start=performance.now();try{const r=await c.query('SELECT private.tri_towers_recover() n');runs.push({at:Date.now(),ms:performance.now()-start,processed:r.rows[0].n});}catch(e){runs.push({at:Date.now(),error:e.message});}finally{busy=false;}}
const timer=setInterval(wake,1000);await wake();
async function stop(){clearInterval(timer);while(busy)await new Promise(r=>setTimeout(r,10));await writeFile(`qualification.local/tri-towers/${database}-worker.json`,JSON.stringify(runs,null,2));await c.end();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);process.on('message',m=>{if(m==='stop')void stop();});
process.send?.('ready');
