import {execFileSync} from 'node:child_process';import {readFile} from 'node:fs/promises';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
for(const name of ['engine','adapter']){
 execFileSync(process.execPath,[`dev/tri-towers/build-${name}-proof.mjs`]);
 const client=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database:'postgres'});await client.connect();
 try{await client.query(await readFile(`qualification.local/tri-towers/${name}-proof.sql`,'utf8'));console.log(`PASS ${name} rollback proof on local PostgreSQL`);}finally{await client.end();}
}
