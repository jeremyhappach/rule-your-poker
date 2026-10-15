import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PersistentTableShell} from '@/lib/canonicalShell/PersistentTableShell';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {TriTowersView,TriTowersRules} from '@/components/triTowers/TriTowersView';
import {useTriTowers} from '@/hooks/useTriTowers';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import '@/index.css';
function Live(){const game=useTriTowers(new URLSearchParams(location.search).get('dealer')!),[tab,setTab]=useState<ShellTabId>('cards');
 if(!game.view)return <div>{game.error||'Connecting'}</div>;
 return <TriTowersView {...game} view={game.view} activeTab={tab} setActiveTab={setTab} panel={<TriTowersRules/>} onIntent={game.act} error={game.error||null}/>;
}
createRoot(document.getElementById('root')!).render(<VisualPreferencesProvider><ResponsiveGeometryProvider><PersistentTableShell gameType="tri-towers" presentationMode="fullscreen"><Live/></PersistentTableShell></ResponsiveGeometryProvider></VisualPreferencesProvider>);
