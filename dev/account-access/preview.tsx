import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {AccountAccessGate} from '../../src/components/AccountAccessGate';
import {PlayerManagement} from '../../src/components/PlayerManagement';
import {PushPreferences} from '../../src/components/delayed/PushPreferences';
const scenario=new URLSearchParams(location.search).get('scenario');
createRoot(document.getElementById('root')!).render(<MemoryRouter><main className="mx-auto max-w-3xl p-4 text-foreground">
 {scenario==='admin'?<PlayerManagement currentUserId="admin" selectedId="player"/>:scenario==='notifications'?<PushPreferences userId="admin" preview rpc={window.accountFixture.rpc} device={{status:()=> 'device-off',prepare:()=>{},enableDevice:async()=> 'enabled',disableDevice:async()=>{}}}/>:<AccountAccessGate><div>Playable content</div></AccountAccessGate>}
</main></MemoryRouter>);
