import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {FiveAliveResults,type FiveAliveWordResult} from '@/components/fiveAlive/FiveAliveResults';
import '@/index.css';
import '@/components/fiveAlive/fiveAlive.css';
const long=location.search.includes('long');
const result=(count:number,difficulty:number,score:number,solved=true):FiveAliveWordResult=>({answer:'APPLE',difficulty,score,solved,guesses:Array.from({length:count},(_,i)=>({word:solved&&i===count-1?'APPLE':'STARE',feedback:Array(5).fill(solved&&i===count-1?'correct':'absent')}))});
const rounds=[{own:result(2,1,560),opponent:result(3,1,392)},{own:result(1,5,1600),opponent:result(6,5,0,false)}];
function Preview(){const [open,setOpen]=useState(true);return <main style={{minHeight:'100%',background:'#071521',color:'#fff',padding:24}}><h1>Word Results · local preview</h1><p>Saved results, maximum single-word score and pending opponent.</p><button onClick={()=>setOpen(true)}>Open Word Results</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="five-alive-history-dialog"><DialogTitle>Word Results</DialogTitle><DialogDescription>Opponent results remain sealed until both finish.</DialogDescription><FiveAliveResults rounds={rounds} waiting={result(1,5,1600)} opponentName={long?'Happach Gmail — visiting player':'Hap'}/></DialogContent></Dialog></main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
