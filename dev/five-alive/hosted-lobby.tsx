import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import Delayed from '@/pages/Delayed';
import {NotificationProvider} from '@/components/delayed/NotificationBell';
import '@/index.css';
const initial=new URLSearchParams(location.search).get('route')??'/delayed';
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[initial]}><NotificationProvider><Routes><Route path="/delayed" element={<Delayed/>}/><Route path="/delayed/:matchId" element={<Delayed/>}/><Route path="/delayed/:matchId/:childId" element={<Delayed/>}/><Route path="/" element={<p>Platform lobby return</p>}/></Routes></NotificationProvider></MemoryRouter></QueryClientProvider>);
