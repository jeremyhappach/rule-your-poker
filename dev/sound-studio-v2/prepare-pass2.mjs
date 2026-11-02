// Additive November 2 library. Never rewrites the approved 27 candidates.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root='dev/sound-studio-v2/',rate=32000,sha=b=>createHash('sha256').update(b).digest('hex');
const source=readFileSync('dev/sound-lab/sources/dice-shake-1.ogg');
const browser=await chromium.launch({channel:'msedge'});
let recorded;
try {const page=await browser.newPage();recorded=await page.evaluate(async base64=>{
 const ctx=new OfflineAudioContext(1,1,32000),bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 const b=await ctx.decodeAudioData(bytes.buffer);return Array.from(b.getChannelData(0));
},source.toString('base64'));}finally{await browser.close();}
let seed=261102;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
function wav(a){const b=Buffer.alloc(44+a.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(a.length*2,40);a.forEach((x,i)=>b.writeInt16LE(Math.round(x*32767),44+2*i));return b;}
function tone(a,hz,at,length=.19,kind=0){for(let i=Math.floor(at*rate);i<Math.min(a.length,(at+length)*rate);i++){const t=i/rate-at,e=Math.sin(Math.PI*t/length)**2*Math.exp(-t*12);a[i]+=e*(Math.sin(2*Math.PI*hz*t)+[.12,.04,.2][kind]*Math.sin(4*Math.PI*hz*t));}}
const groups=[
 ['quintzee-roll','Quintzee — Constant-pitch arcade roll','Start with the admitted rumble; stop with its visible end. No landing.',25,4,-29,['Velvet motor','Pocket arcade','Soft electric purr']],
 ['cup-roll','Yahtzee / Horses / SCC — Dice in a cup','Shake through the moving dice; stop at landing, then approved A/B.',25,4,-27,['Soft cup','Dry cup','Deep cup']],
 ['drop-countdown','357 — 3–2–1 Drop','One descending tone per displayed number; DROP itself stays silent.',35,2.7,-29,['Descending felt','Three soft bells','Mellow steps']],
 ['exact-21','Run21 — Exactly 21 (optional)','New accepted exact-21 result at its visible accent; replace, never stack.',55,.45,-28,['Twenty-one glow','Little orbit','Clear answer']],
 ['run21-bust','Run21 — Bust (optional)','Confirmed bust, once per visible outcome; compare with existing failure cue.',45,.38,-30,['Soft landing','Low orbit','Dusk tap']],
 ['farkle-bust','Farkle — Bust','Confirmed farkle overlay; no inference from an intermediate roll.',45,.42,-29,['Empty cup','Felt pause','Quiet tumble']],
 ['upper-bonus','Quintzee — Upper Bonus +35','New authoritative bonus highlight identity; silent restored highlight.',60,.55,-27,['Upper glint','Warm thirty-five','Bonus bloom']],
 ['all-filled','Quintzee — All Filled +35','Committed board clear bonus at the existing all-filled highlight.',60,.65,-26,['Full card','All in place','Final square']],
];
const catalog=[];
for(const [category,categoryTitle,trigger,priority,duration,peakDb,names] of groups)for(let take=0;take<3;take++){
 const id=category+'-'+String.fromCharCode(97+take),a=new Float64Array(rate*duration);
 const fundamental=[220,264,330][take],pulseHz=[36,44,52][take];
 if(category==='quintzee-roll')for(let i=0;i<a.length;i++){const t=i/rate,p=.28+.72*(.5+.5*Math.cos(2*Math.PI*pulseHz*t))**2;a[i]=p*(Math.sin(2*Math.PI*fundamental*t)+[.1,.24,.04][take]*Math.sin(4*Math.PI*fundamental*t));}
 else if(category==='cup-roll'){
  // Overlapping randomized windows of a real CC0 dice-shake recording. No repeated onset.
  const speed=[.96,1.13,.78][take];
  for(let at=-.5;at<duration;at+=.105+random()*.07){const length=.26+random()*.23,offset=random()*Math.max(1,recorded.length-length*rate*speed),gain=.65+random()*.35;
   for(let j=0;j<length*rate;j++){const idx=Math.round(at*rate+j);if(idx<0||idx>=a.length)continue;const x=offset+j*speed,k=Math.floor(x);a[idx]+=(recorded[k%recorded.length]*(1-x+k)+recorded[(k+1)%recorded.length]*(x-k))*Math.sin(Math.PI*j/(length*rate))**2*gain;}}
  let low=0;for(let i=0;i<a.length;i++){low+=(take===1?.72:.3)*(a[i]-low);a[i]=low;}
 }else if(category==='drop-countdown') [660,550,440].forEach((hz,i)=>tone(a,hz*[1,.8,.6666667][take],i*.9,.18,take));
 else {const down=category.endsWith('bust'),notes=down?[330,247]:category==='exact-21'?[523,659]:category==='upper-bonus'?[440,554,659]:[392,494,587,784];notes.forEach((hz,i)=>tone(a,hz*[1,.9,1.12][take],i*.09,.22,take));}
 // Short click protection, no reverberation tail. Runtime controls loop duration.
 const mean=a.reduce((s,x)=>s+x,0)/a.length;let peak=0;
 for(let i=0;i<a.length;i++){a[i]=(a[i]-mean)*Math.min(1,i/96,(a.length-1-i)/96);peak=Math.max(peak,Math.abs(a[i]));}
 const gain=10**(peakDb/20)/peak;a.forEach((x,i)=>a[i]=x*gain);
 const bytes=wav(a);writeFileSync(root+'assets/'+id+'.wav',bytes);
 const physical=category==='cup-roll';
 catalog.push({id,category,categoryTitle,title:names[take],description:category==='quintzee-roll'?`${fundamental} Hz fixed carrier, ${pulseHz} pulses/second. Tone and texture vary; pitch never climbs.`:physical?['Softened recorded rattle, rounded contact.','Brighter recorded contacts with a lighter cup character.','Lower, cushioned recorded rattle.'][take]:['Short, rounded and understated.','A softer alternative with a little more space.','Distinct timbre, kept below signature celebrations.'][take],trigger,priority,file:id+'.wav',durationMs:duration*1000,peakDb,rmsDb:+(20*Math.log10(Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length))).toFixed(1),playbackGain:1,bytes:bytes.length,sha256:sha(bytes),recipe:{fundamental:category==='quintzee-roll'?fundamental:null,pulseHz:category==='quintzee-roll'?pulseHz:null,loop:duration===4,seed:261102},source:physical?{author:'Kenney Vleugels; P-Town edits',license:'CC0 1.0',url:'https://kenney.nl/assets/casino-audio',file:'dev/sound-lab/sources/dice-shake-1.ogg',sha256:sha(source),generator:'prepare-pass2.mjs'}:{author:'Original P-Town procedural sound design',license:'Project original; no third-party recording or melody',generator:'prepare-pass2.mjs'}});
}
writeFileSync(root+'pass2-catalog.json',JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({added:catalog.length,categories:groups.length,bytes:catalog.reduce((s,c)=>s+c.bytes,0)}));
