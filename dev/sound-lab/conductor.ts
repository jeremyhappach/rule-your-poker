import type {AudioCue} from '@/lib/audio/audioManager';
import {LAB_USER, platformAudio} from './labAudio';
/** getRandomValues also works on an HTTP LAN audition; randomUUID requires HTTPS. */
export function auditionId(){
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
export interface Sound {id:string; priority:number; group:string; cooldownMs:number; cue:AudioCue; onStart?:()=>void}
/** Audition-only policy prototype. AudioManager remains the sole graph/lifecycle owner. */
export class LabConductor {
  private current:{until:number; priority:number; stop:()=>void}|null=null;
  private groupAt=new Map<string,number>();
  stop=()=>{this.current?.stop();this.current=null;};
  play(sound:Sound, id=auditionId(), audition=true):boolean {
    const now=performance.now();
    if(platformAudio.getSnapshot().enabled!==true||document.hidden) return false;
    if(!audition && ((this.current && this.current.until>now && this.current.priority>sound.priority)
      || now-(this.groupAt.get(sound.group)??-Infinity)<sound.cooldownMs)) return false;
    this.stop(); // One voice in this conservative audition; there is never a delayed queue.
    this.groupAt.set(sound.group,now);
    // Explicit audition clicks may wait briefly for a cold browser audio device.
    // Automatic simulation events retain their short deadline and never catch up.
    const grace=audition?1000:20;
    const active={until:now+sound.cue.durationMs+grace,priority:sound.priority,stop:()=>{}};
    this.current=active;
    active.stop=platformAudio.follow({userId:LAB_USER,id:'lab:'+id,startedAt:now,
      expiresAt:now+sound.cue.durationMs+grace,
      cueAt:(elapsed,remaining)=>({durationMs:Math.max(0,Math.min(sound.cue.durationMs,remaining)-2),
        schedule:(ctx,destination,track)=>{
          if(elapsed>(audition?900:100)||remaining<sound.cue.durationMs)return false;
          if(!sound.cue.schedule(ctx,destination,track))return false;
          active.until=performance.now()+sound.cue.durationMs;sound.onStart?.();return true;
        }}),
    });
    return true;
  }
}
