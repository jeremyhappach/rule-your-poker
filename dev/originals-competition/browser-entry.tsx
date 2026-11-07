import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {BrowserRouter,Routes,Route,useParams} from 'react-router-dom';
import {DealerGamePicker} from '@/components/catalog/DealerGamePicker';
import Delayed from '@/pages/Delayed';
import {OriginalsTable} from '@/components/originals/OriginalsTable';
import {GameChatContextProvider} from '@/hooks/GameChatContext';
import {platformAudio} from '@/lib/audio/platformAudio';
import '@/index.css';
const actor=sessionStorage.getItem('originals-user')!;
platformAudio.install();platformAudio.setUser(actor);platformAudio.setPreference(actor,true);
function Choose(){const [selected,setSelected]=useState('');return <><DealerGamePicker roster={{players:2,humans:2}} access={{'crib-lab':true,'chucky-showdown':true}} onSelect={setSelected}/><p>Selected {selected}</p></>;}
function Live(){const {id}=useParams(),[tab,setTab]=useState<any>('cards'),[ended,setEnded]=useState(false);return <GameChatContextProvider value={{allMessages:[],sendMessage:async()=>{},isSending:false} as any}>
 {ended&&<h1>Session Ended</h1>}<OriginalsTable dealerGameId={id!} userId={actor} activeTab={tab} setActiveTab={setTab} liveEntry sessionEnded={ended} onTerminalActive={()=>{}} onTerminalComplete={()=>setEnded(true)}/>
 </GameChatContextProvider>;}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Routes><Route path="/choose" element={<Choose/>}/><Route path="/delayed" element={<Delayed/>}/><Route path="/delayed/:matchId" element={<Delayed/>}/><Route path="/delayed/:matchId/play/:childId" element={<Delayed/>}/><Route path="/live/:id" element={<Live/>}/></Routes></BrowserRouter>);
