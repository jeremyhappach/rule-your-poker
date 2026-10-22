// Use the deployed public client configuration without changing checked-in .env.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const origin='https://holm357.com',html=await fetch(origin).then(r=>r.text());
const path=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)][0]?.[1];assert(path);
const script=new URL(path,origin);assert.equal(script.origin,origin);
const bundle=await fetch(script).then(r=>r.text());
const key=(bundle.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]).find(k=>{if(k.startsWith('sb_publishable_'))return true;try{const p=JSON.parse(Buffer.from(k.split('.')[1],'base64url'));return p.role==='anon'&&p.ref==='xvhmbuppghwmwpwrkzao';}catch{return false;}});assert(key);
const r=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit',env:{...process.env,VITE_SUPABASE_URL:'https://xvhmbuppghwmwpwrkzao.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:key}});process.exitCode=r.status??1;
