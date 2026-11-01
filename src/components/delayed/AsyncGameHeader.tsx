import {useState,type CSSProperties} from 'react';
import {ASYNC_GAME_BRANDING} from '@/lib/delayed/gameBranding';
import {findGame} from '@/lib/gameCatalog';
import './asyncGameHeader.css';

export function AsyncGameHeader({game,name,ordinal,stake}:{game:string;name:string;ordinal:number;stake:number}){
  const brand=ASYNC_GAME_BRANDING[game];
  const title=name===game?findGame(game)?.name??name:name;
  return <div className="delayed-game-heading async-brand-heading" data-brand={game}
    style={{'--async-brand-theme':brand?.theme??'#1a2a39'} as CSSProperties}>
    {brand?.motif&&<img className="async-brand-motif" src={brand.motif} alt="" aria-hidden="true"/>}
    <h3><span className="async-brand-ordinal">{ordinal}.</span>
      <BrandTitle key={game} name={title} logo={brand?.logo} letterTiles={brand?.letterTiles}/>
    </h3>
    <span className="async-brand-stake">Stake <strong>${stake}</strong></span>
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
