import {createRoot} from 'react-dom/client';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {FiveAliveSession} from '@/components/fiveAlive/FiveAliveSession';
import {GameBoard} from '@/pages/Arcade';
import {platformAudio} from '@/lib/audio/platformAudio';
import '@/index.css';
const params=new URLSearchParams(location.search),mode=params.get('mode')==='async'?'async':'arcade';
const id=params.get('id')!,user=params.get('user')!,match=params.get('match')??undefined;
platformAudio.install();platformAudio.setUser(user);
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/fixture']}><Routes>
 <Route path="/fixture" element={<FiveAliveSession mode={mode} id={id} userId={user} matchId={match}/>}/>
 <Route path="/arcade/five-alive" element={<GameBoard game="five-alive" userId={user}/>}/>
 <Route path="/delayed/:id" element={<p>Match lobby</p>}/>
</Routes></MemoryRouter>);
