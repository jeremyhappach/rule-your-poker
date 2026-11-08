// Preserve the deployed v21 worker; add only the Ship Cap Voyage dispatcher.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(process.argv[2],'utf8').replaceAll('\r\n','\n').trimEnd()+'\n';
if(createHash('sha256').update(source).digest('hex')!=='f14db20977605514d5f6cfee886e9012fb7d81d941fda707509ceac52ed3683f')throw Error('Deployed v21 changed; inspect before packaging');
const anchor='async function synchronize(rpc, input, actor, token = null) {';
if(source.split(anchor).length!==2)throw Error('Dispatcher changed');
const insertion='\n  if (input.game === "ship-cap-voyage") return (await rpc("arcade_ship_cap_voyage_step", { p_actor: actor, p_run: input.id, p_token: token })).record;';
mkdirSync('qualification.local/ship-cap-voyage',{recursive:true});
writeFileSync('qualification.local/ship-cap-voyage/worker-release.mjs',source.replace(anchor,anchor+insertion));
