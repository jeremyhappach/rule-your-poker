import {platformAudio} from '@/lib/audio/platformAudio';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {pcmCue} from '@/lib/audio/pcm';
import {chessSamples,type ChessSound} from './presentation';
// Prepared without opening an AudioContext; the shared mixer owns unlock/mute.
const cues = {slide:pcmCue(chessSamples('slide')),hop:pcmCue(chessSamples('hop')),poof:pcmCue(chessSamples('poof'))};
export function chessSound(id:string,type:ChessSound,surface:Element|null){
 const userId=platformAudio.getSnapshot().userId;if(!userId||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return()=>{};
 let stop=()=>{};platformAudio.present({userId,id:'chess:'+id+':'+type,cue:isSoundSurfaceVisible(surface)?cues[type]:undefined},s=>{stop=s;});return()=>stop();
}
