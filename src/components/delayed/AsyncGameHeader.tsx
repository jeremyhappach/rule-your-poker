import {useState,type CSSProperties,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import {ASYNC_GAME_BRANDING} from '@/lib/delayed/gameBranding';
import {findGame} from '@/lib/gameCatalog';
import './asyncGameHeader.css';

export function AsyncGameHeader({game,name,ordinal,stake,disclosure}:{game:string;name:string;ordinal?:number;stake?:number;
 disclosure?:{expanded:boolean;controls:string;onToggle:()=>void;summary:ReactNode}}){
  const brand=ASYNC_GAME_BRANDING[game];
  const title=name===game?findGame(game)?.name??name:name;
  const titleContent=<BrandTitle key={game} name={title} logo={brand?.logo} letterTiles={brand?.letterTiles}/>;
  return <div className="delayed-game-heading async-brand-heading" data-brand={game} data-collapsible={!!disclosure||undefined}
    style={{'--async-brand-theme':brand?.theme??'#1a2a39'} as CSSProperties}>
    {brand?.motif&&<img className="async-brand-motif" src={brand.motif} alt="" aria-hidden="true"/>}
    <h3>{disclosure?<button type="button" className="async-completed-toggle" aria-expanded={disclosure.expanded} aria-controls={disclosure.controls} onClick={disclosure.onToggle}>
      {titleContent}{disclosure.summary}<ChevronDown aria-hidden="true" size={18}/>
    </button>:<>{ordinal!==undefined&&<span className="async-brand-ordinal">{ordinal}.</span>}{titleContent}</>}</h3>
    {stake!==undefined&&<span className="async-brand-stake">Stake <strong>${stake}</strong></span>}
  </div>;
}

function BrandTitle({name,logo,letterTiles}:{name:string;logo?:string;letterTiles?:boolean}){
  const [loaded,setLoaded]=useState(false);
  return <span className="async-brand-title" data-loaded={loaded||undefined} data-words={letterTiles||undefined}>
    <span className="async-brand-name">{name}</span>
    {logo&&<img className="async-brand-logo" src={logo} alt="" aria-hidden="true"
      onLoad={()=>setLoaded(true)} onError={()=>setLoaded(false)}/>}
    {letterTiles&&<span className="async-brand-letters" aria-hidden="true"><i>A</i><i>B</i><i>C</i></span>}
  </span>;
}
