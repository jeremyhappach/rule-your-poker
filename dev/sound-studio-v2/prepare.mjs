// Original deterministic sound design. No samples, voices, melodies or network calls.
import {mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url)), rate=32000;
const groups=[
 ['no-qualify','SCC — No Qualify','A brief, gentle letdown. Completed unqualified turn only.',30,[
  ['Felt sigh','A muted wooden descent with a soft breath.',.42,-28,[60,57],.11,'wood'],
  ['Low velvet','Two rounded low notes; quiet and matter-of-fact.',.48,-29,[55,50],.14,'warm'],
  ['Closing bell','A small descending glass interval, softened at the edges.',.52,-29,[72,69],.13,'bell']]],
 ['midnight','SCC — Midnight','Qualified 6–5–4 plus cargo 12. An achievement, not a victory.',65,[
  ['Midnight blue','A low bell opens into a compact, luminous answer.',.95,-22,[55,67,74],.14,'bell'],
  ['After hours','Warm mallets with a little suspended jazz color.',1.05,-23,[60,67,69,76],.13,'warm'],
  ['Moonlit brass','A brushed rise and a short, rounded brass accent.',1.1,-23,[55,62,67,74],.15,'brass']]],
 ['five-ones','Horses — Five Ones','Five actual 1 faces on an admitted roll; not wild-assisted five of another value.',70,[
  ['Five of a kind','Five close mallet strikes and a warm final glint.',1.12,-21,[60,64,67,72,79],.1,'wood'],
  ['Lucky iron','A low metallic pulse resolving into a bright fifth.',1.25,-22,[48,55,60,67,72],.14,'bell'],
  ['Royal tumble','A soft brass burst with a restrained high answer.',1.3,-22,[55,60,64,67,76],.13,'brass']]],
 ['score-post','Dice Games — Score Posting','One committed score appears. A single confirmation, never a count-up.',20,[
  ['Ink & felt','A dry contact and a tiny rounded tone.',.22,-30,[72],.1,'wood'],
  ['Soft seal','Two tightly joined mallet notes; a compact confirmation.',.3,-30,[69,76],.045,'warm'],
  ['Silver dot','A small, clean bell with a very short tail.',.26,-31,[81],.1,'bell']]],
 ['yahtzee','Yahtzee / Quintzee','Celebrate the relevant committed scoring achievement once.',75,[
  ['Five stars','A recognizable five-note rise with a neat finish.',1.2,-21,[60,64,67,74,79],.14,'wood'],
  ['High five','A playful syncopated brass answer; no long fanfare.',1.35,-22,[60,67,64,72,79],.16,'brass'],
  ['Crown of glass','A light crystalline climb with a warm underlying note.',1.25,-23,[67,72,76,79,84],.12,'bell']]],
 ['my-leg','My Leg Earned','Local player UUID receives a legitimate individual leg award.',50,[
  ['Up one','A warm, ascending three-note mallet figure.',.68,-24,[60,64,67],.12,'wood'],
  ['Little lift','A soft upward interval with an airy finish.',.62,-25,[64,71,76],.11,'warm'],
  ['Step of gold','A rounded low note answered by two small bells.',.75,-25,[55,67,72],.13,'bell']]],
 ['opponent-leg','Opponent Leg Earned','Another player UUID receives a leg; acknowledgment without personal triumph.',40,[
  ['Across the felt','Two low, neutral wooden taps.',.38,-29,[55,55],.1,'wood'],
  ['Quiet nod','A mellow descending interval, shorter than your own award.',.44,-30,[62,60],.11,'warm'],
  ['Distant marker','One dusky bell, with no rising victory gesture.',.48,-30,[62],.1,'bell']]],
 ['sweep','Sweep the Legs','Admitted canonical sweep phase. Owns the whole terminal audio family.',120,[
  ['The P-Town sweep','A brushed sweep, low impact, then a compact signature flourish.',1.6,-19,[43,55,62,67,74],.18,'brass'],
  ['Felt thunder','A warm low sweep with a climbing mallet finish.',1.45,-20,[48,55,60,64,72],.16,'wood'],
  ['House signature','A dark bell pickup into a memorable bright resolution.',1.7,-20,[50,57,62,69,74],.19,'bell']]],
 ['chucky','Chucky’s Evil Laugh','One fresh pre-deal character moment, never each card. Audition bypasses fatigue limits.',60,[
  ['Velvet villain','Low theatrical mwa-ha-ha-ha; smooth and slightly sinister.',1.3,-24,[],0,'laugh-low'],
  ['Little trouble','A brighter impish mwa-ha-ha-ha with a quick final chuckle.',1.08,-25,[],0,'laugh-imp'],
  ['Crooked grin','A grainier, nasal mwa-ha-ha-ha with a descending finish.',1.42,-25,[],0,'laugh-grain']]],
];
const hash=b=>createHash('sha256').update(b).digest('hex');
let seed=231101;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
function note(out,midi,at,kind,level=1){
 const hz=440*2**((midi-69)/12), start=Math.round(at*rate);
 const partials=kind==='bell'?[1,2.76,4.07,5.43]:kind==='brass'?[1,2,3,4,5]:[1,2,3.99];
 const decay=kind==='wood'?13:kind==='brass'?8:7;
 for(let i=start;i<out.length;i++){
  const t=(i-start)/rate, env=(1-Math.exp(-t*(kind==='brass'?65:500)))*Math.exp(-decay*t);
  let value=0;partials.forEach((p,j)=>value+=Math.sin(2*Math.PI*hz*p*t)*Math.exp(-j*t*7)/(1+j*j*3));
  out[i]+=value*env*level;
 }
}
function breath(out,start,duration,level){
 let low=0;for(let i=Math.round(start*rate);i<Math.min(out.length,(start+duration)*rate);i++){
  const t=(i/rate-start)/duration,n=random()*2-1;low+=.12*(n-low);
  out[i]+=(n-low)*Math.sin(Math.PI*t)**2*level;
 }
}
function laugh(out,kind,seconds){
 // Additive glottal source through moving vowel formants: /mwɑ hɑ hɑ hɑ/.
 // This is a synthetic character, not an imitation of a person or movie voice.
 const low=kind==='laugh-low',imp=kind==='laugh-imp',base=low?120:imp?195:148;
 const syllables=[[.025,.34,1],[.40,.19,.9],[.64,.18,.8],[.87,.2,.65]];
 const stretch=seconds/1.3;
 for(let k=0;k<syllables.length;k++){
  const [rawStart,rawDur,amp]=syllables[k],start=rawStart*stretch,dur=rawDur*stretch;
  breath(out,start,.045*stretch,.075);
  let phase=0;
  for(let i=Math.round(start*rate);i<Math.min(out.length,(start+dur)*rate);i++){
   const t=Math.max(0,Math.min(1,(i/rate-start)/dur));
   const pitch=base*(1+.19*Math.sin(Math.PI*t)-.09*t-.045*k)*(1+.015*Math.sin(2*Math.PI*31*i/rate));
   phase+=2*Math.PI*pitch/rate;
   const opening=k===0?Math.min(1,t*3):1;
   const formants=[250+opening*480,750+opening*420,2450+(imp?400:0)];
   let value=0;
   for(let h=1;h<=Math.min(65,Math.floor(9000/pitch));h++){
    const hz=h*pitch;
    let shape=.02;
    formants.forEach((f,j)=>shape+=[1,.65,.19][j]*Math.exp(-.5*((hz-f)/[105,150,230][j])**2));
    value+=Math.sin(h*phase+.12*h)*shape/Math.sqrt(h);
   }
   const env=Math.min(1,t*13)*Math.sin(Math.PI*Math.min(.999,t))**.65;
   out[i]+=value*env*amp+(kind==='laugh-grain'?(random()*2-1)*env*.035:0);
  }
 }
}
function wav(samples){
 const b=Buffer.alloc(44+samples.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);
 for(let i=0;i<samples.length;i++)b.writeInt16LE(Math.round(samples[i]*32767),44+i*2);return b;
}
const catalog=[];mkdirSync(root+'assets',{recursive:true});
for(const [category,categoryTitle,trigger,priority,recipes] of groups){
 for(let j=0;j<recipes.length;j++){
  const [title,description,seconds,peakDb,notes,step,timbre]=recipes[j];
  const id=category+'-'+String.fromCharCode(97+j),samples=new Float64Array(Math.round(seconds*rate));
  if(category==='chucky')laugh(samples,timbre,seconds);
  else{
   notes.forEach((m,i)=>note(samples,m,i*step,timbre));
   if(category==='sweep'){breath(samples,.01,.34,.3);note(samples,36,.24,'warm',.6);}
   if(category==='no-qualify'&&j===0)breath(samples,.03,.19,.055);
   if(category==='score-post')breath(samples,0,.028,.12);
  }
  const dry=samples.slice();
  if(seconds>.6)for(const [delay,gain] of [[.037,.07],[.071,.035]])for(let i=Math.round(delay*rate);i<samples.length;i++)samples[i]+=dry[i-Math.round(delay*rate)]*gain;
  const mean=samples.reduce((a,b)=>a+b,0)/samples.length;
  for(let i=0;i<samples.length;i++)samples[i]=(samples[i]-mean)*Math.min(1,i/(rate*.004),(samples.length-1-i)/(rate*.045));
  if(!samples.every(Number.isFinite))throw Error(id+': non-finite synthesis');
  let peak=0;for(const s of samples)peak=Math.max(peak,Math.abs(s));
  if(peak===0)throw Error(id+': silent synthesis');
  const gain=10**(peakDb/20)/peak;for(let i=0;i<samples.length;i++)samples[i]*=gain;
  const bytes=wav(samples);writeFileSync(root+'assets/'+id+'.wav',bytes);
  const rms=Math.sqrt(samples.reduce((a,b)=>a+b*b,0)/samples.length);
  catalog.push({id,category,categoryTitle,title,description,trigger,priority,file:id+'.wav',durationMs:Math.round(seconds*1000),peakDb,rmsDb:+(20*Math.log10(rms)).toFixed(1),playbackGain:1,bytes:bytes.length,sha256:hash(bytes),recipe:{notes,step,timbre},source:{author:'Original P-Town procedural sound design by Codex',license:'Project original; no third-party audio, melody or voice',generator:'prepare.mjs',seed:231101}});
 }
}
writeFileSync(root+'catalog.json',JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({candidates:catalog.length,categories:groups.length,bytes:catalog.reduce((n,c)=>n+c.bytes,0)}));
