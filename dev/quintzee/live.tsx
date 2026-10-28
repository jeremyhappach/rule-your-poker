import {useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QuintzeeView} from '@/components/quintzee/QuintzeeView';
import {useQuintzee,type QuintzeeTransport} from '@/hooks/useQuintzee';
import type {QuintzeeTheme} from '@/lib/quintzee/model';
import '@/index.css';
import './preview.css';
interface Player {actor:string;token:string;name:string}
interface Fixture {id:string;players:Player[]}
async function request(path:string,body:unknown){const response=await fetch('/__quintzee/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error),{definitive:data.definitive});return data;}
function App(){
 const params=new URLSearchParams(location.search),id=params.get('id'),actor=params.get('actor'),token=params.get('token');
 const [fixture,setFixture]=useState<Fixture|null>(id&&actor&&token?{id,players:[{actor,token,name:'You'}]}:null),[theme,setTheme]=useState<QuintzeeTheme>('classic'),[players,setPlayers]=useState(1),[error,setError]=useState('');
 async function start(){try{const f=await request('new',{players,theme});setFixture(f);const p=f.players[0];history.replaceState(null,'',`?${new URLSearchParams({id:f.id,actor:p.actor,token:p.token,frame:params.get('frame')??'full'})}`);}catch(e){setError((e as Error).message);}}
 if(fixture)return <Live fixture={fixture}/>;
 return <main className="q-preview-setup"><p>LOCAL PROTOTYPE · NO PRODUCTION ADMISSION</p><h1>Quintzee</h1><label>Visual theme<select value={theme} onChange={e=>setTheme(e.target.value as QuintzeeTheme)}><option value="classic">Classic Green</option><option value="modern">Modern MAXX / Force</option></select></label><label>Players<select value={players} onChange={e=>setPlayers(Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>{n===1?'Solo Arcade':`${n} network participants`}</option>)}</select></label><button onClick={()=>void start()}>Start local game</button><p>180 seconds per round · Two rounds · 80,000 earns a bonus</p><p>Each network participant receives a separate local identity and browser link. Canonical session and financial integration remain gated.</p>{error&&<p role="alert">{error}</p>}</main>;
}
function Live({fixture:f}:{fixture:Fixture}){
 const p=f.players[0];
 const transport=useMemo<QuintzeeTransport>(()=>({load:()=>request('state',{id:f.id,token:p.token}),send:command=>request('action',{id:f.id,token:p.token,command}),subscribe:refresh=>{const stream=new EventSource(`/__quintzee/events?${new URLSearchParams({id:f.id,token:p.token})}`);stream.onmessage=refresh;stream.onopen=refresh;return()=>stream.close();}}),[f.id,p.token]);
 const game=useQuintzee(f.id,p.actor,transport);
 if(game.snapshot?.status==='abandoned')return <main className="q-preview-setup"><h1>Game abandoned</h1><p>This local run is abandoned. Its score will not enter a leaderboard.</p><p>Production Arcade lifecycle integration remains unwired.</p><a href="/dev/quintzee/live.html?frame=phone">Back to local setup</a></main>;
 return <div className="q-preview" data-frame={new URLSearchParams(location.search).get('frame')??'full'}><aside className="q-preview-links"><a href="/dev/quintzee/live.html">Local setup</a>{f.players.slice(1).map(other=><a key={other.actor} href={`?${new URLSearchParams({id:f.id,actor:other.actor,token:other.token})}`} target="_blank" rel="noreferrer">Open {other.name}</a>)}</aside><div className="q-preview-stage">{game.snapshot?<QuintzeeView snapshot={game.snapshot} actor={p.actor} now={game.now} pending={game.pending} error={game.error} onIntent={game.act} onReconnect={game.reconnect}/>:<p role="status">{game.error||'Connecting to local SQL authority…'}</p>}</div></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
