import {build} from 'esbuild';import {writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const result=await build({entryPoints:['supabase/functions/delayed-recovery/index.ts'],bundle:true,platform:'neutral',format:'esm',target:'es2022',write:false});
const source=result.outputFiles[0].text;
if(/^import /m.test(source))throw Error('Recovery worker must be self-contained');
writeFileSync('qualification.local/async-combined/recovery-worker.js',source);
writeFileSync('qualification.local/async-combined/recovery-worker.json',JSON.stringify({sha256:createHash('sha256').update(source).digest('hex'),bytes:source.length,entrypoint:'index.ts',verify_jwt:false,authentication:'single-use database dispatcher token; service role RPC boundary'},null,2));
console.log('Bundled recovery worker locally',source.length,'bytes. Not deployed.');
