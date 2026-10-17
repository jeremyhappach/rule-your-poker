import type {AudioCue} from '@/lib/audio/audioManager';

export const TRI_FANFARE_MS=3000;
type Point={time:number;value:number;ramp?:'linear'|'exponential'};

/** Seek an envelope without replaying an elapsed attack or restarting its decay. */
function automate(parameter:AudioParam,points:Point[],at:number){
 let prior=points[0],next:Point|undefined;
 for(const point of points){if(point.time<=at)prior=point;else{next=point;break;}}
 let value=prior.value;
 if(next?.ramp){const fraction=(at-prior.time)/(next.time-prior.time);
  value=next.ramp==='linear'?prior.value+(next.value-prior.value)*fraction:prior.value*Math.pow(next.value/prior.value,fraction);
 }
 parameter.setValueAtTime(value,at);
 for(const point of points){if(point.time<=at)continue;const when=point.time;
  if(point.ramp==='linear')parameter.linearRampToValueAtTime(point.value,when);
  else if(point.ramp==='exponential')parameter.exponentialRampToValueAtTime(point.value,when);
  else parameter.setValueAtTime(point.value,when);
 }
}

/** Owner-auditioned two-part brass: repeated pickups, three rising trills, resolution. */
export function triAllClearCueAt(elapsed=0,remaining=TRI_FANFARE_MS):AudioCue{
 const durationMs=Math.max(0,Math.min(remaining,TRI_FANFARE_MS-elapsed)-5);
 return {durationMs,schedule(ctx,destination,track){
  if(ctx.state!=='running'||durationMs<=0)return false;
  const cursor=Math.max(0,elapsed)/1000,end=cursor+durationMs/1000;
  // Preserve the approved audition's whole-tone transposition and timbre exactly.
  const hz=(midi:number)=>440*Math.pow(2,(midi-71)/12);
  const wave=ctx.createPeriodicWave(new Float32Array(6),new Float32Array([0,1,.32,.18,.09,.045]));
  const phrases=[{lead:[74,77],home:[76,79],upper:[77,81],land:[76,79],level:.76},
   {lead:[76,79],home:[77,81],upper:[79,83],land:[77,81],level:.93},
   {lead:[77,81],home:[79,83],upper:[81,84],land:[79,84],level:1.13}];
  let scheduled=false;
  phrases.forEach((phrase,second)=>{
   const start=Math.max(second,cursor),stop=Math.min(second+.995,end);
   if(stop<=start)return;
   for(let voice=0;voice<2;voice++){
    const osc=track(ctx.createOscillator()),gain=track(ctx.createGain()),filter=track(ctx.createBiquadFilter());
    const at=ctx.currentTime+start-cursor,phraseAt=ctx.currentTime+second-cursor;
    osc.setPeriodicWave(wave);filter.type='lowpass';filter.frequency.setValueAtTime(2200+second*350,at);filter.Q.value=.35;
    const pitch:Point[]=[{time:phraseAt,value:hz(phrase.lead[voice])},{time:phraseAt+.19,value:hz(phrase.home[voice])}];
    for(let step=0;step<6;step++)pitch.push({time:phraseAt+.30+step*.055,value:hz((step%2?phrase.home:phrase.upper)[voice])});
    pitch.push({time:phraseAt+(second===2?.70:.64),value:hz(phrase.land[voice])});
    automate(osc.frequency,pitch,at);
    const level=(voice===0?.105:.095)*phrase.level,envelope:Point[]=[];
    for(const pickup of [0,.095])envelope.push(
     {time:phraseAt+pickup,value:.0001},{time:phraseAt+pickup+.008,value:level*.65,ramp:'exponential'},
     {time:phraseAt+pickup+.045,value:level*.65},{time:phraseAt+pickup+.070,value:.0001,ramp:'exponential'});
    envelope.push({time:phraseAt+.19,value:.0001},{time:phraseAt+.205,value:level*.85,ramp:'exponential'},
     {time:phraseAt+.64,value:level,ramp:'linear'},{time:phraseAt+.85,value:level},
     {time:phraseAt+(second===2?.99:.965),value:.0001,ramp:'exponential'});
    automate(gain.gain,envelope,at);
    osc.connect(filter);filter.connect(gain);gain.connect(destination);osc.start(at);osc.stop(ctx.currentTime+stop-cursor);
    scheduled=true;
   }
  });
  return scheduled;
 }};
}
