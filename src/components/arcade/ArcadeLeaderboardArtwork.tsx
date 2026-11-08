import type {CSSProperties} from 'react';
import {Run21SpaceScene} from '@/components/run21/Run21SpaceScene';
import tower from '@/assets/cartoon/tower.webp';

/** Decorative only; no gameplay state or interactions. Hidden by the containing art layer. */
export function ArcadeLeaderboardArtwork({game}:{game:string}){
if(game==='357-drop')return <div className="drop-meld" aria-label="Decorative 3, 5, 7 card fan">{[{rank:3,suit:'♠'},{rank:5,suit:'♥'},{rank:7,suit:'♣'}].map((card,i)=><div className="meld-card" data-red={i===1} key={i}><span>{card.rank}<small>{card.suit}</small></span><b>{card.suit}</b></div>)}</div>;
 if(game==='run21')return <Run21SpaceScene/>;
 if(game==='tri-towers')return <div className="castle" aria-hidden="true">{[0,1,2].map(i=><img key={i} src={tower} alt=""/>)}</div>;
 if(game==='chucky-showdown')return <img className="chucky-portrait" alt="" src="/arcade/leaderboards/chucky-four-cards.png"/>;
 if(game==='quintzee')return <img className="dice-panorama" alt="" src="/game-branding/async-v1/quintzee-motif.webp"/>;
 if(game==='eleven-up')return <div className="pool-balls" aria-hidden="true">{[1,8,10].map((n,i)=><i key={n} style={{'--ball':['#ecc12f','#20252a','#2871cc'][i]} as CSSProperties}><b>{n}</b></i>)}</div>;
 if(game==='crib-lab')return <><div className="peg-track" aria-hidden="true">{Array.from({length:24},(_,i)=><i key={i}/>)}</div><div className="crib-meld" aria-label="Decorative 6, 7, 7, 8 meld">{[{rank:6,suit:'♣'},{rank:7,suit:'♥'},{rank:7,suit:'♠'},{rank:8,suit:'♦'}].map((card,i)=><div className="meld-card" data-red={i===1||i===3} key={i}><span>{card.rank}<small>{card.suit}</small></span><b>{card.suit}</b></div>)}</div></>;
 if(game==='boxdrop')return <div className="factory" aria-hidden="true">{[1,2,3,4].map((n,i)=><span key={n}><b style={{background:['#b72c25','#2589ba','#d8b829','#5ba91f'][i]}}>{n}</b></span>)}</div>;
 if(['trip-flip','take-two'].includes(game))return <div className="card-accents" aria-hidden="true">{Array.from({length:game==='take-two'?2:3},(_,i)=><i key={i}><span>♠</span></i>)}</div>;
 if(game==='royal-flash')return <div className="royal-grid" aria-hidden="true">{Array.from({length:15},(_,i)=><i key={i}>{i<5?['♠','♥','♣','♦','♠'][i]:''}</i>)}</div>;
 return null;
}
