import {createRoot} from 'react-dom/client';
import {MegaArcade} from '../../src/components/megaCardGolf/MegaArcade';
import {AudioManager} from '../../src/lib/audio/audioManager';
import './preview.css';
const audio=new AudioManager({createContext:()=>new AudioContext(),loadPreference:async()=>localStorage.getItem('mega-preview-sounds')==='true',now:()=>performance.now(),storage:()=>sessionStorage,document:()=>document});
async function request<T>(body:object):Promise<T>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch('/__mega',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error);return data;}finally{clearTimeout(timer);}}
createRoot(document.getElementById('root')!).render(<MegaArcade request={request} audio={audio} userId="local-preview" preview/>);
