import {useState,type CSSProperties,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import {ASYNC_GAME_BRANDING} from '@/lib/delayed/gameBranding';
import {findGame} from '@/lib/gameCatalog';
import {FiveAliveLogo} from '@/components/fiveAlive/FiveAliveLogo';
import {AsyncWordsLogo} from './AsyncWordsLogo';
import './asyncGameHeader.css';

export function AsyncGameHeader({game,name,ordinal,stake,disclosure}:{game:string;name:string;ordinal?:number;stake?:number;
 disclosure?:{expanded:boolean;controls:string;onToggle:()=>void;summary:ReactNode}}){
  const brand=ASYNC_GAME_BRANDING[game];
  const title=name===game?findGame(game)?.name??name:name;
  const titleContent=<AsyncGameTitle key={game} game={game} name={title}/>;
  return <div className="delayed-game-heading async-brand-heading" data-brand={game} data-collapsible={!!disclosure||undefined}
    style={{'--async-brand-theme':brand?.theme??'#1a2a39'} as CSSProperties}>
    {brand?.motif&&<img className="async-brand-motif" src={brand.motif} alt="" aria-hidden="true"/>}
    <h3>{disclosure?<button type="button" className="async-completed-toggle" aria-expanded={disclosure.expanded} aria-controls={disclosure.controls} onClick={disclosure.onToggle}>
      {titleContent}{disclosure.summary}<ChevronDown aria-hidden="true" size={18}/>
    </button>:<>{ordinal!==undefined&&<span className="async-brand-ordinal">{ordinal}.</span>}{titleContent}</>}</h3>
    {stake!==undefined&&<span className="async-brand-stake">Stake <strong>${stake}</strong></span>}
  </div>;
}

export function AsyncGameTitle({game,name,placement='header'}:{game:string;name:string;placement?:'picker'|'header'}){
  const {logo,letterTiles}=ASYNC_GAME_BRANDING[game]??{};
  const [loaded,setLoaded]=useState(false);
  if(game==='five-alive')return <span className="async-brand-title" data-game={game}><FiveAliveLogo stacked={placement==='picker'}/></span>;
  if(game==='ptown-words'&&placement==='picker')return <span className="async-brand-title" data-game={game}><AsyncWordsLogo/></span>;
  return <span className="async-brand-title" data-game={game} data-loaded={loaded||undefined} data-words={letterTiles||undefined}>
    <span className="async-brand-name">{game==='chess'&&placement==='picker'?<><span className="async-chess-title-line">P-Town</span>{' '}<span className="async-chess-title-line">Chess</span></>:name}</span>
    {logo&&<img className="async-brand-logo" src={logo} alt="" aria-hidden="true"
      onLoad={()=>setLoaded(true)} onError={()=>setLoaded(false)}/>}
    {letterTiles&&<span className="async-brand-letters" aria-hidden="true"><i>A</i><i>B</i><i>C</i></span>}
  </span>;
}
