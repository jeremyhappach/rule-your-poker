import {CanonicalCardBack} from '@/components/canonicalShell/CanonicalCardBack';
import type {CourseConfig} from '@/lib/megaCardGolf/config';

export function CourseCardBack({course}:{course:CourseConfig}){
 const coastal=course.id==='coastal-links',canyon=course.id==='devils-canyon';
 const ink=coastal?'#133e53':canyon?'#5e2b30':'#174b38',paper=coastal?'#e2f1e8':canyon?'#ffdfae':'#fff0bd';
 return <CanonicalCardBack widthPx={100} heightPx={140} variant="raised" style={{width:'100%',height:'100%',borderRadius:'9%'}} artwork={
  <svg data-course-back={course.id} viewBox="0 0 100 140" width="100%" height="100%" preserveAspectRatio="none" style={{display:'block'}} aria-hidden="true">
   <rect width="100" height="140" fill={ink}/><rect x="5" y="5" width="90" height="130" rx="7" fill="none" stroke={paper} strokeWidth="1.5"/>
   <circle cx="50" cy="43" r="24" fill={paper}/>
   {coastal?<><path d="M26 46q8-12 16 0t16 0t16 0M28 55q8-12 16 0t16 0t12 0" fill="none" stroke={ink} strokeWidth="4"/><path d="M47 22v18l14-9z" fill={ink}/></>:canyon?<path d="M26 59l13-34 9 15 11-17 15 36z" fill={ink}/>:<><circle cx="50" cy="36" r="10" fill={ink}/><path d="M27 57q18-19 46 0v9H27z" fill={ink}/></>}
   <text x="50" y="82" textAnchor="middle" fontSize="7" letterSpacing="2" fill={paper}>P-TOWN</text>
   <foreignObject x="9" y="87" width="82" height="32"><div style={{color:paper,fontFamily:'Georgia,serif',fontWeight:700,fontSize:13,lineHeight:1.1,textAlign:'center'}}>{course.name}</div></foreignObject>
   <path d="M26 123h48" stroke={paper}/><text x="50" y="132" textAnchor="middle" fontSize="5.5" letterSpacing="1.2" fill={paper}>SOUVENIR DECK</text>
  </svg>}/>;
}
