// Preserve the exact qualified v20 deployment. Only the new dispatcher is added.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(process.argv[2],'utf8').replaceAll('\r\n','\n').trimEnd()+'\n';
if(createHash('sha256').update(source).digest('hex')!=='49b68a8592e00a4877886312460b1bf3e16cb37aab79be8ba94358756f3c11e7')throw Error('Deployed v20 source changed; inspect before packaging');
const anchor='async function synchronize(rpc, input, actor, token = null) {';
if(source.split(anchor).length!==2)throw Error('Dispatcher changed');
const insertion='\n  if (input.game === "horses-blitz") return (await rpc("arcade_horses_blitz_step", { p_actor: actor, p_run: input.id, p_token: token })).record;';
mkdirSync('qualification.local/horses-blitz',{recursive:true});writeFileSync('qualification.local/horses-blitz/worker-release.mjs',source.replace(anchor,anchor+insertion));
