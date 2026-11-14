import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PtownWordsView} from '@/components/ptownWords/PtownWordsView';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {TooltipProvider} from '@/components/ui/tooltip';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
import '@/index.css';
import '@/lib/delayed/delayed.css';
const params=new URLSearchParams(location.search),mode=params.get('mode')??'local',action=params.get('action')??'place';
const player=mode==='local'?'me':'other';
const board:WordsSnapshot['board']=Array(225).fill(null);
[112,113,114].forEach((square,i)=>board[square]={id:i+20,face:'CAT'[i],letter:'CAT'[i],value:1});
const view:WordsSnapshot={identity:{sessionId:'fixture',dealerGameId:mode+action,roundId:'round'},revision:1,serverAt:1000,rules:{version:'ptown-words/2',dictionaryId:'enable2k/1',dictionarySha256:'fixture',turnMs:180000},board,rack:[{id:1,face:'A',value:1},{id:2,face:'C',value:3}],rackCounts:{me:2,other:7},bagCount:80,players:[{id:'me',userId:'me',name:'Jeremy',seat:1,isBot:false},{id:'other',userId:'other',name:'mcrew81',seat:2,isBot:false}],scores:{me:player==='me'?10:0,other:player==='other'?10:0},viewerId:'me',activePlayerId:'me',turn:2,deadline:181000,playDeadline:action==='place'?181000:null,phase:'playing',canAct:true,paused:false,pausedAt:null,finished:false,settlement:null,financial:{balances:{},resultId:null,batch:null},moves:[{turn:1,playerId:player,action:action==='timeout'?'pass':action,reason:action==='timeout'?'timeout':undefined,count:action==='exchange'?5:3,points:action==='place'?10:0,words:action==='place'?[{word:'CAT',points:10,square:112,direction:0}]:[]}],event:{label:'',points:0},movePresentation:action==='place'?{version:1,turn:1,playerId:player,squares:[112,113,114],startedAt:1000,focusMs:200,flipMs:260,announceAt:1980,readyAt:6000,noticeMs:3600}:undefined};
function Preview(){
 const [now,setNow]=useState(1000),[tab,setTab]=useState<'cards'|'lobby'|'chat'|'history'>('cards');
 Object.assign(window,{setWordsTime:setNow});
 return <div className="async-words-turn"><div className="delayed-turn-nav">Words polish · local fixture</div><PtownWordsView gameplay={mode!=='replay'} view={view} now={now} asyncDraftUserId={mode==='async'||action!=='place'?'me':undefined} pending={false} connected error="" activeTab={tab} setActiveTab={setTab} panel={<p>Fixture history</p>} sessionEnded={false} onIntent={async()=>true} onReconnect={()=>{}}/></div>;
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><Preview/></ResponsiveGeometryProvider></TooltipProvider>);
