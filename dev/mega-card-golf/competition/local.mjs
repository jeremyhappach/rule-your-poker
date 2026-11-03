import pg from 'file:///C:/Users/jerem/source/repos/rule-your-poker/qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
export async function connect(database){
 if(!/^(postgres|mega_competition_\d+)$/.test(database))throw Error('Disposable Mega database only');
 const client=new pg.Client({host:'127.0.0.1',port:55439,user:'tri_test',database,connectionTimeoutMillis:5000});await client.connect();return client;
}
if(process.argv.includes('--create')){
 const root=await connect('postgres'),database='mega_competition_'+Date.now();
 await root.query('CREATE DATABASE '+database+' TEMPLATE async_real_1793571492049');await root.end();
 mkdirSync('qualification.local/mega-competition',{recursive:true});writeFileSync('qualification.local/mega-competition/context.json',JSON.stringify({database}));
 const db=await connect(database);
 console.log(JSON.stringify({database,tables:(await db.query("select table_schema,table_name from information_schema.tables where table_name like '%mega%' or table_name in ('arcade_runs','golf_matches','game_defaults','delayed_children')")).rows}));await db.end();
}
export function databaseName(){return JSON.parse(readFileSync('qualification.local/mega-competition/context.json','utf8')).database;}
