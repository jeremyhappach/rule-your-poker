import './fiveAliveLogo.css';
/** Shared vector mark: scales as one unit, with an untiled 5 and gameplay colors. */
export function FiveAliveLogo({stacked=false}:{stacked?:boolean}){
 return <svg className="five-alive-logo" data-stacked={stacked||undefined} viewBox={stacked?'0 -24 390 278':'0 0 450 80'} role="img" aria-label="Five Alive" focusable="false">
  <g aria-hidden="true" fontFamily="Arial Black, system-ui, sans-serif" fontWeight="900" fill="#fff">
   <text x={stacked?195:2} y={stacked?112:69} textAnchor={stacked?'middle':'start'} fontSize={stacked?132:82}>5</text>
   <g transform={stacked?'translate(3 172)':'translate(64 0)'}>{[..."ALIVE"].map((letter,index)=><g key={letter}>
    <rect x={index*78} y="4" width="72" height="72" rx="6" fill={index===1?'#c58a00':index===4?'#079a23':'#69717d'} stroke={index===1?'#ffcf00':index===4?'#23d24a':'#8e97a2'} strokeWidth="2"/>
    <text x={36+index*78} y="41" textAnchor="middle" dominantBaseline="central" fontSize="51">{letter}</text>
   </g>)}</g>
  </g>
 </svg>;
}
