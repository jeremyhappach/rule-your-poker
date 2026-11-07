import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {MegaArcade} from '@/components/megaCardGolf/MegaArcade';
import {AudioManager} from '@/lib/audio/audioManager';
import '@/index.css';
import '../preview.css';
const audio=new AudioManager({createContext:()=>new AudioContext(),loadPreference:async()=>false,now:()=>performance.now(),storage:()=>sessionStorage,document:()=>document});
async function request<T>(body:object):Promise<T>{
 const response=await fetch('/__mega',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw Error(data.error);return data;
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><BrowserRouter><MegaArcade request={request} audio={audio} userId="local-ui-proof"/></BrowserRouter></TooltipProvider>);
