import {useId} from 'react';
import './midnight.css';

// Decorative motifs only. Names, availability and game rules stay in the catalog.
const motifs = new Set(['run21','tri-towers','quintzee','boxdrop','trip-flip','take-two','royal-flash','mega-card-golf']);
const atlas:Record<string,number>={'holm-game':0,'3-5-7':1,'357-drop':1,cribbage:2,'crib-lab':2,'gin-rummy':3,canasta:4,'six-card-golf':5,horses:6,'horses-blitz':6,'ship-captain-crew':7,'ship-cap-voyage':7,yahtzee:8};
// Trim only empty atlas margins on Multiplayer surfaces; the artwork is unchanged.
const sceneBounds:Record<number,string>={1:'22 64 374 285',2:'20 80 385 285',3:'20 50 380 305',4:'25 50 370 320',5:'20 20 388 350',6:'35 35 335 330',7:'55 10 320 355',8:'10 112 398 155'};
const approvedSetupArt:Record<string,string>={'3-5-7':'357',cribbage:'cribbage','gin-rummy':'gin',horses:'horses',yahtzee:'yahtzee',run21:'run21'};
const approvedPickerArt:Record<string,string>={'3-5-7':'357',cribbage:'cribbage','gin-rummy':'gin',canasta:'canasta','six-card-golf':'golf',horses:'horses','ship-captain-crew':'scc',yahtzee:'yahtzee',farkle:'farkle',chess:'chess','ptown-words':'words',run21:'run21','tri-towers':'tri','eleven-up':'eleven',boxdrop:'boxdrop','trip-flip':'trip','take-two':'take','royal-flash':'royal','race-poker':'race','crib-lab':'crib-lab',quintzee:'quintzee'};
// The flattened reference prints labels into otherwise empty art corners.
// Clip in source coordinates so letterboxing cannot move those exclusions.
const pickerClips:Record<string,{width:number;height:number;points:string}>={
 '357':{width:153,height:117,points:'31,0 153,0 153,112 148,117 0,117 0,36 31,36'},
 cribbage:{width:199,height:93,points:'120,0 199,0 199,89 193,93 0,93 0,16 120,16'},
 gin:{width:158,height:103,points:'59,0 158,0 158,99 153,103 0,103 0,30 59,30'},
 scc:{width:184,height:153,points:'91,0 184,0 184,153 0,153 0,57 58,57 58,31 91,31'},
 canasta:{width:175,height:90,points:'90,0 175,0 175,90 0,90 0,9 90,9'},
 golf:{width:143,height:97,points:'11,0 143,0 143,97 0,97 0,28 11,28'},
 tri:{width:110,height:63,points:'35,0 110,0 110,60 0,60 0,30 35,30'},
 race:{width:100,height:60,points:'22,0 100,0 100,55 0,55 0,28 22,28'},
 quintzee:{width:98,height:63,points:'0,2 98,2 98,63 0,63'},
};
const fans:Record<string,string[]> = {
  'battle-31':['A♠','K♠','Q♠'], 'race-poker':['A♠','K♥','Q♣'],
};
function Die({n,x,y,size=45,fill}:{n:number;x:number;y:number;size?:number;fill:string}){
  const pips=n===1?[[.5,.5]]:n===2?[[.25,.25],[.75,.75]]:n===3?[[.25,.25],[.5,.5],[.75,.75]]:n===4?[[.25,.25],[.75,.25],[.25,.75],[.75,.75]]:n===5?[[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]]:[[.25,.22],[.75,.22],[.25,.5],[.75,.5],[.25,.78],[.75,.78]];
  return <g transform={`translate(${x} ${y})`}><rect width={size} height={size} rx={size*.16} fill={fill} stroke="#f9deb0" strokeWidth="1.5"/>{pips.map(([a,b],i)=><circle key={i} cx={a*size} cy={b*size} r={size*.075} fill="#14212b"/>)}</g>;
}
export function GameArtwork({game,className='',surface='motif'}:{game:string;className?:string;surface?:'motif'|'picker'|'setup'}){
  const id=useId().replace(/:/g,''),paper=id+'paper',gold=id+'gold';
  if(game==='holm-game')return <img className={'midnight-art midnight-holm-cards '+className} src="/game-branding/holm-approved-cards.webp" alt="" aria-hidden="true"/>;
  if(surface==='setup'&&approvedSetupArt[game])return <img className={'midnight-art midnight-approved-art '+className} src={'/game-branding/approved-'+approvedSetupArt[game]+'-art.webp'} alt="" aria-hidden="true"/>;
  if(surface!=='motif'&&approvedPickerArt[game]){
    const art=approvedPickerArt[game],clip=pickerClips[art],src='/game-branding/approved-picker-'+art+'.webp';
    if(clip)return <svg className={'midnight-art midnight-approved-art '+className} viewBox={`0 0 ${clip.width} ${clip.height}`} aria-hidden="true" focusable="false"><defs><clipPath id={id+'approved'}><polygon points={clip.points}/></clipPath></defs><image href={src} width={clip.width} height={clip.height} clipPath={`url(#${id}approved)`}/></svg>;
    return <img className={'midnight-art midnight-approved-art '+className} src={src} alt="" aria-hidden="true"/>;
  }
  if(game in atlas){const cell=atlas[game];return <svg className={'midnight-art '+className} viewBox={surface==='motif'?'0 0 418 418':sceneBounds[cell]??'0 0 418 418'} aria-hidden="true" focusable="false"><defs><clipPath id={id+'clip'}><rect width="418" height="418"/></clipPath></defs><g clipPath={`url(#${id}clip)`}><image href="/game-branding/midnight-motifs.webp" x={-(cell%3)*418} y={-Math.floor(cell/3)*418} width="1254" height="1254"/></g></svg>;}
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
