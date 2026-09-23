export interface Rect { x:number; y:number; width:number; height:number }
export const intersects=(a:Rect,b:Rect)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
export const DRAW_HELP={x:-.2,y:.5,width:.312,height:.455};
export const DRAW_PASS={...DRAW_HELP,x:1.2};
export const drawPassRect=(draw:Rect):Rect=>({...drawHelpRect(draw),x:draw.x+(DRAW_PASS.x-DRAW_PASS.width/2)*draw.width});
export const drawHelpRect=(draw:Rect):Rect=>({x:draw.x+(DRAW_HELP.x-DRAW_HELP.width/2)*draw.width,y:draw.y+(DRAW_HELP.y-DRAW_HELP.height/2)*draw.height,width:DRAW_HELP.width*draw.width,height:DRAW_HELP.height*draw.height});
/** A close, symmetric 2:3 card pair just inside the bottom felt rim. */
export function drawPairRect(reserved:Rect[],feltAspect:number,centerY=.88,hasDrawCards=true):Rect {
  const height=.22,width=height/1.5/feltAspect/.46;
  for(let bottom=Math.min(.975,centerY+height/2);bottom>=.45;bottom-=.01){
    const r={x:.5-width/2,y:bottom-height,width,height};
    const clear=[...(hasDrawCards?[r,drawPassRect(r)]:[]),drawHelpRect(r)].every(rect=>{
      const padded={x:rect.x-.015,y:rect.y-.015,width:rect.width+.03,height:rect.height+.03};
      return !reserved.some(o=>intersects(padded,o))&&[rect.x,rect.x+rect.width].every(x=>[rect.y,rect.y+rect.height].every(y=>(2*x-1)**2+(2*y-1)**2<=.985));
    });
    if(clear)return r;
  }
  return {x:.5,y:.5,width:0,height:0};
}
/** Container-relative exclusion solver; never moves or rescales a shell owner. */
export function safeFeltRect(reserved:Rect[],feltAspect=1.09):Rect {
  let best:Rect|null=null;
  let bestQuality=0;
  const gap=.015;
  const obstacles=reserved.map(r=>({x:r.x-gap,y:r.y-gap,width:r.width+2*gap,height:r.height+2*gap}));
  for(let left=.075;left<=.3;left+=.025)for(let right=.7;right<=.926;right+=.025)
    for(let top=.1;top<=.4;top+=.025)for(let bottom=.4;bottom<=.926;bottom+=.025){
      if(bottom<=top)continue;
      const r={x:left,y:top,width:right-left,height:bottom-top};
      // Optimize legible 2:3 cards, rather than a wide, shallow rectangle.
      const cardWidth=Math.min(r.width*feltAspect*.96*.184,r.height*.88*.84/3/1.5);
      const quality=cardWidth+r.width*r.height*.005;
      if(quality<=bestQuality)continue;
      if(![[left,top],[right,top],[left,bottom],[right,bottom]].every(([x,y])=>(2*x-1)**2+(2*y-1)**2<=.985))continue;
      if(obstacles.some(o=>intersects(r,o)))continue;
      best=r;bestQuality=quality;
    }
  // An unsupported shell layout fails closed rather than covering a participant.
  return best??{x:.5,y:.5,width:0,height:0};
}
