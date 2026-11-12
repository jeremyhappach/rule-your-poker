import {platformAudio} from '@/lib/audio/platformAudio';
import type {AudioCue} from '@/lib/audio/audioManager';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
export function chessSound(id:string,type:'slide'|'hop'|'poof',surface:Element|null){
 const userId=platformAudio.getSnapshot().userId;if(!userId||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return()=>{};
 const cue:AudioCue={durationMs:220,schedule:(ctx,dest,track)=>{const gain=track(ctx.createGain()),filter=track(ctx.createBiquadFilter()),source=track(ctx.createBufferSource());const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.2),ctx.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.exp(-i/samples.length*5);source.buffer=buffer;filter.type='lowpass';filter.frequency.value=type==='poof'?500:type==='hop'?240:950;gain.gain.value=type==='poof'?.09:.05;source.connect(filter).connect(gain).connect(dest);source.start();return true;}};
 let stop=()=>{};platformAudio.present({userId,id:'chess:'+id+':'+type,cue:isSoundSurfaceVisible(surface)?cue:undefined},s=>{stop=s;});return()=>stop();
}
