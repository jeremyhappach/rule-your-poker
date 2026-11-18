import type {AudioCue} from '@/lib/audio/audioManager';

type Note={at:number;hz:number;end?:number;length:number;volume?:number;wave?:OscillatorType};
/** Original Five Alive synth assets. No samples or cues from another game. */
function phrase(notes:Note[]):AudioCue{
 return {durationMs:Math.ceil(Math.max(...notes.map(n=>n.at+n.length))*1000),schedule(context,destination,track){
  if(context.state!=='running')return false;
  for(const note of notes){
   const source=track(context.createOscillator()),gain=track(context.createGain()),at=context.currentTime+note.at;
   source.type=note.wave??'sine';source.frequency.setValueAtTime(note.hz,at);
   if(note.end)source.frequency.exponentialRampToValueAtTime(note.end,at+note.length*.85);
   gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(note.volume??.055,at+.012);
   gain.gain.exponentialRampToValueAtTime(.0001,at+note.length);
   source.connect(gain);gain.connect(destination);source.onended=()=>{source.disconnect();gain.disconnect();};
   source.start(at);source.stop(at+note.length);
  }return true;
 }};
}
export const fiveAlivePoof=phrase([{at:0,hz:310,end:68,length:.35,wave:'triangle',volume:.075},{at:.025,hz:830,end:140,length:.22,volume:.035}]);
export const fiveAliveBink=phrase([{at:0,hz:784,end:1047,length:.23,volume:.065},{at:.025,hz:1568,length:.18,volume:.02}]);
export const fiveAliveInvalid=phrase([{at:0,hz:247,end:220,length:.11,volume:.045},{at:.12,hz:196,end:185,length:.16,volume:.04}]);
const melody=(frequencies:number[],step:number,length:number,volume=.055)=>frequencies.map((hz,i)=>({at:i*step,hz,length,volume,wave:'triangle' as const}));
export const fiveAliveSuccess:Readonly<Record<number,AudioCue>>={
 1:phrase([...melody([392,494,587,784,659,784,988,1175],.14,.28),{at:1.15,hz:392,length:.7,volume:.035},{at:1.15,hz:587,length:.7,volume:.03},{at:1.15,hz:784,length:.75,volume:.05}]),
 2:phrase([...melody([392,494,587,784,988],.15,.3),{at:.8,hz:587,length:.55,volume:.04},{at:.8,hz:784,length:.55,volume:.05}]),
 3:phrase(melody([494,587,784,988],.14,.32)),
 4:phrase(melody([494,659,784],.13,.3,.05)),
 5:phrase(melody([587,784],.15,.3,.045)),
 // A soft descending exhale and warm resolution: relief, not a fanfare.
 6:phrase([{at:0,hz:660,end:220,length:.48,volume:.045},{at:.38,hz:330,end:392,length:.42,volume:.04}]),
};
export function fiveAliveCountCue(elapsed:number,remaining:number):AudioCue{
 const notes:Note[]=[];
 for(let at=0;at+70<=remaining;at+=90){const index=Math.floor((elapsed+at)/90);notes.push({at:at/1000,hz:[523,659,784,1047][index%4],length:.065,volume:.027});}
 return notes.length?phrase(notes):{durationMs:0,schedule:()=>false};
}
