import {connect} from '../async-words/local.mjs';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
export {connect};
export const dir='qualification.local/async-take-two';
mkdirSync(dir,{recursive:true});
export const database=()=>JSON.parse(readFileSync(dir+'/context.json')).database;
if(process.argv.includes('--list')){
 const root=await connect('postgres');
 console.log((await root.query("SELECT datname FROM pg_database WHERE datistemplate=false ORDER BY oid DESC LIMIT 18")).rows);
 await root.end();
}
if(process.argv.includes('--create')){
 const template=process.argv.at(-1);
 if(!/^[a-z0-9_]+$/.test(template))throw Error('invalid template');
 const root=await connect('postgres'),name='async_take_two_'+Date.now();
 await root.query('CREATE DATABASE '+name+' TEMPLATE '+template);await root.end();
 writeFileSync(dir+'/context.json',JSON.stringify({database:name,template}));
 console.log(name);
}
