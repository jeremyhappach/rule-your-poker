import {useId} from 'react';
import './midnight.css';

// Decorative motifs only. Names, availability and game rules stay in the catalog.
const motifs = new Set(['run21','tri-towers','quintzee','boxdrop','trip-flip','take-two','royal-flash','mega-card-golf']);
const atlas:Record<string,number>={'holm-game':0,'3-5-7':1,'357-drop':1,cribbage:2,'crib-lab':2,'gin-rummy':3,canasta:4,'six-card-golf':5,horses:6,'horses-blitz':6,'ship-captain-crew':7,'ship-cap-voyage':7,yahtzee:8};
const fans:Record<string,string[]> = {
  'battle-31':['A♠','K♠','Q♠'], 'race-poker':['A♠','K♥','Q♣'],
};
function Die({n,x,y,size=45,fill}:{n:number;x:number;y:number;size?:number;fill:string}){
  const pips=n===1?[[.5,.5]]:n===2?[[.25,.25],[.75,.75]]:n===3?[[.25,.25],[.5,.5],[.75,.75]]:n===4?[[.25,.25],[.75,.25],[.25,.75],[.75,.75]]:n===5?[[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]]:[[.25,.22],[.75,.22],[.25,.5],[.75,.5],[.25,.78],[.75,.78]];
  return <g transform={`translate(${x} ${y})`}><rect width={size} height={size} rx={size*.16} fill={fill} stroke="#f9deb0" strokeWidth="1.5"/>{pips.map(([a,b],i)=><circle key={i} cx={a*size} cy={b*size} r={size*.075} fill="#14212b"/>)}</g>;
}
export function GameArtwork({game,className=''}:{game:string;className?:string}){
  const id=useId().replace(/:/g,''),paper=id+'paper',gold=id+'gold';
  if(game in atlas){const cell=atlas[game];return <svg className={'midnight-art '+className} viewBox="0 0 418 418" aria-hidden="true" focusable="false"><defs><clipPath id={id+'clip'}><rect width="418" height="418"/></clipPath></defs><g clipPath={`url(#${id}clip)`}><image href="/game-branding/midnight-motifs.webp" x={-(cell%3)*418} y={-Math.floor(cell/3)*418} width="1254" height="1254"/></g></svg>;}
  if(game==='chucky-showdown')return <img className={'midnight-art midnight-portrait '+className} src="/arcade/approved-v1/chucky-portrait.webp" alt="" aria-hidden="true"/>;
  if(motifs.has(game))return <img className={'midnight-art midnight-existing-art '+className} src={`/game-branding/async-v1/${game}-motif.webp`} alt="" aria-hidden="true"/>;
  const cards=fans[game];
  return <svg className={'midnight-art '+className} viewBox="0 0 280 180" aria-hidden="true" focusable="false">
    <defs><linearGradient id={paper} x2=".7" y2="1"><stop stopColor="#fff7df"/><stop offset=".55" stopColor="#efddbb"/><stop offset="1" stopColor="#bf945b"/></linearGradient><linearGradient id={gold} x2="1" y2="1"><stop stopColor="#fff0bd"/><stop offset=".3" stopColor="#b27c2f"/><stop offset=".6" stopColor="#f5ca70"/><stop offset="1" stopColor="#805020"/></linearGradient></defs>
    {cards&&cards.map((card,i)=><g key={i} transform={`translate(${60+i*(cards.length===4?35:43)} ${27+Math.abs(i-(cards.length-1)/2)*7}) rotate(${(i-(cards.length-1)/2)*12} 35 125)`}>
      <rect width="73" height="123" rx="6" fill={card==='back'?'#102239':`url(#${paper})`} stroke="#f2dfaf" strokeWidth="1.5"/>
      {card==='back'?<><rect x="6" y="6" width="61" height="111" rx="5" fill="none" stroke={`url(#${gold})`}/><path d="M36 18 62 62 36 105 11 62Z" fill="none" stroke="#b89556"/><text x="36" y="76" textAnchor="middle" fill="#d5b776" fontSize="40">♠</text></>:<g fill={/[♥♦]/.test(card)?'#a12e23':'#10202b'}><text x="8" y="27" fontSize="25" fontFamily="Georgia" fontWeight="bold">{card[0]}</text><text x="8" y="47" fontSize="22">{card[1]}</text><text x="37" y="92" textAnchor="middle" fontSize="49">{card[1]??card[0]}</text>{/[KQ]/.test(card)&&<path d="m22 59 4-13 9 8 9-8 5 13z" fill={`url(#${gold})`}/>}</g>}
    </g>)}
    {game==='farkle'&&<><Die n={1} x={70} y={70} size={62} fill={`url(#${paper})`}/><Die n={5} x={145} y={55} size={62} fill={`url(#${paper})`}/></>}
    {game==='eleven-up'&&[1,11,3].map((n,i)=><g key={n}><circle cx={85+i*56} cy={100-(i%2)*15} r="39" fill={['#aa8b35','#2c4e64','#733e3a'][i]} stroke="#cfbc8a"/><circle cx={85+i*56} cy={100-(i%2)*15} r="22" fill="#eee1c6"/><text x={85+i*56} y={108-(i%2)*15} textAnchor="middle" fontSize="25" fontFamily="Georgia" fill="#142636">{n}</text></g>)}
    {game==='chess'&&<text x="140" y="148" textAnchor="middle" fill={`url(#${paper})`} fontSize="155">♞</text>}
    {['ptown-words','five-alive'].includes(game)&&'WORD'.split('').map((letter,i)=><g key={i} transform={`translate(${30+i*57} ${65+(i%2)*10}) rotate(${i%2?8:-8} 25 25)`}><rect width="52" height="57" rx="6" fill={`url(#${paper})`} stroke="#d0b583"/><text x="26" y="41" textAnchor="middle" fontSize="36" fontFamily="Georgia" fill="#183047">{letter}</text></g>)}
    {game==='river-city-run'&&<><path d="M40 110h200l-25 35H62Z" fill={`url(#${gold})`}/><path d="M80 109V63h118v46M100 63V40h67v23" fill="#d1b57d" stroke="#87683c" strokeWidth="3"/><path d="M25 155q30-15 60 0t60 0 60 0 50 0" fill="none" stroke="#4c6d7f" strokeWidth="7"/></>}
  </svg>;
}

export function GameIllustration({game,name}:{game:string;name?:string}){
  return <div className="midnight-illustration" data-game-art={game}>{name&&<h3>{name}</h3>}<GameArtwork game={game}/></div>;
}
