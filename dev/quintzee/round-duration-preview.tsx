// Synthetic local UI only; Vite aliases Supabase to the existing catalog mock.
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {GameDefaultsConfig} from '@/components/GameDefaultsConfig';
import {TooltipProvider} from '@/components/ui/tooltip';import {Toaster} from 'sonner';
import fixture from '../lobby-catalog/production-fixture.json';import {reset,writes} from '../lobby-catalog/mockSupabase';import '@/index.css';
reset([{...fixture.defaults[0],game_type:'quintzee',decision_timer_seconds:10,quintzee_theme:'classic',quintzee_round_seconds:240} as typeof fixture.defaults[number]]);
(window as any).durationPreviewWrites=writes;
function App(){const[open,setOpen]=useState(true);return <TooltipProvider><button onClick={()=>setOpen(true)}>Open Defaults</button><GameDefaultsConfig open={open} onOpenChange={setOpen}/><Toaster/></TooltipProvider>;}
createRoot(document.getElementById('root')!).render(<App/>);
