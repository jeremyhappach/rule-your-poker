import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {ArcadeSwitchboard} from '@/components/arcade/ArcadeSwitchboard';
import {ArcadeOrderingPanel} from '@/components/admin/ArcadeOrderingPanel';
import {TooltipProvider} from '@/components/ui/tooltip';
import {fixtureAdmin} from './client';
import '@/index.css';
const playerId='10000000-0000-0000-0000-000000000002';
createRoot(document.getElementById('root')!).render(<TooltipProvider><BrowserRouter>
  {fixtureAdmin?<main className="mx-auto max-w-xl p-4"><ArcadeOrderingPanel/></main>:<ArcadeSwitchboard userId={playerId}/>}
</BrowserRouter></TooltipProvider>);
