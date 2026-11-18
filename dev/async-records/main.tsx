import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route,useParams,useSearchParams} from 'react-router-dom';
import {CompletedMatchRecord} from '@/components/delayed/CompletedMatchRecord';
import {AsyncHistory} from '@/components/delayed/AsyncHistory';
import '@/index.css';
function RecordRoute(){const {matchId}=useParams(),[query]=useSearchParams();return <CompletedMatchRecord key={matchId+':'+query.get('game')} matchId={matchId!} childId={query.get('game')??undefined} userId="me"/>;}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Routes>
 <Route path="/delayed/:matchId" element={<RecordRoute/>}/>
 <Route path="*" element={<main className="delayed-page"><h1>Completed matches</h1><AsyncHistory viewerName="Hap"/></main>}/>
</Routes></BrowserRouter>);
