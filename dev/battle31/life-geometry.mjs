import assert from 'node:assert/strict';

/** Run inside the browser. Border-box circles, not row bounding boxes. */
export function measureLifeGeometry(){
 const anchor=document.querySelector('[data-canonical-leg-anchor="seat"]');
 if(!anchor)return null;
 const chip=anchor.closest('[data-chip-center]'),disc=chip.querySelector('[data-chip-reaction-target]')??chip,cluster=chip.closest('[data-canonical-seat-cluster]'),cr=disc.getBoundingClientRect();
 const nodes=[cluster,...cluster.querySelectorAll('*')],previous=nodes.map(n=>n.style.pointerEvents);
 // Hit testing normally skips this presentation-only layer. Pointer events
 // affect hit testing, not painting, so this exposes the real paint order.
 nodes.forEach(n=>n.style.pointerEvents='auto');
 try{
  const markers=[...anchor.querySelectorAll('[data-canonical-lives]>span')].filter(n=>getComputedStyle(n).borderRadius==='50%').map(n=>{
   const b=n.getBoundingClientRect(),R=cr.width/2,r=b.width/2,dx=b.x+r-cr.x-R,dy=b.y+r-cr.y-R,opacity=Number(getComputedStyle(n).opacity);
   const points=[[0,0],[0,.7],[.7,0],[-.7,0],[0,-.7]].map(([x,y])=>{const px=b.x+r+x*r,py=b.y+r+y*r,inside=px>=0&&px<innerWidth&&py>=0&&py<innerHeight,hit=inside?document.elementFromPoint(px,py):null;return {inside,visible:hit===n||!!hit&&n.contains(hit),animatedSibling:!!hit&&hit.parentElement===n.parentElement&&hit.hasAttribute('data-life-dissolve'),cardOccludes:!!hit?.closest('[data-canonical-seat-cluster-content]')};});
   return {R,r,dx,dy,tangentError:Math.hypot(dx,dy)-R-r,angle:Math.atan2(dy,dx)*180/Math.PI,opacity,scale:b.width/n.offsetWidth,elapsed:-parseFloat(n.style.animationDelay||'0'),animating:n.hasAttribute('data-life-dissolve'),bounds:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},points};
  });
  return {chip:{x:cr.x,y:cr.y,width:cr.width,height:cr.height},width:innerWidth,height:innerHeight,markers};
 }finally{nodes.forEach((n,i)=>n.style.pointerEvents=previous[i]);}
}

export function assertLifeGeometry(g,{allowViewportClip=false}={}){
 assert(g?.markers.length,'life markers are rendered');
 const first=g.markers[0];
 assert(Math.abs(first.tangentError)<.15,`circle tangency error ${first.tangentError}px`);
 assert(first.angle>=45-.15&&first.angle<=90+.15,`life leaves the lower-right arc: ${first.angle}deg`);
 for(const m of g.markers){
  assert(m.tangentError>-.15,'life overlaps chip circle');
  if(m.opacity<.1)continue;
  for(const p of m.points){
   assert(!p.cardOccludes,'card obscures life marker');
   // The enlarged lost circle may cover a neighboring life during its hold;
   // cards or any unrelated layer must never paint over the life row.
   if(p.inside&&!(allowViewportClip&&m.bounds.right>g.width))assert(p.visible||p.animatedSibling,'life is covered by another painted element');
   else assert(allowViewportClip,'life is clipped by viewport');
  }
 }
}
