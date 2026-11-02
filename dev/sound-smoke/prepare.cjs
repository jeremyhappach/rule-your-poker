const fs=require('fs'),crypto=require('crypto'),root='dev/sound-smoke/',rate=32000;
const timing=require('./timing.json');
// An actual recorded lub-dub (Andy Jack, CC0), retaining its pitch, texture and internal timing.
// Rebalance the existing recording for small speakers; no added tones or distortion.
const recording=fs.readFileSync(root+'sources/andy-jack-heartbeat-pair.wav');
const heartbeat=new Float64Array((recording.length-44)/2);
for(let i=0;i<heartbeat.length;i++)heartbeat[i]=recording.readInt16LE(44+2*i)/32768;
function filter(samples,b0,b1,b2,a0,a1,a2){
 let x1=0,x2=0,y1=0,y2=0;
 for(let i=0;i<samples.length;i++){
  const x=samples[i],y=(b0*x+b1*x1+b2*x2-a1*y1-a2*y2)/a0;
  x2=x1;x1=x;y2=y1;y1=y;samples[i]=y;
 }
}
// Remove bass that consumed nearly all the headroom, then lift the recorded valve texture.
const w=2*Math.PI*200/rate,c=Math.cos(w),alpha=Math.sin(w)/(2*Math.SQRT1_2);
filter(heartbeat,(1+c)/2,-(1+c),(1+c)/2,1+alpha,-2*c,1-alpha);
const pw=2*Math.PI*450/rate,pc=Math.cos(pw),pa=Math.sin(pw)/(2*.7),gain=10**(12/40);
filter(heartbeat,1+pa*gain,-2*pc,1-pa*gain,1+pa/gain,-2*pc,1-pa/gain);
for(let i=0;i<heartbeat.length;i++)heartbeat[i]*=Math.min(1,i/(rate*.005),(heartbeat.length-1-i)/(rate*.008));
const heartGain=.38/heartbeat.reduce((max,x)=>Math.max(max,Math.abs(x)),0);
function heart(a,at,fadeLastBeat=false){for(let j=0;j<heartbeat.length;j++){const i=Math.round(at*rate)+j;if(i>=a.length)break;const fade=fadeLastBeat?Math.min(1,(heartbeat.length-1-j)/(rate*.08)):1;a[i]+=heartbeat[j]*heartGain*fade;}}
function wav(a){const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);a.forEach((v,i)=>b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));return b;}
const catalog=[];
const chuckyDuration=((timing.chuckyHeartbeatPairs-1)*timing.chuckyHeartbeatIntervalMs+400)/1000;
for(const [id,title,duration] of [['chucky-heartbeat','Chucky — Independent Heartbeat',chuckyDuration],['chucky-sting','Chucky — Dramatic Three-Note Sting',1.4],['357-beeps','357 — Drag-Race Beeps',2.7],['357-heartbeat','357 — Double Heartbeat',2.7]]){
 const a=new Float64Array(Math.round(rate*duration));
 if(id==='chucky-heartbeat')for(let beat=0;beat<timing.chuckyHeartbeatPairs;beat++)heart(a,beat*timing.chuckyHeartbeatIntervalMs/1000,beat===timing.chuckyHeartbeatPairs-1);
 if(id==='chucky-sting')for(const [at,hz,len,level] of [[0,110,.27,.09],[.4,98,.27,.09],[.8,73.42,.6,.105]])for(let j=0;j<len*rate;j++){const t=j/rate,e=Math.sin(Math.PI*t/len)**1.2,phase=2*Math.PI*hz*t;a[Math.round(at*rate)+j]+=level*e*(Math.sin(phase)+.45*Math.sin(3*phase)+.35*Math.sin(5*phase)+.15*Math.sin(7*phase));}
 if(id.startsWith('357'))for(const at of [0,.9,1.8]){if(id==='357-heartbeat')heart(a,at);else for(let j=0;j<.085*rate;j++){const t=j/rate,e=Math.min(1,t/.004,(.085-t)/.008);a[at*rate+j]=.055*e*(Math.sin(2*Math.PI*440*t)+.12*Math.sin(6*Math.PI*440*t));}}
 const b=wav(a);fs.writeFileSync(root+'assets/'+id+'.wav',b);catalog.push({id,title,durationMs:duration*1000,sha256:crypto.createHash('sha256').update(b).digest('hex'),peak:a.reduce((max,x)=>Math.max(max,Math.abs(x)),0),source:id.endsWith('heartbeat')?'Real heartbeat recorded by Andy Jack, published by JonasTisell (CC0); trimmed, filtered and level-adjusted':'Original procedural sound; no third-party recording',...(id.endsWith('heartbeat')?{sourceUrl:'https://freesound.org/people/JonasTisell/sounds/670465/',license:'CC0-1.0'}:{})});
}
fs.writeFileSync(root+'catalog.json',JSON.stringify(catalog,null,2)+'\n');
