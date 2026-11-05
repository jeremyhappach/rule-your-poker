// Original deterministic audition sounds. No external recordings or dependencies.
// Preview only: deliberately outside the shipped source/assets.
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url)),rate=44100;
mkdirSync(dir,{recursive:true});
let seed=20261105;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const signal=seconds=>new Float64Array(Math.round(seconds*rate));
function tone(out,start,duration,from,to,amp,edge=0){
 let phase=0;for(let i=0;i<duration*rate;i++){
  const t=i/rate,u=t/duration,k=Math.round(start*rate)+i;if(k>=out.length)break;
  phase+=2*Math.PI*(from*(to/from)**u)/rate;
  const env=Math.min(1,t/.004)*Math.min(1,(duration-t)/.018)*Math.exp(-u*1.4);
  out[k]+=amp*env*(Math.sin(phase)+edge*Math.sin(3*phase)/3+edge*.1*Math.sin(5*phase));
 }
}
// Damped, inharmonic stone transients: filtered noise, short crack and dark body.
function stone(out,start,duration,amp,size,grit=1){
 let low=0,mid=0,phase=0;const cutoff=Math.min(11000,2200/size),a=1-Math.exp(-2*Math.PI*cutoff/rate);
 const modes=[.79,1.43,2.17,3.61].map(m=>[m*(170/size),rnd()*Math.PI*2]);
 const first=Math.round(start*rate);
 for(let i=0;i<duration*rate&&first+i<out.length;i++){
  const t=i/rate,u=t/duration,n=rnd()*2-1;
  low+=a*(n-low);mid+=.018*(n-mid);
  const attack=Math.min(1,t/.0008),fade=Math.max(0,1-u)**2;
  const body=modes.reduce((s,[f,p],j)=>s+Math.sin(2*Math.PI*f*t+p)*Math.exp(-t*(24+j*17)/size)/(j+1),0);
  const snap=(low-mid)*Math.exp(-t*95/size)*grit;
  phase+=2*Math.PI*(135/size)*Math.exp(-t*12)/rate;
  out[first+i]+=amp*attack*fade*(snap*.65+body*.17+Math.sin(phase)*Math.exp(-t*33/size)*.12);
 }
}
function debris(out,start,duration,count,amp,size){
 for(let i=0;i<count;i++){
  const u=i/count,at=start+duration*(u*.75+rnd()*.25);
  stone(out,at,.022+rnd()*.06,amp*(1-u*.8)*(.25+.75*rnd()),size*(.45+.7*rnd()),1.3);
 }
 // A granular dusty tail between the individual fragments.
 let low=0;for(let i=0;i<duration*rate;i++){
  const t=i/rate,u=t/duration,k=Math.round(start*rate)+i;if(k>=out.length)break;
  const n=rnd()*2-1;low+=.2*(n-low);
  const env=Math.sin(Math.PI*u)**.7*Math.exp(-u*3.3);
  out[k]+=low*amp*.35*env*(.3+.7*rnd()**3);
 }
}
function write(name,out,peakDb,label){
 // Short fades and a small leading pad protect browser playback edges.
 for(let i=0;i<out.length;i++)out[i]*=Math.min(1,i/(rate*.002),(out.length-1-i)/(rate*.015));
 let peak=0,sum=0;for(const x of out)peak=Math.max(peak,Math.abs(x));
 const gain=10**(peakDb/20)/peak,pad=Math.round(.025*rate),tail=Math.round(.035*rate),frames=out.length+pad+tail;
 const wav=Buffer.alloc(44+frames*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(frames*2,40);
 for(let i=0;i<out.length;i++){const x=out[i]*gain;sum+=x*x;wav.writeInt16LE(Math.round(x*32767),44+(i+pad)*2);}
 writeFileSync(dir+name+'.wav',wav);
 return {name,label,format:'mono PCM16 WAV',rate,actionMs:Math.round(out.length/rate*1000),fileMs:Math.round(frames/rate*1000),peakDbFS:peakDb,rmsDbFS:Math.round(20*Math.log10(Math.sqrt(sum/out.length))*10)/10,sha256:createHash('sha256').update(wav).digest('hex')};
}
const catalog=[];
const a=signal(.17);tone(a,0,.068,510,470,1);tone(a,.083,.083,355,315,.9);catalog.push(write('tritowers-a-soft-double',a,-23,'A — Soft double-note'));
const b=signal(.12);tone(b,0,.118,195,145,1,.9);catalog.push(write('tritowers-b-low-buzz',b,-24,'B — Short low buzz'));
const c=signal(.64);stone(c,0,.19,1,.8);stone(c,.028,.13,.55,.55);stone(c,.065,.16,.35,.7);debris(c,.075,.47,23,.25,.55);catalog.push(write('run21-a-dry-stone',c,-14,'A — Dry stone crack'));
const d=signal(.96);stone(d,0,.24,1,1.5);stone(d,.045,.22,.58,1.15);stone(d,.13,.18,.45,.85);debris(d,.11,.73,42,.39,.8);catalog.push(write('run21-b-heavy-crumble',d,-14,'B — Heavy crumble'));
writeFileSync(dir+'catalog.json',JSON.stringify({status:'Audition only; not integrated or deployed',source:'Original procedural synthesis; no third-party recordings',base:'47939ceffadbbb5423e5ef0ee98e25624f43d39b',catalog},null,2));
console.log(JSON.stringify(catalog,null,2));
