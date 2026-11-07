import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import Arcade from '@/pages/Arcade';
import {platformAudio} from '@/lib/audio/platformAudio';
import {preloadApprovedSounds} from '@/lib/audio/approvedSounds';
import '@/index.css';

const actor=sessionStorage.getItem('lab-proof-user')!;
platformAudio.install();
platformAudio.setUser(actor);
platformAudio.setPreference(actor,true);
platformAudio.acquireGameplay();
void preloadApprovedSounds();
// Observe actual cue scheduling without changing the production audio manager.
const audioEvents:string[]=JSON.parse(sessionStorage.getItem('357-proof-audio')??'[]');
const record=(id:string)=>{audioEvents.push(id);sessionStorage.setItem('357-proof-audio',JSON.stringify(audioEvents));};
Object.assign(window,{audioEvents});
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
