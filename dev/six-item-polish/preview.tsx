import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {TooltipProvider} from '@/components/ui/tooltip';
import {PtownWordsView} from '@/components/ptownWords/PtownWordsView';
import {PersistentTableShell} from '@/lib/canonicalShell/PersistentTableShell';
import {CanonicalTableHeader} from '@/lib/canonicalShell/CanonicalTableHeader';
import {HorsesDie} from '@/components/HorsesDie';
import {SCCDie} from '@/components/SCCDie';
import {PlayingCard} from '@/components/PlayingCard';
import {MatchList} from '@/pages/Delayed';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
import {wordsRpc} from '@/lib/ptownWords/client';
import '@/index.css';
import '@/components/midnight/midnight.css';
const params=new URLSearchParams(location.search),mode=params.get('mode')??'multiplayer';
const board:WordsSnapshot['board']=Array(225).fill(null);
if(params.has('cross')){board[97]={id:50,face:'Z',letter:'Z',value:10};board[98]={id:51,face:'Q',letter:'Q',value:10};}
if(params.has('committed'))board[112]={id:50,face:'A',letter:'A',value:1};
const rack=[{id:0,face:'A',value:1},{id:1,face:'X',value:8},{id:2,face:'C',value:3},{id:3,face:'T',value:1},{id:4,face:'A',value:1},{id:5,face:'?',value:0},{id:6,face:'?',value:0}];
const v:WordsSnapshot={identity:{sessionId:'fixture',dealerGameId:'polish-'+mode,roundId:'round'},revision:1,serverAt:1000,rules:{version:'ptown-words/4',dictionaryId:'enable2k/1',dictionarySha256:'fixture',turnMs:300000},board,rack,rackCounts:{me:7,other:7},bagCount:80,players:[{id:'me',userId:'me',name:'Jeremy',seat:1,isBot:false},{id:'other',userId:'other',name:'mcru81',seat:2,isBot:false}],scores:{me:0,other:0},viewerId:'me',activePlayerId:'me',turn:1,deadline:301000,playDeadline:301000,phase:'playing',canAct:true,paused:false,pausedAt:null,finished:false,settlement:null,financial:{balances:{},resultId:null,batch:null},moves:[],event:{label:'',points:0}};
function Words(){
 const [tab,setTab]=useState<any>('cards'),[error,setError]=useState(''),[errorVersion,setErrorVersion]=useState(0),[tick,setTick]=useState(1000);
 Object.assign(window,{polishRerender:()=>setTick(n=>n+100)});
 return <PtownWordsView view={v} now={tick} asyncDraftUserId={mode==='async'?'me':undefined} pending={false} connected error={error} errorVersion={errorVersion} activeTab={tab} setActiveTab={setTab} panel={<p>Fixture information</p>} sessionEnded={false} onReconnect={()=>{}} onIntent={async intent=>{
  if(intent.type!=='place')return false;
  const result=await wordsRpc<any>('ptown_words_preview',{p_version:v.rules.version,p_board:v.board,p_rack:v.rack,p_items:intent.items});
  setError(result.invalidWords?.length?'ptown_words:invalid_word:'+result.invalidWords.join(','):'');setErrorVersion(n=>n+1);return !result.invalidWords?.length;
 }}/>;
}
function Artifacts(){return <div data-canonical-shell-root style={{minHeight:'100%',padding:20}}><div data-canonical-shell-header><div>Blue Hour header</div></div><div data-canonical-shell-hud-grid><div className="bg-card text-card-foreground" data-hud-sample>Active player</div></div>{['local','opponent','bot'].map(owner=><div key={owner} data-owner={owner} style={{display:'flex',gap:10,marginTop:20}}><HorsesDie value={3} isHeld={false} canToggle={owner==='local'}/><HorsesDie value={2} isHeld canToggle={owner==='local'}/><SCCDie value={5} isHeld={false} isSCC={false} canToggle={owner==='local'}/><PlayingCard card={{rank:'A',suit:'hearts'}}/></div>)}</div>;}
function Preview(){if(mode==='artifacts')return <Artifacts/>;if(mode==='lobby')return <main className="midnight-lobby delayed-page"><MatchList userId="me"/></main>;return <PersistentTableShell gameId="fixture" gameType="ptown-words" presentationMode="fullscreen" anteAmount={0} viewerPosition={1} viewerUserId="me" seats={[]} header={<CanonicalTableHeader title="Words qualification" gameplay/>}><Words/></PersistentTableShell>;}
createRoot(document.getElementById('root')!).render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><VisualPreferencesProvider userId="me"><TooltipProvider><ResponsiveGeometryProvider><Preview/></ResponsiveGeometryProvider></TooltipProvider></VisualPreferencesProvider></QueryClientProvider></MemoryRouter>);
