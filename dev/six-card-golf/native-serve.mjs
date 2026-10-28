// Loopback UI with the real SDK/Auth and isolated local Golf authority.
// Native interaction test intercepts every Golf RPC and forbids production data writes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const origin='https://holm357.com',url='https://xvhmbuppghwmwpwrkzao.supabase.co';
const html=await fetch(origin).then(r=>r.text()),asset=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)][0]?.[1];assert(asset);
const assetUrl=new URL(asset,origin);assert.equal(assetUrl.origin,origin);
const bundle=await fetch(assetUrl).then(r=>r.text());assert(bundle.includes(url));
const key=(bundle.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]).find(k=>{if(k.startsWith('sb_publishable_'))return true;try{const p=JSON.parse(Buffer.from(k.split('.')[1],'base64url'));return p.role==='anon'&&p.ref==='xvhmbuppghwmwpwrkzao'}catch{return false}});assert(key);
const child=spawn(process.execPath,['dev/six-card-golf/serve.mjs','--native-client'],{windowsHide:true,stdio:'inherit',env:{...process.env,VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:key}});
child.on('exit',code=>{process.exitCode=code??1;});
