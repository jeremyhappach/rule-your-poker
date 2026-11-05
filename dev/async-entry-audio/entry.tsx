import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Link, Outlet, Route, Routes} from 'react-router-dom';
import {AsyncAudioScope} from '@/components/delayed/AsyncAudioScope';
import {ReviewGate} from '@/components/delayed/ResultReview';
import {DelayedTurn} from '@/components/delayed/DelayedTurn';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {platformAudio} from '@/lib/audio/platformAudio';
import {audioTrace} from '@/lib/audio/audioTrace';
import '@/index.css';
const home: any = {id: 'match', status: 'active', organizer: 'me', opponent: 'other', players: [{id: 'me', name: 'Me'}, {id: 'other', name: 'Other'}], lineup: [{id: 'child', game: 'tri-towers', stake: 5, ordinal: 1, terminal: false}]};
platformAudio.install(); platformAudio.setUser('me'); audioTrace.start();
(window as any).manager = platformAudio; (window as any).trace = audioTrace;
function CheckedTurn() {
  const [checked, setChecked] = useState(false);
  // Only fixture latency: models the existing release/data checks above ReviewGate.
  useEffect(() => {const timer = setTimeout(() => setChecked(true), 600); return () => clearTimeout(timer);}, []);
  return checked ? <ReviewGate home={home} childId="child" matchId="match" userId="me">{() => <DelayedTurn autoStart childId="child" matchId="match" userId="me" players={home.players}/>}</ReviewGate> : <p>Checking release</p>;
}
const retain = new URLSearchParams(location.search).get('retain') !== '0';
createRoot(document.getElementById('root')!).render(<StrictMode><TooltipProvider><ResponsiveGeometryProvider><BrowserRouter>
  <Link to="/" style={{position: 'fixed', bottom: 0, right: 0, zIndex: 10000}}>Leave Async</Link>
  <Routes><Route path="/" element={<h1>Lobby</h1>}/><Route element={retain ? <AsyncAudioScope/> : <Outlet/>}>
    <Route path="/delayed/match" element={<><GameplaySoundButton/><Link to="/delayed/match/play/child">Take turn</Link></>}/>
    <Route path="/delayed/match/play/child" element={<CheckedTurn/>}/>
  </Route></Routes>
</BrowserRouter></ResponsiveGeometryProvider></TooltipProvider></StrictMode>);
