import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {NotificationProvider} from '@/components/delayed/NotificationBell';
import {useAsyncActionCount} from '@/components/delayed/AsyncActivity';
import {delayedRpc,delayedRequest} from '@/lib/delayed/client';
function Fixture(){const count=useAsyncActionCount();return <main><h1>Async ({count})</h1>
 <button onClick={()=>void delayedRequest({op:'action'})}>Take turn</button>
 <button onClick={()=>void delayedRpc('delayed_review_ack')}>View result</button>
 </main>;}
createRoot(document.getElementById('root')!).render(<BrowserRouter><NotificationProvider><Fixture/></NotificationProvider></BrowserRouter>);
