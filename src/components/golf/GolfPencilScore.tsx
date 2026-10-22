/** Original single-stroke numerals keep the pencil look on every device,
 * without a font download or a platform-dependent handwriting fallback. */
const strokes:Record<string,string>={
 '0':'M8 3C1 2 1 22 7 22C14 22 15 2 8 3Z',
 '1':'M3 7L8 3 7 22',
 '2':'M2 7Q5 0 10 4Q15 8 3 21L12 22',
 '3':'M2 4Q13 0 11 8L6 12Q15 11 11 19Q7 25 1 20',
 '4':'M9 2L2 15 13 14M10 4L9 23',
 '5':'M12 3L4 3 3 12Q13 7 12 17Q10 25 2 20',
 '6':'M11 3Q3 5 2 16Q2 25 10 21Q16 15 9 13Q5 12 3 16',
 '7':'M1 4L13 3Q8 12 6 23',
 '8':'M7 12Q-1 5 6 3Q16 1 11 9L4 15Q-1 22 8 22Q17 21 7 12Z',
 '9':'M11 11Q4 16 2 9Q1 2 8 3Q15 3 10 22',
 '-':'M2 13L11 12','—':'M1 13L13 12','E':'M12 3L4 3 2 22 12 22M3 12L10 12',
};
export function GolfPencilScore({value}:{value:number|string}){
 const text=String(value);
 return <svg className="golf-pencil-score" viewBox={'0 0 '+(text.length*15+4)+' 27'} role="img" aria-label={text}><title>{text}</title>{[...text].map((digit,i)=><g key={i} transform={'translate('+(i*15+2)+' '+(i%2?'.4':'0')+') rotate('+(i%2?'-2':'1')+' 7 13)'} fill="none" stroke="#555957" strokeLinecap="round" strokeLinejoin="round"><path pathLength="1" d={strokes[digit]} strokeWidth="1.4" opacity=".76"/><path pathLength="1" d={strokes[digit]} strokeWidth=".55" opacity=".34" transform="translate(.45 -.25)"/></g>)}</svg>;
}
