import type {AudioCue} from '../audio/audioManager';
export function riverCue(kind:string):AudioCue{return {durationMs:900,schedule(audioContext,destination,track){
function tableTone(hz,offset,duration,level=.06,wave:OscillatorType='triangle',endHz=hz,brass=false){
 const t=audioContext.currentTime+offset,o=track(audioContext.createOscillator()),g=track(audioContext.createGain());
 o.type=wave;o.frequency.setValueAtTime(hz,t);if(endHz!==hz)o.frequency.exponentialRampToValueAtTime(endHz,t+duration*.85);
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(level,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
 if(brass){const f=track(audioContext.createBiquadFilter());f.type='lowpass';f.Q.value=1.5;f.frequency.setValueAtTime(1100,t);f.frequency.exponentialRampToValueAtTime(400,t+duration);o.connect(f);f.connect(g);}else o.connect(g);
 g.connect(destination);o.start(t);o.stop(t+duration+.02);
}
function tableSound(type){
 if(!audioContext||audioContext.state!=='running')return;
 if(type==='card'||type==='reveal'){
  const duration=type==='card'?.055:.08,buffer=audioContext.createBuffer(1,Math.floor(audioContext.sampleRate*duration),audioContext.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,2);
  const source=track(audioContext.createBufferSource()),filter=track(audioContext.createBiquadFilter()),gain=track(audioContext.createGain());source.buffer=buffer;filter.type='highpass';filter.frequency.value=1200;gain.gain.value=.13;source.connect(filter);filter.connect(gain);gain.connect(destination);source.start();return;
 }
 if(type==='win'||type==='blackjack'){
  [523.25,659.25,783.99,1046.5].forEach((hz,i)=>tableTone(hz,i*.095,.18,.065));
  [523.25,659.25,783.99,1046.5].forEach(hz=>tableTone(hz,.39,.36,.028));
  if(type==='blackjack')tableTone(1567.98,.52,.25,.04);return;
 }
 if(type==='loss'||type==='bust'){
  const scale=type==='bust'?.85:1;
  tableTone(330*scale,0,.28,.075,'sawtooth',220*scale,true);
  tableTone(294*scale,.33,.4,.075,'sawtooth',147*scale,true);return;
 }
 if(type==='countup'){
  // Same 420 ms as the visible balance interpolation; one cue per credited win.
  for(let i=0;i<8;i++)tableTone(1100+i*105,i*.05,.045,.035,'sine',900+i*90);
  return;
 }
 const tones=type==='chip'?[1600,2200]:[440,440];
 tones.forEach((hz,i)=>tableTone(hz,i*.065,.095,.055,type==='chip'?'sine':'triangle'));
}
function metalImpact() {
  if(!audioContext || audioContext.state!=='running') return;
  const now=audioContext.currentTime;
  for(const [i,hz] of [173,421,863,1451].entries()) {
    const osc=track(audioContext.createOscillator()), gain=track(audioContext.createGain());
    osc.type='triangle'; osc.frequency.setValueAtTime(hz,now); osc.frequency.exponentialRampToValueAtTime(hz*.69,now+.16);
    gain.gain.setValueAtTime(.0001,now); gain.gain.exponentialRampToValueAtTime(.14/(i+1),now+.003); gain.gain.exponentialRampToValueAtTime(.0001,now+.32);
    osc.connect(gain); gain.connect(destination); osc.start(now); osc.stop(now+.34);
  }
  const buffer=audioContext.createBuffer(1,Math.floor(audioContext.sampleRate*.12),audioContext.sampleRate), data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*(1-i/data.length);
  const noise=track(audioContext.createBufferSource()), filter=track(audioContext.createBiquadFilter()), gain=track(audioContext.createGain());
  noise.buffer=buffer; filter.type='highpass'; filter.frequency.value=950; gain.gain.value=.14;
  noise.connect(filter); filter.connect(gain); gain.connect(destination); noise.start(now); noise.stop(now+.13);
}

if(kind==='impact')metalImpact();else tableSound(kind);return true;}};}
