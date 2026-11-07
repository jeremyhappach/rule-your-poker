// Preserve the inspected deployed v19 worker and add only the new game dispatch.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const path=process.argv[2];if(!path)throw Error('Supply the downloaded v19 index.ts');
const source=readFileSync(path,'utf8').replaceAll('\r\n','\n');
if(createHash('sha256').update(source).digest('hex')!=='dfe1a752b2e5d1f6016716effb20fc1970a8c531309bf42a6d66f8cb9faa64eb')throw Error('Deployed worker changed; inspect before packaging');
const anchor='async function synchronize(rpc, input, actor, token = null) {';
if(source.split(anchor).length!==2)throw Error('Dispatcher changed');
const insertion='\n  if (input.game === "357-drop") return (await rpc("arcade_drop357_step", { p_actor: actor, p_run: input.id, p_token: token })).record;';
mkdirSync('qualification.local/drop357',{recursive:true});
writeFileSync('qualification.local/drop357/worker-release.mjs',source.replace(anchor,anchor+insertion));
