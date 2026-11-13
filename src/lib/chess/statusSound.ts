import {platformAudio} from '@/lib/audio/platformAudio';
import {decodePCM,pcmCue} from '@/lib/audio/pcm';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import type {AudioCue} from '@/lib/audio/audioManager';
import checkUrl from '@/assets/audio/chess-check.wav?url';
import {chessStatusPCM} from './statusSamples';
let check:AudioCue|undefined,loading:Promise<void>|undefined;
const cues={win:pcmCue(chessStatusPCM.win),loss:pcmCue(chessStatusPCM.loss)};
export function preloadChessStatusSound(){return loading??=fetch(checkUrl).then(r=>r.ok?r.arrayBuffer():Promise.reject()).then(bytes=>{check=pcmCue(decodePCM(bytes));}).catch(()=>{});}
export function chessStatusSound(id:string,type:'check'|'win'|'loss',surface:Element|null){
 const userId=platformAudio.getSnapshot().userId;let stop=()=>{};if(!userId)return stop;
 const visible=!document.hidden&&isSoundSurfaceVisible(surface);
 platformAudio.present({userId,id:'chess-status:'+id+':'+type,cue:visible?(type==='check'?check:cues[type]):undefined},s=>{stop=s;});return()=>stop();
}
export function chessHeartbeat(id:string,surface:Element|null){
 const userId=platformAudio.getSnapshot().userId,at=performance.now();if(!userId||document.hidden||!isSoundSurfaceVisible(surface))return()=>{};
 return platformAudio.follow({userId,id:'chess-heart:'+id,startedAt:at,expiresAt:at+3600000,cueAt:(_elapsed,remaining)=>({durationMs:Math.max(1,remaining-1),schedule(ctx,destination,track){const {samples,rate}=chessStatusPCM.heartbeat,b=ctx.createBuffer(1,samples.length,rate);b.copyToChannel(samples,0);const source=track(ctx.createBufferSource());source.buffer=b;source.loop=true;source.connect(destination);source.start();return true;}})});
}
