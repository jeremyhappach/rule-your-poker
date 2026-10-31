import {createECDH,createHmac,createCipheriv,createPrivateKey,createHash,sign,randomBytes} from 'node:crypto';
const b64=v=>Buffer.from(v).toString('base64url');
const hmac=(key,data)=>createHmac('sha256',key).update(data).digest();
const expand=(prk,info,size)=>hmac(prk,Buffer.concat([info,Buffer.from([1])])).subarray(0,size);
const allowed=new Set(['https://fcm.googleapis.com','https://updates.push.services.mozilla.com','https://web.push.apple.com']);
export function encryptPayload(subscription,payload){
 const ua=Buffer.from(subscription.keys.p256dh,'base64url'),auth=Buffer.from(subscription.keys.auth,'base64url');
 if(ua.length!==65||ua[0]!==4||auth.length!==16)throw Error('Invalid subscription keys');
 const dh=createECDH('prime256v1');dh.generateKeys();const pub=dh.getPublicKey();
 const keyInfo=Buffer.concat([Buffer.from('WebPush: info\0'),ua,pub]);
 const ikm=expand(hmac(auth,dh.computeSecret(ua)),keyInfo,32),salt=randomBytes(16),prk=hmac(salt,ikm);
 const cek=expand(prk,Buffer.from('Content-Encoding: aes128gcm\0'),16),nonce=expand(prk,Buffer.from('Content-Encoding: nonce\0'),12);
 const plain=Buffer.concat([Buffer.from(JSON.stringify(payload)),Buffer.from([2])]);if(plain.length>3000)throw Error('Payload too large');
 const cipher=createCipheriv('aes-128-gcm',cek,nonce),ciphertext=Buffer.concat([cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
 const size=Buffer.alloc(4);size.writeUInt32BE(4096);
 return Buffer.concat([salt,size,Buffer.from([65]),pub,ciphertext]);
}
export function pushRequest(job,credentials,now=Date.now()){
 const endpoint=new URL(job.endpoint);
 if(!allowed.has(endpoint.origin)||endpoint.username||endpoint.password||endpoint.hash)throw Error('Unapproved push service');
 const pub=Buffer.from(credentials.publicKey,'base64url');if(pub.length!==65||pub[0]!==4)throw Error('Invalid VAPID key');
 if(!/^(mailto:|https:\/\/)/.test(credentials.subject))throw Error('VAPID contact required');
 const jwt=b64(JSON.stringify({typ:'JWT',alg:'ES256'}))+'.'+b64(JSON.stringify({aud:endpoint.origin,exp:Math.floor(now/1000)+3600,sub:credentials.subject}));
 const key=createPrivateKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:b64(pub.subarray(1,33)),y:b64(pub.subarray(33)),d:credentials.privateKey}});
 const token=jwt+'.'+b64(sign('sha256',Buffer.from(jwt),{key,dsaEncoding:'ieee-p1363'}));
 return {url:endpoint.href,options:{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{
  Authorization:'vapid t='+token+', k='+credentials.publicKey,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:String(Math.max(0,Math.min(60,Math.floor((job.payload.expiresAt-now)/1000)))),Urgency:'normal',
  Topic:createHash('sha256').update(String(job.payload.eventId)).digest('base64url').slice(0,32),
 },body:encryptPayload(job,job.payload)}};
}
/** No ambient fetch: local runners must inject a fake sender. Live wiring is a separate release gate. */
export function createTransport(credentials,sendHttp){
 if(typeof sendHttp!=='function')throw Error('Explicit transport required');
 return job=>{
  if(!Number.isFinite(job.payload?.expiresAt)||job.payload.expiresAt<=Date.now())return {skipped:true};
  const request=pushRequest(job,credentials);
  if(job.payload.expiresAt<=Date.now())return {skipped:true};
  return sendHttp(request.url,request.options);
 };
}
