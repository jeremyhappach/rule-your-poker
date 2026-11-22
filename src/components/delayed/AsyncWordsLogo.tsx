/** Scalable Scrabble-style letter tiles; the complete title is its accessible name. */
export function AsyncWordsLogo(){
 const points:Record<string,number>={P:3,T:1,O:1,W:4,N:1,R:1,D:2,S:1};
 return <svg className="async-words-logo" viewBox="0 0 216 82" role="img" aria-label="P-Town Words" focusable="false">
  <g aria-hidden="true" fontFamily="Georgia, serif" fontWeight="700">{['P-TOWN','WORDS'].map((word,row)=>[...word].map((letter,column)=><g key={row+':'+column} transform={`translate(${2+(row?18:0)+column*36} ${2+row*44})`}>
   <rect width="32" height="32" rx="3" fill="#e5c68d" stroke="#b58b4d" strokeWidth="1.4"/>
   <path d="M3 29V3h26" fill="none" stroke="#ffebbf" strokeWidth="1.3"/>
   <text x="15" y="23" fontSize="23" textAnchor="middle" fill="#302313">{letter}</text>
   {points[letter]&&<text x="28" y="29" fontSize="7" textAnchor="end" fill="#302313">{points[letter]}</text>}
  </g>))}</g>
 </svg>;
}
