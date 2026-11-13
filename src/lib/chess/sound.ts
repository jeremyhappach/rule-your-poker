import {platformAudio} from '@/lib/audio/platformAudio';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {pcmCue} from '@/lib/audio/pcm';
import {chessSamples,type ChessSound} from './presentation';
// Prepared without opening an AudioContext; the shared mixer owns unlock/mute.
const slide=pcmCue(chessSamples('slide'));
// Keep the quieter slide mix; animation events still own the exact start.
export const chessSlideCue={...slide,schedule:((ctx,destination,track)=>{
 const gain=track(ctx.createGain());gain.gain.value=.45;gain.connect(destination);
 return slide.schedule(ctx,gain,track);
}) as typeof slide.schedule};
const cues = {slide:chessSlideCue,hop:pcmCue(chessSamples('hop')),poof:pcmCue(chessSamples('poof'))};
export function chessSound(id:string,type:ChessSound,surface:Element|null){
 const userId=platformAudio.getSnapshot().userId;if(!userId||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return()=>{};
 let stop=()=>{};platformAudio.present({userId,id:'chess:'+id+':'+type,cue:isSoundSurfaceVisible(surface)?cues[type]:undefined},s=>{stop=s;});return()=>stop();
}
