import type {AudioCue} from '@/lib/audio/audioManager';
export interface PCM {samples: Float32Array; rate: number}
// All committed audition files use portable mono PCM16 WAV, including older iOS.
export function decodePCM(bytes: ArrayBuffer): PCM {
  const data = new DataView(bytes);
  const tag = (at:number) => String.fromCharCode(...new Uint8Array(bytes,at,4));
  if (tag(0)!=='RIFF'||tag(8)!=='WAVE') throw new Error('Invalid WAV');
  let rate=0, start=0, size=0;
  for(let at=12;at+8<=bytes.byteLength;){
    const length=data.getUint32(at+4,true);
    if(at+8+length>bytes.byteLength) throw new Error('Truncated WAV');
    if(tag(at)==='fmt '){
      if(data.getUint16(at+8,true)!==1||data.getUint16(at+10,true)!==1||data.getUint16(at+22,true)!==16) throw new Error('Expected mono PCM16');
      rate=data.getUint32(at+12,true);
    }
    if(tag(at)==='data'){start=at+8;size=length;}
    at+=8+length+(length%2);
  }
  if(!rate||!size||size%2) throw new Error('Missing PCM');
  const samples=new Float32Array(size/2);
  for(let i=0;i<samples.length;i++) samples[i]=data.getInt16(start+i*2,true)/32768;
  return {samples,rate};
}
export function pcmCue(pcm:PCM, elapsedMs=0, remainingMs=Infinity): AudioCue {
  const offset=Math.max(0,elapsedMs)/1000;
  const seconds=Math.max(0,Math.min(pcm.samples.length/pcm.rate-offset,remainingMs/1000));
  return {durationMs:seconds*1000,schedule(ctx,destination,track){
    if(seconds<=0) return false;
    const buffer=ctx.createBuffer(1,pcm.samples.length,pcm.rate);
    buffer.copyToChannel(pcm.samples,0);
    const source=track(ctx.createBufferSource()); source.buffer=buffer;
    source.connect(destination); source.start(ctx.currentTime,offset,seconds); return true;
  }};
}
