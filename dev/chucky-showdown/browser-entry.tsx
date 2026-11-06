import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import Arcade from '@/pages/Arcade';
import {platformAudio} from '@/lib/audio/platformAudio';
import {preloadApprovedSounds} from '@/lib/audio/approvedSounds';
import '@/index.css';

const actor=sessionStorage.getItem('showdown-local-user')!;
platformAudio.install();
platformAudio.setUser(actor);
platformAudio.setPreference(actor,localStorage.getItem('showdown-local-sounds')!=='off');
void preloadApprovedSounds();
// Observe actual cue scheduling without changing the production audio manager.
const audioEvents:string[]=[];
const audioTimeline:{id:string;at:number;highlights:number}[]=[];
function record(id:string){
  audioEvents.push(id);
  audioTimeline.push({id,at:performance.now(),highlights:document.querySelectorAll('.cs-slot[data-winning=true]').length});
}
Object.assign(window,{audioEvents,audioTimeline});
const present=platformAudio.present.bind(platformAudio);
platformAudio.present=(event,scheduled)=>{
  const cue=event.cue;
  return present({...event,cue:cue&&{...cue,schedule(...args){const started=cue.schedule(...args);if(started)record(event.id);return started;}}},scheduled);
};
const follow=platformAudio.follow.bind(platformAudio);
platformAudio.follow=event=>follow({...event,cueAt:(at,left)=>{
  const cue=event.cueAt(at,left);
  return cue&&{...cue,schedule(...args){const started=cue.schedule(...args);if(started)record(event.id);return started;}};
}});
createRoot(document.getElementById('root')!).render(<BrowserRouter><Routes>
  <Route path="/arcade" element={<Arcade/>}/><Route path="/arcade/:game" element={<Arcade/>}/>
  <Route path="/arcade/:game/run/:runId" element={<Arcade/>}/>
</Routes></BrowserRouter>);
