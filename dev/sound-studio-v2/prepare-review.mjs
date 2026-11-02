import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
// B2 preserves B's exact carrier/harmonic mix, slows 44 -> 34 pulses/second,
// and narrows the amplitude duty cycle. This is a new, unapproved asset.
const rate=32000,samples=new Float64Array(rate*4);
let peak=0;
for(let i=0;i<samples.length;i++){
 const t=i/rate,pulse=.025+.975*(.5+.5*Math.cos(2*Math.PI*34*t))**5;
 samples[i]=pulse*(Math.sin(2*Math.PI*264*t)+.24*Math.sin(4*Math.PI*264*t))*Math.min(1,i/96,(samples.length-1-i)/96);
 peak=Math.max(peak,Math.abs(samples[i]));
}
const bytes=Buffer.alloc(44+samples.length*2),gain=10**(-29/20)/peak;
bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples.length*2,40);
samples.forEach((x,i)=>bytes.writeInt16LE(Math.round(x*gain*32767),44+i*2));
writeFileSync('dev/sound-studio-v2/assets/quintzee-roll-b2.wav',bytes);
writeFileSync('dev/sound-studio-v2/review-catalog.json',JSON.stringify([{id:'quintzee-roll-b2',category:'quintzee-roll',title:'B2 · slower, sharper pulses',priority:25,file:'quintzee-roll-b2.wav',durationMs:4000,peakDb:-29,sha256:createHash('sha256').update(bytes).digest('hex'),recipe:{carrierHz:264,harmonic:0.24,pulseHz:34,floor:0.025,power:5},approval:'revision requested; awaits owner audition'}],null,2)+'\n');
