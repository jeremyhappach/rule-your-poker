import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes,createHmac,createDecipheriv,createPublicKey,verify} from 'node:crypto';
import {deviceStatus,enableFromGesture,authorizedDestination} from '../../src/lib/webPush/device.mjs';
import {deliverOne} from '../../server/webPush/worker.mjs';
import {pushRequest,createTransport} from '../../server/webPush/transport.mjs';
test('permission states include iOS installed requirement, denial, revocation and unsupported',()=>{
 const e={ios:false,standalone:false,secure:true,supported:true,permission:'default'};
 assert.equal(deviceStatus(e),'permission-needed');assert.equal(deviceStatus({...e,ios:true}),'home-screen');
 assert.equal(deviceStatus({...e,supported:false}),'unsupported');assert.equal(deviceStatus({...e,permission:'denied'},true),'denied');
 assert.equal(deviceStatus(e,true),'revoked');assert.equal(deviceStatus({...e,permission:'granted'}),'device-off');
 assert.equal(deviceStatus({...e,permission:'granted'},true),'enabled');
});
test('OS permission happens in the gesture before subscription; denial never subscribes',async()=>{
 const calls=[];const port={gesture:()=>true,status:()=> 'permission-needed',permission:()=> 'default',requestPermission:()=>{calls.push('prompt');return Promise.resolve('granted');},subscribe:async()=>{calls.push('subscribe');}};
 const pending=enableFromGesture(port);assert.deepEqual(calls,['prompt']);await pending;assert.deepEqual(calls,['prompt','subscribe']);
 await assert.rejects(enableFromGesture({...port,gesture:()=>false}));
 assert.equal(await enableFromGesture({...port,requestPermission:async()=> 'denied',subscribe:async()=>assert.fail('denied subscription')}),'denied');
});
test('click destination uses fresh membership and deletion state',()=>{
 const h={id:'match',players:[{id:'a'}]};assert.equal(authorizedDestination({matchId:'match'},'a',h),'/delayed/match');
 assert.equal(authorizedDestination({matchId:'match'},'b',h),null);assert.equal(authorizedDestination({matchId:'other'},'a',h),null);
 assert.equal(authorizedDestination({matchId:'match'},'a',{...h,removedAt:'now'}),'/delayed');
});
for(const [status,result]of [[201,'sent'],[410,'gone'],[404,'gone'],[429,'retry'],[503,'retry'],[403,'failed']])test('worker receipt for '+status,async()=>{
 let receipt;await deliverOne(async(name,args)=>name.endsWith('claim')?{eventId:'e',subscriptionId:'s',lease:'l'}:name.endsWith('authorize')?{payload:{}}:(receipt=args),async()=>({status}));assert.equal(receipt.p_result,result);
});
test('worker rechecks actionability, never sends cancelled jobs, retries transport loss',async()=>{
 let receipt;const rpc=async(name,args)=>name.endsWith('claim')?{eventId:'e',subscriptionId:'s',lease:'l'}:name.endsWith('authorize')?null:(receipt=args);
 await deliverOne(rpc,async()=>assert.fail('cancelled delivery'));assert.equal(receipt.p_result,'skipped');
 await deliverOne(async(name,args)=>name.endsWith('authorize')?{}:rpc(name,args),async()=>{throw Error('offline');});assert.equal(receipt.p_result,'retry');
});
test('standard aes128gcm payload decrypts for the intended subscription and VAPID verifies',()=>{
 const ua=createECDH('prime256v1');ua.generateKeys();const vapid=createECDH('prime256v1');vapid.generateKeys();const auth=randomBytes(16);
 const publicKey=vapid.getPublicKey().toString('base64url'),credentials={publicKey,privateKey:vapid.getPrivateKey().toString('base64url'),subject:'mailto:local@example.invalid'};
 const job={endpoint:'https://web.push.apple.com/local-test',keys:{p256dh:ua.getPublicKey().toString('base64url'),auth:auth.toString('base64url')},payload:{matchId:'only-a-match-id',kind:'turn'}};
 const req=pushRequest(job,credentials),body=req.options.body,salt=body.subarray(0,16),pub=body.subarray(21,86),encrypted=body.subarray(86);
 const h=(k,d)=>createHmac('sha256',k).update(d).digest(),expand=(k,i,n)=>h(k,Buffer.concat([Buffer.from(i),Buffer.from([1])])).subarray(0,n);
 const ikm=expand(h(auth,ua.computeSecret(pub)),Buffer.concat([Buffer.from('WebPush: info\0'),ua.getPublicKey(),pub]),32),prk=h(salt,ikm);
 const decipher=createDecipheriv('aes-128-gcm',expand(prk,'Content-Encoding: aes128gcm\0',16),expand(prk,'Content-Encoding: nonce\0',12));decipher.setAuthTag(encrypted.subarray(-16));
 const plain=Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]);assert.equal(plain.at(-1),2);assert.deepEqual(JSON.parse(plain.subarray(0,-1)),job.payload);
 const token=/t=([^,]+)/.exec(req.options.headers.Authorization)[1].split('.'),p=vapid.getPublicKey();
 const pk=createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:p.subarray(1,33).toString('base64url'),y:p.subarray(33).toString('base64url')}});
 assert(verify('sha256',Buffer.from(token.slice(0,2).join('.')),{key:pk,dsaEncoding:'ieee-p1363'},Buffer.from(token[2],'base64url')));
 assert.equal(req.options.redirect,'error');assert.throws(()=>pushRequest({...job,endpoint:'https://127.0.0.1/private'},credentials));assert.throws(()=>createTransport(credentials));
});
