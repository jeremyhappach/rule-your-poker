import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route} from 'react-router-dom';
import Arcade from '../../src/pages/Arcade';import '../../src/index.css';
import {platformAudio} from '../../src/lib/audio/platformAudio';
platformAudio.install();platformAudio.setUser((window as any).__ARCADE_USER__);platformAudio.setPreference((window as any).__ARCADE_USER__,true);
createRoot(document.getElementById('root')!).render(<BrowserRouter><Routes><Route path="/arcade" element={<Arcade/>}/><Route path="/arcade/:game" element={<Arcade/>}/><Route path="/arcade/:game/run/:runId" element={<Arcade/>}/></Routes></BrowserRouter>);

