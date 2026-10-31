import {AudioManager} from '@/lib/audio/audioManager';
export const evidence={events:[] as string[],starts:[] as number[],audioStates:[] as string[],requests:0,commits:[] as {revision:number;elapsed:number}[]};
export const platformAudio=new AudioManager({
 createContext:()=>{const ctx=new AudioContext(),create=ctx.createOscillator.bind(ctx);
  evidence.audioStates.push(ctx.state);ctx.addEventListener('statechange',()=>evidence.audioStates.push(ctx.state));
  ctx.createOscillator=()=>{const node=create(),start=node.start.bind(node);node.start=(at=0)=>{evidence.starts.push(at);start(at);};return node;};return ctx;},
 loadPreference:async()=>true,now:()=>performance.now(),storage:()=>sessionStorage,document:()=>document,
});
const follow=platformAudio.follow.bind(platformAudio);
platformAudio.follow=e=>{evidence.events.push(e.id);return follow(e);};
platformAudio.install();platformAudio.setUser('local-preview');
Object.assign(window,{polishEvidence:evidence});
