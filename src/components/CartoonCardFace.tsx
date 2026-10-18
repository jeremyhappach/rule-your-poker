import courts from '@/assets/cartoon/courts.webp';

/** Face art only. PlayingCard retains visibility, backs, dimensions and highlights. */
export function CartoonCardFace({rank,suit,layout="standard"}:{rank:string;suit:string;layout?:"standard"|"tableau"|"royal"}){
 const tableau=layout==='tableau',royal=layout==='royal';
 const court=['J','Q','K'].indexOf(rank);
 return <svg data-cartoon-card-face="" aria-hidden="true" viewBox="0 0 100 150" width="100%" height="100%" style={{display:'block',overflow:'hidden'}}>
  <text data-card-rank="" x={royal?23:tableau?50:rank==='10'?2:7} y={royal?59:tableau?61:43} textAnchor={tableau||royal?"middle":undefined} fill="currentColor" fontFamily="Georgia, serif" fontSize={royal?(rank==='10'?42:62):tableau?(rank==='10'?65:74):(rank==='10'?44:52)} fontWeight="900" letterSpacing="-3">{rank}</text>
  {!tableau&&<text data-card-suit="" x={royal?77:73} y={royal?59:44} textAnchor="middle" fill="currentColor" fontFamily="Arial, sans-serif" fontSize={royal?60:51}>{suit}</text>}
  {court>=0?<svg x={royal?22:tableau?10:2} y={royal?79:tableau?66:48} width={royal?56:tableau?80:96} height={royal?64:tableau?82:100} viewBox={`${court*100} 0 100 100`} overflow="hidden"><image href={courts} width="300" height="100"/></svg>:
   <text x="50" y="129" textAnchor="middle" fill="currentColor" fontFamily="Arial, sans-serif" fontSize="88">{suit}</text>}
 </svg>;
}
