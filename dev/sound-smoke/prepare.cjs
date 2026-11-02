const fs=require('fs'),crypto=require('crypto'),root='dev/sound-smoke/',rate=32000;
// Retain the low fundamental, with damped upper partials that carry the thud on small speakers.
function pulse(a,at,hz,duration,level){for(let j=0;j<duration*rate;j++){const i=Math.round(at*rate)+j;if(i>=a.length)break;const t=j/rate,e=Math.min(1,t/.006)*Math.exp(-t*16)*(1-t/duration),phase=2*Math.PI*(hz*t+12*t*Math.exp(-t*20));a[i]+=level*e*(Math.sin(phase)+.65*Math.sin(3*phase)+.5*Math.sin(5*phase));}}
function heart(a,at){pulse(a,at,76,.19,.13);pulse(a,at+.19,62,.17,.105);}
function wav(a){const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);a.forEach((v,i)=>b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));return b;}
const catalog=[];
for(const [id,title,duration] of [['chucky-heartbeat','Chucky — Slow Heartbeat',6],['chucky-sting','Chucky — Dramatic Three-Note Sting',1.4],['357-beeps','357 — Drag-Race Beeps',2.7],['357-heartbeat','357 — Double Heartbeat',2.7]]){
 const a=new Float64Array(rate*duration);
 if(id==='chucky-heartbeat')for(let t=0;t<6;t+=1.12)heart(a,t);
 if(id==='chucky-sting')for(const [at,hz,len,level] of [[0,110,.27,.09],[.4,98,.27,.09],[.8,73.42,.6,.105]])for(let j=0;j<len*rate;j++){const t=j/rate,e=Math.sin(Math.PI*t/len)**1.2,phase=2*Math.PI*hz*t;a[Math.round(at*rate)+j]+=level*e*(Math.sin(phase)+.45*Math.sin(3*phase)+.35*Math.sin(5*phase)+.15*Math.sin(7*phase));}
 if(id.startsWith('357'))for(const at of [0,.9,1.8]){if(id==='357-heartbeat')heart(a,at);else for(let j=0;j<.085*rate;j++){const t=j/rate,e=Math.min(1,t/.004,(.085-t)/.008);a[at*rate+j]=.055*e*(Math.sin(2*Math.PI*440*t)+.12*Math.sin(6*Math.PI*440*t));}}
 const b=wav(a);fs.writeFileSync(root+'assets/'+id+'.wav',b);catalog.push({id,title,durationMs:duration*1000,sha256:crypto.createHash('sha256').update(b).digest('hex'),peak:a.reduce((max,x)=>Math.max(max,Math.abs(x)),0),source:'Original procedural sound; no third-party recording'});
}
fs.writeFileSync(root+'catalog.json',JSON.stringify(catalog,null,2)+'\n');
