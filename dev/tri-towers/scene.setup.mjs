import {connect} from './bots-fixture.mjs';import {readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const base=JSON.parse(readFileSync('qualification.local/tri-towers/cartoon-context.json','utf8')).database,database='tri_scene_'+Date.now(),root=await connect('postgres');
await root.query('CREATE DATABASE '+database+' TEMPLATE '+base);await root.end();
writeFileSync('qualification.local/tri-towers/scene-context.json',JSON.stringify({database}));
const db=await connect(database);try{
 for(const f of JSON.parse(readFileSync('qualification.local/tri-towers/scene-installed.json','utf8'))){await db.query(f.definition);const actual=(await db.query('SELECT md5(pg_get_functiondef(oid)) hash FROM pg_proc WHERE proname=$1',[f.proname])).rows;assert.equal(actual[0]?.hash,f.hash,'installed baseline '+f.proname);}
 await db.query(readFileSync('supabase/tri-towers/scene.sql','utf8'));console.log('PASS exact deployed baseline; isolated candidate installed',database);
}finally{await db.end();}
