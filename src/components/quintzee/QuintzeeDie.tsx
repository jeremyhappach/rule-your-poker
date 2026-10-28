import {useEffect,useState} from 'react';
const pips:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const transit=[2,5,1,6,3,4];
/** Transitional faces are independent of the authoritative landing value. */
export function QuintzeeDie({value,rolling}:{value:number;rolling:boolean}){
 const [frame,setFrame]=useState(0);
 useEffect(()=>{if(!rolling)return;const timer=setInterval(()=>setFrame(f=>f+1),60);return()=>clearInterval(timer);},[rolling]);
 const shown=rolling?transit[frame%transit.length]:value;
 return <span className="q-die" aria-hidden="true">{(pips[shown]??[]).map(p=><i key={p} style={{gridRow:Math.floor(p/3)+1,gridColumn:p%3+1}}/>)}</span>;
}
