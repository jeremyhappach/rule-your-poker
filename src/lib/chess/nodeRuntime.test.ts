import {it,expect} from 'vitest';
import {buildSync} from 'esbuild';
import {copyFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

it('loads the shared JSON rules in native Node without Vite bundling',()=>{
 const root=resolve('qualification.local');mkdirSync(root,{recursive:true});
 const directory=mkdtempSync(join(root,'chess-node-'));
 try{
  const output=join(directory,'rules.mjs');
  buildSync({entryPoints:['src/lib/chess/rules.ts'],outfile:output,bundle:false,platform:'node',format:'esm',target:'node24'});
  copyFileSync('src/lib/chess/configuration.json',join(directory,'configuration.json'));
  const result=spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(pathToFileURL(output).href)});console.log(m.CHESS_RULES.turnMs)`],{encoding:'utf8',windowsHide:true});
  expect(result.status,result.stderr).toBe(0);expect(result.stdout.trim()).toBe('300000');
 }finally{if(!resolve(directory).startsWith(root+sep))throw Error('Unexpected test directory');rmSync(directory,{recursive:true,force:true});}
});
