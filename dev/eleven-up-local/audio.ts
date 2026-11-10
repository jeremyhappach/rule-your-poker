import {AudioManager} from '@/lib/audio/audioManager';
// Offline review uses the real audio engine and header control; preferences stay local.
export const platformAudio=new AudioManager({
 createContext:()=>new AudioContext(),loadPreference:async()=>localStorage.getItem('eleven-review-sounds')!=='false',
 savePreference:async(_user,enabled)=>{localStorage.setItem('eleven-review-sounds',String(enabled));},
 now:()=>performance.now(),storage:()=>sessionStorage,document:()=>document
});
export const cueEvents:{id:string;played:boolean;at:number}[]=[];
const present=platformAudio.present.bind(platformAudio);
platformAudio.present=(event,scheduled)=>{const played=present(event,scheduled);cueEvents.push({id:event.id,played,at:performance.now()});return played;};
const request=platformAudio.request.bind(platformAudio);
platformAudio.request=event=>{
 const record={id:event.id,played:false,at:performance.now()};cueEvents.push(record);
 return request({...event,cue:{...event.cue,schedule(...args){record.played=event.cue.schedule(...args);return record.played;}}});
};
platformAudio.install();platformAudio.setUser('local-review');
